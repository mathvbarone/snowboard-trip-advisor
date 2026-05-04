import { useSyncExternalStore } from 'react'

import { parseURL, serializeURL, type RouteState } from '../lib/urlState'

// useSyncExternalStore-backed URL state subscription for the admin app.
//
// Two event sources:
//   1. Browser-driven `popstate` (back/forward navigation).
//   2. Same-tick `setRoute` calls — broadcast to subscribers via the
//      module-scoped `subscribers` Set so React 19 Suspense does not tear.
//
// Admin does not ship the normalizeIfNeeded helper Epic 3 uses — the admin
// URL surface is a single 'dashboard' literal with no shareable-state-
// normalization invariant (PR 4.3 adds 'resorts', at which point revisit).

const subscribers = new Set<() => void>()

function notify(): void {
  for (const cb of subscribers) {
    cb()
  }
}

function subscribe(cb: () => void): () => void {
  subscribers.add(cb)
  const onPop = (): void => {
    // Invalidate cache BEFORE calling cb() so React's next getSnapshot()
    // re-derives from the new URL rather than returning the stale cache.
    cachedSearch = null
    cb()
  }
  window.addEventListener('popstate', onPop)
  return (): void => {
    subscribers.delete(cb)
    window.removeEventListener('popstate', onPop)
  }
}

// useSyncExternalStore requires getSnapshot to return a stable reference when
// the underlying state has not changed. parseURL allocates a fresh object on
// every call, which would cause an infinite render loop. Cache by the
// location.search the snapshot was last derived from; invalidate inside
// setRoute (after the history write) and on popstate (in the listener
// above) so a stale cache cannot survive a real URL change.
let cachedSearch: string | null = null
let cachedSnapshot: RouteState | null = null

function getSnapshot(): RouteState {
  const search = window.location.search
  if (cachedSearch === search && cachedSnapshot !== null) {
    return cachedSnapshot
  }
  cachedSearch = search
  cachedSnapshot = parseURL(search)
  return cachedSnapshot
}

export function useURLState(): RouteState {
  return useSyncExternalStore(subscribe, getSnapshot)
}

export function setRoute(state: RouteState): void {
  // Phase 1 (PR 4.2): serializeURL always returns '' because 'dashboard' is the
  // only route and is the default (omitted from URL). The URL is always the bare
  // pathname. PR 4.3 extends both serializeURL and this function when it adds
  // the 'resorts' route (the two must change together in the same commit).
  void serializeURL(state)
  window.history.pushState({}, '', window.location.pathname)
  // Invalidate cache BEFORE notify() so subscribers' getSnapshot() calls
  // re-derive against the new URL, not the pre-write cached value.
  cachedSearch = null
  notify()
}

/** Test-only: clear all module-scoped state between tests. */
export function __resetForTests(): void {
  subscribers.clear()
  cachedSearch = null
  cachedSnapshot = null
}
