import type { HealthResponse } from '@snowboard-trip-advisor/schema/api'
import { useEffect, useState } from 'react'

import { apiClient } from '../lib/apiClient'

export type UseHealthResult =
  | { value: HealthResponse; error: null }
  | { value: null; error: Error }
  | { value: null; error: null }

// Module-level: keyed in-flight cache (React-state plan-review fold).
// Health has a single key ('singleton'); useResortList uses query-string keys.
// Same Map shape across both hooks for consistency. Cleared on settle so a
// second mount AFTER the first resolves triggers a fresh fetch — the analyst
// expects fresh data on reload, not a result cache.
const inFlight = new Map<string, Promise<HealthResponse>>()
const HEALTH_KEY = 'singleton'

export function useHealth(): UseHealthResult {
  const [value, setValue] = useState<HealthResponse | null>(null)
  const [error, setError] = useState<Error | null>(null)

  useEffect((): (() => void) => {
    let cancelled = false
    let p = inFlight.get(HEALTH_KEY)
    if (p === undefined) {
      p = apiClient.getHealth().finally((): void => {
        inFlight.delete(HEALTH_KEY)
      })
      inFlight.set(HEALTH_KEY, p)
    }
    p.then((v): void => {
      if (!cancelled) {
        setValue(v)
      }
    }).catch((e: unknown): void => {
      if (!cancelled) {
        setError(e instanceof Error ? e : new Error(String(e)))
      }
    })
    return (): void => {
      cancelled = true
    }
  }, [])

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
