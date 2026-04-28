import type { ISOCountryCode } from '@snowboard-trip-advisor/schema'

// Country → primary-language map for the BCP 47 lang attribute on resort-name
// elements (parent §2.4 + cross-cutting assignments table). ISO 3166-1 alpha-2
// country codes are NOT valid BCP 47 language tags (CZ country → cs language;
// AT country → de language). The map covers parent §2.1's country list;
// secondary languages (CH FR/IT/RM, ES CA/EU/GL) take the official primary
// per spec §6.6.
export const COUNTRY_TO_PRIMARY_LANG: Readonly<Record<string, string>> = {
  PL: 'pl',     // Poland → Polish
  CZ: 'cs',     // Czech Republic → Czech
  AT: 'de',     // Austria → German
  CH: 'de',     // Switzerland → German (primary; FR/IT/RM secondary)
  FR: 'fr',     // France → French
  IT: 'it',     // Italy → Italian
  ES: 'es',     // Spain → Spanish (primary; CA/EU/GL secondary)
  SE: 'sv',     // Sweden → Swedish
}

// Safe default: misannouncement < no announcement. SR users hearing 'en'
// for a Polish resort name is suboptimal; an undefined lang attribute
// hides language metadata entirely.
export function countryToPrimaryLang(country: ISOCountryCode): string {
  return COUNTRY_TO_PRIMARY_LANG[country] ?? 'en'
}
