import { describe, expect, it } from 'vitest'

import { airbnbDeepLink, bookingDeepLink } from './deepLinks'

// Canonical-template choice (documented also in deepLinks.ts):
//   - Booking: `ss=` is filled with the resort's `name` (human-facing
//     query — Booking matches by display name, not slug).
//   - Airbnb:  `/s/<segment>/homes` is filled with the resort's `name`
//     (Airbnb's location-search URL uses the human label).
// The slug is still defended (encoded into a `slug=` query parameter)
// so a malicious slug surfaced via URL state cannot break out of the
// canonical template.
//
// `override` (per-resort `booking_ss` / `airbnb_ss` from parent §1
// line 131) replaces the name input wholesale — operators can curate
// search strings (e.g. "Bialka Tatrzanska resort area" instead of just
// the resort name). The override is still subject to encodeURIComponent.
//
// `trip` (when supplied) appends checkin/checkout/adults parameters.
// When `party_size` is omitted the adults param is absent entirely
// (no magic-number default).

describe('bookingDeepLink', (): void => {
  it('canonical template uses encoded name in ss=', (): void => {
    const url = bookingDeepLink({ slug: 'a-resort', name: 'Špindlerův Mlýn' })
    expect(url.startsWith('https://www.booking.com/searchresults.html?ss=')).toBe(true)
    expect(url).toContain(encodeURIComponent('Špindlerův Mlýn'))
  })

  it('encodes the slug into the slug= defence-in-depth param', (): void => {
    const url = bookingDeepLink({ slug: 'kotelnica-bialczanska', name: 'Kotelnica' })
    expect(url).toContain(`slug=${encodeURIComponent('kotelnica-bialczanska')}`)
  })

  it('encodeURIComponent-encodes a malicious slug (no raw delimiters)', (): void => {
    const url = bookingDeepLink({ slug: "';drop table--", name: 'Resort' })
    // `encodeURIComponent` is the correct discipline for user-controlled
    // segments. It encodes `;` → `%3B` and ` ` → `%20`. Apostrophes are
    // URL-safe (sub-delims, not reserved as URL delimiters in path/query
    // positions) and `encodeURIComponent` deliberately leaves them raw —
    // the safety property is "every character that needs encoding is
    // encoded", not "every printable special character is encoded".
    expect(url).not.toContain(';')
    expect(url).not.toContain(' ')
    expect(url).toContain(encodeURIComponent("';drop table--"))
  })

  it('uses override in ss= when supplied (overrides the name input)', (): void => {
    const url = bookingDeepLink({
      slug: 'a-resort',
      name: 'A Resort',
      override: 'Bialka Tatrzanska resort area',
    })
    expect(url).toContain(`ss=${encodeURIComponent('Bialka Tatrzanska resort area')}`)
    // The override replaces the name in `ss=`; the unencoded name should
    // not appear as a substring of `ss=…&` (it can still appear in slug=
    // if it happened to equal the slug, but in this fixture it does not).
    expect(url).not.toContain('ss=A%20Resort')
    expect(url).not.toContain('ss=A+Resort')
  })

  it('encodes a malicious override (no raw delimiters)', (): void => {
    const url = bookingDeepLink({
      slug: 'a-resort',
      name: 'A',
      override: "';drop--",
    })
    // Same encoding discipline as malicious slug — `;` is encoded, raw
    // apostrophe is URL-safe per RFC 3986 sub-delims.
    expect(url).not.toContain(';')
    expect(url).toContain(encodeURIComponent("';drop--"))
  })

  it('appends checkin / checkout / group_adults when trip with party_size is supplied', (): void => {
    const url = bookingDeepLink({
      slug: 'a-resort',
      name: 'A Resort',
      trip: { start: '2026-12-20', end: '2026-12-27', party_size: 4 },
    })
    expect(url).toContain('checkin=2026-12-20')
    expect(url).toContain('checkout=2026-12-27')
    expect(url).toContain('group_adults=4')
  })

  it('omits group_adults when party_size is undefined (no magic-number default)', (): void => {
    const url = bookingDeepLink({
      slug: 'a-resort',
      name: 'A Resort',
      trip: { start: '2026-12-20', end: '2026-12-27' },
    })
    expect(url).toContain('checkin=2026-12-20')
    expect(url).toContain('checkout=2026-12-27')
    expect(url).not.toContain('group_adults=')
  })

  it('omits trip params entirely when trip is undefined', (): void => {
    const url = bookingDeepLink({ slug: 'a-resort', name: 'A Resort' })
    expect(url).not.toContain('checkin=')
    expect(url).not.toContain('checkout=')
    expect(url).not.toContain('group_adults=')
  })
})

describe('airbnbDeepLink', (): void => {
  it('canonical template uses encoded name in /s/<segment>/homes', (): void => {
    const url = airbnbDeepLink({ slug: 'a-resort', name: 'Špindlerův Mlýn' })
    expect(url.startsWith('https://www.airbnb.com/s/')).toBe(true)
    expect(url).toContain(encodeURIComponent('Špindlerův Mlýn'))
  })

  it('encodes the slug into the slug= defence-in-depth param', (): void => {
    const url = airbnbDeepLink({ slug: 'kotelnica-bialczanska', name: 'Kotelnica' })
    expect(url).toContain(`slug=${encodeURIComponent('kotelnica-bialczanska')}`)
  })

  it('encodeURIComponent-encodes a malicious slug (no raw delimiters)', (): void => {
    const url = airbnbDeepLink({ slug: "';drop table--", name: 'Resort' })
    expect(url).not.toContain(';')
    expect(url).not.toContain(' ')
    expect(url).toContain(encodeURIComponent("';drop table--"))
  })

  it('uses override in the /s/<segment>/homes path when supplied', (): void => {
    const url = airbnbDeepLink({
      slug: 'a-resort',
      name: 'A Resort',
      override: 'Bialka Tatrzanska resort area',
    })
    expect(url).toContain(`/s/${encodeURIComponent('Bialka Tatrzanska resort area')}/homes`)
    expect(url).not.toContain(`/s/${encodeURIComponent('A Resort')}/homes`)
  })

  it('encodes a malicious override (no raw delimiters)', (): void => {
    const url = airbnbDeepLink({
      slug: 'a-resort',
      name: 'A',
      override: "';drop--",
    })
    expect(url).not.toContain(';')
    expect(url).toContain(encodeURIComponent("';drop--"))
  })

  it('appends checkin / checkout / adults when trip with party_size is supplied', (): void => {
    const url = airbnbDeepLink({
      slug: 'a-resort',
      name: 'A Resort',
      trip: { start: '2026-12-20', end: '2026-12-27', party_size: 4 },
    })
    expect(url).toContain('checkin=2026-12-20')
    expect(url).toContain('checkout=2026-12-27')
    expect(url).toContain('adults=4')
  })

  it('omits adults when party_size is undefined (no magic-number default)', (): void => {
    const url = airbnbDeepLink({
      slug: 'a-resort',
      name: 'A Resort',
      trip: { start: '2026-12-20', end: '2026-12-27' },
    })
    expect(url).toContain('checkin=2026-12-20')
    expect(url).toContain('checkout=2026-12-27')
    expect(url).not.toContain('adults=')
  })

  it('omits trip params entirely when trip is undefined', (): void => {
    const url = airbnbDeepLink({ slug: 'a-resort', name: 'A Resort' })
    expect(url).not.toContain('checkin=')
    expect(url).not.toContain('checkout=')
    expect(url).not.toContain('adults=')
  })
})
