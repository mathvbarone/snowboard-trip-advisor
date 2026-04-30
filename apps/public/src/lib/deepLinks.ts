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
// label too. URLs are human-facing (users may copy / share / bookmark
// them); a `name`-driven canonical template keeps the visible URL
// readable.
//
// The `slug=<encoded>` query parameter is appended to BOTH templates as
// belt-and-braces defence-in-depth. This is NOT specced — it's an
// in-PR decision (PR 3.5). Rationale:
//   1. Log-grep / fixture-asserting: tests + future ops dashboards can
//      pin a deep-link to a resort by `slug=` without re-deriving it
//      from the human-readable `name` (which depends on UTF-8
//      normalization, locale casing, etc.).
//   2. Future provider-side validators (e.g. an admin smoke-tester that
//      visits each generated URL) may prefer a slug-based lookup —
//      `slug=` keeps the URL machine-checkable.
//   3. URL stays well-formed even if `name` somehow becomes empty
//      (Booking would otherwise generate `?ss=&...`, which redirects
//      to a generic landing page — `slug=` keeps the resort identity
//      recoverable from the URL).
// Booking and Airbnb both tolerate unknown query parameters (verified
// via manual smoke; neither provider rejects requests with extra
// params). If a future provider validator does reject unknown params,
// the `slug=` emission becomes a per-builder flag rather than a
// universal default — handled in the PR that introduces the validator.
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
  /**
   * Optional trip-window parameters appended to the deep-link URL.
   *
   * - `start` and `end` MUST be ISO 8601 calendar dates in the format
   *   `YYYY-MM-DD` (e.g. `'2026-12-20'`). The builder does NOT validate or
   *   transform — the strings flow through `encodeURIComponent` as-is and
   *   land in the provider's `checkin=` / `checkout=` query params.
   * - A non-ISO string (e.g. `Date.toString()`, locale-formatted) will
   *   produce a malformed URL that the provider rejects. Validate at the
   *   call site, not here. Phase 2's admin-app form-controls will brand
   *   this as `ISODate`.
   * - `party_size` (when set) becomes Booking's `group_adults=N` and
   *   Airbnb's `adults=N`. When omitted, the adults param is NOT defaulted
   *   to a magic number — the provider applies its own default.
   *
   * @example
   *   bookingDeepLink({ slug: 'kotelnica-bialczanska', name: 'Kotelnica',
   *     trip: { start: '2026-12-20', end: '2026-12-27', party_size: 4 } })
   */
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
