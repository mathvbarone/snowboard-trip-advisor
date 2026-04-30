import {
  ISOCountryCode,
  ISODateTimeString,
  METRIC_FIELDS,
  ResortSlug,
  type ResortView,
} from '@snowboard-trip-advisor/schema'
import { describe, expect, it } from 'vitest'

import { METRIC_LABELS, METRIC_RENDERERS, MISSING } from './matrixRenderers'

const FRESH = ISODateTimeString.parse('2026-04-26T08:00:00Z')

function makeAllNeverFetched(): ResortView {
  return {
    slug: ResortSlug.parse('test-resort'),
    name: { en: 'Test Resort' },
    country: ISOCountryCode.parse('PL'),
    region: { en: 'Region' },
    altitude_m: { state: 'never_fetched' },
    slopes_km: { state: 'never_fetched' },
    lift_count: { state: 'never_fetched' },
    skiable_terrain_ha: { state: 'never_fetched' },
    season: { state: 'never_fetched' },
    snow_depth_cm: { state: 'never_fetched' },
    lifts_open: { state: 'never_fetched' },
    lift_pass_day: { state: 'never_fetched' },
    lodging_sample_median_eur: { state: 'never_fetched' },
  }
}

function makeAllFresh(): ResortView {
  return {
    slug: ResortSlug.parse('test-resort'),
    name: { en: 'Test Resort' },
    country: ISOCountryCode.parse('PL'),
    region: { en: 'Region' },
    altitude_m: {
      state: 'fresh',
      value: { min: 100, max: 200 },
      source: 'manual',
      observed_at: FRESH,
    },
    slopes_km: { state: 'fresh', value: 25, source: 'manual', observed_at: FRESH },
    lift_count: { state: 'fresh', value: 12, source: 'manual', observed_at: FRESH },
    skiable_terrain_ha: {
      state: 'fresh',
      value: 80,
      source: 'manual',
      observed_at: FRESH,
    },
    season: {
      state: 'fresh',
      value: { start_month: 11, end_month: 4 },
      source: 'manual',
      observed_at: FRESH,
    },
    snow_depth_cm: { state: 'fresh', value: 50, source: 'manual', observed_at: FRESH },
    lifts_open: {
      state: 'fresh',
      value: { count: 6, total: 12 },
      source: 'manual',
      observed_at: FRESH,
    },
    lift_pass_day: {
      state: 'fresh',
      value: { amount: 45, currency: 'EUR' },
      source: 'manual',
      observed_at: FRESH,
    },
    lodging_sample_median_eur: {
      state: 'fresh',
      value: { amount: { amount: 90, currency: 'EUR' }, sample_size: 10 },
      source: 'manual',
      observed_at: FRESH,
    },
  }
}

describe('METRIC_RENDERERS', (): void => {
  it('exposes a renderer for every METRIC_FIELDS entry', (): void => {
    for (const path of METRIC_FIELDS) {
      expect(METRIC_RENDERERS[path]).toBeTypeOf('function')
    }
  })

  it('returns "—" for every never_fetched field', (): void => {
    const view = makeAllNeverFetched()
    for (const path of METRIC_FIELDS) {
      expect(METRIC_RENDERERS[path](view)).toBe(MISSING)
    }
  })

  it('formats fresh-state fields with the design-system formatters', (): void => {
    const view = makeAllFresh()
    expect(METRIC_RENDERERS['altitude_m.min'](view)).toBe('100')
    expect(METRIC_RENDERERS['altitude_m.max'](view)).toBe('200')
    expect(METRIC_RENDERERS['slopes_km'](view)).toBe('25')
    expect(METRIC_RENDERERS['lift_count'](view)).toBe('12')
    expect(METRIC_RENDERERS['skiable_terrain_ha'](view)).toBe('80')
    expect(METRIC_RENDERERS['season.start_month'](view)).toBe('Nov')
    expect(METRIC_RENDERERS['season.end_month'](view)).toBe('Apr')
    expect(METRIC_RENDERERS['snow_depth_cm'](view)).toBe('50')
    expect(METRIC_RENDERERS['lifts_open.count'](view)).toBe('6')
    expect(METRIC_RENDERERS['lifts_open.total'](view)).toBe('12')
    expect(METRIC_RENDERERS['lift_pass_day'](view)).toBe('€45')
    expect(METRIC_RENDERERS['lodging_sample.median_eur'](view)).toBe('€90')
  })

  it('falls back to a "Mn" placeholder for out-of-range season months', (): void => {
    const view = makeAllFresh()
    if (view.season.state === 'fresh') {
      view.season = {
        ...view.season,
        value: { start_month: 0, end_month: 13 },
      }
    }
    expect(METRIC_RENDERERS['season.start_month'](view)).toBe('M0')
    expect(METRIC_RENDERERS['season.end_month'](view)).toBe('M13')
  })
})

describe('METRIC_LABELS', (): void => {
  it('exposes a non-empty label for every METRIC_FIELDS entry', (): void => {
    for (const path of METRIC_FIELDS) {
      const label = METRIC_LABELS[path]
      expect(label.length).toBeGreaterThan(0)
    }
  })
})
