// Deep-link builders for the detail drawer's external CTAs.
//
// Canonical templates (parent §1 line 131 — "Per-resort `booking_ss` and
// `airbnb_ss` override strings allow operators to use their own curated
// search strings"):
//
//   Booking:  https://www.booking.com/searchresults.html?ss=<encoded>&slug=<encoded>
//   Airbnb:   https://www.airbnb.com/s/<encoded>/homes?slug=<encoded>
//
// `ss=` (Booking) and the `/s/<segment>/homes` path (Airbnb) are filled
// with the resort's display `name` — Booking's site searches by display
// label, not slug; Airbnb's location-search URL is keyed off the human
// label too. A defence-in-depth `slug=<encoded>` query parameter is also
// emitted so a malicious slug surfaced via URL state cannot break out of
// the canonical template (the URL stays well-formed even if `name` is
// somehow empty).
//
// `override` — when supplied — replaces the `name` input. Operators can
// curate search strings (e.g. "Bialka Tatrzanska resort area" instead of
// just the resort name). The override is still subject to
// `encodeURIComponent` (untrusted input).
//
// `trip` — when supplied — appends checkin / checkout / adults parameters.
// Booking uses `group_adults`; Airbnb uses `adults`. When `party_size` is
// omitted the adults parameter is absent entirely — no magic-number
// default. Trip dates are ISO 8601 (`YYYY-MM-DD`); we still
// `encodeURIComponent` them for defence-in-depth even though digits +
// hyphens are URL-safe by construction.
//
// All user-controlled segments are `encodeURIComponent`-wrapped. The
// builders are pure (no module state, no external imports) so they are
// safe to call inside a render cycle.

export type BookingDeepLink = string
export type AirbnbDeepLink = string

export type DeepLinkArgs = {
  slug: string
  name: string
  override?: string
  trip?: { start: string; end: string; party_size?: number }
}

function tripQueryParts(
  trip: DeepLinkArgs['trip'],
  adultsKey: 'group_adults' | 'adults',
): ReadonlyArray<string> {
  if (trip === undefined) {
    return []
  }
  const parts: string[] = [
    `checkin=${encodeURIComponent(trip.start)}`,
    `checkout=${encodeURIComponent(trip.end)}`,
  ]
  if (trip.party_size !== undefined) {
    parts.push(`${adultsKey}=${encodeURIComponent(String(trip.party_size))}`)
  }
  return parts
}

export function bookingDeepLink(args: DeepLinkArgs): BookingDeepLink {
  const ssInput = args.override ?? args.name
  const queryParts: string[] = [
    `ss=${encodeURIComponent(ssInput)}`,
    `slug=${encodeURIComponent(args.slug)}`,
    ...tripQueryParts(args.trip, 'group_adults'),
  ]
  return `https://www.booking.com/searchresults.html?${queryParts.join('&')}`
}

export function airbnbDeepLink(args: DeepLinkArgs): AirbnbDeepLink {
  const segment = args.override ?? args.name
  const queryParts: string[] = [
    `slug=${encodeURIComponent(args.slug)}`,
    ...tripQueryParts(args.trip, 'adults'),
  ]
  return `https://www.airbnb.com/s/${encodeURIComponent(segment)}/homes?${queryParts.join('&')}`
}
