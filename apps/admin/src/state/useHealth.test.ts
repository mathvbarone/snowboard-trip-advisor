import type { HealthResponse } from '@snowboard-trip-advisor/schema/api'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { server } from '../mocks/server'

import { __resetForTests, useHealth, type UseHealthResult } from './useHealth'

// React-state plan-review fold (P1): symmetric reset in BOTH before/afterEach,
// matching Epic 3's apps/public/src/state/useDataset.test.tsx:52-57. Belt-and-
// braces against module-state leak if a future test forgets the beforeEach.
beforeEach((): void => {
  __resetForTests()
})
afterEach((): void => {
  __resetForTests()
  server.resetHandlers()
})

describe('useHealth (PR 4.2)', (): void => {
  it('returns { value: null, error: null } on initial render', (): void => {
    const { result } = renderHook(() => useHealth())
    expect(result.current).toEqual({ value: null, error: null })
  })

  it('resolves to { value, error: null } after fetch', async (): Promise<void> => {
    const { result } = renderHook(() => useHealth())
    await waitFor((): void => {
      expect(result.current.value).not.toBeNull()
    })
    expect(result.current.error).toBeNull()
    expect(result.current.value?.resorts_total).toBeGreaterThanOrEqual(0)
  })

  it('rejects to { value: null, error } when MSW returns 500', async (): Promise<void> => {
    server.use(
      http.get('/api/health', (): Response =>
        HttpResponse.json(
          { error: { code: 'internal', message: 'test error' } },
          { status: 500 },
        ),
      ),
    )
    const { result } = renderHook(() => useHealth())
    await waitFor((): void => {
      expect(result.current.error).not.toBeNull()
    })
    expect(result.current.value).toBeNull()
    expect(result.current.error).toBeInstanceOf(Error)
  })

  it('rejects with Error wrapping non-Error rejections', async (): Promise<void> => {
    // Cover the `e instanceof Error ? e : new Error(String(e))` defensive branch.
    // We mock apiClient.getHealth to throw a raw string (not an Error instance).
    const { apiClient } = await import('../lib/apiClient')
    const spy = vi.spyOn(apiClient, 'getHealth').mockRejectedValueOnce('string rejection')
    const { result } = renderHook(() => useHealth())
    await waitFor((): void => {
      expect(result.current.error).not.toBeNull()
    })
    expect(result.current.value).toBeNull()
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe('string rejection')
    spy.mockRestore()
  })

  it('__resetForTests clears the in-flight cache (fresh fetch on next render)', async (): Promise<void> => {
    // First render — establishes in-flight promise.
    const { result: r1, unmount: u1 } = renderHook(() => useHealth())
    await waitFor((): void => {
      expect(r1.current.value).not.toBeNull()
    })
    u1()

    // Reset clears the cache; subsequent render should issue a new fetch and resolve.
    __resetForTests()

    const { result: r2 } = renderHook(() => useHealth())
    // Before the async settles, value should be null (fresh start).
    expect(r2.current.value).toBeNull()
    await waitFor((): void => {
      expect(r2.current.value).not.toBeNull()
    })
    expect(r2.current.error).toBeNull()
  })

  it('does not update state after unmount on success (cancelled guard true-branch)', async (): Promise<void> => {
    // Covers the `if (!cancelled)` false-branch in the .then callback.
    // Option B: hold the promise unresolved until AFTER unmount so the cancelled
    // flag is guaranteed to be true when the .then runs — no timing assumptions.
    // Deferred captures: assigned synchronously inside the Promise constructor
    // (which the MSW handler invokes before returning), so they are always set by
    // the time handlerReadyPromise resolves.
    type Deferred = {
      resolve: (value: HealthResponse) => void
      ready: () => void
    }
    const deferred: Partial<Deferred> = {}
    const handlerReadyPromise = new Promise<void>((resolve): void => {
      deferred.ready = resolve
    })

    server.use(
      http.get('/api/health', (): Promise<Response> => {
        const p = new Promise<HealthResponse>((res): void => {
          deferred.resolve = res
        }).then((data): Response => HttpResponse.json(data))
        // Signal the test that deferred.resolve is now assigned.
        if (deferred.ready) {
          deferred.ready()
        }
        return p
      }),
    )

    const { result, unmount } = renderHook((): UseHealthResult => useHealth())
    // Wait until the MSW handler has been entered (deferred.resolve is now assigned).
    await handlerReadyPromise
    // Immediately cancel — value should still be null (not yet settled).
    expect(result.current.value).toBeNull()
    unmount()

    // Settle the fetch AFTER unmount: cancelled is already true when .then runs.
    if (deferred.resolve) {
      deferred.resolve({
        resorts_total: 0,
        resorts_with_stale_fields: 0,
        resorts_with_failed_fields: 0,
        resorts_with_missing_provenance: 0,
        resorts_with_corrupt_workspace: 0,
        pending_integration_errors: 0,
        last_published_at: null,
        archive_size_bytes: 0,
      })
    }
    // Flush microtasks inside act so React processes the (suppressed) update.
    await act(async (): Promise<void> => {
      await new Promise<void>((resolve): void => {
        queueMicrotask(resolve)
      })
    })
    // If the cancelled guard fired correctly, no state update occurred.
    // result.current reflects the LAST rendered state (null/null from initial render).
    expect(result.current.value).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('does not update state after unmount on error (cancelled guard catch-branch)', async (): Promise<void> => {
    // Covers the `if (!cancelled)` false-branch in the .catch callback.
    // Option B: same controllable-promise + gate pattern as the success test above.
    type Deferred = {
      reject: (reason: unknown) => void
      ready: () => void
    }
    const deferred: Partial<Deferred> = {}
    const handlerReadyPromise = new Promise<void>((resolve): void => {
      deferred.ready = resolve
    })

    server.use(
      http.get('/api/health', (): Promise<Response> => {
        const p = new Promise<HealthResponse>((_res, rej): void => {
          deferred.reject = rej
        }).then((): Response => HttpResponse.json({}))
        if (deferred.ready) {
          deferred.ready()
        }
        return p
      }),
    )

    const { result, unmount } = renderHook((): UseHealthResult => useHealth())
    await handlerReadyPromise
    expect(result.current.error).toBeNull()
    unmount()

    // Reject AFTER unmount: cancelled is already true when .catch runs.
    if (deferred.reject) {
      deferred.reject(new Error('test error post-unmount'))
    }
    await act(async (): Promise<void> => {
      await new Promise<void>((resolve): void => {
        queueMicrotask(resolve)
      })
    })
    // After unmount the cancelled guard should suppress the state update.
    expect(result.current.error).toBeNull()
  })

  it('two concurrent mounts share the in-flight fetch (single request)', async (): Promise<void> => {
    let requestCount = 0
    const listener = ({ request }: { request: Request }): void => {
      if (new URL(request.url).pathname === '/api/health') {
        requestCount += 1
      }
    }
    server.events.on('request:start', listener)
    try {
      const { result: r1 } = renderHook((): UseHealthResult => useHealth())
      const { result: r2 } = renderHook((): UseHealthResult => useHealth())

      await waitFor((): void => {
        expect(r1.current.value).not.toBeNull()
      })
      await waitFor((): void => {
        expect(r2.current.value).not.toBeNull()
      })

      // Both hooks should have resolved to the same data.
      expect(r1.current.error).toBeNull()
      expect(r2.current.error).toBeNull()
      // Only one HTTP request should have been issued.
      expect(requestCount).toBe(1)
    } finally {
      server.events.removeListener('request:start', listener)
    }
  })
})
