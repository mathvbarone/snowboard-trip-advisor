import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Resort, WorkspaceFile } from '@snowboard-trip-advisor/schema'
import type { PublishState } from '@snowboard-trip-advisor/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { listResortsHandler } from '../listResorts'

// ---------------------------------------------------------------------------
// Shared fixture builder helpers
// ---------------------------------------------------------------------------
//
// Mirrors apps/admin/server/__tests__/health.test.ts. Relative timestamps
// keep staleness assertions independent of wall-clock date — the handler
// compares (now - observed_at) against a 14-day TTL, so hard-coded ISO
// literals eventually flip from "fresh" to "stale" in CI.

const DAY_MS = 24 * 60 * 60 * 1000
const FRESH_OBSERVED_AT = new Date(Date.now() - DAY_MS).toISOString()
// 20 days is firmly inside the (default=14, max_stale=30] stale window —
// Codex round-5 fix added the upper bound, so 30 days sits exactly at the
// boundary and microsecond drift would flip it to never_fetched.
const STALE_OBSERVED_AT = new Date(Date.now() - 20 * DAY_MS).toISOString()
// Beyond max_stale → canonical liveField returns 'never_fetched', not stale.
// Pin the no-over-count branch the round-5 finding called out.
const TOO_OLD_OBSERVED_AT = new Date(Date.now() - 60 * DAY_MS).toISOString()
const HASH_1 = '0000000000000000000000000000000000000000000000000000000000000001'
const SOURCE_URL = 'https://example.com/'
const ATTRIBUTION = { en: 'Test attribution.' }

/** Build a FieldSource literal for a given observed_at timestamp. */
function makeFieldSource(observed_at: string): {
  source: 'manual'
  source_url: string
  observed_at: string
  fetched_at: string
  upstream_hash: string
  attribution_block: { en: string }
} {
  return {
    source: 'manual',
    source_url: SOURCE_URL,
    observed_at,
    fetched_at: FRESH_OBSERVED_AT,
    upstream_hash: HASH_1,
    attribution_block: ATTRIBUTION,
  }
}

/** Durable METRIC_FIELDS that live on resort.field_sources. */
const DURABLE_FIELD_SOURCES_KEYS = [
  'altitude_m.min', 'altitude_m.max', 'slopes_km', 'lift_count',
  'skiable_terrain_ha', 'season.start_month', 'season.end_month',
] as const

/** Live METRIC_FIELDS that live on live_signal.field_sources. */
const LIVE_FIELD_SOURCES_KEYS = [
  'snow_depth_cm', 'lifts_open.count', 'lifts_open.total',
  'lift_pass_day', 'lodging_sample.median_eur',
] as const

/** Build durable field_sources for all static resort paths with the given observed_at. */
function durableFieldSources(observed_at: string): Record<string, ReturnType<typeof makeFieldSource>> {
  return Object.fromEntries(
    DURABLE_FIELD_SOURCES_KEYS.map((k) => [k, makeFieldSource(observed_at)]),
  )
}

/** Build live field_sources for all live-signal paths with the given observed_at. */
function liveFieldSources(observed_at: string): Record<string, ReturnType<typeof makeFieldSource>> {
  return Object.fromEntries(
    LIVE_FIELD_SOURCES_KEYS.map((k) => [k, makeFieldSource(observed_at)]),
  )
}

/**
 * Build a Resort parse-validated fixture.
 * `publishState` lets each test pin the exact publish_state on the embedded
 * Resort — the listResorts handler reads `wf.resort.publish_state` for the
 * workspace branch (per spec §4.1.1: workspace takes precedence) and
 * `r.publish_state` for the published-only branch, so the fixture MUST set
 * it explicitly to keep the assertion deterministic (Schema-API plan-review fold).
 */
