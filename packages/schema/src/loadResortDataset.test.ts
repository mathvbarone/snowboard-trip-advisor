import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { loadResortDataset, FRESHNESS_TTL_DAYS } from './loadResortDataset'

// Verified: packages/schema/src/loadResortDataset.test.ts
// → ../../.. → worktree root → data/published/current.v1.json
const FIXTURE_PATH = fileURLToPath(
  new URL('../../../data/published/current.v1.json', import.meta.url),
)

describe('loadResortDataset (Epic 2 PR 2.4)', (): void => {
  it('returns 2 ResortViews for the PR 2.1 seed fixture', async (): Promise<void> => {
    const result = await loadResortDataset(FIXTURE_PATH, {
      now: new Date('2026-04-26T08:00:00Z'),                    // freeze to fixture day
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.views.length).toBe(2)
      expect(result.views[0]?.slug).toBe('kotelnica-bialczanska')
      expect(result.views[1]?.slug).toBe('spindleruv-mlyn')
    }
  })

  it('projects durable fields as state=fresh (durable data does not go stale)', async (): Promise<void> => {
    const result = await loadResortDataset(FIXTURE_PATH, {
      now: new Date('2099-01-01T00:00:00Z'),                    // far future
    })
    if (result.ok) {
      expect(result.views[0]?.slopes_km.state).toBe('fresh')
    }
  })

  it('projects live fields as state=stale when observed_at is between TTL.default and TTL.max_stale', async (): Promise<void> => {
    const result = await loadResortDataset(FIXTURE_PATH, {
      now: new Date('2026-05-15T08:00:00Z'),                    // 19 days after fixture observed_at
    })
    if (result.ok) {
      // 19 > 14 (default) but < 30 (max_stale) → stale
      expect(result.views[0]?.snow_depth_cm.state).toBe('stale')
    }
  })

  it('projects live fields as state=never_fetched when observed_at is older than TTL.max_stale', async (): Promise<void> => {
    const result = await loadResortDataset(FIXTURE_PATH, {
      now: new Date('2026-06-15T08:00:00Z'),                    // ~50 days
    })
    if (result.ok) {
      expect(result.views[0]?.snow_depth_cm.state).toBe('never_fetched')
    }
  })

  it('returns { ok: false, issues } when the file fails validation', async (): Promise<void> => {
    const tmp = await mkdtemp(join(tmpdir(), 'sta-load-'))
    const bad = join(tmp, 'bad.json')
    await writeFile(bad, JSON.stringify({ schema_version: 99 }))
    const result = await loadResortDataset(bad)
    expect(result.ok).toBe(false)
    await rm(tmp, { recursive: true, force: true })
  })

  it('returns { ok: false } when the path does not exist', async (): Promise<void> => {
    await expect(loadResortDataset('/nonexistent/path.json')).rejects.toBeDefined()
    // Note: the function doesn't catch ENOENT; file-not-found is a programmer error.
    // Validation failures (file exists but is malformed) surface as { ok: false, issues }.
  })

  it('exposes FRESHNESS_TTL_DAYS = { default: 14, max_stale: 30 } as the Phase 1 default', (): void => {
    expect(FRESHNESS_TTL_DAYS).toEqual({ default: 14, max_stale: 30 })
  })

  it('works when called without options (default now branch)', async (): Promise<void> => {
    // Covers the `now = new Date()` default — called without options object at all.
    // The fixture data is from 2026-04-26; with today's date it will be stale or never_fetched,
    // but the call must resolve without throwing.
    const result = await loadResortDataset(FIXTURE_PATH)
    // We only assert structural correctness — the freshness state depends on wall-clock time.
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.views.length).toBe(2)
    }
  })

  it('projects live fields as state=never_fetched when the resort has no live signal', async (): Promise<void> => {
    // Covers the `live === undefined` branch in liveField (resort in resorts[] with no
    // matching entry in live_signals[]).
    const tmp = await mkdtemp(join(tmpdir(), 'sta-no-live-'))
    const noLiveFixture = join(tmp, 'no-live.json')
    // Minimal valid fixture: single resort with full durable field_sources, no live signal.
    const fieldSource = {
      source: 'manual',
      source_url: 'https://example.com/',
      observed_at: '2026-04-26T08:00:00Z',
      fetched_at: '2026-04-26T08:00:00Z',
      upstream_hash: '0000000000000000000000000000000000000000000000000000000000000001',
      attribution_block: { en: 'Test.' },
    }
    await writeFile(noLiveFixture, JSON.stringify({
      schema_version: 1,
      published_at: '2026-04-26T08:00:00Z',
      manifest: { resort_count: 1, generated_by: 'test', validator_version: '1.0.0' },
      resorts: [{
        schema_version: 1,
        slug: 'test-resort',
        name: { en: 'Test Resort' },
        country: 'AT',
        region: { en: 'Test Region' },
        altitude_m: { min: 500, max: 1000 },
        slopes_km: 10,
        lift_count: 5,
        skiable_terrain_ha: 20,
        season: { start_month: 12, end_month: 4 },
        publish_state: 'published',
        field_sources: {
          'altitude_m.min': fieldSource,
          'altitude_m.max': fieldSource,
          'slopes_km': fieldSource,
          'lift_count': fieldSource,
          'skiable_terrain_ha': fieldSource,
          'season.start_month': fieldSource,
          'season.end_month': fieldSource,
        },
      }],
      live_signals: [],
    }))
    const result = await loadResortDataset(noLiveFixture, {
      now: new Date('2026-04-26T08:00:00Z'),
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.views[0]?.snow_depth_cm.state).toBe('never_fetched')
      expect(result.views[0]?.lift_pass_day.state).toBe('never_fetched')
    }
    await rm(tmp, { recursive: true, force: true })
  })

  it('projects live field as state=never_fetched when the optional field value is absent from the live signal', async (): Promise<void> => {
    // Covers the `value === undefined` branch in liveField: live signal exists but
    // an optional field (e.g. lift_pass_day) is not populated. This is valid because
    // all live signal fields are optional in the schema.
    const tmp = await mkdtemp(join(tmpdir(), 'sta-partial-live-'))
    const partialFixture = join(tmp, 'partial.json')
    const fieldSource = {
      source: 'manual',
      source_url: 'https://example.com/',
      observed_at: '2026-04-26T08:00:00Z',
      fetched_at: '2026-04-26T08:00:00Z',
      upstream_hash: '0000000000000000000000000000000000000000000000000000000000000001',
      attribution_block: { en: 'Test.' },
    }
    await writeFile(partialFixture, JSON.stringify({
      schema_version: 1,
      published_at: '2026-04-26T08:00:00Z',
      manifest: { resort_count: 1, generated_by: 'test', validator_version: '1.0.0' },
      resorts: [{
        schema_version: 1,
        slug: 'test-resort',
        name: { en: 'Test Resort' },
        country: 'AT',
        region: { en: 'Test Region' },
        altitude_m: { min: 500, max: 1000 },
        slopes_km: 10,
        lift_count: 5,
        skiable_terrain_ha: 20,
        season: { start_month: 12, end_month: 4 },
        publish_state: 'published',
        field_sources: {
          'altitude_m.min': fieldSource,
          'altitude_m.max': fieldSource,
          'slopes_km': fieldSource,
          'lift_count': fieldSource,
          'skiable_terrain_ha': fieldSource,
          'season.start_month': fieldSource,
          'season.end_month': fieldSource,
        },
      }],
      live_signals: [{
        schema_version: 1,
        resort_slug: 'test-resort',
        observed_at: '2026-04-26T08:00:00Z',
        fetched_at: '2026-04-26T08:00:00Z',
        // Only snow_depth_cm is populated; lift_pass_day and lodging_sample are absent.
        snow_depth_cm: 42,
        field_sources: {
          'snow_depth_cm': fieldSource,
        },
      }],
    }))
    const result = await loadResortDataset(partialFixture, {
      now: new Date('2026-04-26T08:00:00Z'),
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      // snow_depth_cm is present → fresh
      expect(result.views[0]?.snow_depth_cm.state).toBe('fresh')
      // lift_pass_day is absent (value === undefined) → never_fetched
      expect(result.views[0]?.lift_pass_day.state).toBe('never_fetched')
      // lodging_sample_median_eur is absent → never_fetched
      expect(result.views[0]?.lodging_sample_median_eur.state).toBe('never_fetched')
    }
    await rm(tmp, { recursive: true, force: true })
  })
})

