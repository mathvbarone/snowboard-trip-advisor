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
    ])('rejects %s in upsert body', (_label: string, payload: Record<string, unknown>): void => {
      const r = ResortUpsertBody.safeParse(payload)
      expect(r.success).toBe(false)
    })

    it('still accepts mutable resort fields (slopes_km, lift_count, etc.)', (): void => {
      const r = ResortUpsertBody.safeParse({ resort: { slopes_km: 12, lift_count: 6 } })
      expect(r.success).toBe(true)
    })

    it('still accepts mutable live_signal fields', (): void => {
      // live_signal partial-mutable shape: resort_slug is forbidden, but other fields pass.
      const r = ResortUpsertBody.safeParse({ live_signal: { schema_version: 1 } })
      expect(r.success).toBe(true)
    })
  })
})
