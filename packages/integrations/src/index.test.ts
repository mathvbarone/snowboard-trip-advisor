import { describe, expect, it } from 'vitest'
import { isRecordAllowed, registry } from './index'

describe('integrations package barrel (index.ts)', (): void => {
  it('re-exports the runtime values the public API needs', (): void => {
    // Smoke check: each runtime export resolves to a defined value.
    // Catches accidental mis-spellings or dropped exports in the barrel.
    // Type-only exports (Adapter<S>, AdapterResult, AdapterError, AdapterContext, etc.)
    // are exercised across the suite — anything compiling against them imports via this barrel.
    expect(isRecordAllowed).toBeDefined()
    expect(registry).toBeDefined()
  })
})
