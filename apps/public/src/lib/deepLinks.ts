// Deep-link builders for the detail drawer's external CTAs. PR 3.1c ships
// the type contract + stub bodies; PR 3.5 fills the bodies (Booking +
// Airbnb URL composition, encodeURIComponent on every user-controlled
// segment, security attribute checklist). The file exists at PR 3.1c so
// PR 3.5's diff is a body-fill, not a new file — the frozen-interface
// promise from §5.5 extends one level into lib too.

export type BookingDeepLink = string
export type AirbnbDeepLink = string

export type DeepLinkArgs = {
  slug: string
  name: string
  override?: string
  trip?: { start: string; end: string; party_size?: number }
}

export function bookingDeepLink(args: DeepLinkArgs): BookingDeepLink {
  void args
  throw new Error('bookingDeepLink — lands in PR 3.5')
}

export function airbnbDeepLink(args: DeepLinkArgs): AirbnbDeepLink {
  void args
  throw new Error('airbnbDeepLink — lands in PR 3.5')
}
