import type { PublishResponse } from '@snowboard-trip-advisor/schema/api'
import { useRef, useState } from 'react'

import { apiClient } from '../lib/apiClient'

import { invalidateListPublishes } from './useListPublishes'

export type PublishStatus = 'idle' | 'submitting' | 'success' | 'error'

// Discriminated state. Encoding response/error in the variant lets the
// dialog narrow on `status` without optional chaining or nullish-coalesce
// fallbacks against impossible runtime states.
type UsePublishState =
  | { readonly status: 'idle'; readonly response: null; readonly error: null }
  | { readonly status: 'submitting'; readonly response: null; readonly error: null }
  | { readonly status: 'success'; readonly response: PublishResponse; readonly error: null }
  | { readonly status: 'error'; readonly response: null; readonly error: Error }

export type UsePublishResult = UsePublishState & {
  readonly submit: () => Promise<void>
  readonly reset: () => void
}

const INITIAL_STATE: UsePublishState = { status: 'idle', response: null, error: null }

export function usePublish(): UsePublishResult {
  const [state, setState] = useState<UsePublishState>(INITIAL_STATE)
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
    setState({ status: 'submitting', response: null, error: null })
    try {
      const r = await apiClient.publish()
      setState({ status: 'success', response: r, error: null })
      // Decision D2: only invalidate listPublishes — NOT useHealth (D3 dropped).
      invalidateListPublishes()
    } catch (e: unknown) {
      setState({
        status: 'error',
        response: null,
        error: e instanceof Error ? e : new Error(String(e)),
      })
    } finally {
      inFlightRef.current = false
    }
  }

  function reset(): void {
    setState(INITIAL_STATE)
  }

  return { ...state, submit, reset }
}

/** Test-only: symmetry with module-state-bearing hooks (no module state here). */
export function __resetForTests(): void {
  // intentional no-op
}
