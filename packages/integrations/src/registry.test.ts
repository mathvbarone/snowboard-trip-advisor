import { AdapterSourceKey } from '@snowboard-trip-advisor/schema'
import { describe, expect, it } from 'vitest'

import { registry } from './registry'

describe('registry', (): void => {
  it('exposes one adapter per AdapterSourceKey (mapped-type exhaustiveness)', (): void => {
    const keys = Object.keys(registry).sort()
    expect(keys).toEqual(['airbnb', 'booking', 'opensnow', 'resort-feed', 'snowforecast'])
    for (const key of keys) {
      AdapterSourceKey.parse(key)
    }
  })
  it("each adapter's `source` field matches its key", (): void => {
    for (const [key, adapter] of Object.entries(registry)) {
      expect(adapter.source).toBe(key)
    }
  })
})
