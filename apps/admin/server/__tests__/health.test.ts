import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Resort, WorkspaceFile } from '@snowboard-trip-advisor/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { healthHandler } from '../health'

// ---------------------------------------------------------------------------
// Shared fixture builder helpers
// ---------------------------------------------------------------------------

// Relative timestamps — keeps staleness assertions independent of wall-clock
// date. The healthHandler compares (now - observed_at) against a 14-day TTL,
// so hard-coded ISO literals eventually flip from "fresh" to "stale" in CI.
// 1 day ago = guaranteed fresh (<14-day threshold).
// 30 days ago = guaranteed stale (>14-day threshold).
const DAY_MS = 24 * 60 * 60 * 1000
const FRESH_OBSERVED_AT = new Date(Date.now() - DAY_MS).toISOString()
const STALE_OBSERVED_AT = new Date(Date.now() - 30 * DAY_MS).toISOString()
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

/**
 * Build a Resort parse-validated fixture.
 * `fieldSources` keys should be a subset of METRIC_FIELDS. The caller controls
 * which paths are present to exercise missing-provenance and staleness branches.
 */
function makeResort(
  slug: string,
  fieldSources: Record<string, ReturnType<typeof makeFieldSource>>,
): Resort {
  return Resort.parse({
    schema_version: 1,
    slug,
    name: { en: 'Test Resort' },
    country: 'AT',
    region: { en: 'Test Region' },
    altitude_m: { min: 800, max: 1800 },
    slopes_km: 50,
    lift_count: 12,
    skiable_terrain_ha: 200,
    season: { start_month: 12, end_month: 4 },
    publish_state: 'draft',
    field_sources: fieldSources,
  })
}

/** Durable METRIC_FIELDS that live on resort.field_sources (not live_signal). */
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
 * Build a WorkspaceFile literal and serialize it to JSON for writing to disk.
 * Includes a live_signal with live field_sources to cover all METRIC_FIELDS paths.
 */
function makeWorkspaceFileJson(
  slug: string,
  resort: Resort,
  liveSignalFieldSources: Record<string, ReturnType<typeof makeFieldSource>> | null = null,
): string {
  const liveSignal =
    liveSignalFieldSources !== null
      ? {
          schema_version: 1,
          resort_slug: slug,
          observed_at: FRESH_OBSERVED_AT,
          fetched_at: FRESH_OBSERVED_AT,
          field_sources: liveSignalFieldSources,
        }
      : null

  const wf = WorkspaceFile.parse({
    schema_version: 1,
    slug,
    resort,
    live_signal: liveSignal,
    modified_at: FRESH_OBSERVED_AT,
  })
  return JSON.stringify(wf)
}

// ---------------------------------------------------------------------------
// Test setup / teardown
// ---------------------------------------------------------------------------

let workspaceRoot: string

beforeEach(async (): Promise<void> => {
  workspaceRoot = await mkdtemp(join(tmpdir(), 'admin-health-test-'))
})

