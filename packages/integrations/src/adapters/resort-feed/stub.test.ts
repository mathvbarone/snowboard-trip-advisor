import { ResortSlug } from '@snowboard-trip-advisor/schema'
import { describe, expect, it } from 'vitest'

import { resortFeedStub } from './stub'

describe('resort-feed stub', (): void => {
  it('declares the durable resort fields it will own in Epic 5', (): void => {
    expect(resortFeedStub.fields).toEqual([
      'altitude_m.min',
      'altitude_m.max',
      'slopes_km',
      'lift_count',
      'skiable_terrain_ha',
      'season.start_month',
      'season.end_month',
    ])
  })
  it('returns ok=true with no values + manual-source map (never throws)', async (): Promise<void> => {
    const result = await resortFeedStub.fetch({
      requestId: 'req-1',
      traceparent: '00-0-0-00',
      dryRun: true,
      resort_slug: ResortSlug.parse('three-valleys'),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.values).toEqual({})
    for (const field of resortFeedStub.fields) {
      expect(result.sources[field]?.source).toBe('manual')
    }
  })
})
