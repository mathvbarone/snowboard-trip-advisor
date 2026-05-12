import {
  ListPublishesQuery,
  ListPublishesResponse,
} from '@snowboard-trip-advisor/schema/api'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { server } from '../mocks/server'

import {
  __resetForTests,
  invalidateListPublishes,
  useListPublishes,
  type UseListPublishesResult,
} from './useListPublishes'

// Symmetric reset matches the established useResortList.test.ts:13-19 +
// useHealth.test.ts:13-19 pattern: belt-and-braces against module-state leak
// if a future test forgets the beforeEach.
beforeEach((): void => {
  __resetForTests()
})
afterEach((): void => {
  __resetForTests()
  server.resetHandlers()
})

const EMPTY_QUERY: ListPublishesQuery = ListPublishesQuery.parse({})
const PAGE_0: ListPublishesQuery = ListPublishesQuery.parse({ page: { offset: 0, limit: 20 } })
const PAGE_1: ListPublishesQuery = ListPublishesQuery.parse({ page: { offset: 20, limit: 20 } })

const RESPONSE_A: ListPublishesResponse = ListPublishesResponse.parse({
  items: [],
  page: { offset: 0, limit: 20, total: 0 },
})
const RESPONSE_B: ListPublishesResponse = ListPublishesResponse.parse({
  items: [
    {
      version_id: '1-2026-05-12T08-30-15-247Z',
      published_at: '2026-05-12T08:30:15.247Z',
      archive_path: 'data/published/history/1-2026-05-12T08-30-15-247Z.json',
      resort_count: 2,
      published_by: 'analyst@local',
    },
  ],
  page: { offset: 0, limit: 20, total: 1 },
})