afterEach(async (): Promise<void> => {
  await rm(workspaceRoot, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('healthHandler (PR 4.2)', (): void => {
  it('happy path: workspace with intact field_sources → resorts_with_missing_provenance === 0', async (): Promise<void> => {
    await mkdir(join(workspaceRoot, 'data', 'admin-workspace'), { recursive: true })

    const resort = makeResort('kotelnica', durableFieldSources(FRESH_OBSERVED_AT))
    await writeFile(
      join(workspaceRoot, 'data', 'admin-workspace', 'kotelnica.json'),
      makeWorkspaceFileJson('kotelnica', resort, liveFieldSources(FRESH_OBSERVED_AT)),
    )

    const result = await healthHandler({ query: {} }, { workspaceRoot })

    expect(result.resorts_with_missing_provenance).toBe(0)
    expect(result.resorts_with_corrupt_workspace).toBe(0)
    expect(result.resorts_with_stale_fields).toBe(0)
    expect(result.resorts_with_failed_fields).toBe(0)
    expect(result.resorts_total).toBe(1)
    expect(result.last_published_at).toBeNull()
    expect(result.archive_size_bytes).toBe(0)
    expect(result.pending_integration_errors).toBe(0)
  })

  it('missing-provenance: workspace file lacks field_sources entry → resorts_with_missing_provenance === 1', async (): Promise<void> => {
    await mkdir(join(workspaceRoot, 'data', 'admin-workspace'), { recursive: true })

    // Fixture: resort.field_sources omits slopes_km; live_signal is null
    // (so live_signal.field_sources is also empty). Combined missing paths:
    // slopes_km (durable) + snow_depth_cm + lifts_open.count + lifts_open.total
    // + lift_pass_day + lodging_sample.median_eur (5 live) = 6 missing total.
    // resorts_with_missing_provenance counts RESORTS with ≥1 missing path,
    // not paths — so the assertion is === 1 (one resort with missing
    // provenance), not === 6.
    // Also exercises the wf.live_signal?.field_sources ?? {} null-branch on
    // health.ts: live_signal is null → combined sources = resort.field_sources only.
    const incompleteFieldSources: Record<string, ReturnType<typeof makeFieldSource>> = {
      'altitude_m.min': makeFieldSource(FRESH_OBSERVED_AT),
      'altitude_m.max': makeFieldSource(FRESH_OBSERVED_AT),
      // 'slopes_km' intentionally omitted → triggers missing-provenance
      'lift_count': makeFieldSource(FRESH_OBSERVED_AT),
      'skiable_terrain_ha': makeFieldSource(FRESH_OBSERVED_AT),
      'season.start_month': makeFieldSource(FRESH_OBSERVED_AT),
      'season.end_month': makeFieldSource(FRESH_OBSERVED_AT),
    }

    const resort = makeResort('spindl', incompleteFieldSources)
    await writeFile(
      join(workspaceRoot, 'data', 'admin-workspace', 'spindl.json'),
      // null live_signal → combined = resort.field_sources only; missing slopes_km + all live paths
      makeWorkspaceFileJson('spindl', resort, null),
    )

    const result = await healthHandler({ query: {} }, { workspaceRoot })

    expect(result.resorts_with_missing_provenance).toBe(1)
    expect(result.resorts_with_corrupt_workspace).toBe(0)
    expect(result.resorts_total).toBe(1)
    expect(result.last_published_at).toBeNull()
  })

  it('corrupt-workspace (P0-4): truncated/invalid JSON file → resorts_with_corrupt_workspace === 1, healthy slugs still aggregate', async (): Promise<void> => {
    await mkdir(join(workspaceRoot, 'data', 'admin-workspace'), { recursive: true })

    // Valid workspace file
    const resort = makeResort('kotelnica', durableFieldSources(FRESH_OBSERVED_AT))
    await writeFile(
      join(workspaceRoot, 'data', 'admin-workspace', 'kotelnica.json'),
      makeWorkspaceFileJson('kotelnica', resort, liveFieldSources(FRESH_OBSERVED_AT)),
    )
    // Truncated / invalid JSON — will fail safeParse
    await writeFile(
      join(workspaceRoot, 'data', 'admin-workspace', 'bad.json'),
      '{not_json',
    )

    const result = await healthHandler({ query: {} }, { workspaceRoot })

    expect(result.resorts_with_corrupt_workspace).toBe(1)
    expect(result.resorts_total).toBe(1)            // bad.json not counted in total
    expect(result.resorts_with_missing_provenance).toBe(0)
    expect(result.last_published_at).toBeNull()
  })

  it('missing-published (§10.9): no data/published/current.v1.json → last_published_at: null, archive_size_bytes: 0', async (): Promise<void> => {
    await mkdir(join(workspaceRoot, 'data', 'admin-workspace'), { recursive: true })

    const resort = makeResort('kotelnica', durableFieldSources(FRESH_OBSERVED_AT))
    await writeFile(
      join(workspaceRoot, 'data', 'admin-workspace', 'kotelnica.json'),
      makeWorkspaceFileJson('kotelnica', resort, liveFieldSources(FRESH_OBSERVED_AT)),
    )
    // No data/published/current.v1.json on disk

    const result = await healthHandler({ query: {} }, { workspaceRoot })

    expect(result.last_published_at).toBeNull()
    expect(result.archive_size_bytes).toBe(0)
    expect(result.resorts_total).toBe(1)
  })

  it('cold-start (§10.9): no workspace files AND no published doc → all aggregates 0', async (): Promise<void> => {
    // Workspace dir does not exist; no published doc
    const result = await healthHandler({ query: {} }, { workspaceRoot })

    expect(result.resorts_total).toBe(0)
    expect(result.resorts_with_stale_fields).toBe(0)
    expect(result.resorts_with_failed_fields).toBe(0)
    expect(result.resorts_with_missing_provenance).toBe(0)
    expect(result.resorts_with_corrupt_workspace).toBe(0)
    expect(result.pending_integration_errors).toBe(0)
    expect(result.last_published_at).toBeNull()
    expect(result.archive_size_bytes).toBe(0)
  })

  it('valid published doc present: last_published_at set, archive_size_bytes > 0, published-only slugs counted', async (): Promise<void> => {
    await mkdir(join(workspaceRoot, 'data', 'admin-workspace'), { recursive: true })
    await mkdir(join(workspaceRoot, 'data', 'published'), { recursive: true })

    // Workspace has one resort
    const resort = makeResort('kotelnica', durableFieldSources(FRESH_OBSERVED_AT))
    await writeFile(
      join(workspaceRoot, 'data', 'admin-workspace', 'kotelnica.json'),
      makeWorkspaceFileJson('kotelnica', resort, liveFieldSources(FRESH_OBSERVED_AT)),
    )

    // Published doc includes a second slug not in workspace → publishedOnlyCount = 1
    const publishedResort = makeResort('spindl', durableFieldSources(FRESH_OBSERVED_AT))
    const publishedDoc = {
      schema_version: 1,
      published_at: '2026-04-26T08:00:00Z',
      resorts: [publishedResort],
      live_signals: [],
      manifest: { resort_count: 1, generated_by: 'test', validator_version: '0.0.0' },
    }
    await writeFile(
      join(workspaceRoot, 'data', 'published', 'current.v1.json'),
      JSON.stringify(publishedDoc),
    )

    const result = await healthHandler({ query: {} }, { workspaceRoot })

    expect(result.last_published_at).toBe('2026-04-26T08:00:00Z')
    expect(result.archive_size_bytes).toBeGreaterThan(0)
    // workspace slug (kotelnica) + published-only slug (spindl not in workspace)
    expect(result.resorts_total).toBe(2)
  })

  it('corrupt published doc: invalid JSON in current.v1.json → last_published_at: null, archive_size_bytes: 0', async (): Promise<void> => {
    await mkdir(join(workspaceRoot, 'data', 'admin-workspace'), { recursive: true })
    await mkdir(join(workspaceRoot, 'data', 'published'), { recursive: true })

    const resort = makeResort('kotelnica', durableFieldSources(FRESH_OBSERVED_AT))
    await writeFile(
      join(workspaceRoot, 'data', 'admin-workspace', 'kotelnica.json'),
      makeWorkspaceFileJson('kotelnica', resort, liveFieldSources(FRESH_OBSERVED_AT)),
    )

    // Publish file exists but has invalid content — safeParse will fail
    await writeFile(
      join(workspaceRoot, 'data', 'published', 'current.v1.json'),
      '{"schema_version": 1, "published_at": "bad-date", "resorts": [], "live_signals": [], "manifest": {}}',
    )

    const result = await healthHandler({ query: {} }, { workspaceRoot })

    expect(result.last_published_at).toBeNull()
    expect(result.archive_size_bytes).toBe(0)
    expect(result.resorts_total).toBe(1)
  })

  it('stale-fields: workspace file with field_sources observed_at older than 14 days → resorts_with_stale_fields === 1', async (): Promise<void> => {
    await mkdir(join(workspaceRoot, 'data', 'admin-workspace'), { recursive: true })

    // All durable paths are fresh, but live paths are stale (>14d observed_at).
    // The stale check covers resort.field_sources AND live_signal.field_sources.
    const resort = makeResort('stale-resort', durableFieldSources(FRESH_OBSERVED_AT))
    await writeFile(
      join(workspaceRoot, 'data', 'admin-workspace', 'stale-resort.json'),
      makeWorkspaceFileJson('stale-resort', resort, liveFieldSources(STALE_OBSERVED_AT)),
    )

    const result = await healthHandler({ query: {} }, { workspaceRoot })

    expect(result.resorts_with_stale_fields).toBe(1)
    expect(result.resorts_total).toBe(1)
    expect(result.resorts_with_corrupt_workspace).toBe(0)
    expect(result.resorts_with_missing_provenance).toBe(0)
  })

  // ---------------------------------------------------------------------------
  // P1 fix: published-only resorts must be included in per-field aggregates
  // ---------------------------------------------------------------------------

  it('P1: published-only resort with stale field_sources → resorts_with_stale_fields === 1', async (): Promise<void> => {
    // Empty workspace dir — no workspace files at all.
    await mkdir(join(workspaceRoot, 'data', 'admin-workspace'), { recursive: true })
    await mkdir(join(workspaceRoot, 'data', 'published'), { recursive: true })

    // Published doc has one resort with stale durable field_sources.
    // A matching live_signal is provided with fresh field_sources, so stale
    // detection depends on the durable paths (Option C: combined sources).
    const staleResort = makeResort('ischgl', {
      ...durableFieldSources(STALE_OBSERVED_AT),  // durable paths stale
    })
    const publishedDoc = {
      schema_version: 1,
      published_at: '2026-04-26T08:00:00Z',
      resorts: [staleResort],
      live_signals: [
        {
          schema_version: 1,
          resort_slug: 'ischgl',
          observed_at: FRESH_OBSERVED_AT,
          fetched_at: FRESH_OBSERVED_AT,
          field_sources: liveFieldSources(FRESH_OBSERVED_AT),  // live paths fresh
        },
      ],
      manifest: { resort_count: 1, generated_by: 'test', validator_version: '0.0.0' },
    }
    await writeFile(
      join(workspaceRoot, 'data', 'published', 'current.v1.json'),
      JSON.stringify(publishedDoc),
    )

    const result = await healthHandler({ query: {} }, { workspaceRoot })

    // The published-only resort has stale durable paths — should be counted.
    expect(result.resorts_with_stale_fields).toBe(1)
    expect(result.resorts_total).toBe(1)
    expect(result.resorts_with_corrupt_workspace).toBe(0)
    // All METRIC_FIELDS paths present in combined sources (durable + live) → no missing provenance.
    expect(result.resorts_with_missing_provenance).toBe(0)
  })

  it('P1: published-only resort with missing field_sources entry → resorts_with_missing_provenance === 1', async (): Promise<void> => {
    // Option C semantics: missing provenance is checked against combined sources
    // (resort.field_sources + live_signal.field_sources). If no live_signal
    // is present for the published-only resort, live paths are absent → counts as missing.
    await mkdir(join(workspaceRoot, 'data', 'admin-workspace'), { recursive: true })
    await mkdir(join(workspaceRoot, 'data', 'published'), { recursive: true })

    // Resort with durable field_sources complete; NO live_signal in published doc.
    // → combined sources missing all 5 live paths → hasMissingProvenance = true.
    const publishedResort = makeResort('saalbach', durableFieldSources(FRESH_OBSERVED_AT))
    const publishedDoc = {
      schema_version: 1,
      published_at: '2026-04-26T08:00:00Z',
      resorts: [publishedResort],
      live_signals: [],  // no live_signal → live paths absent in combined sources
      manifest: { resort_count: 1, generated_by: 'test', validator_version: '0.0.0' },
    }
    await writeFile(
      join(workspaceRoot, 'data', 'published', 'current.v1.json'),
      JSON.stringify(publishedDoc),
    )

    const result = await healthHandler({ query: {} }, { workspaceRoot })

    // Missing live-path provenance surfaces correctly for published-only resorts.
    expect(result.resorts_with_missing_provenance).toBe(1)
    expect(result.resorts_total).toBe(1)
    expect(result.resorts_with_stale_fields).toBe(0)  // durable paths are fresh
    expect(result.resorts_with_corrupt_workspace).toBe(0)
  })

  it('P1: mixed — 1 workspace stale + 1 published-only stale → resorts_with_stale_fields === 2', async (): Promise<void> => {
    await mkdir(join(workspaceRoot, 'data', 'admin-workspace'), { recursive: true })
    await mkdir(join(workspaceRoot, 'data', 'published'), { recursive: true })

    // Workspace: one stale resort (live paths stale).
    const workspaceResort = makeResort('kotelnica', durableFieldSources(FRESH_OBSERVED_AT))
    await writeFile(
      join(workspaceRoot, 'data', 'admin-workspace', 'kotelnica.json'),
      makeWorkspaceFileJson('kotelnica', workspaceResort, liveFieldSources(STALE_OBSERVED_AT)),
    )

    // Published: workspace resort is also in the published doc (workspace takes
    // precedence — it must NOT be double-counted) + one published-only stale resort.
    const publishedWorkspaceResort = makeResort('kotelnica', durableFieldSources(FRESH_OBSERVED_AT))
    const publishedOnlyResort = makeResort('livigno', durableFieldSources(STALE_OBSERVED_AT))
    const publishedDoc = {
      schema_version: 1,
      published_at: '2026-04-26T08:00:00Z',
      resorts: [publishedWorkspaceResort, publishedOnlyResort],
      live_signals: [
        {
          schema_version: 1,
          resort_slug: 'livigno',
          observed_at: FRESH_OBSERVED_AT,
          fetched_at: FRESH_OBSERVED_AT,
          field_sources: liveFieldSources(FRESH_OBSERVED_AT),  // live paths fresh; durable stale
        },
      ],
      manifest: { resort_count: 2, generated_by: 'test', validator_version: '0.0.0' },
    }
    await writeFile(
      join(workspaceRoot, 'data', 'published', 'current.v1.json'),
      JSON.stringify(publishedDoc),
    )

    const result = await healthHandler({ query: {} }, { workspaceRoot })

    // Both the workspace resort (stale live paths) and the published-only resort
    // (stale durable paths) contribute to the stale count.
    expect(result.resorts_with_stale_fields).toBe(2)
    // kotelnica (workspace) + livigno (published-only) = 2 total
    expect(result.resorts_total).toBe(2)
    expect(result.resorts_with_corrupt_workspace).toBe(0)
  })

  // ---------------------------------------------------------------------------
  // P2 fix: malformed published JSON must degrade gracefully (not 500)
  // ---------------------------------------------------------------------------

  it('P2: malformed published JSON (parse failure) → last_published_at: null, archive_size_bytes: 0, resorts_total === workspace count', async (): Promise<void> => {
    // Distinct from the existing "corrupt published doc" test which writes valid
    // JSON with an invalid schema shape. This test writes syntactically invalid
    // JSON → JSON.parse throws SyntaxError → must be treated as absent.
    await mkdir(join(workspaceRoot, 'data', 'admin-workspace'), { recursive: true })
    await mkdir(join(workspaceRoot, 'data', 'published'), { recursive: true })

    const resort = makeResort('kotelnica', durableFieldSources(FRESH_OBSERVED_AT))
    await writeFile(
      join(workspaceRoot, 'data', 'admin-workspace', 'kotelnica.json'),
      makeWorkspaceFileJson('kotelnica', resort, liveFieldSources(FRESH_OBSERVED_AT)),
    )

    // Syntactically invalid JSON — JSON.parse throws SyntaxError.
    await writeFile(
      join(workspaceRoot, 'data', 'published', 'current.v1.json'),
      '{not_valid_json',
    )

    const result = await healthHandler({ query: {} }, { workspaceRoot })

    // Malformed JSON ≡ absent: no published contribution.
    expect(result.last_published_at).toBeNull()
    expect(result.archive_size_bytes).toBe(0)
    // Only workspace resort counted; no published-only resorts.
    expect(result.resorts_total).toBe(1)
    expect(result.resorts_with_corrupt_workspace).toBe(0)
    expect(result.resorts_with_stale_fields).toBe(0)
  })
})
