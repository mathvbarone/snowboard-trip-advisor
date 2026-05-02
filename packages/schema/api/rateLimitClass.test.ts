import { describe, expect, it } from 'vitest'

import { RATE_LIMIT_CLASS, type RateLimitClass } from './rateLimitClass'

describe('RATE_LIMIT_CLASS (PR 4.1a, spec §10.5 — Phase 1 advisory)', (): void => {
  it('classifies all 6 Epic 4 endpoints', (): void => {
    expect(RATE_LIMIT_CLASS).toEqual({
      listResorts: 'read',
      resortDetail: 'read',
      resortUpsert: 'write',
      publish: 'write',
      listPublishes: 'read',
      health: 'read',
    })
  })

  it('every value is either read or write (RateLimitClass union)', (): void => {
    for (const value of Object.values(RATE_LIMIT_CLASS)) {
      const cls: RateLimitClass = value
      expect(['read', 'write']).toContain(cls)
    }
  })
})
