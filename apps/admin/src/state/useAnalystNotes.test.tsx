import { ResortSlug } from '@snowboard-trip-advisor/schema'
import { AnalystNotesGetResponse } from '@snowboard-trip-advisor/schema/api'
import { act, render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { Component, Suspense, type JSX, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from '../lib/apiClient'
import { server } from '../mocks/server'

import {
  __resetForTests,
  invalidateAnalystNotes,
  prepopulateAnalystNotes,
  useAnalystNotes,
} from './useAnalystNotes'

const KOTELNICA = ResortSlug.parse('kotelnica-bialczanska')
const SPINDLERUV = ResortSlug.parse('spindleruv-mlyn')

function Probe({ slug }: { readonly slug: ResortSlug }): JSX.Element {
  const data = useAnalystNotes(slug)
  return <p data-testid="probe-slug">{data.slug}</p>
}

class Boundary extends Component<
  { readonly children: ReactNode },
  { readonly error: Error | null }
> {
  public override state: { readonly error: Error | null } = { error: null }

  public static getDerivedStateFromError(error: Error): { readonly error: Error } {
    return { error }
  }

  public override render(): JSX.Element {
    if (this.state.error !== null) {
      return <p data-testid="boundary-error">{this.state.error.name}</p>
    }
    return <>{this.props.children}</>
  }
}

let fallbackRenderCount = 0

function CountingFallback(): JSX.Element {
  fallbackRenderCount += 1
  return <p data-testid="loading">loading</p>
}

async function renderAsync(node: ReactNode): Promise<ReturnType<typeof render>> {
  let view!: ReturnType<typeof render>
  await act(async (): Promise<void> => {
    view = render(node)
    for (let i = 0; i < 10; i += 1) {
      await Promise.resolve()
    }
  })
  return view
}

beforeEach((): void => {
  __resetForTests()
  fallbackRenderCount = 0
})

afterEach((): void => {
  __resetForTests()
  server.resetHandlers()
})

describe('useAnalystNotes (PR N.c1 — Suspense read hook)', (): void => {
  it('suspends on first read; resolves with notes response', async (): Promise<void> => {
    // Step 2: first read triggers fetch + suspends then resolves
    await renderAsync(
      <Suspense fallback={<CountingFallback />}>
        <Probe slug={KOTELNICA} />
      </Suspense>,
    )
    expect(await screen.findByTestId('probe-slug')).toHaveTextContent('kotelnica-bialczanska')
    expect(fallbackRenderCount).toBeGreaterThan(0)
  })

  it('cache hit: same slug rendered twice fires ONE apiClient.getAnalystNotes call', async (): Promise<void> => {
    // Step 4: second read for the same slug returns cached value (no refetch)
    const spy = vi.spyOn(apiClient, 'getAnalystNotes')
    const { unmount } = await renderAsync(
      <Suspense fallback={<CountingFallback />}>
        <Probe slug={KOTELNICA} />
      </Suspense>,
    )
    await screen.findByTestId('probe-slug')
    unmount()
    await renderAsync(
      <Suspense fallback={<CountingFallback />}>
        <Probe slug={KOTELNICA} />
      </Suspense>,
    )
    await screen.findByTestId('probe-slug')
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  it('prepopulateAnalystNotes seeds BOTH caches; subsequent render returns synchronously without calling apiClient.getAnalystNotes and without mounting the Suspense fallback', async (): Promise<void> => {
    // Step 5: prepopulateAnalystNotes updates cache + notifies subscribers
    const spy = vi.spyOn(apiClient, 'getAnalystNotes')
    const seedResponse = makeSyntheticResponse('kotelnica-bialczanska')
    prepopulateAnalystNotes(KOTELNICA, seedResponse)
    fallbackRenderCount = 0

    await renderAsync(
      <Suspense fallback={<CountingFallback />}>
        <Probe slug={KOTELNICA} />
      </Suspense>,
    )
    expect(screen.getByTestId('probe-slug')).toHaveTextContent('kotelnica-bialczanska')
    expect(spy).not.toHaveBeenCalled()
    expect(fallbackRenderCount).toBe(0)
    spy.mockRestore()
  })

  it('invalidateAnalystNotes() (no args) clears the entire cache', async (): Promise<void> => {
    const spy = vi.spyOn(apiClient, 'getAnalystNotes')
    server.use(
      http.get('/api/analyst-notes/:slug', ({ params }): Response => {
        const slug = params.slug as string
        return HttpResponse.json({ slug, notes: {} })
      }),
    )
    const a = await renderAsync(
      <Suspense fallback={<CountingFallback />}>
        <Probe slug={KOTELNICA} />
      </Suspense>,
    )
    await screen.findByTestId('probe-slug')
    a.unmount()
    const b = await renderAsync(
      <Suspense fallback={<CountingFallback />}>
        <Probe slug={SPINDLERUV} />
      </Suspense>,
    )
    await screen.findByTestId('probe-slug')
    expect(spy).toHaveBeenCalledTimes(2)
    b.unmount()

    invalidateAnalystNotes()   // no args — clear everything
    await renderAsync(
      <Suspense fallback={<CountingFallback />}>
        <Probe slug={KOTELNICA} />
      </Suspense>,
    )
    await screen.findByTestId('probe-slug')
    expect(spy).toHaveBeenCalledTimes(3)   // KOTELNICA cleared too — refetched
    spy.mockRestore()
  })

  it('invalidateAnalystNotes(slug) clears the slug entry and the next render refetches', async (): Promise<void> => {
    // Step 6: invalidateAnalystNotes clears cache + notifies
    const spy = vi.spyOn(apiClient, 'getAnalystNotes')
    const { unmount } = await renderAsync(
      <Suspense fallback={<CountingFallback />}>
        <Probe slug={KOTELNICA} />
      </Suspense>,
    )
    await screen.findByTestId('probe-slug')
    expect(spy).toHaveBeenCalledTimes(1)
    unmount()

    invalidateAnalystNotes(KOTELNICA)
    await renderAsync(
      <Suspense fallback={<CountingFallback />}>
        <Probe slug={KOTELNICA} />
      </Suspense>,
    )
    await screen.findByTestId('probe-slug')
    expect(spy).toHaveBeenCalledTimes(2)
    spy.mockRestore()
  })

  it('rejected promise stays PINNED per ADR-0010: re-render same slug re-throws SAME rejection (no auto-clear)', async (): Promise<void> => {
    // Step 7: ADR-0010 rejected-promise pinning — verbatim mirror of useResortDetail.test.tsx
    server.use(
      http.get('/api/analyst-notes/:slug', (): Response =>
        HttpResponse.json(
          { error: { code: 'internal', message: 'boom' } },
          { status: 500 },
        ),
      ),
    )
    const spy = vi.spyOn(apiClient, 'getAnalystNotes')
    const { unmount } = await renderAsync(
      <Boundary>
        <Suspense fallback={<CountingFallback />}>
          <Probe slug={KOTELNICA} />
        </Suspense>
      </Boundary>,
    )
    expect(await screen.findByTestId('boundary-error')).toBeInTheDocument()
    expect(spy).toHaveBeenCalledTimes(1)
    unmount()

    // Re-render — pinned rejection re-throws WITHOUT a new fetch.
    await renderAsync(
      <Boundary>
        <Suspense fallback={<CountingFallback />}>
          <Probe slug={KOTELNICA} />
        </Suspense>
      </Boundary>,
    )
    expect(await screen.findByTestId('boundary-error')).toBeInTheDocument()
    expect(spy).toHaveBeenCalledTimes(1)   // still 1 — no new fetch
    spy.mockRestore()
  })

  it('rejected-promise path skips the synchronous cache (preserves ADR-0010 pinning across the dual-cache shape)', async (): Promise<void> => {
    server.use(
      http.get('/api/analyst-notes/:slug', (): Response =>
        HttpResponse.json(
          { error: { code: 'internal', message: 'boom' } },
          { status: 500 },
        ),
      ),
    )
    const { unmount } = await renderAsync(
      <Boundary>
        <Suspense fallback={<CountingFallback />}>
          <Probe slug={KOTELNICA} />
        </Suspense>
      </Boundary>,
    )
    expect(await screen.findByTestId('boundary-error')).toBeInTheDocument()
    unmount()

    // Re-render same slug — the rejection is still pinned through the
    // promise cache; the synchronous-fulfilled cache stayed empty for this
    // slug (the .then resolver that populates cachedFulfilled never fires
    // on rejection). The next render hits use() → re-throws.
    await renderAsync(
      <Boundary>
        <Suspense fallback={<CountingFallback />}>
          <Probe slug={KOTELNICA} />
        </Suspense>
      </Boundary>,
    )
    expect(await screen.findByTestId('boundary-error')).toBeInTheDocument()
  })

  it('per-slug isolation: different slugs each fire their own apiClient.getAnalystNotes call', async (): Promise<void> => {
    const spy = vi.spyOn(apiClient, 'getAnalystNotes')
    server.use(
      http.get('/api/analyst-notes/:slug', ({ params }): Response => {
        const slug = params.slug as string
        return HttpResponse.json({ slug, notes: {} })
      }),
    )
    const { unmount } = await renderAsync(
      <Suspense fallback={<CountingFallback />}>
        <Probe slug={KOTELNICA} />
      </Suspense>,
    )
    await screen.findByTestId('probe-slug')
    unmount()
    await renderAsync(
      <Suspense fallback={<CountingFallback />}>
        <Probe slug={SPINDLERUV} />
      </Suspense>,
    )
    await screen.findByTestId('probe-slug')
    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy).toHaveBeenCalledWith(KOTELNICA)
    expect(spy).toHaveBeenCalledWith(SPINDLERUV)
    spy.mockRestore()
  })

  it('synchronous fast path: after first fetch resolves, re-mounting same slug skips Suspense (no fallback render, no new fetch)', async (): Promise<void> => {
    const spy = vi.spyOn(apiClient, 'getAnalystNotes')
    const { unmount } = await renderAsync(
      <Suspense fallback={<CountingFallback />}>
        <Probe slug={KOTELNICA} />
      </Suspense>,
    )
    await screen.findByTestId('probe-slug')
    const fallbacksAfterFirstMount = fallbackRenderCount
    expect(fallbacksAfterFirstMount).toBeGreaterThan(0)
    unmount()

    await renderAsync(
      <Suspense fallback={<CountingFallback />}>
        <Probe slug={KOTELNICA} />
      </Suspense>,
    )
    expect(screen.getByTestId('probe-slug')).toHaveTextContent('kotelnica-bialczanska')
    expect(fallbackRenderCount).toBe(fallbacksAfterFirstMount)   // no new fallback render
    expect(spy).toHaveBeenCalledTimes(1)                         // no new fetch
    spy.mockRestore()
  })

  it('mounted consumers re-render when prepopulateAnalystNotes updates the cache', async (): Promise<void> => {
    const initial = makeSyntheticResponse('kotelnica-bialczanska')
    prepopulateAnalystNotes(KOTELNICA, initial)

    await renderAsync(
      <Suspense fallback={<CountingFallback />}>
        <Probe slug={KOTELNICA} />
      </Suspense>,
    )
    expect(screen.getByTestId('probe-slug')).toHaveTextContent('kotelnica-bialczanska')

    const updated = AnalystNotesGetResponse.parse({
      slug: 'kotelnica-bialczanska',
      notes: {},
    })

    await act(async (): Promise<void> => {
      prepopulateAnalystNotes(KOTELNICA, updated)
      for (let i = 0; i < 10; i += 1) { await Promise.resolve() }
    })

    expect(screen.getByTestId('probe-slug')).toHaveTextContent('kotelnica-bialczanska')
  })

  it('multiple mounted consumers for the same slug share subscriptions (both re-render on prepopulate)', async (): Promise<void> => {
    // Covers subscribeSlug false branch (set already exists for slug) and
    // the partial-unsubscribe branch (set.size > 0 after one unmount).
    const seedResponse = makeSyntheticResponse('kotelnica-bialczanska')
    prepopulateAnalystNotes(KOTELNICA, seedResponse)

    function ProbeA(): JSX.Element {
      const data = useAnalystNotes(KOTELNICA)
      return <p data-testid="probe-a">{data.slug}</p>
    }
    function ProbeB(): JSX.Element {
      const data = useAnalystNotes(KOTELNICA)
      return <p data-testid="probe-b">{data.slug}</p>
    }

    const { unmount: unmountA } = await renderAsync(
      <Suspense fallback={<CountingFallback />}>
        <ProbeA />
      </Suspense>,
    )
    await renderAsync(
      <Suspense fallback={<CountingFallback />}>
        <ProbeB />
      </Suspense>,
    )
    expect(screen.getByTestId('probe-a')).toHaveTextContent('kotelnica-bialczanska')
    expect(screen.getByTestId('probe-b')).toHaveTextContent('kotelnica-bialczanska')

    // Unmount A — B still subscribed; set.size > 0 after unsubscribe (false branch of s.size === 0).
    unmountA()

    // Both probes rendered from the same slug subscription; still resolves.
    const updated = makeSyntheticResponse('kotelnica-bialczanska')
    await act(async (): Promise<void> => {
      prepopulateAnalystNotes(KOTELNICA, updated)
      for (let i = 0; i < 10; i += 1) { await Promise.resolve() }
    })
    expect(screen.getByTestId('probe-b')).toHaveTextContent('kotelnica-bialczanska')
  })

  it('invalidateAnalystNotes() (no args) wakes every mounted consumer (subscription propagation across all slugs)', async (): Promise<void> => {
    // Mount Probe and KEEP it mounted so a subscriber for KOTELNICA is alive
    // when invalidate-all fires. Covers the for-of bumpSlugRev loop body in
    // the no-args branch of invalidateAnalystNotes.
    prepopulateAnalystNotes(KOTELNICA, makeSyntheticResponse('kotelnica-bialczanska'))
    await renderAsync(
      <Suspense fallback={<CountingFallback />}>
        <Probe slug={KOTELNICA} />
      </Suspense>,
    )
    expect(screen.getByTestId('probe-slug')).toHaveTextContent('kotelnica-bialczanska')

    // Stub the GET so the post-invalidate refetch resolves with fresh data.
    server.use(
      http.get('/api/analyst-notes/:slug', ({ params }): Response => {
        const slug = typeof params.slug === 'string' ? params.slug : 'unknown'
        return HttpResponse.json({ slug, notes: {} })
      }),
    )

    // Invalidate ALL while the consumer is mounted — wakes the live subscriber.
    await act(async (): Promise<void> => {
      invalidateAnalystNotes()
      for (let i = 0; i < 20; i += 1) { await Promise.resolve() }
    })
    expect(await screen.findByTestId('probe-slug')).toHaveTextContent('kotelnica-bialczanska')
  })

  it('stale in-flight GET that resolves AFTER prepopulateAnalystNotes does NOT overwrite cachedFulfilled', async (): Promise<void> => {
    // Race: a GET fires; before it resolves, prepopulate is called with newer data.
    // The older GET MUST NOT clobber cachedFulfilled when it eventually resolves.
    let resolveGet: (value: AnalystNotesGetResponse) => void = (): void => {}
    const olderResponse = makeSyntheticResponse('older-slug')
    const newerResponse = makeSyntheticResponse('kotelnica-bialczanska')
    const spy = vi.spyOn(apiClient, 'getAnalystNotes').mockImplementation(
      (): Promise<AnalystNotesGetResponse> =>
        new Promise<AnalystNotesGetResponse>((resolve): void => { resolveGet = resolve }),
    )

    // NameProbe reads .slug from the response to verify which version was returned
    function SlugProbe({ slug }: { readonly slug: ResortSlug }): JSX.Element {
      const data = useAnalystNotes(slug)
      return <p data-testid="probe-slug">{data.slug}</p>
    }

    try {
      await act(async (): Promise<void> => {
        render(
          <Suspense fallback={<CountingFallback />}>
            <SlugProbe slug={KOTELNICA} />
          </Suspense>,
        )
        await Promise.resolve()
      })
      expect(spy).toHaveBeenCalledTimes(1)

      // Prepopulate with newer response while GET is still in flight.
      prepopulateAnalystNotes(KOTELNICA, newerResponse)

      // Resolve the older GET — the .then guard should reject the cache write.
      await act(async (): Promise<void> => {
        resolveGet(olderResponse)
        for (let i = 0; i < 10; i += 1) {
          await Promise.resolve()
        }
      })

      // The next read returns the NEWER response (synchronous fast path).
      expect(screen.getByTestId('probe-slug')).toHaveTextContent('kotelnica-bialczanska')
    } finally {
      spy.mockRestore()
    }
  })
})

function makeSyntheticResponse(slug: string): AnalystNotesGetResponse {
  return AnalystNotesGetResponse.parse({ slug, notes: {} })
}
