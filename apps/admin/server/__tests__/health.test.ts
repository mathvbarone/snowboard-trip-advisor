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

  it('missing-provenance: workspace file lacks durable field_sources entry → resorts_with_missing_provenance === 1', async (): Promise<void> => {
    await mkdir(join(workspaceRoot, 'data', 'admin-workspace'), { recursive: true })

    // Fixture: resort.field_sources omits slopes_km (durable path); live_signal is null
    // (no live values populated → no live paths required per round-4 fix).
    // Only the durable-path miss matters → hasMissingDurableProvenance = true.
    // Exercises the DURABLE_METRIC_FIELDS check and the null live_signal branch.
    const incompleteFieldSources: Record<string, ReturnType<typeof makeFieldSource>> = {
      'altitude_m.min': makeFieldSource(FRESH_OBSERVED_AT),
      'altitude_m.max': makeFieldSource(FRESH_OBSERVED_AT),
      // 'slopes_km' intentionally omitted → triggers durable missing-provenance
      'lift_count': makeFieldSource(FRESH_OBSERVED_AT),
      'skiable_terrain_ha': makeFieldSource(FRESH_OBSERVED_AT),
      'season.start_month': makeFieldSource(FRESH_OBSERVED_AT),
      'season.end_month': makeFieldSource(FRESH_OBSERVED_AT),
    }

    const resort = makeResort('spindl', incompleteFieldSources)
    await writeFile(
      join(workspaceRoot, 'data', 'admin-workspace', 'spindl.json'),
      // null live_signal → no live values populated → no live paths required
      makeWorkspaceFileJson('spindl', resort, null),
    )

    const result = await healthHandler({ query: {} }, { workspaceRoot })

    expect(result.resorts_with_missing_provenance).toBe(1)
    expect(result.resorts_with_corrupt_workspace).toBe(0)
    expect(result.resorts_total).toBe(1)
    expect(result.last_published_at).toBeNull()
  })

  it('round-4 fix: null live_signal + complete durable field_sources → resorts_with_missing_provenance === 0', async (): Promise<void> => {
    // Pins the fix: a null live_signal means no live values are populated,
    // so no live field_sources are required. Only durable paths matter.
    // Before the fix, all 5 live paths would be flagged as missing → count=1.
    // After the fix, null live_signal → 0 live paths required → count=0.
    await mkdir(join(workspaceRoot, 'data', 'admin-workspace'), { recursive: true })

    const resort = makeResort('complete-durable', durableFieldSources(FRESH_OBSERVED_AT))
    await writeFile(
      join(workspaceRoot, 'data', 'admin-workspace', 'complete-durable.json'),
      // null live_signal → no live values → no live field_sources required
      makeWorkspaceFileJson('complete-durable', resort, null),
    )

    const result = await healthHandler({ query: {} }, { workspaceRoot })

    // All durable paths present; no live values populated → no missing provenance.
    expect(result.resorts_with_missing_provenance).toBe(0)
    expect(result.resorts_with_corrupt_workspace).toBe(0)
    expect(result.resorts_total).toBe(1)
  })

  it('round-4 fix: populated live_signal value without matching field_sources entry → resorts_with_missing_provenance === 1', async (): Promise<void> => {
    // Pins the conditional-live-path requirement: when a live value is set,
    // its field_sources entry is required. Here all 5 live values are populated
    // (exercises all branches of populatedLivePaths) but lift_pass_day is absent
    // from field_sources → hasMissingLiveProvenance.
    await mkdir(join(workspaceRoot, 'data', 'admin-workspace'), { recursive: true })

    const resort = makeResort('missing-live-source', durableFieldSources(FRESH_OBSERVED_AT))
    // Build a live_signal with ALL live values set to exercise all populatedLivePaths
    // branches, but lift_pass_day missing from field_sources.
    const liveSignalWithMissingSource = {
      schema_version: 1,
      resort_slug: 'missing-live-source',
      observed_at: FRESH_OBSERVED_AT,
      fetched_at: FRESH_OBSERVED_AT,
      snow_depth_cm: 50,                     // populates 'snow_depth_cm' path
      lifts_open: { count: 8, total: 12 },   // populates 'lifts_open.count' and 'lifts_open.total'
      lift_pass_day: { amount: 60, currency: 'EUR' },  // populates 'lift_pass_day' — field_sources entry ABSENT below
      lodging_sample: { median_eur: { amount: 120, currency: 'EUR' }, sample_size: 5 }, // populates 'lodging_sample.median_eur'
      field_sources: {
        'snow_depth_cm': makeFieldSource(FRESH_OBSERVED_AT),
        'lifts_open.count': makeFieldSource(FRESH_OBSERVED_AT),
        'lifts_open.total': makeFieldSource(FRESH_OBSERVED_AT),
        // 'lift_pass_day' intentionally absent → triggers hasMissingLiveProvenance
        'lodging_sample.median_eur': makeFieldSource(FRESH_OBSERVED_AT),
      },
    }
    const wfJson = JSON.stringify({
      schema_version: 1,
      slug: 'missing-live-source',
      resort,
      live_signal: liveSignalWithMissingSource,
      modified_at: FRESH_OBSERVED_AT,
    })
    await writeFile(
      join(workspaceRoot, 'data', 'admin-workspace', 'missing-live-source.json'),
      wfJson,
    )

    const result = await healthHandler({ query: {} }, { workspaceRoot })

    // lift_pass_day is populated but missing from field_sources → counted.
    expect(result.resorts_with_missing_provenance).toBe(1)
    expect(result.resorts_with_corrupt_workspace).toBe(0)
    expect(result.resorts_total).toBe(1)
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

  it('P1: published-only resort with stale live field_sources → resorts_with_stale_fields === 1', async (): Promise<void> => {
    // Empty workspace dir — no workspace files at all.
    await mkdir(join(workspaceRoot, 'data', 'admin-workspace'), { recursive: true })
    await mkdir(join(workspaceRoot, 'data', 'published'), { recursive: true })

    // Published doc has one resort with fresh durable field_sources and a
    // matching live_signal with stale live field_sources. Only live paths are
    // subject to clock-based staleness (durable paths are never-stale-by-clock
    // per loadResortDatasetFromObject.ts:83-99).
    const freshResort = makeResort('ischgl', {
      ...durableFieldSources(FRESH_OBSERVED_AT),  // durable paths fresh (never stale by clock)
    })
    const publishedDoc = {
      schema_version: 1,
      published_at: '2026-04-26T08:00:00Z',
      resorts: [freshResort],
      live_signals: [
        {
          schema_version: 1,
          resort_slug: 'ischgl',
          observed_at: STALE_OBSERVED_AT,
          fetched_at: STALE_OBSERVED_AT,
          field_sources: liveFieldSources(STALE_OBSERVED_AT),  // live paths stale → triggers count
        },
      ],
      manifest: { resort_count: 1, generated_by: 'test', validator_version: '0.0.0' },
    }
    await writeFile(
      join(workspaceRoot, 'data', 'published', 'current.v1.json'),
      JSON.stringify(publishedDoc),
    )

    const result = await healthHandler({ query: {} }, { workspaceRoot })

    // The published-only resort has stale live paths — should be counted.
    expect(result.resorts_with_stale_fields).toBe(1)
    expect(result.resorts_total).toBe(1)
    expect(result.resorts_with_corrupt_workspace).toBe(0)
    // All METRIC_FIELDS paths present in combined sources (durable + live) → no missing provenance.
    expect(result.resorts_with_missing_provenance).toBe(0)
  })

  it('P1: published-only resort with missing durable field_sources entry → resorts_with_missing_provenance === 1', async (): Promise<void> => {
    // After the round-4 fix, missing provenance for published-only resorts requires
    // a durable-path miss (live paths are only required when values are populated).
    // Resort omits slopes_km from field_sources; no live_signal → no live paths required.
    // → hasMissingDurableProvenance fires → count === 1.
    await mkdir(join(workspaceRoot, 'data', 'admin-workspace'), { recursive: true })
    await mkdir(join(workspaceRoot, 'data', 'published'), { recursive: true })

    // Resort with slopes_km OMITTED from durable field_sources.
    const incompleteFieldSources: Record<string, ReturnType<typeof makeFieldSource>> = {
      'altitude_m.min': makeFieldSource(FRESH_OBSERVED_AT),
      'altitude_m.max': makeFieldSource(FRESH_OBSERVED_AT),
      // 'slopes_km' intentionally omitted → triggers durable missing-provenance
      'lift_count': makeFieldSource(FRESH_OBSERVED_AT),
      'skiable_terrain_ha': makeFieldSource(FRESH_OBSERVED_AT),
      'season.start_month': makeFieldSource(FRESH_OBSERVED_AT),
      'season.end_month': makeFieldSource(FRESH_OBSERVED_AT),
    }
    const publishedResort = makeResort('saalbach', incompleteFieldSources)
    const publishedDoc = {
      schema_version: 1,
      published_at: '2026-04-26T08:00:00Z',
      resorts: [publishedResort],
      live_signals: [],  // no live_signal → no live values → no live paths required
      manifest: { resort_count: 1, generated_by: 'test', validator_version: '0.0.0' },
    }
    await writeFile(
      join(workspaceRoot, 'data', 'published', 'current.v1.json'),
      JSON.stringify(publishedDoc),
    )

    const result = await healthHandler({ query: {} }, { workspaceRoot })

    // Missing durable-path provenance surfaces correctly for published-only resorts.
    expect(result.resorts_with_missing_provenance).toBe(1)
    expect(result.resorts_total).toBe(1)
    expect(result.resorts_with_stale_fields).toBe(0)
    expect(result.resorts_with_corrupt_workspace).toBe(0)
  })

  it('round-4 fix: published-only resort with populated live value but missing live field_sources → resorts_with_missing_provenance === 1', async (): Promise<void> => {
    // Pins the conditional-live-path requirement for the published-only loop.
    // A published resort with complete durable field_sources and a live_signal
    // that has snow_depth_cm populated but NO field_sources entry for it
    // → hasMissingLiveProvenance fires in the published-only branch → count=1.
    await mkdir(join(workspaceRoot, 'data', 'admin-workspace'), { recursive: true })
    await mkdir(join(workspaceRoot, 'data', 'published'), { recursive: true })

    const publishedResort = makeResort('davos', durableFieldSources(FRESH_OBSERVED_AT))
    const publishedDoc = {
      schema_version: 1,
      published_at: '2026-04-26T08:00:00Z',
      resorts: [publishedResort],
      live_signals: [
        {
          schema_version: 1,
          resort_slug: 'davos',
          observed_at: FRESH_OBSERVED_AT,
          fetched_at: FRESH_OBSERVED_AT,
          snow_depth_cm: 80,  // value populated → field_sources entry required
          field_sources: {
            // snow_depth_cm intentionally absent → triggers hasMissingLiveProvenance
          },
        },
      ],
      manifest: { resort_count: 1, generated_by: 'test', validator_version: '0.0.0' },
    }
    await writeFile(
      join(workspaceRoot, 'data', 'published', 'current.v1.json'),
      JSON.stringify(publishedDoc),
    )

    const result = await healthHandler({ query: {} }, { workspaceRoot })

    // Live path populated but field_sources entry absent → counted.
    expect(result.resorts_with_missing_provenance).toBe(1)
    expect(result.resorts_total).toBe(1)
    expect(result.resorts_with_stale_fields).toBe(0)  // snow_depth_cm has no field_sources → not checked for staleness
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
    const publishedOnlyResort = makeResort('livigno', durableFieldSources(FRESH_OBSERVED_AT))
    const publishedDoc = {
      schema_version: 1,
      published_at: '2026-04-26T08:00:00Z',
      resorts: [publishedWorkspaceResort, publishedOnlyResort],
      live_signals: [
        {
          schema_version: 1,
          resort_slug: 'livigno',
          observed_at: STALE_OBSERVED_AT,
          fetched_at: STALE_OBSERVED_AT,
          field_sources: liveFieldSources(STALE_OBSERVED_AT),  // live paths stale — triggers count
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
    // (stale live paths) contribute to the stale count.
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

  // ---------------------------------------------------------------------------
  // Round-3 Codex fix: durable paths are never-stale-by-clock
  // ---------------------------------------------------------------------------

  it('round-3 fix: durable path (slopes_km) with stale observed_at → resorts_with_stale_fields === 0', async (): Promise<void> => {
    // Pins the fix: durable resort attributes do not go stale by clock.
    // Only live paths (snow_depth_cm etc.) are subject to the TTL check.
    await mkdir(join(workspaceRoot, 'data', 'admin-workspace'), { recursive: true })

    // All durable paths are stale (30 days old); all live paths are fresh.
    // After the fix, only live paths are checked → no stale resort counted.
    const resort = makeResort('stale-durable', durableFieldSources(STALE_OBSERVED_AT))
    await writeFile(
      join(workspaceRoot, 'data', 'admin-workspace', 'stale-durable.json'),
      makeWorkspaceFileJson('stale-durable', resort, liveFieldSources(FRESH_OBSERVED_AT)),
    )

    const result = await healthHandler({ query: {} }, { workspaceRoot })

    // Durable paths are never-stale-by-clock → not counted as stale.
    expect(result.resorts_with_stale_fields).toBe(0)
    expect(result.resorts_total).toBe(1)
    expect(result.resorts_with_corrupt_workspace).toBe(0)
    expect(result.resorts_with_missing_provenance).toBe(0)
  })

  it('round-3 fix: mixed durable-stale + live-stale → resorts_with_stale_fields === 1 (only live-path staleness counts)', async (): Promise<void> => {
    // Two workspace resorts: one with both durable and live paths stale (should
    // count once — the live path is what triggers it), one with only durable
    // paths stale and live paths fresh (should NOT count).
    await mkdir(join(workspaceRoot, 'data', 'admin-workspace'), { recursive: true })

    // Resort A: durable stale + live stale → counts (live path triggers it).
    const resortA = makeResort('both-stale', durableFieldSources(STALE_OBSERVED_AT))
    await writeFile(
      join(workspaceRoot, 'data', 'admin-workspace', 'both-stale.json'),
      makeWorkspaceFileJson('both-stale', resortA, liveFieldSources(STALE_OBSERVED_AT)),
    )

    // Resort B: durable stale + live fresh → does NOT count (live path is fresh).
    const resortB = makeResort('durable-stale-only', durableFieldSources(STALE_OBSERVED_AT))
    await writeFile(
      join(workspaceRoot, 'data', 'admin-workspace', 'durable-stale-only.json'),
      makeWorkspaceFileJson('durable-stale-only', resortB, liveFieldSources(FRESH_OBSERVED_AT)),
    )

    const result = await healthHandler({ query: {} }, { workspaceRoot })

    // Only the resort with stale live paths contributes to the stale count.
    expect(result.resorts_with_stale_fields).toBe(1)
    expect(result.resorts_total).toBe(2)
    expect(result.resorts_with_corrupt_workspace).toBe(0)
  })
})
