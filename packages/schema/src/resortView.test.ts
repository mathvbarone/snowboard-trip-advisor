import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { ISODateTimeString } from './branded'
import { ResortLiveSignal } from './liveSignal'
import { METRIC_FIELDS } from './metricFields'
import { Resort } from './resort'
import type { FieldStateFor, FieldValue, ResortView } from './resortView'
import { FieldState, projectFieldStates, toFieldValue } from './resortView'
import { WorkspaceFile } from './workspaceFile'

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

describe('projectFieldStates (PR 4.4a-1, spec §7.10)', (): void => {
  const NOW = new Date('2026-05-01T00:00:00Z')
  const RECENT = ISODateTimeString.parse('2026-04-29T00:00:00Z')      // 2 days < default TTL (14)
  const STALE_AT = ISODateTimeString.parse('2026-04-10T00:00:00Z')    // 21 days > default, < max_stale (30)
  const NEVER_FETCHED_AT = ISODateTimeString.parse('2026-03-02T00:00:00Z') // 60 days > max_stale

  it('all 12 metric paths project to live state from a fully-populated resort + live_signal', (): void => {
    const resort = makeFullyPopulatedResort(RECENT)
    const live = makeFullyPopulatedLiveSignal(RECENT)
    const states = projectFieldStates(resort, live, {}, NOW)
    expect(Object.keys(states).sort()).toEqual([...METRIC_FIELDS].sort())
    for (const path of METRIC_FIELDS) {
      expect(states[path].state).toBe('live')
    }
  })

  it('live path with observed_at between default and max_stale TTL projects stale (with age_days)', (): void => {
    const resort = makeFullyPopulatedResort(RECENT)
    const live = makeFullyPopulatedLiveSignalWithSnowDepthAt(RECENT, STALE_AT)
    const state = projectFieldStates(resort, live, {}, NOW)['snow_depth_cm']
    expect(state).toMatchObject({ state: 'stale', value: 100 })
    if (state.state !== 'stale') { throw new Error('expected stale variant for narrowing') }
    expect(state.age_days).toBeGreaterThan(14)
    expect(state.age_days).toBeLessThanOrEqual(30)
  })

  it('live path with observed_at exceeding max_stale TTL projects failed/never_fetched', (): void => {
    const resort = makeFullyPopulatedResort(RECENT)
    const live = makeFullyPopulatedLiveSignalWithSnowDepthAt(RECENT, NEVER_FETCHED_AT)
    const state = projectFieldStates(resort, live, {}, NOW)['snow_depth_cm']
    expect(state).toEqual({ state: 'failed', reason: 'never_fetched', observed_at: NEVER_FETCHED_AT })
  })

  it('durable path with old observed_at still projects as live (A1.6 / Codex round-2 P2-3)', (): void => {
    // Without DURABLE_PATHS guard, slopes_km with 60-day-old observed_at would
    // false-positive as 'failed (never_fetched)' — disagreeing with the canonical
    // dashboard / resorts-list projections that treat durable fields as fresh.
    const resort = makeResortWithSlopesKmAt(RECENT, NEVER_FETCHED_AT)
    const live = makeFullyPopulatedLiveSignal(RECENT)
    const state = projectFieldStates(resort, live, {}, NOW)['slopes_km']
    expect(state).toMatchObject({ state: 'live', value: 50, observed_at: NEVER_FETCHED_AT })
  })

  it('durable path with missing resort.field_sources entry projects failed/no field_sources entry', (): void => {
    const resort = makeResortMissingFieldSource(RECENT, 'slopes_km')
    const live = makeFullyPopulatedLiveSignal(RECENT)
    const state = projectFieldStates(resort, live, {}, NOW)['slopes_km']
    expect(state).toEqual({
      state: 'failed',
      reason: 'no field_sources entry',
      observed_at: NOW.toISOString(),
    })
  })

  it('live path with missing live_signal.field_sources entry projects failed/no field_sources entry', (): void => {
    const resort = makeFullyPopulatedResort(RECENT)
    const live = makeLiveSignalMissingFieldSource(RECENT, 'snow_depth_cm')
    const state = projectFieldStates(resort, live, {}, NOW)['snow_depth_cm']
    // value is still defined on live.snow_depth_cm but fs is missing → failed
    expect(state).toEqual({
      state: 'failed',
      reason: 'no field_sources entry',
      observed_at: NOW.toISOString(),
    })
  })

  it('durable path with mode=manual + valid value projects manual', (): void => {
    const resort = makeFullyPopulatedResort(RECENT)
    const live = makeFullyPopulatedLiveSignal(RECENT)
    const state = projectFieldStates(resort, live, { slopes_km: 'manual' }, NOW)['slopes_km']
    expect(state).toEqual({ state: 'manual', value: 50, observed_at: RECENT })
  })

  it('mode=manual but value undefined falls back to failed (live path with absent value)', (): void => {
    // live_signal has snow_depth_cm field_sources entry but no snow_depth_cm value.
    const resort = makeFullyPopulatedResort(RECENT)
    const live = makeLiveSignalWithoutSnowDepthValue(RECENT)
    const state = projectFieldStates(resort, live, { snow_depth_cm: 'manual' }, NOW)['snow_depth_cm']
    expect(state).toMatchObject({ state: 'failed', reason: 'no field_sources entry' })
  })

  it('durable path with mode=auto projects live (auto is the default; no manual override)', (): void => {
    const resort = makeFullyPopulatedResort(RECENT)
    const live = makeFullyPopulatedLiveSignal(RECENT)
    const state = projectFieldStates(resort, live, { slopes_km: 'auto' }, NOW)['slopes_km']
    expect(state.state).toBe('live')
  })

  it('live path with mode=auto and stale observed_at still ages to stale (auto does not suppress TTL)', (): void => {
    const resort = makeFullyPopulatedResort(RECENT)
    const live = makeFullyPopulatedLiveSignalWithSnowDepthAt(RECENT, STALE_AT)
    const state = projectFieldStates(resort, live, { snow_depth_cm: 'auto' }, NOW)['snow_depth_cm']
    expect(state.state).toBe('stale')
  })

  it('per-path source selection: live paths read ONLY from live_signal.field_sources (Codex round-14 P2-18)', (): void => {
    // Resort.field_sources accepts arbitrary string keys, so a hand-edited
    // workspace could carry a durable-style entry under a live-path key. The
    // projection MUST NOT use that as a fallback when live_signal.field_sources
    // is missing the entry — masking missing live provenance is wrong.
    const resort = makeResortWithExtraLivePathSource(RECENT)
    const live = makeLiveSignalMissingFieldSource(RECENT, 'snow_depth_cm')
    const state = projectFieldStates(resort, live, {}, NOW)['snow_depth_cm']
    expect(state).toMatchObject({ state: 'failed', reason: 'no field_sources entry' })
  })

  it('per-path source selection: durable paths read ONLY from resort.field_sources (Codex round-14 P2-18)', (): void => {
    // Inverse case: a live_signal.field_sources entry under a durable-path key
    // must NOT be picked up for the durable path when resort.field_sources is
    // missing it.
    const resort = makeResortMissingFieldSource(RECENT, 'slopes_km')
    const live = makeLiveSignalWithDurablePathSource(RECENT)
    const state = projectFieldStates(resort, live, {}, NOW)['slopes_km']
    expect(state).toMatchObject({ state: 'failed', reason: 'no field_sources entry' })
  })

  it('null live_signal: durable paths still live; live paths all failed/no field_sources entry', (): void => {
    const resort = makeFullyPopulatedResort(RECENT)
    const states = projectFieldStates(resort, null, {}, NOW)
    for (const path of ['altitude_m.min', 'altitude_m.max', 'slopes_km', 'lift_count',
      'skiable_terrain_ha', 'season.start_month', 'season.end_month'] as const) {
      expect(states[path].state).toBe('live')
    }
    for (const path of ['snow_depth_cm', 'lifts_open.count', 'lifts_open.total',
      'lift_pass_day', 'lodging_sample.median_eur'] as const) {
      expect(states[path]).toMatchObject({ state: 'failed', reason: 'no field_sources entry' })
    }
  })
})