function makeResort(
  slug: string,
  fieldSources: Record<string, ReturnType<typeof makeFieldSource>>,
  publishState: PublishState = 'draft',
  country: 'AT' | 'CH' | 'IT' = 'AT',
): Resort {
  return Resort.parse({
    schema_version: 1,
    slug,
    name: { en: `Resort ${slug}` },
    country,
    region: { en: 'Test Region' },
    altitude_m: { min: 800, max: 1800 },
    slopes_km: 50,
    lift_count: 12,
    skiable_terrain_ha: 200,
    season: { start_month: 12, end_month: 4 },
    publish_state: publishState,
    field_sources: fieldSources,
  })
}

/**
 * Build a WorkspaceFile JSON literal for writing to disk.
 *
 * `liveSignalFieldSources === null` → live_signal is null (no live values
 * populated). When non-null, the live_signal is built with all five live
 * metric values populated so populatedLivePaths() returns all 5 paths and
 * stale-field counting is meaningful.
 */
function makeWorkspaceFileJson(
  slug: string,
  resort: Resort,
  liveSignalFieldSources: Record<string, ReturnType<typeof makeFieldSource>> | null = null,
  modifiedAt: string = FRESH_OBSERVED_AT,
): string {
  const liveSignal =
    liveSignalFieldSources !== null
      ? {
          schema_version: 1,
          resort_slug: slug,
          observed_at: FRESH_OBSERVED_AT,
          fetched_at: FRESH_OBSERVED_AT,
          snow_depth_cm: 40,
          lifts_open: { count: 10, total: 15 },
          lift_pass_day: { amount: 55, currency: 'EUR' },
          lodging_sample: { median_eur: { amount: 100, currency: 'EUR' }, sample_size: 3 },
          field_sources: liveSignalFieldSources,
        }
      : null

  const wf = WorkspaceFile.parse({
    schema_version: 1,
    slug,
    resort,
    live_signal: liveSignal,
    modified_at: modifiedAt,
  })
  return JSON.stringify(wf)
}

// ---------------------------------------------------------------------------
// Test setup / teardown
// ---------------------------------------------------------------------------

let workspaceRoot: string

beforeEach(async (): Promise<void> => {
  workspaceRoot = await mkdtemp(join(tmpdir(), 'admin-listResorts-test-'))
})

