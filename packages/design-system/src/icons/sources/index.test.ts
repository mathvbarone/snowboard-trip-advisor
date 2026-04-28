import type { SourceKey } from '@snowboard-trip-advisor/schema'
import { describe, expect, it } from 'vitest'

import { SOURCE_GLYPHS } from './index'

describe('SOURCE_GLYPHS barrel', (): void => {
  it('exposes a glyph component for each SourceKey', (): void => {
    // Compile-time exhaustiveness is provided by the
    // `satisfies Record<SourceKey, IconComponent>` annotation in index.ts —
    // adding a new SourceKey to the schema enum without updating the barrel
    // would fail typecheck. This runtime sanity check guards against a
    // future regression where the satisfies annotation gets dropped.
    const required: ReadonlyArray<SourceKey> = [
      'opensnow',
      'snowforecast',
      'resort-feed',
      'booking',
      'airbnb',
      'manual',
    ]
    for (const key of required) {
      expect(typeof SOURCE_GLYPHS[key]).toBe('function')
    }
  })
})
