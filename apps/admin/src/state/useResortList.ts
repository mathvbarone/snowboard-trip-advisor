import type { ListResortsQuery, ListResortsResponse } from '@snowboard-trip-advisor/schema/api'
import { useEffect, useState } from 'react'

import { apiClient } from '../lib/apiClient'

export type UseResortListResult =
  | { value: ListResortsResponse; error: null }
  | { value: null; error: Error }
  | { value: null; error: null }

// Module-level: keyed in-flight cache (React-state plan-review fold).
// Mirrors useHealth.ts:16 — same Map shape across both hooks for consistency.
// Different-key concurrent mounts each get their own in-flight promise (the
// prior single `let inFlight` could be blown away by a different-key mount,
// breaking the shared-fetch property for in-progress requests).
const inFlight = new Map<string, Promise<ListResortsResponse>>()

// React-state plan-review fold: JSON.stringify's second arg is a *replacer*,
// NOT a sort hint. The prior `JSON.stringify(q, Object.keys(q).sort())`
// produced a property-allowlist — top-level keys allowed, but nested keys
// kept INSERTION order, so two semantically-equal queries hashed to different
// keys depending on caller construction order. Recursive-key-sorted JSON
// closes the gap; nested objects (e.g., query.filter, query.page) get sorted
// too. Verified by useResortList.test.ts "queryKey deeply sorts nested object
// keys" — would fail under the property-allowlist mistake.
function deepSortedStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown): unknown => {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      const sortedEntries = Object.keys(v as Record<string, unknown>)
        .sort()
        .map((k): [string, unknown] => [k, (v as Record<string, unknown>)[k]])
      return Object.fromEntries(sortedEntries)
    }
    return v
  })
}

function queryKey(q: ListResortsQuery): string {
  return deepSortedStringify(q)
}

export function useResortList(query: ListResortsQuery): UseResortListResult {
  const [value, setValue] = useState<ListResortsResponse | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const key = queryKey(query)

  useEffect((): (() => void) => {
    let cancelled = false
    let p = inFlight.get(key)
    if (p === undefined) {
      p = apiClient.listResorts(query).finally((): void => {
        inFlight.delete(key)
      })
      inFlight.set(key, p)
    }
    p.then((v): void => {
      if (!cancelled) {
        setValue(v)
        setError(null)
      }
    }).catch((e: unknown): void => {
      if (!cancelled) {
        setError(e instanceof Error ? e : new Error(String(e)))
        setValue(null)
      }
    })
    return (): void => {
      cancelled = true
    }
    // `query` is intentionally excluded — `key` is its deep-sorted hash, so
    // the effect re-runs only when the semantic query changes (not when a
    // referentially-new but content-equal object is passed each render).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key is the canonical hash of query
  }, [key])

  if (error !== null) {
    return { value: null, error }
  }
  if (value !== null) {
    return { value, error: null }
  }
  return { value: null, error: null }
}

/** Test-only: clear the in-flight cache between tests. */
export function __resetForTests(): void {
  inFlight.clear()
}
