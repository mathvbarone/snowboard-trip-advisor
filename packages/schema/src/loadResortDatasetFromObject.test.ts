import { describe, expect, it } from 'vitest'

import { loadResortDatasetFromObject, FRESHNESS_TTL_DAYS } from './loadResortDatasetFromObject'

const fieldSource = {
  source: 'manual',
  source_url: 'https://example.com/',
  observed_at: '2026-04-26T08:00:00Z',
  fetched_at: '2026-04-26T08:00:00Z',
  upstream_hash: '0000000000000000000000000000000000000000000000000000000000000001',
  attribution_block: { en: 'Test.' },
}

const baseResort = {
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
    slopes_km: fieldSource,
    lift_count: fieldSource,
    skiable_terrain_ha: fieldSource,
    'season.start_month': fieldSource,
    'season.end_month': fieldSource,
  },
}

function buildDataset(overrides: { live_signals?: ReadonlyArray<unknown> } = {}): unknown {
  return {
    schema_version: 1,
    published_at: '2026-04-26T08:00:00Z',
    manifest: { resort_count: 1, generated_by: 'test', validator_version: '1.0.0' },
    resorts: [baseResort],
    live_signals: overrides.live_signals ?? [],
  }
}

describe('loadResortDatasetFromObject (PR 3.1c)', (): void => {
  it('projects durable fields as state=fresh (durable data does not go stale)', async (): Promise<void> => {
    const result = await loadResortDatasetFromObject(buildDataset(), {
      now: new Date('2099-01-01T00:00:00Z'),
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.views[0]?.slopes_km.state).toBe('fresh')
    }
  })

  it('projects live fields as state=fresh inside the default TTL window', async (): Promise<void> => {
    const liveSignal = {
      schema_version: 1,
      resort_slug: 'test-resort',
      observed_at: '2026-04-26T08:00:00Z',
      fetched_at: '2026-04-26T08:00:00Z',
      snow_depth_cm: 42,
      field_sources: { snow_depth_cm: fieldSource },
    }
    const result = await loadResortDatasetFromObject(
      buildDataset({ live_signals: [liveSignal] }),
      { now: new Date('2026-04-27T08:00:00Z') },
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.views[0]?.snow_depth_cm.state).toBe('fresh')
    }
  })

  it('projects live fields as state=stale between TTL.default and TTL.max_stale', async (): Promise<void> => {
    const liveSignal = {
      schema_version: 1,
      resort_slug: 'test-resort',
      observed_at: '2026-04-26T08:00:00Z',
      fetched_at: '2026-04-26T08:00:00Z',
      snow_depth_cm: 42,
      field_sources: { snow_depth_cm: fieldSource },
    }
    const result = await loadResortDatasetFromObject(
      buildDataset({ live_signals: [liveSignal] }),
      { now: new Date('2026-05-15T08:00:00Z') },
    )
    if (result.ok) {
      expect(result.views[0]?.snow_depth_cm.state).toBe('stale')
    }
  })

  it('projects live fields as state=never_fetched older than TTL.max_stale', async (): Promise<void> => {
    const liveSignal = {
      schema_version: 1,
      resort_slug: 'test-resort',
      observed_at: '2026-04-26T08:00:00Z',
      fetched_at: '2026-04-26T08:00:00Z',
      snow_depth_cm: 42,
      field_sources: { snow_depth_cm: fieldSource },
    }
    const result = await loadResortDatasetFromObject(
      buildDataset({ live_signals: [liveSignal] }),
      { now: new Date('2026-06-15T08:00:00Z') },
    )
    if (result.ok) {
      expect(result.views[0]?.snow_depth_cm.state).toBe('never_fetched')
    }
  })

  it('projects live fields as state=never_fetched when the resort has no live signal', async (): Promise<void> => {
    const result = await loadResortDatasetFromObject(buildDataset(), {
      now: new Date('2026-04-26T08:00:00Z'),
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.views[0]?.snow_depth_cm.state).toBe('never_fetched')
      expect(result.views[0]?.lift_pass_day.state).toBe('never_fetched')
    }
  })

  it('projects live field as state=never_fetched when the optional field value is absent from the live signal', async (): Promise<void> => {
    const liveSignal = {
      schema_version: 1,
      resort_slug: 'test-resort',
      observed_at: '2026-04-26T08:00:00Z',
      fetched_at: '2026-04-26T08:00:00Z',
      snow_depth_cm: 42,
      field_sources: { snow_depth_cm: fieldSource },
    }
    const result = await loadResortDatasetFromObject(
      buildDataset({ live_signals: [liveSignal] }),
      { now: new Date('2026-04-26T08:00:00Z') },
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.views[0]?.snow_depth_cm.state).toBe('fresh')
      expect(result.views[0]?.lift_pass_day.state).toBe('never_fetched')
      expect(result.views[0]?.lodging_sample_median_eur.state).toBe('never_fetched')
    }
  })

  it('returns { ok: false, issues } when the input fails validation', async (): Promise<void> => {
    const result = await loadResortDatasetFromObject({ schema_version: 99 })
    expect(result.ok).toBe(false)
  })

  it('works without options (default now branch)', async (): Promise<void> => {
    const result = await loadResortDatasetFromObject(buildDataset())
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.views.length).toBe(1)
    }
  })

  it('exposes FRESHNESS_TTL_DAYS as the Phase 1 default', (): void => {
    expect(FRESHNESS_TTL_DAYS).toEqual({ default: 14, max_stale: 30 })
  })

  it('projects a Money-bearing live field (lodging_sample) when present', async (): Promise<void> => {
    const liveSignal = {
      schema_version: 1,
      resort_slug: 'test-resort',
      observed_at: '2026-04-26T08:00:00Z',
      fetched_at: '2026-04-26T08:00:00Z',
      lodging_sample: {
        median_eur: { amount: 99, currency: 'EUR' },
        sample_size: 5,
      },
      field_sources: { 'lodging_sample.median_eur': fieldSource },
    }
    const result = await loadResortDatasetFromObject(
      buildDataset({ live_signals: [liveSignal] }),
      { now: new Date('2026-04-26T08:00:00Z') },
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.views[0]?.lodging_sample_median_eur.state).toBe('fresh')
    }
  })
})