afterEach(async (): Promise<void> => {
  await rm(workspaceRoot, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// Tests — the 4 cases per plan §2.1 / spec §7.9
// ---------------------------------------------------------------------------

describe('listResortsHandler (PR 4.3)', (): void => {
  it('happy path: workspace ∪ published with workspace precedence on shared slug', async (): Promise<void> => {
    // Workspace has slug A; published has A + B.
    // - A appears once (workspace precedence per §4.1.1).
    //   - publish_state from WORKSPACE Resort (set explicitly to 'published').
    //   - last_updated from wf.modified_at (NOT publishedDoc.published_at).
    // - B appears once (published-only).
    //   - publish_state from published Resort ('published').
    //   - last_updated from publishedDoc.published_at.
    await mkdir(join(workspaceRoot, 'data', 'admin-workspace'), { recursive: true })
    await mkdir(join(workspaceRoot, 'data', 'published'), { recursive: true })

    const workspaceModifiedAt = new Date(Date.now() - 2 * DAY_MS).toISOString()
    const publishedAt = '2026-04-26T08:00:00Z'

    // Workspace: slug A, publish_state explicitly 'published' on the embedded Resort.
    const workspaceResortA = makeResort(
      'aspen',
      durableFieldSources(FRESH_OBSERVED_AT),
      'published',
      'AT',
    )
    await writeFile(
      join(workspaceRoot, 'data', 'admin-workspace', 'aspen.json'),
      makeWorkspaceFileJson(
        'aspen',
        workspaceResortA,
        liveFieldSources(FRESH_OBSERVED_AT),
        workspaceModifiedAt,
      ),
    )

    // Published: A (with a stale name we should NOT see — workspace wins) and B.
    const publishedResortA = makeResort(
      'aspen',
      durableFieldSources(FRESH_OBSERVED_AT),
      'published',
      'AT',
    )
    const publishedResortB = makeResort(
      'breck',
      durableFieldSources(FRESH_OBSERVED_AT),
      'published',
      'CH',
    )
    // Include a live_signal for B (published-only) so the liveSignalBySlug
    // Map-construction transform is exercised. B has fresh field_sources →
    // stale_field_count remains 0, keeping the assertion simple.
    const publishedDoc = {
      schema_version: 1,
      published_at: publishedAt,
      resorts: [publishedResortA, publishedResortB],
      live_signals: [
        {
          schema_version: 1,
          resort_slug: 'breck',
          observed_at: FRESH_OBSERVED_AT,
          fetched_at: FRESH_OBSERVED_AT,
          snow_depth_cm: 30,
          lifts_open: { count: 8, total: 12 },
          lift_pass_day: { amount: 60, currency: 'EUR' },
          lodging_sample: { median_eur: { amount: 110, currency: 'EUR' }, sample_size: 4 },
          field_sources: liveFieldSources(FRESH_OBSERVED_AT),
        },
      ],
      manifest: { resort_count: 2, generated_by: 'test', validator_version: '0.0.0' },
    }
    await writeFile(
      join(workspaceRoot, 'data', 'published', 'current.v1.json'),
      JSON.stringify(publishedDoc),
    )

    const result = await listResortsHandler({ query: {} }, { workspaceRoot })

    expect(result.page).toEqual({ offset: 0, limit: 50, total: 2 })
    expect(result.items).toHaveLength(2)

    const a = result.items.find((i): boolean => i.slug === 'aspen')
    const b = result.items.find((i): boolean => i.slug === 'breck')

    // A from workspace branch — last_updated === workspace.modified_at (NOT published_at).
    expect(a).toBeDefined()
    expect(a?.last_updated).toBe(workspaceModifiedAt)
    expect(a?.last_updated).not.toBe(publishedAt)
    expect(a?.publish_state).toBe('published')  // from wf.resort.publish_state
    expect(a?.country).toBe('AT')
    expect(a?.failed_field_count).toBe(0)
    expect(a?.stale_field_count).toBe(0)

    // B from published branch — last_updated === publishedDoc.published_at.
    expect(b).toBeDefined()
    expect(b?.last_updated).toBe(publishedAt)
    expect(b?.publish_state).toBe('published')  // from r.publish_state
    expect(b?.country).toBe('CH')
    expect(b?.failed_field_count).toBe(0)
    expect(b?.stale_field_count).toBe(0)
  })

  it('draft-resort path (§4.1.1): workspace-only slug surfaces with publish_state from workspace Resort', async (): Promise<void> => {
    // Workspace has slug C with publish_state 'draft' explicit.
    // Published has only slug A (publish_state 'published').
    // Expect items: [C (draft), A (published)].
    await mkdir(join(workspaceRoot, 'data', 'admin-workspace'), { recursive: true })
    await mkdir(join(workspaceRoot, 'data', 'published'), { recursive: true })

    const draftResortC = makeResort(
      'crested',
      durableFieldSources(FRESH_OBSERVED_AT),
      'draft',
      'IT',
    )
    await writeFile(
      join(workspaceRoot, 'data', 'admin-workspace', 'crested.json'),
      makeWorkspaceFileJson('crested', draftResortC, liveFieldSources(FRESH_OBSERVED_AT)),
    )

    const publishedResortA = makeResort(
      'aspen',
      durableFieldSources(FRESH_OBSERVED_AT),
      'published',
      'AT',
    )
    const publishedDoc = {
      schema_version: 1,
      published_at: '2026-04-26T08:00:00Z',
      resorts: [publishedResortA],
      live_signals: [],
      manifest: { resort_count: 1, generated_by: 'test', validator_version: '0.0.0' },
    }
    await writeFile(
      join(workspaceRoot, 'data', 'published', 'current.v1.json'),
      JSON.stringify(publishedDoc),
    )

    const result = await listResortsHandler({ query: {} }, { workspaceRoot })

    expect(result.page.total).toBe(2)
    expect(result.items).toHaveLength(2)

    const c = result.items.find((i): boolean => i.slug === 'crested')
    const a = result.items.find((i): boolean => i.slug === 'aspen')

    expect(c?.publish_state).toBe('draft')      // from wf.resort.publish_state (workspace)
    expect(a?.publish_state).toBe('published')  // from r.publish_state (published)
  })

  it('missing-published path (§10.9): workspace-only resorts surface, no published doc on disk', async (): Promise<void> => {
    // Workspace has slug A with publish_state 'draft' (typical for workspace-only).
    // No data/published/current.v1.json on disk.
    // Expect items: [A (workspace, publish_state: 'draft')].
    await mkdir(join(workspaceRoot, 'data', 'admin-workspace'), { recursive: true })

    const workspaceModifiedAt = new Date(Date.now() - 3 * DAY_MS).toISOString()
    const resortA = makeResort(
      'aspen',
      durableFieldSources(FRESH_OBSERVED_AT),
      'draft',
      'AT',
    )
    await writeFile(
      join(workspaceRoot, 'data', 'admin-workspace', 'aspen.json'),
      makeWorkspaceFileJson(
        'aspen',
        resortA,
        liveFieldSources(FRESH_OBSERVED_AT),
        workspaceModifiedAt,
      ),
    )
    // No published doc

    const result = await listResortsHandler({ query: {} }, { workspaceRoot })

    expect(result.page).toEqual({ offset: 0, limit: 50, total: 1 })
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.slug).toBe('aspen')
    expect(result.items[0]?.publish_state).toBe('draft')           // from wf.resort.publish_state
    expect(result.items[0]?.last_updated).toBe(workspaceModifiedAt) // from wf.modified_at
    expect(result.items[0]?.failed_field_count).toBe(0)
    expect(result.items[0]?.stale_field_count).toBe(0)
  })

  it('cold-start path (§10.9): no workspace AND no published → empty items, total: 0', async (): Promise<void> => {
    // Workspace dir does not exist; no published doc.
    const result = await listResortsHandler({ query: {} }, { workspaceRoot })

    expect(result.items).toEqual([])
    expect(result.page).toEqual({ offset: 0, limit: 50, total: 0 })
  })

  // -------------------------------------------------------------------------
  // Coverage / branch tests for the read helpers + filter + page paths
  // -------------------------------------------------------------------------

  it('corrupt workspace file (truncated JSON) is skipped and logged via stderr (§10.3.1)', async (): Promise<void> => {
    // Exercises readWorkspaceFilesOrEmpty's "raw: undefined" branch (JSON.parse
    // throws → not ENOENT → push as corrupt) and the WorkspaceFile.safeParse
    // failure branch in the handler (console.error + continue).
    await mkdir(join(workspaceRoot, 'data', 'admin-workspace'), { recursive: true })

    const valid = makeResort('aspen', durableFieldSources(FRESH_OBSERVED_AT), 'draft', 'AT')
    await writeFile(
      join(workspaceRoot, 'data', 'admin-workspace', 'aspen.json'),
      makeWorkspaceFileJson('aspen', valid, liveFieldSources(FRESH_OBSERVED_AT)),
    )
    // Truncated JSON — JSON.parse throws SyntaxError (not ENOENT) → push raw: undefined.
    await writeFile(join(workspaceRoot, 'data', 'admin-workspace', 'bad.json'), '{not_json')

    // Silence the expected stderr write so test output stays clean. Restored in finally.
    // eslint-disable-next-line no-console -- spec §10.3.1 logger is what we're suppressing here
    const original = console.error
    const calls: unknown[][] = []
    // eslint-disable-next-line no-console
    console.error = (...args: unknown[]): void => { calls.push(args) }
    try {
      const result = await listResortsHandler({ query: {} }, { workspaceRoot })

      expect(result.items).toHaveLength(1)
      expect(result.items[0]?.slug).toBe('aspen')
      expect(result.page.total).toBe(1)
      // Verify the corrupt-file logger fired with the expected prefix.
      expect(calls).toHaveLength(1)
      expect(String(calls[0]?.[0])).toContain('[admin/listResorts] corrupt workspace file bad.json')
    } finally {
      // eslint-disable-next-line no-console
      console.error = original
    }
  })

  it('corrupt published doc (valid JSON, invalid schema) is treated as absent', async (): Promise<void> => {
    // Exercises readPublishedDocOrNull's safeParse-fails branch (parsed.success === false).
    // Published doc is valid JSON syntactically but published_at is malformed →
    // PublishedDataset.safeParse returns success: false → handler treats as null.
    await mkdir(join(workspaceRoot, 'data', 'admin-workspace'), { recursive: true })
    await mkdir(join(workspaceRoot, 'data', 'published'), { recursive: true })

    const resort = makeResort('aspen', durableFieldSources(FRESH_OBSERVED_AT), 'draft', 'AT')
    await writeFile(
      join(workspaceRoot, 'data', 'admin-workspace', 'aspen.json'),
      makeWorkspaceFileJson('aspen', resort, liveFieldSources(FRESH_OBSERVED_AT)),
    )
    await writeFile(
      join(workspaceRoot, 'data', 'published', 'current.v1.json'),
      // Valid JSON, invalid PublishedDataset shape (missing required keys).
      '{"schema_version": 1, "published_at": "bad-date", "resorts": [], "live_signals": [], "manifest": {}}',
    )

    const result = await listResortsHandler({ query: {} }, { workspaceRoot })

    // Workspace resort still surfaces; published doc treated as absent.
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.slug).toBe('aspen')
  })

  it('malformed published JSON (SyntaxError) is treated as absent (§10.9)', async (): Promise<void> => {
    // Exercises readPublishedDocOrNull's `err instanceof SyntaxError` branch.
    await mkdir(join(workspaceRoot, 'data', 'admin-workspace'), { recursive: true })
    await mkdir(join(workspaceRoot, 'data', 'published'), { recursive: true })

    const resort = makeResort('aspen', durableFieldSources(FRESH_OBSERVED_AT), 'draft', 'AT')
    await writeFile(
      join(workspaceRoot, 'data', 'admin-workspace', 'aspen.json'),
      makeWorkspaceFileJson('aspen', resort, liveFieldSources(FRESH_OBSERVED_AT)),
    )
    // Syntactically invalid JSON — JSON.parse throws SyntaxError.
    await writeFile(join(workspaceRoot, 'data', 'published', 'current.v1.json'), '{not_valid_json')

    const result = await listResortsHandler({ query: {} }, { workspaceRoot })

    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.slug).toBe('aspen')
  })

  it('filter.country narrows results to matching country only', async (): Promise<void> => {
    await mkdir(join(workspaceRoot, 'data', 'admin-workspace'), { recursive: true })

    const at = makeResort('aspen', durableFieldSources(FRESH_OBSERVED_AT), 'draft', 'AT')
    const ch = makeResort('zermatt', durableFieldSources(FRESH_OBSERVED_AT), 'draft', 'CH')
    await writeFile(
      join(workspaceRoot, 'data', 'admin-workspace', 'aspen.json'),
      makeWorkspaceFileJson('aspen', at, liveFieldSources(FRESH_OBSERVED_AT)),
    )
    await writeFile(
      join(workspaceRoot, 'data', 'admin-workspace', 'zermatt.json'),
      makeWorkspaceFileJson('zermatt', ch, liveFieldSources(FRESH_OBSERVED_AT)),
    )

    const result = await listResortsHandler(
      // Cast: the wire-time ISOCountryCode brand is enforced at the dispatch
      // boundary (Zod), but inside the handler the raw 'CH' literal is the
      // semantic input — match the runtime shape.
      { query: { filter: { country: 'CH' as never } } },
      { workspaceRoot },
    )

    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.slug).toBe('zermatt')
    expect(result.page.total).toBe(1)
  })

  it('filter.hasFailures: true returns empty in Phase 1 (no adapters → failed_field_count always 0)', async (): Promise<void> => {
    await mkdir(join(workspaceRoot, 'data', 'admin-workspace'), { recursive: true })
    const r = makeResort('aspen', durableFieldSources(FRESH_OBSERVED_AT), 'draft', 'AT')
    await writeFile(
      join(workspaceRoot, 'data', 'admin-workspace', 'aspen.json'),
      makeWorkspaceFileJson('aspen', r, liveFieldSources(FRESH_OBSERVED_AT)),
    )

    const withFailures = await listResortsHandler(
      { query: { filter: { hasFailures: true } } },
      { workspaceRoot },
    )
    expect(withFailures.items).toEqual([])
    expect(withFailures.page.total).toBe(0)

    const withoutFailures = await listResortsHandler(
      { query: { filter: { hasFailures: false } } },
      { workspaceRoot },
    )
    expect(withoutFailures.items).toHaveLength(1)
    expect(withoutFailures.page.total).toBe(1)
  })

  it('null live_signal: stale_field_count is 0 (populatedLivePaths returns [] for null)', async (): Promise<void> => {
    // Pins populatedLivePaths' `live === null` early-return. Without this
    // branch the next line (`if (live.snow_depth_cm !== undefined)`) would
    // dereference null and throw.
    await mkdir(join(workspaceRoot, 'data', 'admin-workspace'), { recursive: true })

    const resort = makeResort('aspen', durableFieldSources(FRESH_OBSERVED_AT), 'draft', 'AT')
    // null live_signal — populatedLivePaths returns []; loop never enters; count = 0.
    await writeFile(
      join(workspaceRoot, 'data', 'admin-workspace', 'aspen.json'),
      makeWorkspaceFileJson('aspen', resort, null),
    )

    const result = await listResortsHandler({ query: {} }, { workspaceRoot })

    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.stale_field_count).toBe(0)
  })

  it('stale_field_count: snow_depth_cm populated + stale → count = 1; absent live values exercise populatedLivePaths false branches', async (): Promise<void> => {
    // Two branches exercised here:
    //   1. populatedLivePaths false branches for `lifts_open`, `lift_pass_day`,
    //      `lodging_sample` — all absent on this fixture. Only snow_depth_cm
    //      survives populatedLivePaths.
    //   2. countStaleFields' `ageDays > FRESHNESS_TTL_DAYS.default` true branch
    //      fires for the stale snow_depth_cm entry.
    await mkdir(join(workspaceRoot, 'data', 'admin-workspace'), { recursive: true })

    const resort = makeResort('aspen', durableFieldSources(FRESH_OBSERVED_AT), 'draft', 'AT')
    // Hand-built live_signal: ONLY snow_depth_cm populated. lifts_open,
    // lift_pass_day, lodging_sample all absent → populatedLivePaths drops them
    // (false branches fire). snow_depth_cm field_sources entry is STALE.
    const wfJson = JSON.stringify({
      schema_version: 1,
      slug: 'aspen',
      resort,
      live_signal: {
        schema_version: 1,
        resort_slug: 'aspen',
        observed_at: FRESH_OBSERVED_AT,
        fetched_at: FRESH_OBSERVED_AT,
        snow_depth_cm: 60,
        // lifts_open absent → populatedLivePaths false branch (40, 41)
        // lift_pass_day absent → populatedLivePaths false branch (42)
        // lodging_sample absent → populatedLivePaths false branch (43)
        field_sources: {
          'snow_depth_cm': makeFieldSource(STALE_OBSERVED_AT),
        },
      },
      modified_at: FRESH_OBSERVED_AT,
    })
    await writeFile(join(workspaceRoot, 'data', 'admin-workspace', 'aspen.json'), wfJson)

    const result = await listResortsHandler({ query: {} }, { workspaceRoot })

    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.stale_field_count).toBe(1)
  })

  it('stale_field_count: populated live value but missing field_sources entry → skipped (fs === undefined branch)', async (): Promise<void> => {
    // Pins countStaleFields' `if (fs === undefined) continue` true branch:
    // lodging_sample.median_eur is populated → populatedLivePaths includes it
    // → loop visits the path → combinedSources lookup returns undefined → continue.
    // snow_depth_cm field_sources is absent (no value populated) → not visited.
    await mkdir(join(workspaceRoot, 'data', 'admin-workspace'), { recursive: true })

    const resort = makeResort('aspen', durableFieldSources(FRESH_OBSERVED_AT), 'draft', 'AT')
    const wfJson = JSON.stringify({
      schema_version: 1,
      slug: 'aspen',
      resort,
      live_signal: {
        schema_version: 1,
        resort_slug: 'aspen',
        observed_at: FRESH_OBSERVED_AT,
        fetched_at: FRESH_OBSERVED_AT,
        // snow_depth_cm absent → populatedLivePaths drops it → false branch on line 39.
        lodging_sample: { median_eur: { amount: 100, currency: 'EUR' }, sample_size: 3 },
        field_sources: {
          // 'lodging_sample.median_eur' intentionally absent → fs === undefined → continue.
        },
      },
      modified_at: FRESH_OBSERVED_AT,
    })
    await writeFile(join(workspaceRoot, 'data', 'admin-workspace', 'aspen.json'), wfJson)

    const result = await listResortsHandler({ query: {} }, { workspaceRoot })

    expect(result.items).toHaveLength(1)
    // populatedLivePaths returns ['lodging_sample.median_eur'] but no field_sources
    // entry → fs === undefined → continue → count = 0.
    expect(result.items[0]?.stale_field_count).toBe(0)
  })

  it('stale_field_count: observed_at older than max_stale → never_fetched, NOT counted (Codex round-5 P2)', async (): Promise<void> => {
    // Pins the canonical liveField semantics
    // (loadResortDatasetFromObject.ts:115 — `ageDays > max_stale → never_fetched`).
    // Before the fix, countStaleFields used `ageDays > default` with no upper
    // bound and over-counted >30-day data as stale, disagreeing with the rest
    // of the freshness model. After the fix, the predicate is
    // `default < ageDays <= max_stale` — too-old data falls out into
    // never_fetched and stale_field_count stays 0.
    await mkdir(join(workspaceRoot, 'data', 'admin-workspace'), { recursive: true })

    const resort = makeResort('aspen', durableFieldSources(FRESH_OBSERVED_AT), 'draft', 'AT')
    const wfJson = JSON.stringify({
      schema_version: 1,
      slug: 'aspen',
      resort,
      live_signal: {
        schema_version: 1,
        resort_slug: 'aspen',
        observed_at: TOO_OLD_OBSERVED_AT,
        fetched_at: TOO_OLD_OBSERVED_AT,
        // snow_depth_cm populated → populatedLivePaths includes it → loop visits it.
        // But the field_sources observed_at is 60 days ago > max_stale=30 →
        // canonical model says never_fetched → MUST NOT increment count.
        snow_depth_cm: 80,
        field_sources: {
          'snow_depth_cm': makeFieldSource(TOO_OLD_OBSERVED_AT),
        },
      },
      modified_at: FRESH_OBSERVED_AT,
    })
    await writeFile(join(workspaceRoot, 'data', 'admin-workspace', 'aspen.json'), wfJson)

    const result = await listResortsHandler({ query: {} }, { workspaceRoot })

    expect(result.items).toHaveLength(1)
    // Pre-fix: stale_field_count would be 1 (over-count). Post-fix: 0.
    expect(result.items[0]?.stale_field_count).toBe(0)
  })

  it('page.offset + page.limit slice the filtered set; page.total reflects the filter, not the slice', async (): Promise<void> => {
    await mkdir(join(workspaceRoot, 'data', 'admin-workspace'), { recursive: true })

    // Three resorts so an offset:1, limit:1 slice is non-trivial.
    for (const slug of ['alpha', 'bravo', 'charlie']) {
      const r = makeResort(slug, durableFieldSources(FRESH_OBSERVED_AT), 'draft', 'AT')
      await writeFile(
        join(workspaceRoot, 'data', 'admin-workspace', `${slug}.json`),
        makeWorkspaceFileJson(slug, r, liveFieldSources(FRESH_OBSERVED_AT)),
      )
    }

    const result = await listResortsHandler(
      { query: { page: { offset: 1, limit: 1 } } },
      { workspaceRoot },
    )

    expect(result.items).toHaveLength(1)              // sliced to 1
    expect(result.page).toEqual({ offset: 1, limit: 1, total: 3 })  // total = pre-slice count
  })
})
