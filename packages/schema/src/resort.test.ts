import { describe, expect, it } from 'vitest'

import { Resort } from './resort'

const validFieldSource = {
  source: 'resort-feed' as const,
  source_url: 'https://three-valleys.fr/data',
  observed_at: '2026-04-01T00:00:00Z',
  fetched_at: '2026-04-26T08:00:00Z',
  upstream_hash: 'a'.repeat(64),
  attribution_block: { en: 'Source: Trois Vallées official feed' }
}

const validResort = {
  schema_version: 1,
  slug: 'three-valleys',
  name: { en: 'Trois Vallées' },
  country: 'FR',
  region: { en: 'Savoie' },
  altitude_m: { min: 1100, max: 3230 },
  slopes_km: 600,
  lift_count: 158,
  skiable_terrain_ha: 12_000,
  season: { start_month: 12, end_month: 4 },
  publish_state: 'published',
  field_sources: {
    'altitude_m.min': validFieldSource,
    'altitude_m.max': validFieldSource,
    'slopes_km': validFieldSource,
    'lift_count': validFieldSource,
    'skiable_terrain_ha': validFieldSource,
    'season.start_month': validFieldSource,
    'season.end_month': validFieldSource
  }
} as const

describe('Resort', (): void => {
  it('parses a valid durable record', (): void => {
    expect(Resort.parse(validResort)).toMatchObject({ slug: 'three-valleys' })
  })
  it('rejects schema_version != 1', (): void => {
    expect(() => Resort.parse({ ...validResort, schema_version: 2 })).toThrow()
  })
  it('rejects malformed slug', (): void => {
    expect(() => Resort.parse({ ...validResort, slug: 'Three Valleys' })).toThrow()
  })
  it('rejects publish_state outside {draft, published}', (): void => {
    expect(() => Resort.parse({ ...validResort, publish_state: 'in_review' })).toThrow()
  })
  it('parses with empty field_sources', (): void => {
    const result = Resort.parse({ ...validResort, field_sources: {} })
    expect(result.field_sources).toEqual({})
  })
  it('rejects when a field_sources value is not a valid FieldSource', (): void => {
    expect(() => Resort.parse({
      ...validResort,
      field_sources: { 'slopes_km': { ...validFieldSource, source_url: 'http://insecure.example/data' } }
    })).toThrow()
  })
  it('rejects when a field_sources value is missing attribution_block', (): void => {
    const incompleteSource = Object.fromEntries(
      Object.entries(validFieldSource).filter(([k]): boolean => k !== 'attribution_block')
    )
    expect(() => Resort.parse({
      ...validResort,
      field_sources: { 'slopes_km': incompleteSource }
    })).toThrow()
  })
})
