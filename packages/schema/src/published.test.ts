import { describe, expect, it } from 'vitest'
import { PublishedDataset } from './published'

const validEnvelope = {
  schema_version: 1,
  published_at: '2026-04-26T08:00:00Z',
  resorts: [],
  live_signals: [],
  manifest: {
    resort_count: 0,
    generated_by: 'snowboard-trip-advisor@0.1.0 host=' + 'a'.repeat(64),
    validator_version: '1@' + 'b'.repeat(64)
  }
} as const

describe('PublishedDataset', (): void => {
  it('parses a valid empty envelope', (): void => {
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
