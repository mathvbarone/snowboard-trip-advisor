import {
  ISOCountryCode,
  ISODateTimeString,
  ResortSlug,
  type ResortView,
} from '@snowboard-trip-advisor/schema'
import { describe, expect, it } from 'vitest'

import { filterViews, sortViews } from './cardsSelectors'

const FRESH = ISODateTimeString.parse('2026-04-26T08:00:00Z')

function makeView(opts: {
  slug: string
  country: string
  name: string
  price?: number | null
  snow?: number | null
}): ResortView {
  return {
    slug: ResortSlug.parse(opts.slug),
    name: { en: opts.name },
    country: ISOCountryCode.parse(opts.country),
    region: { en: 'Region' },
    altitude_m: { state: 'never_fetched' },
    slopes_km: { state: 'never_fetched' },
    lift_count: { state: 'never_fetched' },
    skiable_terrain_ha: { state: 'never_fetched' },
    season: { state: 'never_fetched' },
    snow_depth_cm: opts.snow === undefined || opts.snow === null
      ? { state: 'never_fetched' }
      : {
          state: 'fresh',
          value: opts.snow,
          source: 'manual',
          observed_at: FRESH,
        },
    lifts_open: { state: 'never_fetched' },
    lift_pass_day: opts.price === undefined || opts.price === null
      ? { state: 'never_fetched' }
      : {
          state: 'fresh',
          value: { amount: opts.price, currency: 'EUR' },
          source: 'manual',
          observed_at: FRESH,
        },
    lodging_sample_median_eur: { state: 'never_fetched' },
  }
}

describe('filterViews', (): void => {
  const A = makeView({ slug: 'a', country: 'PL', name: 'A', price: 30 })
  const B = makeView({ slug: 'b', country: 'CZ', name: 'B', price: 60 })
  const C = makeView({ slug: 'c', country: 'AT', name: 'C', price: 100 })
  const D = makeView({ slug: 'd', country: 'PL', name: 'D' /* no price */ })

  it('returns all views when no country filter is set and bucket=any', (): void => {
    expect(filterViews([A, B, C, D], [], 'any').map((v): string => v.slug)).toEqual([
      'a', 'b', 'c', 'd',
    ])
  })

  it('keeps only resorts whose country is in the country filter', (): void => {
    expect(filterViews([A, B, C, D], ['PL'], 'any').map((v): string => v.slug)).toEqual([
      'a', 'd',
    ])
  })

  it('keeps everything when the country filter is empty (treats [] as no-op)', (): void => {
    expect(filterViews([A, B, C], [], 'any').map((v): string => v.slug)).toEqual([
      'a', 'b', 'c',
    ])
  })

  it('lo bucket keeps amount ≤ €40', (): void => {
    expect(filterViews([A, B, C], [], 'lo').map((v): string => v.slug)).toEqual(['a'])
  })

  it('mid bucket keeps amount > €40 and ≤ €80', (): void => {
    expect(filterViews([A, B, C], [], 'mid').map((v): string => v.slug)).toEqual(['b'])
  })

  it('hi bucket keeps amount > €80', (): void => {
    expect(filterViews([A, B, C], [], 'hi').map((v): string => v.slug)).toEqual(['c'])
  })

  it('drops never_fetched lift_pass_day under any bucket other than any', (): void => {
    // D has no price; under any non-any bucket it must be excluded.
    expect(filterViews([A, D], [], 'lo').map((v): string => v.slug)).toEqual(['a'])
    expect(filterViews([A, D], [], 'mid').map((v): string => v.slug)).toEqual([])
    expect(filterViews([A, D], [], 'hi').map((v): string => v.slug)).toEqual([])
  })

  it('keeps never_fetched lift_pass_day under bucket=any', (): void => {
    expect(filterViews([A, D], [], 'any').map((v): string => v.slug)).toEqual(['a', 'd'])
  })

  it('combines country filter and price bucket', (): void => {
    expect(filterViews([A, B, C], ['PL', 'AT'], 'hi').map((v): string => v.slug)).toEqual(['c'])
  })

  // Strict country filter: a URL country code that is absent from the
  // dataset returns an empty array. Spec §390 ("The `<NoResorts />`
  // component still ships as defence-in-depth for `views.length === 0`")
  // requires the empty state to be reachable; the previous stale-URL
  // no-op guard hid it. The recovery affordance is the FilterBar (still
  // rendered alongside <NoResorts>) — the user clears the country query
  // by toggling the country chips.
  it('returns [] when every URL country is absent from the dataset', (): void => {
    // Dataset is PL + CZ; URL says ?country=DE — strict filter yields zero.
    expect(filterViews([A, B], ['DE'], 'any')).toEqual([])
  })

  it('returns [] when every URL country is absent (single-country dataset)', (): void => {
    // Single-country dataset (chip group hidden); URL says ?country=PL
    // (B is CZ). Strict filter yields zero; <NoResorts> takes over.
    expect(filterViews([B], ['PL'], 'any')).toEqual([])
  })

  it('intersects URL countries with dataset countries (mixed valid + invalid)', (): void => {
    // Dataset is PL + CZ + AT; URL says DE + PL — only PL is valid, and
    // only PL views survive (DE is silently ignored because PL is present).
    expect(
      filterViews([A, B, C, D], ['DE', 'PL'], 'any').map((v): string => v.slug),
    ).toEqual(['a', 'd'])
  })
})

