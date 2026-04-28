import { describe, expect, it } from 'vitest'

import { PublishedDataset } from './published'

// One-resort minimum fixture: PR 3.1a tightens PublishedDataset to
// `resorts.min(1)` so the v1 envelope can never legitimately ship empty.
// Tests that only exercise envelope-level parsing use this minimal shape.
const validResort = {
  schema_version: 1,
  slug: 'kotelnica-bialczanska',
  name: { en: 'Kotelnica Białczańska' },
  country: 'PL',
  region: { en: 'Białka Tatrzańska, Tatra Mountains' },
  altitude_m: { min: 770, max: 920 },
  slopes_km: 8,
  lift_count: 7,
  skiable_terrain_ha: 40,
  season: { start_month: 12, end_month: 4 },
  publish_state: 'published',
  field_sources: {
    'altitude_m.min': {
      source: 'manual',
      source_url: 'https://bialkatatrzanska.pl/en/',
      observed_at: '2026-04-26T08:00:00Z',
      fetched_at: '2026-04-26T08:00:00Z',
      upstream_hash: '0000000000000000000000000000000000000000000000000000000000000001',
      attribution_block: { en: 'Source: manual seed.' },
    },
  },
} as const

const validEnvelope = {
  schema_version: 1,
  published_at: '2026-04-26T08:00:00Z',
  resorts: [validResort],
  live_signals: [],
  manifest: {
    resort_count: 1,
    generated_by: 'snowboard-trip-advisor@0.1.0 host=' + 'a'.repeat(64),
    validator_version: '1@' + 'b'.repeat(64)
  }
} as const

describe('PublishedDataset', (): void => {
  it('parses a valid one-resort envelope', (): void => {
    expect(PublishedDataset.parse(validEnvelope)).toMatchObject({ schema_version: 1 })
  })
  it('rejects schema_version != 1 (only)', (): void => {
    expect(() => PublishedDataset.parse({ ...validEnvelope, schema_version: 2 })).toThrow()
  })
  it('rejects when manifest is missing required fields', (): void => {
    expect(() => PublishedDataset.parse({ ...validEnvelope, manifest: {} })).toThrow()
  })
  it('rejects non-array resorts', (): void => {
    expect(() => PublishedDataset.parse({ ...validEnvelope, resorts: 'three-valleys' })).toThrow()
  })
})
