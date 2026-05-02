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
})
