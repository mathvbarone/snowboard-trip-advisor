import { ListResortsQuery, type ListResortsResponse } from '@snowboard-trip-advisor/schema/api'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { server } from '../mocks/server'

import { __resetForTests, useResortList, type UseResortListResult } from './useResortList'

// React-state plan-review fold (P1): symmetric reset in BOTH before/afterEach,
// matching useHealth.test.ts:13-19. Belt-and-braces against module-state leak.
beforeEach((): void => {
  __resetForTests()
})
afterEach((): void => {
  __resetForTests()
  server.resetHandlers()
})

const EMPTY_QUERY: ListResortsQuery = ListResortsQuery.parse({})

describe('useResortList (PR 4.3)', (): void => {
  it('returns { value: null, error: null } on initial render', (): void => {
    const { result } = renderHook((): UseResortListResult => useResortList(EMPTY_QUERY))
    expect(result.current).toEqual({ value: null, error: null })
  })

  it('resolves to { value, error: null } after fetch', async (): Promise<void> => {
    const { result } = renderHook((): UseResortListResult => useResortList(EMPTY_QUERY))
    await waitFor((): void => {
      expect(result.current.value).not.toBeNull()
    })
    expect(result.current.error).toBeNull()
    expect(result.current.value?.items).toBeInstanceOf(Array)
    expect(result.current.value?.page.limit).toBeGreaterThan(0)
  })

  it('rejects to { value: null, error } when MSW returns 500', async (): Promise<void> => {
    server.use(
      http.get('/api/resorts', (): Response =>
        HttpResponse.json(
          { error: { code: 'internal', message: 'test error' } },
          { status: 500 },
        ),
      ),
    )
    const { result } = renderHook((): UseResortListResult => useResortList(EMPTY_QUERY))
    await waitFor((): void => {
      expect(result.current.error).not.toBeNull()
    })
    expect(result.current.value).toBeNull()
    expect(result.current.error).toBeInstanceOf(Error)
  })

  it('rejects with Error wrapping non-Error rejections', async (): Promise<void> => {
    // Cover the `e instanceof Error ? e : new Error(String(e))` defensive branch.
    const { apiClient } = await import('../lib/apiClient')
    const spy = vi.spyOn(apiClient, 'listResorts').mockRejectedValueOnce('string rejection')
    const { result } = renderHook((): UseResortListResult => useResortList(EMPTY_QUERY))
    await waitFor((): void => {
      expect(result.current.error).not.toBeNull()
    })
    expect(result.current.value).toBeNull()
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe('string rejection')
    spy.mockRestore()
  })

  it('__resetForTests clears the in-flight cache (fresh fetch on next render)', async (): Promise<void> => {
    const { result: r1, unmount: u1 } = renderHook(
      (): UseResortListResult => useResortList(EMPTY_QUERY),
    )
    await waitFor((): void => {
      expect(r1.current.value).not.toBeNull()
    })
    u1()

    __resetForTests()

    const { result: r2 } = renderHook((): UseResortListResult => useResortList(EMPTY_QUERY))
    expect(r2.current.value).toBeNull()
    await waitFor((): void => {
      expect(r2.current.value).not.toBeNull()
    })
    expect(r2.current.error).toBeNull()
  })

  it('refetches when query changes (different keys → distinct requests)', async (): Promise<void> => {
    let requestCount = 0
    const listener = ({ request }: { request: Request }): void => {
      if (new URL(request.url).pathname === '/api/resorts') {
        requestCount += 1
      }
    }
    server.events.on('request:start', listener)
    try {
      const initialQuery: ListResortsQuery = ListResortsQuery.parse({ filter: { country: 'PL' } })
      const updatedQuery: ListResortsQuery = ListResortsQuery.parse({ filter: { country: 'AT' } })
      const { result, rerender } = renderHook(
        (q: ListResortsQuery): UseResortListResult => useResortList(q),
        { initialProps: initialQuery },
      )
      await waitFor((): void => {
        expect(result.current.value).not.toBeNull()
      })
      expect(requestCount).toBe(1)

      rerender(updatedQuery)
      // Force a fresh-fetch wait by polling requestCount.
      await waitFor((): void => {
        expect(requestCount).toBe(2)
      })
    } finally {
      server.events.removeListener('request:start', listener)
    }
  })

  it('does not update state after unmount on success (cancelled guard true-branch)', async (): Promise<void> => {
    // Covers the `if (!cancelled)` false-branch in the .then callback.
    type Deferred = {
      resolve: (value: ListResortsResponse) => void
      ready: () => void
    }
    const deferred: Partial<Deferred> = {}
    const handlerReadyPromise = new Promise<void>((resolve): void => {
      deferred.ready = resolve
    })

    server.use(
      http.get('/api/resorts', (): Promise<Response> => {
        const p = new Promise<ListResortsResponse>((res): void => {
          deferred.resolve = res
        }).then((data): Response => HttpResponse.json(data))
        if (deferred.ready) {
          deferred.ready()
        }
        return p
      }),
    )

    const { result, unmount } = renderHook(
      (): UseResortListResult => useResortList(EMPTY_QUERY),
    )
    await handlerReadyPromise
    expect(result.current.value).toBeNull()
    unmount()

    if (deferred.resolve) {
      deferred.resolve({
        items: [],
        page: { offset: 0, limit: 50, total: 0 },
      })
    }
    await act(async (): Promise<void> => {
      await new Promise<void>((resolve): void => {
        queueMicrotask(resolve)
      })
    })
    expect(result.current.value).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('does not update state after unmount on error (cancelled guard catch-branch)', async (): Promise<void> => {
    // Covers the `if (!cancelled)` false-branch in the .catch callback.
    type Deferred = {
      reject: (reason: unknown) => void
      ready: () => void
    }
    const deferred: Partial<Deferred> = {}
    const handlerReadyPromise = new Promise<void>((resolve): void => {
      deferred.ready = resolve
    })

    server.use(
      http.get('/api/resorts', (): Promise<Response> => {
        const p = new Promise<ListResortsResponse>((_res, rej): void => {
          deferred.reject = rej
        }).then((): Response => HttpResponse.json({}))
        if (deferred.ready) {
          deferred.ready()
        }
        return p
      }),
    )

    const { result, unmount } = renderHook(
      (): UseResortListResult => useResortList(EMPTY_QUERY),
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

  it('two concurrent mounts with the SAME query share the in-flight fetch (single request)', async (): Promise<void> => {
    let requestCount = 0
    const listener = ({ request }: { request: Request }): void => {
      if (new URL(request.url).pathname === '/api/resorts') {
        requestCount += 1
      }
    }
    server.events.on('request:start', listener)
    try {
      const { result: r1 } = renderHook(
        (): UseResortListResult => useResortList(EMPTY_QUERY),
      )
      const { result: r2 } = renderHook(
        (): UseResortListResult => useResortList(EMPTY_QUERY),
      )

      await waitFor((): void => {
        expect(r1.current.value).not.toBeNull()
      })
      await waitFor((): void => {
        expect(r2.current.value).not.toBeNull()
      })

      expect(r1.current.error).toBeNull()
      expect(r2.current.error).toBeNull()
      expect(requestCount).toBe(1)
    } finally {
      server.events.removeListener('request:start', listener)
    }
  })

  it('two concurrent mounts with DIFFERENT queries each fetch (request count = 2)', async (): Promise<void> => {
    let requestCount = 0
    const listener = ({ request }: { request: Request }): void => {
      if (new URL(request.url).pathname === '/api/resorts') {
        requestCount += 1
      }
    }
    server.events.on('request:start', listener)
    try {
      const queryPL: ListResortsQuery = ListResortsQuery.parse({ filter: { country: 'PL' } })
      const queryAT: ListResortsQuery = ListResortsQuery.parse({ filter: { country: 'AT' } })
      const { result: r1 } = renderHook(
        (): UseResortListResult => useResortList(queryPL),
      )
      const { result: r2 } = renderHook(
        (): UseResortListResult => useResortList(queryAT),
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

  it('queryKey deeply sorts nested object keys (semantically-equal queries share the in-flight fetch)', async (): Promise<void> => {
    // Two queries with the SAME semantic content but DIFFERENT construction
    // order at every nesting level. If queryKey did `JSON.stringify(q,
    // Object.keys(q).sort())` (the property-allowlist mistake), the nested
    // `filter` and `page` objects would keep INSERTION order and the keys
    // would differ — producing two requests instead of one.
    //
    // NOTE: We deliberately bypass `ListResortsQuery.parse(...)` here because
    // Zod 4's parse() rebuilds objects in *schema-definition* order, which
    // would erase the construction-order difference this test depends on.
    // Cast via `unknown` to preserve insertion order while satisfying the
    // branded ISOCountryCode type.
    let requestCount = 0
    const listener = ({ request }: { request: Request }): void => {
      if (new URL(request.url).pathname === '/api/resorts') {
        requestCount += 1
      }
    }
    server.events.on('request:start', listener)
    try {
      const q1 = {
        filter: { country: 'PL', hasFailures: true },
        page: { offset: 0, limit: 10 },
      } as unknown as ListResortsQuery
      const q2 = {
        page: { limit: 10, offset: 0 },
        filter: { hasFailures: true, country: 'PL' },
      } as unknown as ListResortsQuery
      const { result: r1 } = renderHook(
        (): UseResortListResult => useResortList(q1),
      )
      const { result: r2 } = renderHook(
        (): UseResortListResult => useResortList(q2),
      )

      await waitFor((): void => {
        expect(r1.current.value).not.toBeNull()
      })
      await waitFor((): void => {
        expect(r2.current.value).not.toBeNull()
      })
      // Recursive-sort semantics → same key → in-flight promise shared.
      expect(requestCount).toBe(1)
    } finally {
      server.events.removeListener('request:start', listener)
    }
  })
})
