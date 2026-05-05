import { ISOCountryCode, ResortSlug } from '@snowboard-trip-advisor/schema'
import { describe, expect, it } from 'vitest'

import { parseURL, serializeURL, type RouteState } from './urlState'

describe('parseURL — dashboard route', () => {
  it('returns dashboard route for empty search', (): void => {
    expect(parseURL('')).toEqual({ route: 'dashboard' })
  })
  it('returns dashboard route for ?route=dashboard', (): void => {
    expect(parseURL('?route=dashboard')).toEqual({ route: 'dashboard' })
  })
  it('drops unknown route value (defaults to dashboard)', (): void => {
    expect(parseURL('?route=bogus')).toEqual({ route: 'dashboard' })
  })
  it('drops extra unknown keys silently', (): void => {
    expect(parseURL('?route=dashboard&foo=bar')).toEqual({ route: 'dashboard' })
  })
})

describe('parseURL — resorts route', () => {
  it('parses ?route=resorts as { route: "resorts" } with no filters', (): void => {
    expect(parseURL('?route=resorts')).toEqual({
      route: 'resorts',
      country: undefined,
      hasFailures: undefined,
    })
  })
  it('parses ?route=resorts&country=PL with country filter', (): void => {
    expect(parseURL('?route=resorts&country=PL')).toEqual({
      route: 'resorts',
      country: ISOCountryCode.parse('PL'),
      hasFailures: undefined,
    })
  })
  it('drops invalid country (?route=resorts&country=ZZ keeps route, drops filter)', (): void => {
    // ZZ is regex-valid (^[A-Z]{2}$) but not a real ISO-3166-1 alpha-2 code.
    // Per Epic 3 drop-invalid pattern, the country filter is dropped, but the
    // route remains 'resorts'. Note: the schema's regex is permissive — any
    // 2-letter uppercase passes, so use a value that fails the regex to
    // exercise the drop-invalid branch.
    expect(parseURL('?route=resorts&country=zz')).toEqual({
      route: 'resorts',
      country: undefined,
      hasFailures: undefined,
    })
  })
  it('parses ?route=resorts&hasFailures=true', (): void => {
    expect(parseURL('?route=resorts&hasFailures=true')).toEqual({
      route: 'resorts',
      country: undefined,
      hasFailures: true,
    })
  })
  it('parses ?route=resorts&hasFailures=false', (): void => {
    expect(parseURL('?route=resorts&hasFailures=false')).toEqual({
      route: 'resorts',
      country: undefined,
      hasFailures: false,
    })
  })
  it('drops invalid hasFailures (?route=resorts&hasFailures=yes → undefined)', (): void => {
    expect(parseURL('?route=resorts&hasFailures=yes')).toEqual({
      route: 'resorts',
      country: undefined,
      hasFailures: undefined,
    })
  })
  it('parses both filters together', (): void => {
    expect(parseURL('?route=resorts&country=PL&hasFailures=true')).toEqual({
      route: 'resorts',
      country: ISOCountryCode.parse('PL'),
      hasFailures: true,
    })
  })
})

describe('parseURL — editor route', () => {
  it('parses ?route=editor&slug=kotelnica-bialczanska', (): void => {
    expect(parseURL('?route=editor&slug=kotelnica-bialczanska')).toEqual({
      route: 'editor',
      slug: ResortSlug.parse('kotelnica-bialczanska'),
    })
  })
  it('drops to dashboard when slug missing (?route=editor)', (): void => {
    expect(parseURL('?route=editor')).toEqual({ route: 'dashboard' })
  })
  it('drops to dashboard when slug fails regex (?route=editor&slug=Bad_Slug)', (): void => {
    expect(parseURL('?route=editor&slug=Bad_Slug')).toEqual({ route: 'dashboard' })
  })
})

describe('serializeURL', () => {
  it('serializes dashboard route as empty (default omitted)', (): void => {
    expect(serializeURL({ route: 'dashboard' })).toBe('')
  })
  it('serializes resorts with no filters as ?route=resorts', (): void => {
    expect(serializeURL({ route: 'resorts' })).toBe('?route=resorts')
  })
  it('serializes resorts with country', (): void => {
    expect(
      serializeURL({ route: 'resorts', country: ISOCountryCode.parse('PL') }),
    ).toBe('?route=resorts&country=PL')
  })
  it('serializes resorts with hasFailures=true', (): void => {
    expect(serializeURL({ route: 'resorts', hasFailures: true })).toBe(
      '?route=resorts&hasFailures=true',
    )
  })
  it('serializes editor with slug', (): void => {
    expect(
      serializeURL({ route: 'editor', slug: ResortSlug.parse('kotelnica-bialczanska') }),
    ).toBe('?route=editor&slug=kotelnica-bialczanska')
  })
})

describe('round-trip parseURL ∘ serializeURL', () => {
  // Note: optional fields are omitted (not set to undefined) per
  // exactOptionalPropertyTypes — parseURL returns the same shape, so toEqual
  // checks succeed without explicit `undefined` assertions.
  const cases: ReadonlyArray<readonly [string, RouteState]> = [
    ['dashboard', { route: 'dashboard' }],
    ['resorts (no filters)', { route: 'resorts' }],
    ['resorts (country only)', { route: 'resorts', country: ISOCountryCode.parse('PL') }],
    ['resorts (hasFailures only, true)', { route: 'resorts', hasFailures: true }],
    ['resorts (hasFailures only, false)', { route: 'resorts', hasFailures: false }],
    ['resorts (both filters)', {
      route: 'resorts',
      country: ISOCountryCode.parse('PL'),
      hasFailures: true,
    }],
    ['editor', { route: 'editor', slug: ResortSlug.parse('kotelnica-bialczanska') }],
  ]

  for (const [label, input] of cases) {
    it(`${label}: parseURL(serializeURL(input)) === input`, (): void => {
      expect(parseURL(serializeURL(input))).toEqual(input)
    })
  }
})
