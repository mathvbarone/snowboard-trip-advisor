import { describe, expect, it } from 'vitest'
import { publishedDatasetSchema, resortRecordSchema } from './schema'

describe('publishedDatasetSchema', () => {
  it('requires min-max boundaries in scoring metadata', () => {
    const result = publishedDatasetSchema.safeParse({
      version: '2026-04-03T01-45-00Z',
      generated_at: '2026-04-03T01:45:00Z',
      scoring: {
        normalization: 'min-max',
        boundaries: {
          piste_km: { min: 50, max: 600 },
          lift_pass_day_eur: { min: 38, max: 92 },
        },
      },
      resorts: [],
    })

    expect(result.success).toBe(true)
  })

  it('accepts numeric overall confidence and typed status', () => {
    const result = resortRecordSchema.safeParse({
      id: 'three-valleys',
      name: 'Les 3 Vallees',
      country: 'France',
      region: 'Savoie',
      status: 'active',
      overall_confidence: 0.84,
      source_urls: ['https://www.les3vallees.com/en/'],
      field_sources: {},
    })

    expect(result.success).toBe(true)
  })
})
