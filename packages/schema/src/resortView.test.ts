import { describe, expect, it } from 'vitest'

import type { FieldValue, ResortView } from './resortView'

describe('FieldValue / ResortView (Epic 2 PR 2.4)', (): void => {
  it('FieldValue is a 3-state discriminated union (compile-time check via type assertion)', (): void => {
    const a: FieldValue<number> = { state: 'never_fetched' }
    const b: FieldValue<number> = { state: 'fresh', value: 1, source: 'manual', observed_at: '2026-04-26T08:00:00Z' as never }
    const c: FieldValue<number> = { state: 'stale', value: 1, source: 'manual', observed_at: '2026-04-26T08:00:00Z' as never, age_days: 20 }
    expect([a.state, b.state, c.state]).toEqual(['never_fetched', 'fresh', 'stale'])
  })

  it('ResortView includes all 13 spec §5.1 fields (compile-time presence check)', (): void => {
    // The runtime assertion only verifies that consumers can destructure the keys without TS errors;
    // the real coverage of ResortView shape comes from loadResortDataset.test.ts.
    const keys: ReadonlyArray<keyof ResortView> = [
      'slug', 'name', 'country', 'region',
      'altitude_m', 'slopes_km', 'lift_count', 'skiable_terrain_ha', 'season',
      'snow_depth_cm', 'lifts_open', 'lift_pass_day', 'lodging_sample_median_eur',
    ]
    expect(keys.length).toBe(13)
  })
})
