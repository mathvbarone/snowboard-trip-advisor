import { describe, expect, it } from 'vitest'

import { validateDatasetEnvelope } from './check-dist-dataset'

describe('validateDatasetEnvelope', (): void => {
  it('accepts a minimal envelope with all five required top-level keys', (): void => {
    const envelope = {
      schema_version: 1,
      published_at: '2026-04-26T08:00:00Z',
      resorts: [{ slug: 'a' }],
      live_signals: [],
      manifest: {
        resort_count: 1,
        generated_by: 'publishDataset',
        validator_version: '1.0',
      },
    }
    expect(validateDatasetEnvelope(envelope)).toEqual({ ok: true })
  })

  it('rejects a non-object value', (): void => {
    const result = validateDatasetEnvelope(null)
    expect(result.ok).toBe(false)
    expect(result).toMatchObject({
      ok: false,
      reason: 'envelope is not an object',
    })
  })

  it('rejects an array (envelope must be a plain object)', (): void => {
    const result = validateDatasetEnvelope([])
    expect(result).toMatchObject({
      ok: false,
      reason: 'envelope is not an object',
    })
  })

  it('rejects when schema_version is missing', (): void => {
    const result = validateDatasetEnvelope({
      published_at: '2026-04-26T08:00:00Z',
      resorts: [],
      live_signals: [],
      manifest: {},
    })
    expect(result).toMatchObject({
      ok: false,
      reason: 'envelope missing required key: schema_version',
    })
  })

  it('rejects when schema_version is not 1', (): void => {
    const result = validateDatasetEnvelope({
      schema_version: 2,
      published_at: '2026-04-26T08:00:00Z',
      resorts: [],
      live_signals: [],
      manifest: {},
    })
    expect(result).toMatchObject({
      ok: false,
      reason: 'envelope schema_version is not 1 (got 2)',
    })
  })

  it('rejects when published_at is missing', (): void => {
    const result = validateDatasetEnvelope({
      schema_version: 1,
      resorts: [],
      live_signals: [],
      manifest: {},
    })
    expect(result).toMatchObject({
      ok: false,
      reason: 'envelope missing required key: published_at',
    })
  })

  it('rejects when published_at is not a string', (): void => {
    const result = validateDatasetEnvelope({
      schema_version: 1,
      published_at: 12345,
      resorts: [],
      live_signals: [],
      manifest: {},
    })
    expect(result).toMatchObject({
      ok: false,
      reason: 'envelope published_at is not a string',
    })
  })

  it('rejects when resorts is missing', (): void => {
    const result = validateDatasetEnvelope({
      schema_version: 1,
      published_at: '2026-04-26T08:00:00Z',
      live_signals: [],
      manifest: {},
    })
    expect(result).toMatchObject({
      ok: false,
      reason: 'envelope missing required key: resorts',
    })
  })

  it('rejects when resorts is not an array', (): void => {
    const result = validateDatasetEnvelope({
      schema_version: 1,
      published_at: '2026-04-26T08:00:00Z',
      resorts: {},
      live_signals: [],
      manifest: {},
    })
    expect(result).toMatchObject({
      ok: false,
      reason: 'envelope resorts is not an array',
    })
  })

  it('rejects when live_signals is missing', (): void => {
    const result = validateDatasetEnvelope({
      schema_version: 1,
      published_at: '2026-04-26T08:00:00Z',
      resorts: [],
      manifest: {},
    })
    expect(result).toMatchObject({
      ok: false,
      reason: 'envelope missing required key: live_signals',
    })
  })

  it('rejects when live_signals is not an array', (): void => {
    const result = validateDatasetEnvelope({
      schema_version: 1,
      published_at: '2026-04-26T08:00:00Z',
      resorts: [],
      live_signals: 'none',
      manifest: {},
    })
    expect(result).toMatchObject({
      ok: false,
      reason: 'envelope live_signals is not an array',
    })
  })

  it('rejects when manifest is missing', (): void => {
    const result = validateDatasetEnvelope({
      schema_version: 1,
      published_at: '2026-04-26T08:00:00Z',
      resorts: [],
      live_signals: [],
    })
    expect(result).toMatchObject({
      ok: false,
      reason: 'envelope missing required key: manifest',
    })
  })

  it('rejects when manifest is not an object', (): void => {
    const result = validateDatasetEnvelope({
      schema_version: 1,
      published_at: '2026-04-26T08:00:00Z',
      resorts: [],
      live_signals: [],
      manifest: 42,
    })
    expect(result).toMatchObject({
      ok: false,
      reason: 'envelope manifest is not an object',
    })
  })
})
