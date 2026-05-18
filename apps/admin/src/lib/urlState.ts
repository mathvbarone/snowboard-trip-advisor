import { ISOCountryCode, ResortSlug } from '@snowboard-trip-advisor/schema'
import { z } from 'zod'

// URL state for the admin app — source of truth for shareable route state.
//
// Route surface:
//   - 'dashboard' (PR 4.2)
//   - 'resorts'   (PR 4.3; supports country + hasFailures filters)
//   - 'editor'    (PR 4.3 typing-only; render branch in PR 4.4b)
//   - 'publishes' (PR 4.5d; supports page index, 0-default)
//
// Why ship 'editor' as typing-only now: row-click in the resorts table
// (Task 2.4) calls setRoute({ route: 'editor', slug }) end-to-end and the
// URL contract must be settled before that wiring lands. Pre-4.4b, the
// URL updates but the visible view stays on the resorts table — this is
// the intended Phase 1 transition (URL contract precedes the view).
//
// Why re-use ISOCountryCode (branded) here rather than a plain string:
// parsed values flow into ListResortsQuery.filter.country at the apiClient
// call site, and re-using the brand keeps that assignable without a cast.
//
// Defaults are omitted on serialize; unknown keys are ignored;
// invalid values are dropped silently (Epic 3 pattern):
//   - unknown route → 'dashboard'
//   - 'resorts' + invalid country → keep route, drop the country filter
//   - 'resorts' + invalid hasFailures → keep route, drop the filter
//   - 'editor' + missing/invalid slug → 'dashboard' (slug is required on
//     the editor variant; partial editor state is not a valid shape)

// 'gallery' is the S1.0 dev-only component-gallery verification surface — the
// one sanctioned apps/* scope exception for the design-system-only S1 CSS
// stack. It is intentionally absent from Shell's SIDEBAR_ITEMS so it stays
// unlinked (a verification tool, not a user feature); it is reachable only by
// typing ?route=gallery directly.
const ROUTE_VALUES = ['dashboard', 'resorts', 'editor', 'publishes', 'gallery'] as const
const RouteValue = z.enum(ROUTE_VALUES)

// Single source of truth for the publishes-route page size. PublishHistory
// imports this so the URL-contract bound check below (MAX_SAFE_PUBLISHES_PAGE)
// stays in lockstep with the multiplier the consumer actually uses to derive
// the API offset.
export const PUBLISHES_PAGE_SIZE = 20

// The page index is multiplied by PUBLISHES_PAGE_SIZE to derive the API
// offset, and ListPublishesQuery's `z.number().int()` rejects unsafe integers.
// Cap at the largest page whose derived offset stays inside the safe-integer
// range so a crafted deep link can't force a load error in PublishHistory;
// over-cap inputs drop to the canonical first-page form. Codex round-2 P2
// PR #102.
const MAX_SAFE_PUBLISHES_PAGE = Math.floor(Number.MAX_SAFE_INTEGER / PUBLISHES_PAGE_SIZE)

export type Route =
  | { route: 'dashboard' }
  | { route: 'resorts'; country?: ISOCountryCode; hasFailures?: boolean }
  | { route: 'editor'; slug: ResortSlug }
  | { route: 'publishes'; page?: number }
  | { route: 'gallery' }

export type RouteState = Route

export function parseURL(search: string): RouteState {
  const params = new URLSearchParams(search)
  const raw = params.get('route') ?? 'dashboard'
  const parsed = RouteValue.safeParse(raw)
  const route = parsed.success ? parsed.data : 'dashboard'

  if (route === 'dashboard') { return { route: 'dashboard' } }

  if (route === 'gallery') { return { route: 'gallery' } }

  if (route === 'editor') {
    const slug = params.get('slug')
    const slugParsed = slug !== null ? ResortSlug.safeParse(slug) : null
    if (slugParsed?.success !== true) { return { route: 'dashboard' } }
    return { route: 'editor', slug: slugParsed.data }
  }

  if (route === 'publishes') {
    // Drop-invalid pattern: only safe-integer natural numbers in the inclusive
    // range [1, MAX_SAFE_PUBLISHES_PAGE] are preserved. page=0 (default),
    // missing, negative, non-digit, and over-cap values all collapse to the
    // canonical `{ route: 'publishes' }` shape per the "defaults are omitted"
    // header comment. PublishHistory reads `route.page ?? 0` so this is
    // functionally equivalent to explicit page=0. The bound matters because
    // PublishHistory multiplies `page * PUBLISHES_PAGE_SIZE` to derive the API
    // offset, and ListPublishesQuery's `z.number().int()` rejects unsafe
    // integers — without the cap a crafted deep link would surface a load
    // error instead of falling back to page 0.
    const pageRaw = params.get('page')
    const page = pageRaw !== null && /^\d+$/.test(pageRaw) ? Number(pageRaw) : undefined
    if (page === undefined || page === 0 || page > MAX_SAFE_PUBLISHES_PAGE) {
      return { route: 'publishes' }
    }
    return { route: 'publishes', page }
  }

  // route === 'resorts' — fields are conditionally included so the returned
  // shape matches the optional declarations exactly (exactOptionalPropertyTypes
  // forbids explicit `undefined` on optional brand-typed properties).
  const country = params.get('country')
  const countryParsed = country !== null ? ISOCountryCode.safeParse(country) : null
  const hasFailures = parseBooleanParam(params.get('hasFailures'))

  return {
    route: 'resorts',
    ...(countryParsed?.success === true ? { country: countryParsed.data } : {}),
    ...(hasFailures !== undefined ? { hasFailures } : {}),
  }
}

// Parses the string-encoded `hasFailures` param. Drop-invalid: any value other
// than 'true' / 'false' (including null) returns undefined, so the filter is
// silently ignored — same Epic 3 pattern as the country drop above.
function parseBooleanParam(raw: string | null): boolean | undefined {
  if (raw === 'true') { return true }
  if (raw === 'false') { return false }
  return undefined
}

export function serializeURL(state: RouteState): string {
  if (state.route === 'dashboard') { return '' }
  if (state.route === 'gallery') {
    const params = new URLSearchParams()
    params.set('route', 'gallery')
    return `?${params.toString()}`
  }
  if (state.route === 'editor') {
    const params = new URLSearchParams()
    params.set('route', 'editor')
    params.set('slug', state.slug)
    return `?${params.toString()}`
  }
  if (state.route === 'publishes') {
    // Default-0 page omitted to match the header's "defaults are omitted"
    // pattern. Round-trip-stable for the canonical `{ route: 'publishes' }`
    // shape (parseURL collapses ?page=0 to the same omitted-key form).
    const params = new URLSearchParams()
    params.set('route', 'publishes')
    if (state.page !== undefined && state.page > 0) {
      params.set('page', String(state.page))
    }
    return `?${params.toString()}`
  }
  // state.route === 'resorts'
  const params = new URLSearchParams()
  params.set('route', 'resorts')
  if (state.country !== undefined) { params.set('country', state.country) }
  if (state.hasFailures !== undefined) {
    params.set('hasFailures', String(state.hasFailures))
  }
  return `?${params.toString()}`
}
