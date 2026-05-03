import { describe, expect, it } from 'vitest'

import { ResortDetailResponse, ResortSlugParam } from './resortDetail'

const HASH_64 = 'a'.repeat(64)
const OBS_AT = '2026-04-26T08:00:00Z'
const fieldSourceLiteral = {
  source: 'manual',
  source_url: 'https://example.com/x',
  observed_at: OBS_AT,
  fetched_at: OBS_AT,
  upstream_hash: HASH_64,
  attribution_block: { en: 'manual' },
}
const resortLiteral = {
  schema_version: 1,
  slug: 'kotelnica-bialczanska',
  name: { en: 'Kotelnica' },
  country: 'PL',
  region: { en: 'Lesser Poland' },
  altitude_m: { min: 800, max: 1000 },
  slopes_km: 10,
  lift_count: 5,
  skiable_terrain_ha: 50,
  season: { start_month: 12, end_month: 4 },
  publish_state: 'published',
  field_sources: { snow_depth_cm: fieldSourceLiteral },
}

describe('ResortSlugParam (PR 4.1a, spec §4.2)', (): void => {
  it('parses a valid slug', (): void => {
    expect(ResortSlugParam.parse({ slug: 'kotelnica-bialczanska' }).slug).toBe('kotelnica-bialczanska')
  })

  it('rejects slug with underscore (regex enforcement)', (): void => {
    expect(ResortSlugParam.safeParse({ slug: 'has_underscore' }).success).toBe(false)
  })
})

describe('ResortDetailResponse (spec §4.2)', (): void => {
  it('parses with empty field_states', (): void => {
    const r = ResortDetailResponse.parse({
      resort: resortLiteral,
      live_signal: null,
      field_states: {},
    })
    expect(r.live_signal).toBeNull()
    expect(r.field_states).toEqual({})
  })

  it('parses with all 4 FieldState variants in field_states', (): void => {
    const r = ResortDetailResponse.parse({
      resort: resortLiteral,
      live_signal: null,
      field_states: {
        snow_depth_cm: { state: 'live', value: 42, source: 'opensnow', observed_at: OBS_AT },
        slopes_km: { state: 'stale', value: 10, source: 'manual', observed_at: OBS_AT, age_days: 7 },
        lift_count: { state: 'failed', reason: 'upstream 503', observed_at: OBS_AT },
        skiable_terrain_ha: { state: 'manual', value: 50, observed_at: OBS_AT, author: 'admin@example.com' },
      },
    })
    expect(Object.keys(r.field_states)).toHaveLength(4)
  })

  it('rejects field_states with key not in METRIC_FIELDS', (): void => {
    const r = ResortDetailResponse.safeParse({
      resort: resortLiteral,
      live_signal: null,
      field_states: { not_a_metric: { state: 'live', value: 42, source: 'manual', observed_at: OBS_AT } },
    })
    expect(r.success).toBe(false)
  })
})
