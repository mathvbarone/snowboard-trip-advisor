import { describe, expect, it, vi, afterEach } from 'vitest'

import { parseURL, PUSH_KEYS, serializeURL, type URLState } from './urlState'

declare global {
  interface Window {
    __sta_debug?: { urlParseFailures?: ReadonlyArray<unknown> }
  }
}

afterEach((): void => {
  vi.unstubAllEnvs()
  delete window.__sta_debug
})

describe('parseURL', (): void => {
  it('returns empty defaults for an empty search string', (): void => {
    expect(parseURL('')).toEqual({
      view: 'cards',
      sort: 'name',
      country: [],
      shortlist: [],
    })
  })

  it('parses view + sort + country + shortlist + detail + highlight', (): void => {
    const state = parseURL(
      '?view=matrix&sort=snow_depth_desc&country=PL,CZ&shortlist=a-resort,b-resort&detail=a-resort&highlight=snow_depth_cm',
    )
    expect(state.view).toBe('matrix')
    expect(state.sort).toBe('snow_depth_desc')
    expect(state.country).toEqual(['PL', 'CZ'])
    expect(state.shortlist).toEqual(['a-resort', 'b-resort'])
    expect(state.detail).toBe('a-resort')
    expect(state.highlight).toBe('snow_depth_cm')
  })

  it('drops invalid view values silently', (): void => {
    expect(parseURL('?view=detail').view).toBe('cards')         // detail is overlay-only per spec §3.1
  })

  it('drops invalid sort values', (): void => {
    expect(parseURL('?sort=garbage').sort).toBe('name')
  })

  it('truncates shortlist to 6 entries (head-take)', (): void => {
    const state = parseURL('?shortlist=a,b,c,d,e,f,g,h')
    expect(state.shortlist).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })

  it('drops shortlist entries that fail the slug regex', (): void => {
    const state = parseURL('?shortlist=valid-slug,UPPER,also-ok')
    expect(state.shortlist).toEqual(['valid-slug', 'also-ok'])
  })

  it('drops invalid country codes', (): void => {
    const state = parseURL('?country=PL,xx,FRA,CZ')
    expect(state.country).toEqual(['PL', 'CZ'])
  })

  it('drops detail when slug fails the regex', (): void => {
    expect(parseURL('?detail=NOT_A_SLUG').detail).toBeUndefined()
  })

  it('drops highlight when not in METRIC_FIELDS', (): void => {
    expect(parseURL('?highlight=garbage').highlight).toBeUndefined()
  })

  it('ignores unknown keys', (): void => {
    const state = parseURL('?view=cards&unknown=value')
    expect(state.view).toBe('cards')
    expect(Object.keys(state)).not.toContain('unknown')
  })

  it('does not populate __sta_debug.urlParseFailures in production', (): void => {
    vi.stubEnv('DEV', false)
    parseURL('?view=junk')
    expect(window.__sta_debug?.urlParseFailures).toBeUndefined()
  })

  it('populates __sta_debug.urlParseFailures in dev when an invalid value is dropped', (): void => {
    vi.stubEnv('DEV', true)
    parseURL('?view=junk')
    expect(window.__sta_debug?.urlParseFailures?.length).toBeGreaterThan(0)
  })
})

describe('serializeURL', (): void => {
  it('returns an empty string when state is at its defaults', (): void => {
    expect(serializeURL({ view: 'cards', sort: 'name', country: [], shortlist: [] })).toBe('')
  })

  it('omits default values', (): void => {
    expect(
      serializeURL({ view: 'matrix', sort: 'name', country: [], shortlist: [] }),
    ).toBe('view=matrix')
  })

  it('emits keys in stable order: view, sort, country, shortlist, detail, highlight', (): void => {
    const out = serializeURL({
      view: 'matrix',
      sort: 'price_asc',
      country: ['PL', 'CZ'],
      shortlist: ['a-resort'],
      detail: 'a-resort',
      highlight: 'snow_depth_cm',
    })
    // The ordering is encoded in the regex's capture groups.
    expect(out).toBe(
      'view=matrix&sort=price_asc&country=PL,CZ&shortlist=a-resort&detail=a-resort&highlight=snow_depth_cm',
    )
  })

  it('truncates shortlist to 6 on serialize as well', (): void => {
    const out = serializeURL({
      view: 'cards',
      sort: 'name',
      country: [],
      shortlist: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
    })
    expect(out).toBe('shortlist=a,b,c,d,e,f')
  })

  it('round-trips parseURL ∘ serializeURL', (): void => {
    const initial: URLState = {
      view: 'matrix',
      sort: 'price_desc',
      country: ['FR', 'AT'],
      shortlist: ['x', 'y'],
      detail: 'x',
      highlight: 'lift_pass_day',
    }
    expect(parseURL(`?${serializeURL(initial)}`)).toEqual(initial)
  })
})

describe('PUSH_KEYS', (): void => {
  it('includes view + detail (PUSH transitions per spec §3.1)', (): void => {
    expect(PUSH_KEYS).toContain('view')
    expect(PUSH_KEYS).toContain('detail')
  })

  it('does not include sort/country/shortlist/highlight (REPLACE transitions)', (): void => {
    expect(PUSH_KEYS).not.toContain('sort')
    expect(PUSH_KEYS).not.toContain('country')
    expect(PUSH_KEYS).not.toContain('shortlist')
    expect(PUSH_KEYS).not.toContain('highlight')
  })
})
