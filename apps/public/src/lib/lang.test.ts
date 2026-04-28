import { ISOCountryCode } from '@snowboard-trip-advisor/schema'
import { describe, expect, it } from 'vitest'

import { COUNTRY_TO_PRIMARY_LANG, countryToPrimaryLang } from './lang'

const BCP_47 = /^[a-z]{2,3}(-[A-Z]{2,4})?$/

describe('countryToPrimaryLang', (): void => {
  it.each([
    ['PL', 'pl'],
    ['CZ', 'cs'],
    ['AT', 'de'],
    ['CH', 'de'],
    ['FR', 'fr'],
    ['IT', 'it'],
    ['ES', 'es'],
    ['SE', 'sv'],
  ] as const)('maps country %s → primary language %s', (country, expected): void => {
    expect(countryToPrimaryLang(ISOCountryCode.parse(country))).toBe(expected)
  })

  it('falls back to "en" for unknown country codes', (): void => {
    expect(countryToPrimaryLang(ISOCountryCode.parse('XX'))).toBe('en')
  })

  it('every entry in COUNTRY_TO_PRIMARY_LANG yields a valid BCP 47 tag', (): void => {
    for (const tag of Object.values(COUNTRY_TO_PRIMARY_LANG)) {
      expect(tag).toMatch(BCP_47)
    }
  })
})
