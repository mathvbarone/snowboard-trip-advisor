import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'

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
  it('is assignable to ReadonlyArray<MetricPath>', (): void => {
    expectTypeOf(METRIC_FIELDS).toExtend<readonly MetricPath[]>()
  })
})

describe('METRIC_FIELDS literal-tuple typing (PR 4.0)', (): void => {
  it('z.enum(METRIC_FIELDS) parses every literal and rejects unknown', (): void => {
    const schema = z.enum(METRIC_FIELDS)
    expect(schema.safeParse('snow_depth_cm').success).toBe(true)
    expect(schema.safeParse('not-a-metric').success).toBe(false)
  })

  it('TS: z.enum(METRIC_FIELDS) output type narrows to MetricPath, not string', (): void => {
    const schema = z.enum(METRIC_FIELDS)
    expect(schema.options).toEqual(METRIC_FIELDS)
    type Inferred = z.infer<typeof schema>
    expectTypeOf<Inferred>().toEqualTypeOf<MetricPath>()
  })

  it('TS: METRIC_FIELDS literal tuple is assignable to readonly MetricPath[]', (): void => {
    const widened: readonly MetricPath[] = METRIC_FIELDS
    expect(widened.length).toBe(12)
  })
})
