import { describe, expect, it } from 'vitest'

import type { FieldStateFor, FieldValue, ResortView } from './resortView'
import { FieldState, toFieldValue } from './resortView'

const OBS = '2026-04-26T08:00:00Z' as never

describe('FieldValue / ResortView (Epic 2 PR 2.4)', (): void => {
  it('FieldValue is a 3-state discriminated union (compile-time check via type assertion)', (): void => {
    const a: FieldValue<number> = { state: 'never_fetched' }
    const b: FieldValue<number> = { state: 'fresh', value: 1, source: 'manual', observed_at: OBS }
    const c: FieldValue<number> = { state: 'stale', value: 1, source: 'manual', observed_at: OBS, age_days: 20 }
    expect([a.state, b.state, c.state]).toEqual(['never_fetched', 'fresh', 'stale'])
  })

  it('ResortView includes all 13 spec §5.1 fields (compile-time presence check)', (): void => {
    const keys: ReadonlyArray<keyof ResortView> = [
      'slug', 'name', 'country', 'region',
      'altitude_m', 'slopes_km', 'lift_count', 'skiable_terrain_ha', 'season',
      'snow_depth_cm', 'lifts_open', 'lift_pass_day', 'lodging_sample_median_eur',
    ]
    expect(keys.length).toBe(13)
  })
})

describe('FieldStateFor<T> 4-state discriminated union (PR 4.1a)', (): void => {
  it('live variant: { state, value, source, observed_at }', (): void => {
    const s: FieldStateFor<number> = { state: 'live', value: 42, source: 'manual', observed_at: OBS }
    expect(s.state).toBe('live')
    expect(s.value).toBe(42)
  })

  it('stale variant: live + age_days', (): void => {
    const s: FieldStateFor<number> = { state: 'stale', value: 42, source: 'opensnow', observed_at: OBS, age_days: 14 }
    expect(s.age_days).toBe(14)
  })

  it('failed variant: { state, reason, observed_at } — no value', (): void => {
    const s: FieldStateFor<number> = { state: 'failed', reason: 'upstream 503', observed_at: OBS }
    expect(s.reason).toBe('upstream 503')
  })

  it('manual variant: { state, value, observed_at, author? }', (): void => {
    const s: FieldStateFor<number> = { state: 'manual', value: 42, author: 'admin@example.com', observed_at: OBS }
    expect(s.author).toBe('admin@example.com')
  })

  it('manual variant: author is optional', (): void => {
    const s: FieldStateFor<number> = { state: 'manual', value: 42, observed_at: OBS }
    expect(s.author).toBeUndefined()
  })
})

describe('FieldState Zod schema (wire-shape mirror; value is unknown)', (): void => {
  it.each([
    ['live', { state: 'live', value: 42, source: 'manual', observed_at: '2026-04-26T08:00:00Z' }],
    ['stale', { state: 'stale', value: 42, source: 'opensnow', observed_at: '2026-04-26T08:00:00Z', age_days: 14 }],
    ['failed', { state: 'failed', reason: 'upstream 503', observed_at: '2026-04-26T08:00:00Z' }],
    ['manual (no author)', { state: 'manual', value: 42, observed_at: '2026-04-26T08:00:00Z' }],
    ['manual (with author)', { state: 'manual', value: 42, author: 'admin@example.com', observed_at: '2026-04-26T08:00:00Z' }],
  ])('parses %s variant', (_label, input: unknown): void => {
    const result = FieldState.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('rejects unknown state discriminator', (): void => {
    const result = FieldState.safeParse({ state: 'pending', observed_at: '2026-04-26T08:00:00Z' })
    expect(result.success).toBe(false)
  })

  it('rejects live variant missing required value field', (): void => {
    const result = FieldState.safeParse({ state: 'live', source: 'manual', observed_at: '2026-04-26T08:00:00Z' })
    expect(result.success).toBe(false)
  })

  it('rejects stale variant missing required age_days', (): void => {
    const result = FieldState.safeParse({ state: 'stale', value: 42, source: 'manual', observed_at: '2026-04-26T08:00:00Z' })
    expect(result.success).toBe(false)
  })
})

describe('toFieldValue<T> projection (admin → public)', (): void => {
  it('live → fresh (preserves value, source, observed_at)', (): void => {
    const result = toFieldValue<number>({ state: 'live', value: 42, source: 'opensnow', observed_at: OBS })
    expect(result).toEqual({ state: 'fresh', value: 42, source: 'opensnow', observed_at: OBS })
  })

  it('stale → stale (preserves age_days)', (): void => {
    const result = toFieldValue<number>({ state: 'stale', value: 42, source: 'opensnow', observed_at: OBS, age_days: 14 })
    expect(result).toEqual({ state: 'stale', value: 42, source: 'opensnow', observed_at: OBS, age_days: 14 })
  })

  it('failed → never_fetched (drops reason; public app does not surface failure detail)', (): void => {
    const result = toFieldValue<number>({ state: 'failed', reason: 'upstream 503', observed_at: OBS })
    expect(result).toEqual({ state: 'never_fetched' })
  })

  it('manual → fresh with source: manual', (): void => {
    const result = toFieldValue<number>({ state: 'manual', value: 42, observed_at: OBS })
    expect(result).toEqual({ state: 'fresh', value: 42, source: 'manual', observed_at: OBS })
  })

  it('manual with author still projects to fresh (author is admin-side metadata, not public)', (): void => {
    const result = toFieldValue<number>({ state: 'manual', value: 42, author: 'admin@example.com', observed_at: OBS })
    expect(result).toEqual({ state: 'fresh', value: 42, source: 'manual', observed_at: OBS })
  })
})