const FIXTURE_DIR = fileURLToPath(
  new URL('../../../tests/fixtures/admin-workspace/', import.meta.url),
)

describe.each(['kotelnica-bialczanska', 'spindleruv-mlyn'])(
  'projectFieldStates seed-fixture parity (Task 5): %s',
  (slug): void => {
    it('parses cleanly through WorkspaceFile and projects 12 paths with no failed states', (): void => {
      const raw = JSON.parse(readFileSync(`${FIXTURE_DIR}${slug}.json`, 'utf8')) as unknown
      const wf = WorkspaceFile.parse(raw)
      expect(wf.slug).toBe(slug)
      const states = projectFieldStates(
        wf.resort, wf.live_signal, wf.editor_modes,
        new Date('2026-05-08T00:00:00Z'),
      )
      expect(Object.keys(states).sort()).toEqual([...METRIC_FIELDS].sort())
      for (const p of METRIC_FIELDS) {
        expect(states[p].state).not.toBe('failed')
      }
    })
  },
)

// Test fixture factories — private to this module. Generate Resort +
// ResortLiveSignal values via Zod.parse so branded types resolve without `as`
// gymnastics. Hash seeds are chosen to satisfy the 64-char-hex upstream_hash
// brand without colliding across paths.
type FieldSourceMap = Record<string, unknown>

function makeFieldSource(observedAt: ISODateTimeString, hashSeed: string): unknown {
  return {
    source: 'resort-feed',
    source_url: 'https://example.com/seed',
    observed_at: observedAt,
    fetched_at: observedAt,
    upstream_hash: hashSeed.padStart(64, '0'),
    attribution_block: { en: 'Test fixture.' },
  }
}

