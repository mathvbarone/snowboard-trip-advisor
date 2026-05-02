import { describe, expect, it } from 'vitest'

import { HealthQuery, HealthResponse } from './health'

const OBS_AT = '2026-04-26T08:00:00Z'

describe('HealthQuery (PR 4.1a, spec §4.8)', (): void => {
  it('accepts empty object', (): void => {
    expect(HealthQuery.safeParse({}).success).toBe(true)
  })
})

describe('HealthResponse (spec §4.8)', (): void => {
  it('parses with all 8 fields populated and last_published_at as ISODateTimeString', (): void => {
    const r = HealthResponse.parse({
      resorts_total: 2,
      resorts_with_stale_fields: 0,
      resorts_with_failed_fields: 0,
      resorts_with_missing_provenance: 0,
      resorts_with_corrupt_workspace: 0,
      pending_integration_errors: 0,
      last_published_at: OBS_AT,
      archive_size_bytes: 12345,
    })
    expect(r.resorts_total).toBe(2)
    expect(r.last_published_at).toBe(OBS_AT)
  })

  it('parses with last_published_at: null (cold-start, missing-published-doc per §10.9)', (): void => {
    const r = HealthResponse.parse({
      resorts_total: 0,
      resorts_with_stale_fields: 0,
      resorts_with_failed_fields: 0,
      resorts_with_missing_provenance: 0,
      resorts_with_corrupt_workspace: 0,
      pending_integration_errors: 0,
      last_published_at: null,
      archive_size_bytes: 0,
    })
    expect(r.last_published_at).toBeNull()
    expect(r.archive_size_bytes).toBe(0)
  })

  it('rejects missing required resorts_with_corrupt_workspace (P0-4 fold per §4.8 / §10.3.1)', (): void => {
    const r = HealthResponse.safeParse({
      resorts_total: 0,
      resorts_with_stale_fields: 0,
      resorts_with_failed_fields: 0,
      resorts_with_missing_provenance: 0,
      pending_integration_errors: 0,
      last_published_at: null,
      archive_size_bytes: 0,
    })
    expect(r.success).toBe(false)
  })

  it('rejects last_published_at as a non-ISO string (e.g., not the nullable<ISODateTimeString> pattern)', (): void => {
    const r = HealthResponse.safeParse({
      resorts_total: 0,
      resorts_with_stale_fields: 0,
      resorts_with_failed_fields: 0,
      resorts_with_missing_provenance: 0,
      resorts_with_corrupt_workspace: 0,
      pending_integration_errors: 0,
      last_published_at: 'not-an-iso-date',
      archive_size_bytes: 0,
    })
    expect(r.success).toBe(false)
  })

  it('rejects negative counts', (): void => {
    const r = HealthResponse.safeParse({
      resorts_total: -1,
      resorts_with_stale_fields: 0,
      resorts_with_failed_fields: 0,
      resorts_with_missing_provenance: 0,
      resorts_with_corrupt_workspace: 0,
      pending_integration_errors: 0,
      last_published_at: null,
      archive_size_bytes: 0,
    })
    expect(r.success).toBe(false)
  })
})
