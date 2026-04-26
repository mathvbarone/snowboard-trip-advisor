import { describe, expect, expectTypeOf, it } from 'vitest'
import { METRIC_FIELDS, type MetricPath } from './metricFields'

describe('METRIC_FIELDS', (): void => {
  it('lists exactly the 12 metric paths in spec §4.4', (): void => {
    expect(METRIC_FIELDS).toEqual([
      'altitude_m.min', 'altitude_m.max', 'slopes_km', 'lift_count',
      'skiable_terrain_ha', 'season.start_month', 'season.end_month',
      'snow_depth_cm', 'lifts_open.count', 'lifts_open.total',
      'lift_pass_day', 'lodging_sample.median_eur'
    ])
  })
  it('is a frozen tuple (mutations must throw at runtime)', (): void => {
    expect(Object.isFrozen(METRIC_FIELDS)).toBe(true)
  })
  it('is typed as ReadonlyArray<MetricPath>', (): void => {
    expectTypeOf(METRIC_FIELDS).toEqualTypeOf<readonly MetricPath[]>()
  })
})
