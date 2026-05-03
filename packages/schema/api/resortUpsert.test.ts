import { describe, expect, it } from 'vitest'

import { ResortUpsertBody } from './resortUpsert'

describe('ResortUpsertBody (PR 4.1a, spec §4.3)', (): void => {
  it('rejects empty body (at least one of resort/live_signal/editor_modes required)', (): void => {
    const r = ResortUpsertBody.safeParse({})
    expect(r.success).toBe(false)
  })

  it('accepts sparse editor_modes alone (mode-only PUT for useModeToggle)', (): void => {
    const r = ResortUpsertBody.safeParse({ editor_modes: { snow_depth_cm: 'manual' } })
    expect(r.success).toBe(true)
  })

  it('accepts partial resort alone', (): void => {
    const r = ResortUpsertBody.safeParse({ resort: { slopes_km: 12 } })
    expect(r.success).toBe(true)
  })

  it('accepts live_signal: null (clear-live-signal semantics)', (): void => {
    const r = ResortUpsertBody.safeParse({ live_signal: null })
    expect(r.success).toBe(true)
  })

  it('accepts all three fields together', (): void => {
    const r = ResortUpsertBody.safeParse({
      resort: { slopes_km: 12 },
      live_signal: null,
      editor_modes: { snow_depth_cm: 'manual' },
    })
    expect(r.success).toBe(true)
  })

  it('rejects editor_modes with key not in METRIC_FIELDS', (): void => {
    const r = ResortUpsertBody.safeParse({ editor_modes: { not_a_metric: 'manual' } })
    expect(r.success).toBe(false)
  })

  it('rejects editor_modes with mode not in {manual, auto}', (): void => {
    const r = ResortUpsertBody.safeParse({ editor_modes: { snow_depth_cm: 'unknown' } })
    expect(r.success).toBe(false)
  })

  describe('identity + status field rejection (Codex round-3 P1 fold)', (): void => {
    it.each([
      ['resort.slug (path :slug is authoritative)', { resort: { slug: 'different-slug' } }],
      ['resort.schema_version (writer-set)', { resort: { schema_version: 1 } }],
      ['resort.publish_state (managed by publish flow)', { resort: { publish_state: 'published' } }],
      ['live_signal.resort_slug (identity duplicate)', { live_signal: { resort_slug: 'different-slug' } }],
      ['live_signal.schema_version (writer-set, parallel to resort)', { live_signal: { schema_version: 1 } }],
    ])('rejects %s in upsert body', (_label: string, payload: Record<string, unknown>): void => {
      const r = ResortUpsertBody.safeParse(payload)
      expect(r.success).toBe(false)
    })

    it('still accepts mutable resort fields (slopes_km, lift_count, etc.)', (): void => {
      const r = ResortUpsertBody.safeParse({ resort: { slopes_km: 12, lift_count: 6 } })
      expect(r.success).toBe(true)
    })

    it('still accepts mutable live_signal fields (e.g., snow_depth_cm)', (): void => {
      const r = ResortUpsertBody.safeParse({ live_signal: { snow_depth_cm: 42 } })
      expect(r.success).toBe(true)
    })
  })

  describe('field_sources provenance-forge prevention (proactive round-6 P1 fold)', (): void => {
    const HASH_64 = 'a'.repeat(64)
    const OBS_AT = '2026-04-26T08:00:00Z'

    const manualEntry = {
      source: 'manual',
      source_url: 'https://example.com/x',
      observed_at: OBS_AT,
      fetched_at: OBS_AT,
      upstream_hash: HASH_64,
      attribution_block: { en: 'manual entry' },
    }

    it.each(['opensnow', 'resort-feed', 'booking', 'airbnb', 'snowforecast'])(
      'rejects field_sources entry with non-manual source: %s',
      (source: string): void => {
        const forged = { ...manualEntry, source }
        const r = ResortUpsertBody.safeParse({
          resort: { field_sources: { 'altitude_m.max': forged } },
        })
        expect(r.success).toBe(false)
      },
    )

    it('accepts field_sources entry with source: manual (legitimate user-typed value)', (): void => {
      const r = ResortUpsertBody.safeParse({
        resort: { field_sources: { 'altitude_m.max': manualEntry } },
      })
      expect(r.success).toBe(true)
    })

    it('rejects forged source on live_signal.field_sources too', (): void => {
      const forged = { ...manualEntry, source: 'opensnow' }
      const r = ResortUpsertBody.safeParse({
        live_signal: { field_sources: { snow_depth_cm: forged } },
      })
      expect(r.success).toBe(false)
    })

    it('accepts manual source on live_signal.field_sources', (): void => {
      const r = ResortUpsertBody.safeParse({
        live_signal: { field_sources: { snow_depth_cm: manualEntry } },
      })
      expect(r.success).toBe(true)
    })
  })
})