function defaultResortFieldSources(observedAt: ISODateTimeString): FieldSourceMap {
  return {
    'altitude_m.min': makeFieldSource(observedAt, 'a1'),
    'altitude_m.max': makeFieldSource(observedAt, 'a2'),
    'slopes_km': makeFieldSource(observedAt, 'a3'),
    'lift_count': makeFieldSource(observedAt, 'a4'),
    'skiable_terrain_ha': makeFieldSource(observedAt, 'a5'),
    'season.start_month': makeFieldSource(observedAt, 'a6'),
    'season.end_month': makeFieldSource(observedAt, 'a7'),
  }
}

function defaultLiveFieldSources(observedAt: ISODateTimeString): FieldSourceMap {
  return {
    'snow_depth_cm': makeFieldSource(observedAt, 'b1'),
    'lifts_open.count': makeFieldSource(observedAt, 'b2'),
    'lifts_open.total': makeFieldSource(observedAt, 'b3'),
    'lift_pass_day': makeFieldSource(observedAt, 'b4'),
    'lodging_sample.median_eur': makeFieldSource(observedAt, 'b5'),
  }
}

function makeResort(field_sources: FieldSourceMap): Resort {
  return Resort.parse({
    schema_version: 1,
    slug: 'test-resort',
    name: { en: 'Test Resort' },
    country: 'PL',
    region: { en: 'Test Region' },
    altitude_m: { min: 800, max: 1200 },
    slopes_km: 50,
    lift_count: 10,
    skiable_terrain_ha: 75,
    season: { start_month: 12, end_month: 4 },
    publish_state: 'published',
    field_sources,
  })
}

function makeFullyPopulatedResort(observedAt: ISODateTimeString): Resort {
  return makeResort(defaultResortFieldSources(observedAt))
}

function makeLiveSignal(
  observedAt: ISODateTimeString,
  field_sources: FieldSourceMap,
  overrides: { snow_depth_cm?: number | undefined } = {},
): ResortLiveSignal {
  return ResortLiveSignal.parse({
    schema_version: 1,
    resort_slug: 'test-resort',
    observed_at: observedAt,
    fetched_at: observedAt,
    snow_depth_cm: 'snow_depth_cm' in overrides ? overrides.snow_depth_cm : 100,
    lifts_open: { count: 8, total: 10 },
    lift_pass_day: { amount: 50, currency: 'EUR' },
    lodging_sample: { median_eur: { amount: 80, currency: 'EUR' }, sample_size: 30 },
    field_sources,
  })
}

function makeFullyPopulatedLiveSignal(observedAt: ISODateTimeString): ResortLiveSignal {
  return makeLiveSignal(observedAt, defaultLiveFieldSources(observedAt))
}

function makeFullyPopulatedLiveSignalWithSnowDepthAt(
  defaultObservedAt: ISODateTimeString,
  snowDepthObservedAt: ISODateTimeString,
): ResortLiveSignal {
  return makeLiveSignal(defaultObservedAt, {
    ...defaultLiveFieldSources(defaultObservedAt),
    'snow_depth_cm': makeFieldSource(snowDepthObservedAt, 'b1'),
  })
}

function makeResortWithSlopesKmAt(
  defaultObservedAt: ISODateTimeString,
  slopesKmObservedAt: ISODateTimeString,
): Resort {
  return makeResort({
    ...defaultResortFieldSources(defaultObservedAt),
    'slopes_km': makeFieldSource(slopesKmObservedAt, 'a3'),
  })
}

function omitKey(map: FieldSourceMap, missing: string): FieldSourceMap {
  return Object.fromEntries(Object.entries(map).filter(([k]): boolean => k !== missing))
}

function makeResortMissingFieldSource(observedAt: ISODateTimeString, missing: 'slopes_km'): Resort {
  return makeResort(omitKey(defaultResortFieldSources(observedAt), missing))
}

function makeLiveSignalMissingFieldSource(
  observedAt: ISODateTimeString,
  missing: 'snow_depth_cm',
): ResortLiveSignal {
  return makeLiveSignal(observedAt, omitKey(defaultLiveFieldSources(observedAt), missing))
}

function makeLiveSignalWithoutSnowDepthValue(observedAt: ISODateTimeString): ResortLiveSignal {
  return makeLiveSignal(observedAt, defaultLiveFieldSources(observedAt), { snow_depth_cm: undefined })
}

function makeResortWithExtraLivePathSource(observedAt: ISODateTimeString): Resort {
  // Add a durable-style entry under live-path key 'snow_depth_cm' to verify
  // the projection does NOT use it as a fallback for the live-path lookup.
  return makeResort({
    ...defaultResortFieldSources(observedAt),
    'snow_depth_cm': makeFieldSource(observedAt, 'a8'),
  })
}

function makeLiveSignalWithDurablePathSource(observedAt: ISODateTimeString): ResortLiveSignal {
  // Inverse: a live entry under durable-path key 'slopes_km' must not be
  // picked up for the durable path when resort.field_sources omits it.
  return makeLiveSignal(observedAt, {
    ...defaultLiveFieldSources(observedAt),
    'slopes_km': makeFieldSource(observedAt, 'b8'),
  })
}
