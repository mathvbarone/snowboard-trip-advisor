import { describe, expect, it } from 'vitest'
import { computeScores } from './computeScores'

describe('computeScores', () => {
  it('uses config thresholds and returns scoring boundaries', () => {
    const result = computeScores([
      {
        id: 'verbier',
        name: 'Verbier',
        country: 'Switzerland',
        region: 'Valais',
        status: 'active',
        overall_confidence: 0.9,
        source_urls: ['https://www.verbier.ch/'],
        field_sources: {},
        piste_km: 410,
        lift_count: 67,
        vertical_drop_m: 2230,
        top_elevation_m: 3050,
        base_elevation_m: 821,
        lift_pass_day_eur: 79,
        estimated_trip_cost_3_days_eur: 880,
        glacier_access: false,
        snow_reliability_proxy: 0.72,
        transfer_complexity: 0.35,
      },
      {
        id: 'cheap-small',
        name: 'Cheap Small',
        country: 'Austria',
        region: 'Tyrol',
        status: 'active',
        overall_confidence: 0.8,
        source_urls: ['https://example.com'],
        field_sources: {},
        piste_km: 70,
        lift_count: 12,
        vertical_drop_m: 700,
        top_elevation_m: 1900,
        base_elevation_m: 1200,
        lift_pass_day_eur: 40,
        estimated_trip_cost_3_days_eur: 420,
        glacier_access: false,
        snow_reliability_proxy: 0.48,
        transfer_complexity: 0.62,
      },
    ])

    expect(result.boundaries.piste_km).toEqual({ min: 70, max: 410 })
    expect(result.resorts[0].size_category_official).toBe('Mega')
    expect(result.resorts[0].price_category_ski_only).toBe('Premium')
    expect(result.resorts[0].overall_score).toBeGreaterThan(
      result.resorts[1].overall_score,
    )
  })

  it('does not treat missing price fields as free resorts', () => {
    const result = computeScores([
      {
        id: 'missing-price',
        piste_km: 200,
        vertical_drop_m: 1000,
        lift_count: 20,
        snow_reliability_proxy: 0.6,
        transfer_complexity: 0.4,
      },
      {
        id: 'priced',
        piste_km: 200,
        vertical_drop_m: 1000,
        lift_count: 20,
        lift_pass_day_eur: 50,
        estimated_trip_cost_3_days_eur: 600,
        snow_reliability_proxy: 0.6,
        transfer_complexity: 0.4,
      },
    ])

    expect(result.resorts[0].value_score).toBe(0)
    expect(result.resorts[0].price_category_ski_only).toBeUndefined()
    expect(result.resorts[0].price_category_trip_cost).toBeUndefined()
    expect(result.resorts[1].value_score).toBeGreaterThanOrEqual(0)
  })

  it('returns safe boundaries for an empty resort list', () => {
    expect(computeScores([])).toEqual({
      resorts: [],
      boundaries: {
        piste_km: { min: 0, max: 0 },
        lift_pass_day_eur: { min: 0, max: 0 },
        estimated_trip_cost_3_days_eur: { min: 0, max: 0 },
      },
    })
  })
})
