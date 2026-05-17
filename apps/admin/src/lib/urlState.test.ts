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

describe('parseURL — publishes route', () => {
  it('parses ?route=publishes as { route: "publishes" } with no page (default = 0)', (): void => {
    expect(parseURL('?route=publishes')).toEqual({ route: 'publishes' })
  })
  it('parses ?route=publishes&page=2', (): void => {
    expect(parseURL('?route=publishes&page=2')).toEqual({ route: 'publishes', page: 2 })
  })
  it('drops the default-0 page (?route=publishes&page=0 → page key omitted)', (): void => {
    // Defaults are omitted per the urlState.ts header comment, so an explicit
    // page=0 collapses to the canonical "first page" shape. PublishHistory
    // reads `route.page ?? 0` anyway, so functionality is preserved.
    expect(parseURL('?route=publishes&page=0')).toEqual({ route: 'publishes' })
  })
  it('drops invalid page (?route=publishes&page=bogus → no page key)', (): void => {
    expect(parseURL('?route=publishes&page=bogus')).toEqual({ route: 'publishes' })
  })
  it('drops negative page (?route=publishes&page=-1 → no page key)', (): void => {
    // Negative offsets are nonsensical for pagination; the ^\d+$ regex rejects
    // them. PublishHistory's Previous button is `disabled` at page === 0, so a
    // crafted negative URL never originates from the UI.
    expect(parseURL('?route=publishes&page=-1')).toEqual({ route: 'publishes' })
  })
  it('drops unsafe-integer page (?route=publishes&page=99...9 → no page key)', (): void => {
    // 21 nines = ~1e21, well above both Number.MAX_SAFE_INTEGER (2^53 - 1)
    // AND the offset-safe cap (MAX_SAFE_INTEGER / 20). Codex round-1 P3 PR #102.
    expect(parseURL('?route=publishes&page=999999999999999999999')).toEqual({ route: 'publishes' })
  })
  it('drops page values whose derived offset would exceed Number.MAX_SAFE_INTEGER', (): void => {
    // page = MAX_SAFE_INTEGER (2^53 - 1) is itself a safe integer but its
    // derived offset (page * PUBLISHES_PAGE_SIZE = 20 * MAX_SAFE_INTEGER) is
    // NOT — ListPublishesQuery's `z.number().int()` would reject it, surfacing
    // a load error instead of the silent drop-invalid fall-back. Codex round-2
    // P2 PR #102. The parse step caps at MAX_SAFE_PUBLISHES_PAGE = floor(
    // MAX_SAFE_INTEGER / PUBLISHES_PAGE_SIZE) so the consumer never sees an
    // over-cap page.
    expect(parseURL('?route=publishes&page=9007199254740991')).toEqual({ route: 'publishes' })
  })
  it('preserves the largest safe page (offset stays in safe-integer range)', (): void => {
    // floor(MAX_SAFE_INTEGER / 20) = 450359962737049 — boundary case at the cap.
    // page * 20 = 9007199254740980, just below MAX_SAFE_INTEGER. Sanity-pins
    // that the bound is inclusive on the safe side.
    expect(parseURL('?route=publishes&page=450359962737049')).toEqual({
      route: 'publishes',
      page: 450359962737049,
    })
  })
})

describe('parseURL — gallery route (S1.0 dev-only surface)', () => {
  it('parses ?route=gallery as { route: "gallery" }', (): void => {
    expect(parseURL('?route=gallery')).toEqual({ route: 'gallery' })
  })
  it('drops extra unknown keys on the gallery route', (): void => {
    expect(parseURL('?route=gallery&foo=bar')).toEqual({ route: 'gallery' })
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
  it('serializes publishes with no page as ?route=publishes', (): void => {
    expect(serializeURL({ route: 'publishes' })).toBe('?route=publishes')
  })
  it('serializes publishes with page=2 as ?route=publishes&page=2', (): void => {
    expect(serializeURL({ route: 'publishes', page: 2 })).toBe('?route=publishes&page=2')
  })
  it('serializes gallery as ?route=gallery (S1.0 dev-only surface)', (): void => {
    expect(serializeURL({ route: 'gallery' })).toBe('?route=gallery')
  })
  it('drops default-0 page on serialize (?route=publishes)', (): void => {
    // Mirrors the "defaults are omitted" header comment — round-trip-stable for
    // the canonical { route: 'publishes' } shape.
    expect(serializeURL({ route: 'publishes', page: 0 })).toBe('?route=publishes')
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
    ['publishes (no page)', { route: 'publishes' }],
    ['publishes (page=2)', { route: 'publishes', page: 2 }],
    ['gallery', { route: 'gallery' }],
  ]

  for (const [label, input] of cases) {
    it(`${label}: parseURL(serializeURL(input)) === input`, (): void => {
      expect(parseURL(serializeURL(input))).toEqual(input)
    })
  }
})
