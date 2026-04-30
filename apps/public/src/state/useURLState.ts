import { useSyncExternalStore } from 'react'

import { parseURL, PUSH_KEYS, serializeURL, type URLState } from '../lib/urlState'

// useSyncExternalStore-backed URL state subscription.
//
// The store has two event sources:
//   1. Browser-driven `popstate` (back/forward navigation).
//   2. Same-tick `setURLState` calls — broadcast to subscribers via the
//      module-scoped `subscribers` Set so React 19 Suspense doesn't tear.
//
// PUSH vs REPLACE is inferred from the current URL (not the previous render's
// snapshot) so two same-tick setters compose serially: each transition is
// computed against the freshly committed location, never a stale closure.

const subscribers = new Set<() => void>()

function notify(): void {
  for (const cb of subscribers) {
    cb()
  }
}

// Spec §3.2: invalid query-string values are dropped silently AND the URL is
// rewritten to its valid subset on the same render commit. parseURL already
// drops invalid values from the in-memory state; this helper closes the loop
// by writing the canonical serialization back into the address bar (so
// copied/shared links stay valid and successive popstates don't re-parse the
// same junk). Compare strings first to avoid a no-op replaceState — that
// would still register as a history mutation in test spies and could
// interleave with intentional writes from setURLState.
function normalizeIfNeeded(): void {
  const search = window.location.search
  const parsed = parseURL(search)
  const canonical = serializeURL(parsed)
  const desired = canonical.length > 0 ? `?${canonical}` : ''
  if (search !== desired) {
    const url = canonical.length > 0
      ? `?${canonical}`
      : window.location.pathname
    window.history.replaceState({}, '', url)
    cachedSearch = null
  }
}

function subscribe(cb: () => void): () => void {
  // Normalize at subscribe-time (first hook mount) and after every popstate.
  // Doing this inside subscribe — rather than at module load — guarantees we
  // observe the URL the SPA actually booted on (module-load may run before
  // the test harness or app shell finishes its initial history.replaceState).
  normalizeIfNeeded()
  subscribers.add(cb)
  const onPop = (): void => {
    normalizeIfNeeded()
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
// setURLState (after the history write) and on popstate (in the listener
// above) so a stale cache cannot survive a real URL change.
let cachedSearch: string | null = null
let cachedSnapshot: URLState | null = null

function getSnapshot(): URLState {
  const search = window.location.search
  if (cachedSearch === search && cachedSnapshot !== null) {
    return cachedSnapshot
  }
  cachedSearch = search
  cachedSnapshot = parseURL(search)
  return cachedSnapshot
}

function inferTransition(current: URLState, next: URLState): 'push' | 'replace' {
  for (const key of PUSH_KEYS) {
    if (current[key] !== next[key]) {
      return 'push'
    }
  }
  return 'replace'
}

/**
 * @warning Never invoke `setURLState` inside React 19's `startTransition`.
 * The synchronous DOM write (history.pushState/replaceState) would race the
 * deferred render — see spec §10.5.
 */
export function setURLState(partial: Partial<URLState>): void {
  const current = getSnapshot()
  const next: URLState = { ...current, ...partial }
  const search = serializeURL(next)
  const url = search.length > 0 ? `?${search}` : window.location.pathname
  const transition = inferTransition(current, next)
  if (transition === 'push') {
    window.history.pushState({}, '', url)
  } else {
    window.history.replaceState({}, '', url)
  }
  cachedSearch = null
  notify()
}

export function useURLState(): URLState {
  return useSyncExternalStore(subscribe, getSnapshot)
}

/**
 * Module-scoped subscription to URL changes for non-React consumers.
 * Returns the snapshot reader and an unsubscribe. Composes with the same
 * `subscribers` Set + popstate handler that powers `useURLState`, so a
 * subscriber installed here fires on every transition the React tree
 * also sees (no parallel pubsub).
 */
export function subscribeToURLChanges(cb: () => void): () => void {
  return subscribe(cb)
}

/** Read the current URL state synchronously, outside React render. */
export function readURLState(): URLState {
  return getSnapshot()
}
