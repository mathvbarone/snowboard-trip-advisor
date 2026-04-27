import { ResortSlug } from '@snowboard-trip-advisor/schema'
import { describe, expect, it } from 'vitest'

import { airbnbStub } from './stub'

describe('airbnb stub', (): void => {
  it('declares the lodging fields it will own in Epic 5', (): void => {
    expect(airbnbStub.fields).toEqual(['lodging_sample.median_eur'])
  })
  it('returns ok=true with no values + adapter-source provenance (never throws)', async (): Promise<void> => {
    const result = await airbnbStub.fetch({
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
    for (const field of airbnbStub.fields) {
      expect(result.sources[field]?.source).toBe('airbnb')
    }
  })
})
