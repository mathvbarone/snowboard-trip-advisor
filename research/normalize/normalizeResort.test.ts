import { describe, expect, it } from 'vitest'
import { sampleResortSource } from '../__fixtures__/sampleResortSource'
import { normalizeResort } from './normalizeResort'

describe('normalizeResort', () => {
  it('maps source fields into the canonical schema', () => {
    const result = normalizeResort(sampleResortSource)

    expect(result.id).toBe('three-valleys')
    expect(result.piste_km).toBe(600)
    expect(result.lift_pass_day_eur).toBe(79)
    expect(result.field_sources.piste_km.source).toContain('les3vallees')
    expect(result.status).toBe('active')
  })
})
