import { describe, expect, it } from 'vitest'
import { publishedDatasetSchema, resortRecordSchema } from './schema'
import { sourceRegistry } from './sources/sourceRegistry'
import { starterTargets } from './targets'

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

  it('rejects non-ISO datetime strings', () => {
    const result = publishedDatasetSchema.safeParse({
      version: '2026-04-03T01-45-00Z',
      generated_at: 'not-a-datetime',
      scoring: {
        normalization: 'min-max',
        boundaries: {
          piste_km: { min: 50, max: 600 },
        },
      },
      resorts: [],
    })

    expect(result.success).toBe(false)
  })

  it('rejects invalid boundary ordering and negative numeric values', () => {
    const result = publishedDatasetSchema.safeParse({
      version: '2026-04-03T01-45-00Z',
      generated_at: '2026-04-03T01:45:00Z',
      scoring: {
        normalization: 'min-max',
        boundaries: {
          piste_km: { min: 600, max: 50 },
          lift_pass_day_eur: { min: -1, max: 92 },
        },
      },
      resorts: [
        {
          id: 'three-valleys',
          name: 'Les 3 Vallees',
          country: 'France',
          region: 'Savoie',
          status: 'active',
          overall_confidence: 0.84,
          source_urls: ['https://www.les3vallees.com/en/'],
          field_sources: {
            piste_km: {
              source: 'https://www.les3vallees.com/en/ski-area/',
              retrieved_at: 'not-a-datetime',
              confidence: 0.95,
            },
          },
          piste_km: -1,
        },
      ],
    })

    expect(result.success).toBe(false)
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

describe('resortRecordSchema', () => {
  it('rejects invalid datetime strings in field sources', () => {
    const result = resortRecordSchema.safeParse({
      id: 'three-valleys',
      name: 'Les 3 Vallees',
      country: 'France',
      region: 'Savoie',
      status: 'active',
      overall_confidence: 0.84,
      source_urls: ['https://www.les3vallees.com/en/'],
      field_sources: {
        piste_km: {
          source: 'https://www.les3vallees.com/en/ski-area/',
          retrieved_at: 'still-not-a-datetime',
          confidence: 0.95,
        },
      },
    })

    expect(result.success).toBe(false)
  })
})

describe('research seeds', () => {
  it('exposes the starter target resort ids and source URLs', () => {
    expect(starterTargets.map(({ id }) => id)).toEqual([
      'three-valleys',
      'st-anton',
    ])
    expect(starterTargets[0]).toMatchObject({
      name: 'Les 3 Vallees',
      source_urls: ['https://www.les3vallees.com/en/'],
    })
  })

  it('exposes the source registry levels', () => {
    expect(sourceRegistry).toEqual({
      official: 1,
      tourism: 2,
      trusted_secondary: 3,
    })
  })
})
