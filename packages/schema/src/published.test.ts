import { describe, expect, it } from 'vitest'
import { PublishedDataset } from './published'

describe('PublishedDataset', (): void => {
  it('parses an empty envelope', (): void => {
    const envelope = {
      schema_version: 1,
      published_at: '2026-04-26T08:00:00Z',
      resorts: [],
      live_signals: [],
      manifest: {
        resort_count: 0,
        generated_by: 'snowboard-trip-advisor@0.1.0 host=' + 'a'.repeat(64),
        validator_version: '1@' + 'b'.repeat(64)
      }
    }
    expect(PublishedDataset.parse(envelope)).toMatchObject({ schema_version: 1 })
  })
  it('rejects envelope.schema_version != 1', (): void => {
    expect(() => PublishedDataset.parse({ schema_version: 2, resorts: [], live_signals: [], manifest: {} })).toThrow()
  })
})
