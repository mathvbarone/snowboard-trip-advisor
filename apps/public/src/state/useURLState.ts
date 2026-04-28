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

function subscribe(cb: () => void): () => void {
  subscribers.add(cb)
  const onPop = (): void => {
    cachedSearch = null
    cb()
  }
  window.addEventListener('popstate', onPop)
  popstateCallbacks.set(cb, onPop)
  return (): void => {
    subscribers.delete(cb)
    const stored = popstateCallbacks.get(cb)
    if (stored !== undefined) {
      window.removeEventListener('popstate', stored)
      popstateCallbacks.delete(cb)
    }
  }
}

const popstateCallbacks = new WeakMap<() => void, () => void>()

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
