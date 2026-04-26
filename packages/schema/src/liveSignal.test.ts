import { describe, expect, it } from 'vitest'
import { ResortLiveSignal } from './liveSignal'

const validLive = {
  schema_version: 1,
  resort_slug: 'three-valleys',
  observed_at: '2026-04-26T08:00:00Z',
  fetched_at: '2026-04-26T08:00:01Z',
  snow_depth_cm: 120,
  lifts_open: { count: 140, total: 158 },
  lift_pass_day: { amount: 67, currency: 'EUR' },
  field_sources: {}
} as const

describe('ResortLiveSignal', (): void => {
  it('parses a valid volatile record', (): void => {
    expect(ResortLiveSignal.parse(validLive)).toMatchObject({ resort_slug: 'three-valleys' })
  })
  it('rejects forecast_next_7d entries with missing `date`', (): void => {
    expect(() => ResortLiveSignal.parse({
      ...validLive,
      forecast_next_7d: [{ snow_cm: 5 }]
    })).toThrow()
  })
})