describe('useListPublishes (PR 4.5c)', (): void => {
  it('returns { value: null, error: null } on initial render', (): void => {
    const { result } = renderHook(
      (): UseListPublishesResult => useListPublishes(EMPTY_QUERY),
    )
    expect(result.current).toEqual({ value: null, error: null })
  })

  it('resolves to { value, error: null } after fetch', async (): Promise<void> => {
    server.use(http.get('/api/publishes', (): Response => HttpResponse.json(RESPONSE_A)))
    const { result } = renderHook(
      (): UseListPublishesResult => useListPublishes(EMPTY_QUERY),
    )
    await waitFor((): void => {
      expect(result.current.value).not.toBeNull()
    })
    expect(result.current.error).toBeNull()
    expect(result.current.value?.items).toBeInstanceOf(Array)
  })

  it('rejects to { value: null, error } when MSW returns 500', async (): Promise<void> => {
    server.use(
      http.get('/api/publishes', (): Response =>
        HttpResponse.json(
          { error: { code: 'internal', message: 'test error' } },
          { status: 500 },
        ),
      ),
    )
    const { result } = renderHook(
      (): UseListPublishesResult => useListPublishes(EMPTY_QUERY),
    )
    await waitFor((): void => {
      expect(result.current.error).not.toBeNull()
    })
    expect(result.current.value).toBeNull()
    expect(result.current.error).toBeInstanceOf(Error)
  })

  it('rejects with Error wrapping non-Error rejections', async (): Promise<void> => {
    // Cover the `e instanceof Error ? e : new Error(String(e))` defensive branch.
    const { apiClient } = await import('../lib/apiClient')
    const spy = vi.spyOn(apiClient, 'listPublishes').mockRejectedValueOnce('string rejection')
    const { result } = renderHook(
      (): UseListPublishesResult => useListPublishes(EMPTY_QUERY),
    )
    await waitFor((): void => {
      expect(result.current.error).not.toBeNull()
    })
    expect(result.current.value).toBeNull()
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe('string rejection')
    spy.mockRestore()
  })

  it('different page → different cache key → independent fetch', async (): Promise<void> => {
    let requestCount = 0
    const listener = ({ request }: { request: Request }): void => {
      if (new URL(request.url).pathname === '/api/publishes') {
        requestCount += 1
      }
    }
    server.events.on('request:start', listener)
    try {
      const { result: r1 } = renderHook(
        (): UseListPublishesResult => useListPublishes(PAGE_0),
      )
      const { result: r2 } = renderHook(
        (): UseListPublishesResult => useListPublishes(PAGE_1),
      )
      await waitFor((): void => {
        expect(r1.current.value).not.toBeNull()
      })
      await waitFor((): void => {
        expect(r2.current.value).not.toBeNull()
      })
      expect(requestCount).toBe(2)
    } finally {
      server.events.removeListener('request:start', listener)
    }
  })

  it('queryKey deeply sorts nested object keys (semantically-equal queries share fetch)', async (): Promise<void> => {
    // Mirrors useResortList.test.ts:265 — recursive-key-sorted JSON makes
    // construction-order-different queries hash to the same key.
    let requestCount = 0
    const listener = ({ request }: { request: Request }): void => {
      if (new URL(request.url).pathname === '/api/publishes') {
        requestCount += 1
      }
    }
    server.events.on('request:start', listener)
    try {
      const q1 = {
        page: { offset: 0, limit: 20 },
      } as unknown as ListPublishesQuery
      const q2 = {
        page: { limit: 20, offset: 0 },
      } as unknown as ListPublishesQuery
      const { result: r1 } = renderHook(
        (): UseListPublishesResult => useListPublishes(q1),
      )
      const { result: r2 } = renderHook(
        (): UseListPublishesResult => useListPublishes(q2),
      )
      await waitFor((): void => {
        expect(r1.current.value).not.toBeNull()
      })
      await waitFor((): void => {
        expect(r2.current.value).not.toBeNull()
      })
      expect(requestCount).toBe(1)
    } finally {
      server.events.removeListener('request:start', listener)
    }
  })

  it('invalidateListPublishes() triggers re-fetch in subscribed consumer', async (): Promise<void> => {
    let phase: 'A' | 'B' = 'A'
    server.use(
      http.get('/api/publishes', (): Response =>
        HttpResponse.json(phase === 'A' ? RESPONSE_A : RESPONSE_B),
      ),
    )
    const { result } = renderHook(
      (): UseListPublishesResult => useListPublishes(EMPTY_QUERY),
    )
    await waitFor((): void => {
      expect(result.current.value?.items).toEqual([])
    })

    phase = 'B'
    act((): void => {
      invalidateListPublishes()
    })

    await waitFor((): void => {
      expect(result.current.value?.items.length).toBe(1)
    })
    expect(result.current.value?.items[0]?.version_id).toBe('1-2026-05-12T08-30-15-247Z')
  })

  it('subscriber cleanup on unmount: unmounted consumer does NOT re-fetch on invalidation', async (): Promise<void> => {
    let requestCount = 0
    const listener = ({ request }: { request: Request }): void => {
      if (new URL(request.url).pathname === '/api/publishes') {
        requestCount += 1
      }
    }
    server.events.on('request:start', listener)
    try {
      const { result, unmount } = renderHook(
        (): UseListPublishesResult => useListPublishes(EMPTY_QUERY),
      )
      await waitFor((): void => {
        expect(result.current.value).not.toBeNull()
      })
      expect(requestCount).toBe(1)
      unmount()

      act((): void => {
        invalidateListPublishes()
      })
      // Brief wait to make sure no straggler request escapes.
      await new Promise<void>((resolve): void => {
        setTimeout(resolve, 20)
      })
      expect(requestCount).toBe(1)
    } finally {
      server.events.removeListener('request:start', listener)
    }
  })

  it('__resetForTests clears inFlight + subscribers + generations', async (): Promise<void> => {
    const { result: r1, unmount: u1 } = renderHook(
      (): UseListPublishesResult => useListPublishes(EMPTY_QUERY),
    )
    await waitFor((): void => {
      expect(r1.current.value).not.toBeNull()
    })
    u1()

    __resetForTests()

    const { result: r2 } = renderHook(
      (): UseListPublishesResult => useListPublishes(EMPTY_QUERY),
    )
    expect(r2.current.value).toBeNull()
    await waitFor((): void => {
      expect(r2.current.value).not.toBeNull()
    })
    expect(r2.current.error).toBeNull()
  })

  it('stale-request identity guard: invalidate during in-flight prefers fresh response (round-12 fold)', async (): Promise<void> => {
    // Start fetch p1 (returns A after 50ms); 10ms in, invalidate (clears
    // inFlight + bumps generation + fires onInvalidate which starts p2
    // returning B after 5ms). After p1 resolves, the component state must
    // hold B (not A).
    let phase: 'A-slow' | 'B-fast' = 'A-slow'
    server.use(
      http.get('/api/publishes', async (): Promise<Response> => {
        if (phase === 'A-slow') {
          await new Promise<void>((resolve): void => {
            setTimeout(resolve, 50)
          })
          return HttpResponse.json(RESPONSE_A)
        }
        await new Promise<void>((resolve): void => {
          setTimeout(resolve, 5)
        })
        return HttpResponse.json(RESPONSE_B)
      }),
    )

    const { result } = renderHook(
      (): UseListPublishesResult => useListPublishes(EMPTY_QUERY),
    )
    // Switch the mocked phase + invalidate while p1 is still in-flight.
    await new Promise<void>((resolve): void => {
      setTimeout(resolve, 10)
    })
    phase = 'B-fast'
    act((): void => {
      invalidateListPublishes()
    })

    // Wait until the resolved state holds the fresh B response (not A).
    await waitFor(
      (): void => {
        expect(result.current.value?.items.length).toBe(1)
      },
      { timeout: 200 },
    )
    expect(result.current.value?.items[0]?.version_id).toBe('1-2026-05-12T08-30-15-247Z')
  })

  it('reset-on-key-change: stale value cleared while new fetch is in flight (round-11 fold)', async (): Promise<void> => {
    // Mount with PAGE_0; resolve. Rerender with PAGE_1; assert that BEFORE
    // the new fetch resolves the hook returns { value: null, error: null }
    // (loading) — NOT the prior page's value.
    server.use(
      http.get('/api/publishes', async ({ request }): Promise<Response> => {
        const url = new URL(request.url)
        const page = url.searchParams.get('page')
        if (page !== null && page.includes('"offset":20')) {
          await new Promise<void>((resolve): void => {
            setTimeout(resolve, 50)
          })
          return HttpResponse.json(RESPONSE_B)
        }
        return HttpResponse.json(RESPONSE_A)
      }),
    )

    const { result, rerender } = renderHook(
      (q: ListPublishesQuery): UseListPublishesResult => useListPublishes(q),
      { initialProps: PAGE_0 },
    )
    await waitFor((): void => {
      expect(result.current.value).not.toBeNull()
    })
    expect(result.current.value?.items).toEqual([])

    rerender(PAGE_1)
    // Synchronously after rerender the loading state must be visible — NOT
    // PAGE_0's stale rows.
    expect(result.current.value).toBeNull()
    expect(result.current.error).toBeNull()

    await waitFor((): void => {
      expect(result.current.value?.items.length).toBe(1)
    })
  })

  it('does not update state after unmount on error (cancelled guard in rejection handler)', async (): Promise<void> => {
    // Covers the cancelled-branch early-return inside the rejection settle.
    // Same controllable-promise pattern as useResortList.test.ts:163.
    type Deferred = {
      reject: (reason: unknown) => void
      ready: () => void
    }
    const deferred: Partial<Deferred> = {}
    const handlerReadyPromise = new Promise<void>((resolve): void => {
      deferred.ready = resolve
    })

    server.use(
      http.get('/api/publishes', (): Promise<Response> => {
        const p = new Promise<ListPublishesResponse>((_res, rej): void => {
          deferred.reject = rej
        }).then((): Response => HttpResponse.json({}))
        if (deferred.ready) {
          deferred.ready()
        }
        return p
      }),
    )

    const { result, unmount } = renderHook(
      (): UseListPublishesResult => useListPublishes(EMPTY_QUERY),
    )
    await handlerReadyPromise
    expect(result.current.error).toBeNull()
    unmount()

    if (deferred.reject) {
      deferred.reject(new Error('test error post-unmount'))
    }
    await act(async (): Promise<void> => {
      await new Promise<void>((resolve): void => {
        queueMicrotask(resolve)
      })
    })
    expect(result.current.error).toBeNull()
  })

  it('finally-chain identity guard: rejection does not become an unhandled rejection (round-24 fold)', async (): Promise<void> => {
    // The .finally MUST be chained INTO the stored promise (so rejection is
    // observed by the .then handler attached afterwards). A standalone
    // p.finally(...) would create a SECOND promise that rejects with the
    // same error and is never caught. We pin this by spying on the
    // unhandledrejection event.
    const handler = vi.fn()
    process.on('unhandledRejection', handler)

    server.use(
      http.get('/api/publishes', (): Response =>
        HttpResponse.json(
          { error: { code: 'internal', message: 'boom' } },
          { status: 500 },
        ),
      ),
    )

    try {
      const { result } = renderHook(
        (): UseListPublishesResult => useListPublishes(EMPTY_QUERY),
      )
      await waitFor((): void => {
        expect(result.current.error).not.toBeNull()
      })
      // Yield twice to give any orphaned rejection a chance to bubble.
      await new Promise<void>((resolve): void => {
        setTimeout(resolve, 10)
      })
      expect(handler).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', handler)
    }
  })
})
