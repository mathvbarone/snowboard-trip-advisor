import { describe, expect, it } from 'vitest'
import { sampleResortSource } from '../__fixtures__/sampleResortSource'
import { normalizeResort, type NormalizedResort } from './normalizeResort'

const fieldSourcesShape = {
  piste_km: {
    source: 'https://example.com/piste-km',
    retrieved_at: '2026-04-03T00:00:00Z',
    confidence: 0.9,
    notes: 'Official ski area size',
  },
  lift_pass_day_eur: {
    source: 'https://example.com/lift-pass',
    retrieved_at: '2026-04-03T00:00:00Z',
    confidence: 0.8,
  },
} satisfies NormalizedResort['field_sources']

void fieldSourcesShape

describe('normalizeResort', () => {
  it('maps source fields into the canonical schema', () => {
    const result = normalizeResort(sampleResortSource)

    expect(result.id).toBe('three-valleys')
    expect(result.piste_km).toBe(600)
    expect(result.lift_pass_day_eur).toBe(79)
    expect(result.field_sources.piste_km.source).toContain('les3vallees')
    expect(result.field_sources.piste_km.notes).toBe('Official ski area size')
    expect(result.status).toBe('active')
  })

  it('throws when a required source field is missing', () => {
    expect(() =>
      normalizeResort({
        ...sampleResortSource,
        fields: {
          piste_km: sampleResortSource.fields.piste_km,
        },
      }),
    ).toThrow('Missing required field: lift_pass_day_eur')
  })

  it('throws when a numeric field contains an invalid value', () => {
    expect(() =>
      normalizeResort({
        ...sampleResortSource,
        fields: {
          ...sampleResortSource.fields,
          piste_km: {
            ...sampleResortSource.fields.piste_km,
            value: 'not-a-number',
          },
        },
      }),
    ).toThrow('Invalid numeric value for field: piste_km')
  })

  it('rejects blank-string numeric values', () => {
    expect(() =>
      normalizeResort({
        ...sampleResortSource,
        fields: {
          ...sampleResortSource.fields,
          lift_pass_day_eur: {
            ...sampleResortSource.fields.lift_pass_day_eur,
            value: '   ',
          },
        },
      }),
    ).toThrow('Invalid numeric value for field: lift_pass_day_eur')
  })
})
