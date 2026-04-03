import { describe, expect, it } from 'vitest'
import { validatePublishedDataset } from './validatePublishedDataset'

const validDataset = {
  version: '2026-04-03T01-45-00Z',
  generated_at: '2026-04-03T01:45:00Z',
  scoring: {
    normalization: 'min-max',
    boundaries: {
      piste_km: { min: 70, max: 600 },
      lift_pass_day_eur: { min: 40, max: 79 },
    },
  },
  resorts: [],
} as const

const validResort = {
  id: 'verbier',
  name: 'Verbier',
  country: 'Switzerland',
  region: 'Valais',
  status: 'active',
  overall_confidence: 0.9,
  source_urls: ['https://www.verbier.ch/'],
  field_sources: {
    piste_km: {
      source: 'https://www.verbier.ch/',
      retrieved_at: '2026-04-03T01:45:00Z',
      confidence: 0.9,
    },
    lift_pass_day_eur: {
      source: 'https://www.verbier.ch/',
      retrieved_at: '2026-04-03T01:45:00Z',
      confidence: 0.9,
    },
  },
  piste_km: 410,
  lift_pass_day_eur: 79,
  size_category_official: 'Mega',
  price_category_ski_only: 'Premium',
  overall_score: 0.82,
} as const

describe('validatePublishedDataset', () => {
  it('accepts a valid dataset with no resorts', () => {
    expect(validatePublishedDataset(validDataset)).toEqual(validDataset)
  })

  it('accepts a valid dataset with a fully sourced resort', () => {
    expect(
      validatePublishedDataset({
        ...validDataset,
        resorts: [validResort],
      }),
    ).toEqual({
      ...validDataset,
      resorts: [validResort],
    })
  })

  it('accepts a resort when only lift pass input is present and derived fields exist', () => {
    const dataset = {
      ...validDataset,
      resorts: [
        {
          ...validResort,
          piste_km: undefined,
          field_sources: {
            lift_pass_day_eur: validResort.field_sources.lift_pass_day_eur,
          },
          size_category_official: 'Small',
        },
      ],
    }

    expect(validatePublishedDataset(dataset)).toEqual(dataset)
  })

  it('requires field sources for published numeric fields', () => {
    const dataset = {
      ...validDataset,
      resorts: [
        {
          ...validResort,
          id: 'three-valleys',
          name: 'Les 3 Vallees',
          country: 'France',
          region: 'Savoie',
          field_sources: {
            lift_pass_day_eur: validResort.field_sources.lift_pass_day_eur,
          },
          piste_km: 600,
        },
      ],
    }

    expect(() => validatePublishedDataset(dataset)).toThrow(
      'Missing field source for published field: piste_km',
    )
  })

  it('requires derived fields when published inputs are present', () => {
    const dataset = {
      ...validDataset,
      resorts: [
        {
          ...validResort,
          id: 'three-valleys',
          name: 'Les 3 Vallees',
          country: 'France',
          region: 'Savoie',
          piste_km: 600,
          size_category_official: undefined,
          price_category_ski_only: undefined,
          overall_score: undefined,
        },
      ],
    }

    expect(() => validatePublishedDataset(dataset)).toThrow(
      'Missing derived published fields for resort: three-valleys',
    )
  })

  it('throws on invalid schema input', () => {
    expect(() => validatePublishedDataset(null)).toThrow()
  })
})
