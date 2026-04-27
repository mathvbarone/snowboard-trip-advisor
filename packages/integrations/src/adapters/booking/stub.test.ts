import { describe, expect, it } from 'vitest'
import { ResortSlug } from '@snowboard-trip-advisor/schema'
import { bookingStub } from './stub'

describe('booking stub', (): void => {
  it('declares the lodging fields it will own in Epic 5', (): void => {
    expect(bookingStub.fields).toEqual(['lodging_sample.median_eur'])
  })
  it('returns ok=true with no values + manual-source map (never throws)', async (): Promise<void> => {
    const result = await bookingStub.fetch({
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
    for (const field of bookingStub.fields) {
      expect(result.sources[field]?.source).toBe('manual')
    }
  })
})
