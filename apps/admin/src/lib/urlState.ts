import { ISOCountryCode, ResortSlug } from '@snowboard-trip-advisor/schema'
import { z } from 'zod'

// URL state for the admin app — source of truth for shareable route state.
//
// Route surface (this PR — 4.3, Tier 2):
//   - 'dashboard' (PR 4.2)
//   - 'resorts'   (this PR; supports country + hasFailures filters)
//   - 'editor'    (typing-only this PR; render branch lands in PR 4.4b)
// Tier 4 (PR 4.5b) extends with 'publishes'.
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

const ROUTE_VALUES = ['dashboard', 'resorts', 'editor'] as const
const RouteValue = z.enum(ROUTE_VALUES)

export type Route =
  | { route: 'dashboard' }
  | { route: 'resorts'; country?: ISOCountryCode; hasFailures?: boolean }
  | { route: 'editor'; slug: ResortSlug }

export type RouteState = Route

export function parseURL(search: string): RouteState {
  const params = new URLSearchParams(search)
  const raw = params.get('route') ?? 'dashboard'
  const parsed = RouteValue.safeParse(raw)
  const route = parsed.success ? parsed.data : 'dashboard'

  if (route === 'dashboard') { return { route: 'dashboard' } }

  if (route === 'editor') {
    const slug = params.get('slug')
    const slugParsed = slug !== null ? ResortSlug.safeParse(slug) : null
    if (slugParsed?.success !== true) { return { route: 'dashboard' } }
    return { route: 'editor', slug: slugParsed.data }
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
  if (state.route === 'editor') {
    const params = new URLSearchParams()
    params.set('route', 'editor')
    params.set('slug', state.slug)
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
