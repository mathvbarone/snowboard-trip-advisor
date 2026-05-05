import { useSyncExternalStore } from 'react'

import { parseURL, serializeURL, type RouteState } from '../lib/urlState'

// useSyncExternalStore-backed URL state subscription for the admin app.
//
// Two event sources:
//   1. Browser-driven `popstate` (back/forward navigation).
//   2. Same-tick `setRoute` calls — broadcast to subscribers via the
//      module-scoped `subscribers` Set so React 19 Suspense does not tear.
//
// Admin does not ship the normalizeIfNeeded helper Epic 3 uses — the resorts
// route's filters (country, hasFailures) are emitted as-is by serializeURL
// without rewrites; an analyst pasting a URL with a stale or invalid filter
// gets the silent drop-invalid pattern from parseURL on next read.

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
  // serializeURL produces the search string for non-default routes (or '' for
  // the dashboard default, which is omitted from the URL). Push pathname +
  // search so deep-link state actually round-trips through the URL bar —
  // without appending the search the country / hasFailures filters set by the
  // resorts view dropdown would never reach the URL bar or survive a reload.
  const search = serializeURL(state)
  window.history.pushState({}, '', `${window.location.pathname}${search}`)
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