describe('sortViews', (): void => {
  const A = makeView({ slug: 'a', country: 'PL', name: 'Apple', price: 30, snow: 50 })
  const B = makeView({ slug: 'b', country: 'CZ', name: 'Banana', price: 60, snow: 80 })
  const C = makeView({ slug: 'c', country: 'AT', name: 'Cherry', price: 100, snow: 30 })
  const N = makeView({ slug: 'n', country: 'AT', name: 'Nullish', /* no price/snow */ })

  it('name → alphabetical by name.en', (): void => {
    expect(sortViews([C, A, B], 'name').map((v): string => v.slug)).toEqual([
      'a', 'b', 'c',
    ])
  })

  it('price_asc → cheapest first', (): void => {
    expect(sortViews([C, A, B], 'price_asc').map((v): string => v.slug)).toEqual([
      'a', 'b', 'c',
    ])
  })

  it('price_desc → most expensive first', (): void => {
    expect(sortViews([A, B, C], 'price_desc').map((v): string => v.slug)).toEqual([
      'c', 'b', 'a',
    ])
  })

  it('snow_depth_desc → deepest snow first', (): void => {
    expect(sortViews([A, B, C], 'snow_depth_desc').map((v): string => v.slug)).toEqual([
      'b', 'a', 'c',
    ])
  })

  it('sinks never_fetched price values to the end on price_asc', (): void => {
    // N has no price; under price_asc, A (30) < B (60), N is undefined → end.
    expect(sortViews([N, B, A], 'price_asc').map((v): string => v.slug)).toEqual([
      'a', 'b', 'n',
    ])
    // Also exercise N at the END of the input — the V8 comparator-call
    // sequence differs from the [N, ...] case and hits the alternate
    // a/b-undefined branch in compareNumeric.
    expect(sortViews([A, B, N], 'price_asc').map((v): string => v.slug)).toEqual([
      'a', 'b', 'n',
    ])
  })

  it('sinks never_fetched price values to the end on price_desc', (): void => {
    expect(sortViews([N, A, B], 'price_desc').map((v): string => v.slug)).toEqual([
      'b', 'a', 'n',
    ])
    expect(sortViews([A, B, N], 'price_desc').map((v): string => v.slug)).toEqual([
      'b', 'a', 'n',
    ])
  })

  it('sinks never_fetched snow values to the end on snow_depth_desc', (): void => {
    expect(sortViews([N, A, B], 'snow_depth_desc').map((v): string => v.slug)).toEqual([
      'b', 'a', 'n',
    ])
    expect(sortViews([A, B, N], 'snow_depth_desc').map((v): string => v.slug)).toEqual([
      'b', 'a', 'n',
    ])
  })

  it('two never_fetched values compare equal (preserves dataset order)', (): void => {
    const N2 = makeView({ slug: 'n2', country: 'AT', name: 'Other null' })
    // Both N and N2 have undefined price; comparator returns 0; order preserved.
    expect(sortViews([N, N2], 'price_asc').map((v): string => v.slug)).toEqual([
      'n', 'n2',
    ])
  })

  it('sortViews does not mutate the input array', (): void => {
    const input = [B, A, C]
    sortViews(input, 'name')
    expect(input.map((v): string => v.slug)).toEqual(['b', 'a', 'c'])
  })
})
