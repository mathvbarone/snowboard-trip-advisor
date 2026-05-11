import type { PublishResponse } from '@snowboard-trip-advisor/schema/api'
import { useRef, useState } from 'react'

import { apiClient } from '../lib/apiClient'

import { invalidateListPublishes } from './useListPublishes'

export type PublishStatus = 'idle' | 'submitting' | 'success' | 'error'

export interface UsePublishResult {
  readonly status: PublishStatus
  readonly response: PublishResponse | null
  readonly error: Error | null
  readonly submit: () => Promise<void>
  readonly reset: () => void
}

export function usePublish(): UsePublishResult {
  const [status, setStatus] = useState<PublishStatus>('idle')
  const [response, setResponse] = useState<PublishResponse | null>(null)
  const [error, setError] = useState<Error | null>(null)
  // Synchronous in-flight guard. Without it, a double-click on Confirm (or
  // any second submit() before React commits `setStatus('submitting')`) would
  // launch a second apiClient.publish() — Phase 1 does NOT deduplicate
  // Idempotency-Keys server-side (spec §4.9 invariant 5), so two POSTs = two
  // history archives + two current.v1.json writes for one user intent.
  const inFlightRef = useRef<boolean>(false)

  async function submit(): Promise<void> {
    if (inFlightRef.current) {
      return
    }
    inFlightRef.current = true
    setStatus('submitting')
    setError(null)
    try {
      const r = await apiClient.publish()
      setResponse(r)
      setStatus('success')
      // Decision D2: only invalidate listPublishes — NOT useHealth (D3 dropped).
      invalidateListPublishes()
    } catch (e: unknown) {
      setError(e instanceof Error ? e : new Error(String(e)))
      setStatus('error')
    } finally {
      inFlightRef.current = false
    }
  }

  function reset(): void {
    setStatus('idle')
    setResponse(null)
    setError(null)
  }

  return { status, response, error, submit, reset }
}

/** Test-only: symmetry with module-state-bearing hooks (no module state here). */
export function __resetForTests(): void {
  // intentional no-op
}
