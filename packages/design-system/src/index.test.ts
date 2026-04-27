import { describe, expect, it } from 'vitest'
import { tokens } from './index'

describe('package barrel (index.ts)', (): void => {
  it('re-exports the design tokens object the public API needs', (): void => {
    // Smoke check: each re-export resolves to a defined value at runtime.
    // Catches accidental mis-spellings or dropped exports in the barrel.
    expect(tokens).toBeDefined()
  })
})
