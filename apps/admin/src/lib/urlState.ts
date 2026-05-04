import { z } from 'zod'

// URL state for the admin app — source of truth for shareable route state.
// Phase 1 route surface (PR 4.2): single 'dashboard' literal.
// PR 4.3 extends the discriminated union with { route: 'resorts'; filter?: ... }.
// Tier 3 (PR 4.4b) extends with 'editor' (+ slug).
// Tier 4 (PR 4.5b) extends with 'publishes'.
//
// Defaults are omitted on serialize; unknown keys are ignored;
// invalid values are dropped silently (Epic 3 pattern).

const ROUTE_VALUES = ['dashboard'] as const
const RouteValue = z.enum(ROUTE_VALUES)
type RouteValue = z.infer<typeof RouteValue>

export type Route = { route: RouteValue }
export type RouteState = Route

export function parseURL(search: string): RouteState {
  const params = new URLSearchParams(search)
  const raw = params.get('route') ?? 'dashboard'
  const parsed = RouteValue.safeParse(raw)
  return { route: parsed.success ? parsed.data : 'dashboard' }
}

export function serializeURL(state: RouteState): string {
  // Phase 1 — 'dashboard' is the only route and is the default (omitted from URL).
  // PR 4.3 adds 'resorts' to ROUTE_VALUES; update this to:
  //   if (state.route === 'dashboard') return ''; return `?route=${state.route}`.
  void state
  return ''
}
