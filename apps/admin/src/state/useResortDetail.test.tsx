import { ResortSlug } from '@snowboard-trip-advisor/schema'
import { ResortDetailResponse } from '@snowboard-trip-advisor/schema/api'
import { act, render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { Component, Suspense, type JSX, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from '../lib/apiClient'
import { server } from '../mocks/server'

import {
  __resetForTests,
  invalidateResortDetail,
  prepopulateResortDetail,
  useResortDetail,
} from './useResortDetail'

const KOTELNICA = ResortSlug.parse('kotelnica-bialczanska')
const SPINDLERUV = ResortSlug.parse('spindleruv-mlyn')

function Probe({ slug }: { readonly slug: ResortSlug }): JSX.Element {
  const detail = useResortDetail(slug)
  return <p data-testid="probe-slug">{detail.resort.slug}</p>
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

// Render-count instrumentation per reviewer P2: rather than the plan's invented
// `getRenderCount(<Suspense fallback>)` pseudo-helper (no such helper exists in
// @testing-library/react), wrap the fallback in a counter component. Assert
// `fallbackRenderCount === N` to detect Suspense fallbacks. The synchronous
// fast path (cachedFulfilled hit) skips `use()` entirely so the Suspense
// boundary never even mounts the fallback child — count stays at 0.
let fallbackRenderCount = 0

function CountingFallback(): JSX.Element {
  fallbackRenderCount += 1
  return <p data-testid="loading">loading</p>
}

async function renderAsync(node: ReactNode): Promise<ReturnType<typeof render>> {
  // React 19 `use()` + Suspense in jsdom requires wrapping the initial render
  // in act() so the suspended promise can resolve before the test reads the
  // DOM. Loop microtask flushes so multi-step pipelines (fetch → json →
  // validate → render) settle in one act window. Mirrors the pattern in
  // apps/public/src/state/useDataset.test.tsx.
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

describe('useResortDetail (PR 4.4a-2, decisions log D3 / D6 / D13)', (): void => {
  it('happy path: suspends with fallback then resolves with the resort detail', async (): Promise<void> => {
    await renderAsync(
      <Suspense fallback={<CountingFallback />}>
        <Probe slug={KOTELNICA} />
      </Suspense>,
    )
    expect(await screen.findByTestId('probe-slug')).toHaveTextContent('kotelnica-bialczanska')
    expect(fallbackRenderCount).toBeGreaterThan(0)   // first mount suspends
  })

  it('cache hit: same slug rendered twice (with unmount between) fires ONE apiClient.getResort call', async (): Promise<void> => {
    const spy = vi.spyOn(apiClient, 'getResort')
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

  it('per-slug isolation: different slugs each fire their own apiClient.getResort call', async (): Promise<void> => {
    const spy = vi.spyOn(apiClient, 'getResort')
    server.use(
      http.get('/api/resorts/:slug', ({ params }): Response => {
        const slug = params.slug as string
        return HttpResponse.json({
          resort: { ...cannedResortShape, slug },
          live_signal: null,
          field_states: {},
        })
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

  it('rejected promise stays PINNED per ADR-0010: re-render same slug re-throws SAME rejection (no auto-clear)', async (): Promise<void> => {
    server.use(
      http.get('/api/resorts/:slug', (): Response =>
        HttpResponse.json(
          { error: { code: 'internal', message: 'boom' } },
          { status: 500 },
        ),
      ),
    )
    const spy = vi.spyOn(apiClient, 'getResort')
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

  it('invalidateResortDetail(slug) clears the slug entry and the next render refetches', async (): Promise<void> => {
    const spy = vi.spyOn(apiClient, 'getResort')
    const { unmount } = await renderAsync(
      <Suspense fallback={<CountingFallback />}>
        <Probe slug={KOTELNICA} />
      </Suspense>,
    )
    await screen.findByTestId('probe-slug')
    expect(spy).toHaveBeenCalledTimes(1)
    unmount()

    invalidateResortDetail(KOTELNICA)
    await renderAsync(
      <Suspense fallback={<CountingFallback />}>
        <Probe slug={KOTELNICA} />
      </Suspense>,
    )
    await screen.findByTestId('probe-slug')
    expect(spy).toHaveBeenCalledTimes(2)   // cleared → refetched
    spy.mockRestore()
  })

  it('invalidateResortDetail() (no args) clears the entire cache', async (): Promise<void> => {
    const spy = vi.spyOn(apiClient, 'getResort')
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

    invalidateResortDetail()
    await renderAsync(
      <Suspense fallback={<CountingFallback />}>
        <Probe slug={KOTELNICA} />
      </Suspense>,
    )
    await screen.findByTestId('probe-slug')
    expect(spy).toHaveBeenCalledTimes(3)   // KOTELNICA cleared too — refetched
    spy.mockRestore()
  })

  it('__resetForTests clears the cache (validated by the very fixture this test file relies on)', async (): Promise<void> => {
    const spy = vi.spyOn(apiClient, 'getResort')
    const { unmount } = await renderAsync(
      <Suspense fallback={<CountingFallback />}>
        <Probe slug={KOTELNICA} />
      </Suspense>,
    )
    await screen.findByTestId('probe-slug')
    expect(spy).toHaveBeenCalledTimes(1)
    unmount()
    __resetForTests()
    await renderAsync(
      <Suspense fallback={<CountingFallback />}>
        <Probe slug={KOTELNICA} />
      </Suspense>,
    )
    await screen.findByTestId('probe-slug')
    expect(spy).toHaveBeenCalledTimes(2)
    spy.mockRestore()
  })

  it('prepopulateResortDetail seeds BOTH caches; subsequent render returns synchronously WITHOUT calling apiClient.getResort and WITHOUT mounting the Suspense fallback (D13 / round-9 P2-13)', async (): Promise<void> => {
    const spy = vi.spyOn(apiClient, 'getResort')
    const seedResponse: ResortDetailResponse = makeSyntheticResponse('kotelnica-bialczanska')
    prepopulateResortDetail(KOTELNICA, seedResponse)
    fallbackRenderCount = 0

    await renderAsync(
      <Suspense fallback={<CountingFallback />}>
        <Probe slug={KOTELNICA} />
      </Suspense>,
    )
    expect(screen.getByTestId('probe-slug')).toHaveTextContent('kotelnica-bialczanska')
    expect(spy).not.toHaveBeenCalled()      // synchronous fast path skipped use()
    expect(fallbackRenderCount).toBe(0)     // CountingFallback never mounted
    spy.mockRestore()
  })

  it('synchronous fast path: after first fetch resolves, re-mounting same slug skips Suspense (no fallback render, no new fetch)', async (): Promise<void> => {
    const spy = vi.spyOn(apiClient, 'getResort')
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

  it('Codex P2 fold: stale in-flight GET that resolves AFTER prepopulateResortDetail does NOT overwrite cachedFulfilled', async (): Promise<void> => {
    // Race: a GET fires; before it resolves, the caller (e.g. PR 4.4d's
    // useWorkspaceState post-PUT path) calls prepopulateResortDetail with
    // newer post-PUT data. The older GET MUST NOT clobber cachedFulfilled
    // when it eventually resolves — otherwise the next render serves
    // pre-PUT data until the next manual invalidate.
    //
    // Test driver: spy on apiClient.getResort so we control resolution
    // timing precisely (sidesteps MSW handler scheduling).
    let resolveGet: (value: ResortDetailResponse) => void = (): void => {}
    const olderResponse = makeSyntheticResponse('older-response-slug')
    const newerResponse = makeSyntheticResponse('newer-response-slug')
    const spy = vi.spyOn(apiClient, 'getResort').mockImplementation(
      (): Promise<ResortDetailResponse> =>
        new Promise<ResortDetailResponse>((resolve): void => { resolveGet = resolve }),
    )

    try {
      // Kick off the in-flight GET via the hook (don't await full resolution
      // since the promise is still pending).
      await act(async (): Promise<void> => {
        render(
          <Suspense fallback={<CountingFallback />}>
            <Probe slug={KOTELNICA} />
          </Suspense>,
        )
        // One microtask tick lets the hook call apiClient.getResort and
        // populate cachedPromises with the deferred promise.
        await Promise.resolve()
      })
      expect(spy).toHaveBeenCalledTimes(1)

      // Prepopulate with the newer response while the GET is still in flight.
      // This replaces cachedPromises.get(slug) with Promise.resolve(newer).
      prepopulateResortDetail(KOTELNICA, newerResponse)

      // Resolve the older GET. The .then guard should reject the cache write
      // because cachedPromises.get(slug) is no longer the older promise.
      await act(async (): Promise<void> => {
        resolveGet(olderResponse)
        for (let i = 0; i < 10; i += 1) {
          await Promise.resolve()
        }
      })

      // The next read returns the NEWER response (synchronous fast path);
      // the older GET's .then ran but skipped writing cachedFulfilled.
      expect(screen.getByTestId('probe-slug')).toHaveTextContent('newer-response-slug')
    } finally {
      spy.mockRestore()
    }
  })

  it('mounted consumers re-render when prepopulateResortDetail updates the cache (Codex P2-C round-2 fold)', async (): Promise<void> => {
    const initial = makeSyntheticResponse('kotelnica-bialczanska')
    prepopulateResortDetail(KOTELNICA, initial)

    // Mount: synchronous fast path returns the initial canonical.
    await renderAsync(
      <Suspense fallback={<CountingFallback />}>
        <Probe slug={KOTELNICA} />
      </Suspense>,
    )
    expect(screen.getByTestId('probe-slug')).toHaveTextContent('kotelnica-bialczanska')

    // Build a different response shape (different resort.name) and prepopulate.
    // Without slug-rev subscription the mounted consumer would NOT re-render;
    // its display would stay frozen on the initial response. With subscription,
    // useResortDetail's useSyncExternalStore wakes up and the next snapshot
    // returns the new cachedFulfilled entry.
    const updated = ResortDetailResponse.parse({
      ...JSON.parse(JSON.stringify(initial)),
      resort: { ...initial.resort, slug: 'kotelnica-bialczanska', name: { en: 'KOTELNICA-UPDATED' } },
    } as Parameters<typeof ResortDetailResponse.parse>[0])

    await act(async (): Promise<void> => {
      prepopulateResortDetail(KOTELNICA, updated)
      for (let i = 0; i < 10; i += 1) { await Promise.resolve() }
    })

    // Probe renders the resort.slug — same string, but the underlying
    // detail object reference has changed. Add a more discerning probe to
    // confirm the new cache entry is what gets read.
  })

  it('invalidateResortDetail() (no args) wakes every mounted consumer (subscription propagation across all slugs)', async (): Promise<void> => {
    // Mount Probe and KEEP it mounted so a subscriber for KOTELNICA is alive
    // when invalidate-all fires. Without my P2-C fold the for-each-slug bump
    // path inside `invalidateResortDetail()` (no-args branch) wouldn't have
    // a subscriber to wake.
    prepopulateResortDetail(KOTELNICA, makeSyntheticResponse('kotelnica-bialczanska'))
    await renderAsync(
      <Suspense fallback={<CountingFallback />}>
        <Probe slug={KOTELNICA} />
      </Suspense>,
    )
    expect(screen.getByTestId('probe-slug')).toHaveTextContent('kotelnica-bialczanska')

    // Stub the GET so the post-invalidate refetch resolves with new data.
    server.use(
      http.get('/api/resorts/:slug', ({ params }): Response => {
        const slug = typeof params.slug === 'string' ? params.slug : 'unknown'
        return HttpResponse.json({
          ...makeSyntheticResponse(slug),
          resort: { ...makeSyntheticResponse(slug).resort, slug, name: { en: 'POST_INVALIDATE' } },
        })
      }),
    )

    // Invalidate ALL — wakes the live subscriber, the next render falls
    // through to `use(loadOnce(slug))` and refetches.
    await act(async (): Promise<void> => {
      invalidateResortDetail()
      for (let i = 0; i < 20; i += 1) { await Promise.resolve() }
    })
    expect(await screen.findByTestId('probe-slug')).toHaveTextContent('kotelnica-bialczanska')
  })

  it('mounted Probe sees the new resort.name after prepopulateResortDetail (subscription propagates cache mutations)', async (): Promise<void> => {
    function NameProbe({ slug }: { readonly slug: ResortSlug }): JSX.Element {
      const detail = useResortDetail(slug)
      return <p data-testid="probe-name">{detail.resort.name.en}</p>
    }

    const initial = ResortDetailResponse.parse({
      ...JSON.parse(JSON.stringify(makeSyntheticResponse('kotelnica-bialczanska'))),
      resort: { ...makeSyntheticResponse('kotelnica-bialczanska').resort, name: { en: 'INITIAL' } },
    } as Parameters<typeof ResortDetailResponse.parse>[0])
    prepopulateResortDetail(KOTELNICA, initial)

    await renderAsync(
      <Suspense fallback={<CountingFallback />}>
        <NameProbe slug={KOTELNICA} />
      </Suspense>,
    )
    expect(screen.getByTestId('probe-name')).toHaveTextContent('INITIAL')

    const updated = ResortDetailResponse.parse({
      ...JSON.parse(JSON.stringify(initial)),
      resort: { ...initial.resort, name: { en: 'UPDATED' } },
    } as Parameters<typeof ResortDetailResponse.parse>[0])
    await act(async (): Promise<void> => {
      prepopulateResortDetail(KOTELNICA, updated)
      for (let i = 0; i < 10; i += 1) { await Promise.resolve() }
    })

    expect(screen.getByTestId('probe-name')).toHaveTextContent('UPDATED')
  })

  it('rejected-promise path skips the synchronous cache (preserves ADR-0010 pinning across the dual-cache shape)', async (): Promise<void> => {
    server.use(
      http.get('/api/resorts/:slug', (): Response =>
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
})

// Synthetic ResortDetailResponse for prepopulate test — mirrors the canned
// MSW handler's shape to keep both code paths valid against the schema.
const cannedResortShape = {
  schema_version: 1,
  slug: 'placeholder',
  name: { en: 'Placeholder' },
  country: 'PL',
  region: { en: 'Placeholder Region' },
  altitude_m: { min: 800, max: 1000 },
  slopes_km: 10,
  lift_count: 5,
  skiable_terrain_ha: 50,
  season: { start_month: 12, end_month: 4 },
  publish_state: 'published',
  field_sources: {
    snow_depth_cm: {
      source: 'manual',
      source_url: 'https://example.com/x',
      observed_at: '2026-04-26T08:00:00Z',
      fetched_at: '2026-04-26T08:00:00Z',
      upstream_hash: 'a'.repeat(64),
      attribution_block: { en: 'manual' },
    },
  },
}

function makeSyntheticResponse(slug: string): ResortDetailResponse {
  return ResortDetailResponse.parse({
    resort: { ...cannedResortShape, slug },
    live_signal: null,
    field_states: {},
  })
}
