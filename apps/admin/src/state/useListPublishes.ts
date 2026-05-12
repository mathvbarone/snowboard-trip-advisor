import type { ListPublishesQuery, ListPublishesResponse } from '@snowboard-trip-advisor/schema/api'
import { useEffect, useState } from 'react'

import { apiClient } from '../lib/apiClient'

export type UseListPublishesResult =
  | { value: ListPublishesResponse; error: null }
  | { value: null; error: Error }
  | { value: null; error: null }

// Module-level: keyed in-flight cache. Same shape as useResortList.ts:16 +
// useHealth.ts:16 — established project convention. Cleared on settle so a
// second mount AFTER the first resolves triggers a fresh fetch.
const inFlight = new Map<string, Promise<ListPublishesResponse>>()

// Per-key generation counter for stale-request detection. Replaces an
// identity-via-inFlight check that fails in the normal happy path because
// `.finally` removes the inFlight entry BEFORE `.then` runs. Generations
// only increase via invalidate; capture-at-fetch + compare-at-settle still
// detects the stale case, but cache cleanup no longer affects state-write
// guards.
const generations = new Map<string, number>()

function bumpGeneration(key: string): number {
  const g = (generations.get(key) ?? 0) + 1
  generations.set(key, g)
  return g
}

function currentGeneration(key: string): number {
  return generations.get(key) ?? 0
}

// Recursive-key-sorted JSON for stable cache keys regardless of caller
// construction order (matches useResortList.ts:26-36's deepSortedStringify).
function keyOf(q: ListPublishesQuery): string {
  return JSON.stringify(q, (_key, v: unknown): unknown => {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      const sortedEntries = Object.keys(v as Record<string, unknown>)
        .sort()
        .map((k): [string, unknown] => [k, (v as Record<string, unknown>)[k]])
      return Object.fromEntries(sortedEntries)
    }
    return v
  })
}

// Per-key subscribers for `invalidateListPublishes()` post-publish refresh.
const subscribers = new Map<string, Set<() => void>>()

export function useListPublishes(q: ListPublishesQuery): UseListPublishesResult {
  const [value, setValue] = useState<ListPublishesResponse | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const key = keyOf(q)

  useEffect((): (() => void) => {
    let cancelled = false
    // Reset to loading on key change so the user doesn't see stale rows from
    // the previous page while the new fetch is in flight. Mirrors
    // useResortList.ts:54-55's reset-on-effect-entry pattern.
    setValue(null)
    setError(null)

    function startFetch(myGen: number): void {
      let p = inFlight.get(key)
      if (p === undefined) {
        // Chain `.finally(...)` INTO the stored promise so a rejection from
        // apiClient.listPublishes is observed by the `.then(_, rej)` attached
        // below. A standalone `p.finally(...)` would create a second promise
        // that rejects with the same error and is NEVER caught → unhandled
        // rejection. Mirrors useResortList.ts:58-61's chain shape.
        // Identity-guard the delete so a stale settle doesn't evict a fresh
        // promise placed in this slot by invalidate + onInvalidate.
        const stored: Promise<ListPublishesResponse> = apiClient
          .listPublishes(q)
          .finally((): void => {
            if (inFlight.get(key) === stored) {
              inFlight.delete(key)
            }
          })
        p = stored
        inFlight.set(key, p)
      }
      p.then(
        (r): void => {
          // Generation guard: if invalidate bumped the generation while this
          // request was in flight, our captured myGen is now stale → skip write.
          if (cancelled || currentGeneration(key) !== myGen) {
            return
          }
          setValue(r)
          setError(null)
        },
        (e: unknown): void => {
          if (cancelled || currentGeneration(key) !== myGen) {
            return
          }
          setError(e instanceof Error ? e : new Error(String(e)))
          setValue(null)
        },
      )
    }

    startFetch(currentGeneration(key))

    // Subscribe to invalidations so post-publish kicks a re-fetch. The
    // cleanup synchronously deletes onInvalidate from `subscribers` BEFORE
    // any further invalidate iteration sees it, so an in-cleanup `cancelled`
    // guard inside onInvalidate would be unreachable — omit it.
    function onInvalidate(): void {
      setValue(null)
      setError(null)
      // bumpGeneration already happened in invalidateListPublishes (before
      // subscribers fire). Capture the NEW generation for this fresh fetch.
      startFetch(currentGeneration(key))
    }
    let set = subscribers.get(key)
    if (set === undefined) {
      set = new Set()
      subscribers.set(key, set)
    }
    set.add(onInvalidate)

    return (): void => {
      cancelled = true
      set.delete(onInvalidate)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key is the canonical hash of q
  }, [key])

  if (error !== null) {
    return { value: null, error }
  }
  if (value !== null) {
    return { value, error: null }
  }
  return { value: null, error: null }
}

// usePublish.ts calls this on successful publish so PublishHistory re-fetches.
export function invalidateListPublishes(): void {
  // Bump generation for every known key BEFORE clearing inFlight so any
  // in-flight promise's eventual settle sees the generation mismatch and
  // skips its setValue. Subscribers then fire onInvalidate which captures
  // the new generation for the fresh fetch.
  for (const key of subscribers.keys()) {
    bumpGeneration(key)
  }
  inFlight.clear()
  for (const set of subscribers.values()) {
    for (const cb of set) {
      cb()
    }
  }
}

/** Test-only: clear inFlight + subscribers + generations between tests. */
export function __resetForTests(): void {
  inFlight.clear()
  subscribers.clear()
  generations.clear()
}
