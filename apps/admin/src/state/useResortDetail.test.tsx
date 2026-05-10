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
