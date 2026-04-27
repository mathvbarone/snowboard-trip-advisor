import { ResortSlug } from '@snowboard-trip-advisor/schema'
import { describe, expect, it } from 'vitest'

import { snowforecastStub } from './stub'

describe('snowforecast stub', (): void => {
  it('declares the snow fields it will own in Epic 5', (): void => {
    expect(snowforecastStub.fields).toEqual(['snow_depth_cm'])
  })
  it('returns ok=true with no values + adapter-source provenance (never throws)', async (): Promise<void> => {
    const result = await snowforecastStub.fetch({
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
    for (const field of snowforecastStub.fields) {
      expect(result.sources[field]?.source).toBe('snowforecast')
    }
  })
})
