import {
  ISODateTimeString,
  METRIC_FIELDS,
  ResortSlug,
  type FieldStateFor,
  type MetricPath,
} from '@snowboard-trip-advisor/schema'
import { ResortDetailResponse } from '@snowboard-trip-advisor/schema/api'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from '../lib/apiClient'
import { server } from '../mocks/server'
import { __resetForTests as __resetDetail } from '../state/useResortDetail'
import { __resetForTests as __resetURL } from '../state/useURLState'

import { ResortEditor } from './ResortEditor'

// PR 4.4b Tasks 6+7 — composition + EditorErrorBoundary tests.
// Per Decision D1 (boundary co-located + per-error-code copy), D4 (per-route
// Suspense + inline fallback). Mirrors the renderAsync pattern from
// useResortDetail.test.tsx so multi-microtask Suspense pipelines (fetch → text
// → JSON.parse → schema parse → render) settle in one act window.

const KOTELNICA = ResortSlug.parse('kotelnica-bialczanska')
const SPINDLERUV = ResortSlug.parse('spindleruv-mlyn')

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

const HASH_64 = 'a'.repeat(64)
const OBS_AT = '2026-04-29T08:00:00Z'

function makeLiveState(value: unknown): FieldStateFor<unknown> {
  return {
    state: 'live',
    value,
    source: 'resort-feed',
    observed_at: ISODateTimeString.parse(OBS_AT),
  }
}

const VALUES_BY_PATH: Record<MetricPath, unknown> = {
  'altitude_m.min': 800,
  'altitude_m.max': 2300,
  'slopes_km': 142,
  'lift_count': 24,
  'skiable_terrain_ha': 50,
  'season.start_month': 12,
  'season.end_month': 4,
  'snow_depth_cm': 145,
  'lifts_open.count': 12,
  'lifts_open.total': 24,
  'lift_pass_day': { amount: 50, currency: 'EUR' },
  'lodging_sample.median_eur': { amount: 80, currency: 'EUR' },
}

function makeFullDetail(slug: string): ResortDetailResponse {
  const fieldSources: Record<string, unknown> = {}
  for (const path of METRIC_FIELDS) {
    fieldSources[path] = {
      source: 'resort-feed',
      source_url: 'https://example.com/x',
      observed_at: OBS_AT,
      fetched_at: OBS_AT,
      upstream_hash: HASH_64,
      attribution_block: { en: 'Source: example.' },
    }
  }
  const fieldStates: Record<string, FieldStateFor<unknown>> = {}
  for (const path of METRIC_FIELDS) {
    fieldStates[path] = makeLiveState(VALUES_BY_PATH[path])
  }
  return ResortDetailResponse.parse({
    resort: {
      schema_version: 1,
      slug,
      name: { en: 'Test Resort' },
      country: 'PL',
      region: { en: 'Test Region' },
      altitude_m: { min: 800, max: 2300 },
      slopes_km: 142,
      lift_count: 24,
      skiable_terrain_ha: 50,
      season: { start_month: 12, end_month: 4 },
      publish_state: 'published',
      field_sources: fieldSources,
    },
    live_signal: {
      schema_version: 1,
      resort_slug: slug,
      observed_at: OBS_AT,
      fetched_at: OBS_AT,
      snow_depth_cm: 145,
      lifts_open: { count: 12, total: 24 },
      lift_pass_day: { amount: 50, currency: 'EUR' },
      lodging_sample: {
        median_eur: { amount: 80, currency: 'EUR' },
        sample_size: 30,
      },
      field_sources: fieldSources,
    },
    field_states: fieldStates,
  })
}

beforeEach((): void => {
  __resetDetail()
  __resetURL()
  // Default route — keeps the mounted boundary's onBack click test predictable.
  window.history.replaceState({}, '', '/?route=editor&slug=kotelnica-bialczanska')
})

afterEach((): void => {
  __resetDetail()
  __resetURL()
  window.history.replaceState({}, '', '/')
  server.resetHandlers()
})

describe('ResortEditor — Suspense + composition (PR 4.4b §D4)', (): void => {
  it('renders the inline Loading… status while the detail is being fetched', (): void => {
    server.use(
      http.get('/api/resorts/:slug', (): Response =>
        HttpResponse.json(makeFullDetail('kotelnica-bialczanska')),
      ),
    )
    render(<ResortEditor slug={KOTELNICA} />)
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveTextContent('Loading…')
  })

  it('renders the Tabs (Durable + Live) with all 7 durable rows on the default tab', async (): Promise<void> => {
    server.use(
      http.get('/api/resorts/:slug', (): Response =>
        HttpResponse.json(makeFullDetail('kotelnica-bialczanska')),
      ),
    )
    await renderAsync(<ResortEditor slug={KOTELNICA} />)

    expect(screen.getByRole('tablist', { name: 'Editor sections' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Durable' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Live' })).toBeInTheDocument()

    const panel = screen.getByRole('tabpanel')
    expect(within(panel).getByLabelText('Altitude (min, m)')).toBeInTheDocument()
    expect(within(panel).getByLabelText('Altitude (max, m)')).toBeInTheDocument()
    expect(within(panel).getByLabelText('Slopes (km)')).toBeInTheDocument()
    expect(within(panel).getByLabelText('Lift count')).toBeInTheDocument()
    expect(within(panel).getByLabelText('Skiable terrain (ha)')).toBeInTheDocument()
    expect(within(panel).getByLabelText('Season start')).toBeInTheDocument()
    expect(within(panel).getByLabelText('Season end')).toBeInTheDocument()
    // Live paths are NOT mounted in the durable panel (TabPanel renders only when active).
    expect(within(panel).queryByLabelText('Snow depth (cm)')).toBeNull()
  })

  it('switches to the Live tab and renders all 5 live rows', async (): Promise<void> => {
    server.use(
      http.get('/api/resorts/:slug', (): Response =>
        HttpResponse.json(makeFullDetail('kotelnica-bialczanska')),
      ),
    )
    await renderAsync(<ResortEditor slug={KOTELNICA} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('tab', { name: 'Live' }))

    const panel = screen.getByRole('tabpanel')
    expect(within(panel).getByLabelText('Snow depth (cm)')).toBeInTheDocument()
    expect(within(panel).getByLabelText('Lifts open (count)')).toBeInTheDocument()
    expect(within(panel).getByLabelText('Lifts open (total)')).toBeInTheDocument()
    expect(within(panel).getByLabelText('Lift pass (per day)')).toBeInTheDocument()
    expect(within(panel).getByLabelText('Lodging median')).toBeInTheDocument()
  })

  it('falls back to a synthetic failed state for paths missing from field_states (defends the partialRecord typing)', async (): Promise<void> => {
    // Canned default in mocks/server.ts ships `field_states: {}`. Without an
    // override here the panel still mounts all 7 durable rows; they render in
    // the failed-default state ("—" + StatusPill variant=failed).
    await renderAsync(<ResortEditor slug={KOTELNICA} />)
    const panel = screen.getByRole('tabpanel')
    expect(within(panel).getByLabelText('Slopes (km)')).toBeInTheDocument()
    // Each missing field renders "—" via the failed-default fallback.
    expect(within(panel).getAllByText('—').length).toBeGreaterThanOrEqual(7)
  })

  it('passes jest-axe in the loaded state', async (): Promise<void> => {
    server.use(
      http.get('/api/resorts/:slug', (): Response =>
        HttpResponse.json(makeFullDetail('kotelnica-bialczanska')),
      ),
    )
    const { container } = await renderAsync(<ResortEditor slug={KOTELNICA} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('EditorErrorBoundary (PR 4.4b §D1)', (): void => {
  it('on 404, surfaces "Resort not found." with a Back-to-resorts affordance', async (): Promise<void> => {
    server.use(
      http.get('/api/resorts/:slug', (): Response =>
        HttpResponse.json(
          { error: { code: 'not-found', message: 'no such slug' } },
          { status: 404 },
        ),
      ),
    )
    await renderAsync(<ResortEditor slug={KOTELNICA} />)
    expect(screen.getByText('Resort not found.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /back to resorts/i })).toBeInTheDocument()
  })

  it('clicking Back invalidates the slug cache AND routes to /resorts', async (): Promise<void> => {
    const spyGet = vi.spyOn(apiClient, 'getResort')
    server.use(
      http.get('/api/resorts/:slug', (): Response =>
        HttpResponse.json(
          { error: { code: 'not-found', message: 'no such slug' } },
          { status: 404 },
        ),
      ),
    )
    await renderAsync(<ResortEditor slug={KOTELNICA} />)
    expect(spyGet).toHaveBeenCalledTimes(1)

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /back to resorts/i }))

    expect(window.location.search).toBe('?route=resorts')
    spyGet.mockRestore()
  })

  it('on 500 workspace-corrupt, surfaces literal recovery copy with the slug-specific path + Retry button', async (): Promise<void> => {
    server.use(
      http.get('/api/resorts/:slug', (): Response =>
        HttpResponse.json(
          {
            error: {
              code: 'workspace-corrupt',
              message: 'workspace file corrupt',
              details: { slug: 'kotelnica-bialczanska' },
            },
          },
          { status: 500 },
        ),
      ),
    )
    await renderAsync(<ResortEditor slug={KOTELNICA} />)
    expect(
      screen.getByText(/data\/admin-workspace\/kotelnica-bialczanska\.json/),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /back to resorts/i })).toBeInTheDocument()
  })

  it('Retry recovers when the next response is 200 (cache invalidated; subtree remounts)', async (): Promise<void> => {
    let callCount = 0
    server.use(
      http.get('/api/resorts/:slug', (): Response => {
        callCount += 1
        if (callCount === 1) {
          return HttpResponse.json(
            { error: { code: 'workspace-corrupt', message: 'boom' } },
            { status: 500 },
          )
        }
        return HttpResponse.json(makeFullDetail('kotelnica-bialczanska'))
      }),
    )
    await renderAsync(<ResortEditor slug={KOTELNICA} />)
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()

    const user = userEvent.setup()
    await act(async (): Promise<void> => {
      await user.click(screen.getByRole('button', { name: /retry/i }))
      for (let i = 0; i < 20; i += 1) {
        await Promise.resolve()
      }
    })

    expect(screen.getByRole('tablist', { name: 'Editor sections' })).toBeInTheDocument()
    expect(callCount).toBe(2)
  })

  it('renders a generic fallback for unexpected error codes (e.g. internal)', async (): Promise<void> => {
    server.use(
      http.get('/api/resorts/:slug', (): Response =>
        HttpResponse.json(
          { error: { code: 'internal', message: 'boom' } },
          { status: 500 },
        ),
      ),
    )
    await renderAsync(<ResortEditor slug={KOTELNICA} />)
    expect(screen.getByText(/error loading resort: boom/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('wraps non-ApiClientError throws into a generic envelope (defends against unexpected errors)', async (): Promise<void> => {
    const spyGet = vi.spyOn(apiClient, 'getResort').mockImplementation(
      (): Promise<ResortDetailResponse> =>
        Promise.reject(new Error('synthetic boom')),
    )
    // React 19's automatic error logging is noisy here; suppress for this test.
    const spyConsole = vi.spyOn(console, 'error').mockImplementation((): void => undefined)
    try {
      await renderAsync(<ResortEditor slug={KOTELNICA} />)
      expect(screen.getByText(/error loading resort:.*synthetic boom/i)).toBeInTheDocument()
    } finally {
      spyGet.mockRestore()
      spyConsole.mockRestore()
    }
  })

  it('passes jest-axe in the not-found error state', async (): Promise<void> => {
    server.use(
      http.get('/api/resorts/:slug', (): Response =>
        HttpResponse.json(
          { error: { code: 'not-found', message: 'no such slug' } },
          { status: 404 },
        ),
      ),
    )
    const { container } = await renderAsync(<ResortEditor slug={KOTELNICA} />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('passes jest-axe in the workspace-corrupt error state', async (): Promise<void> => {
    server.use(
      http.get('/api/resorts/:slug', (): Response =>
        HttpResponse.json(
          { error: { code: 'workspace-corrupt', message: 'boom' } },
          { status: 500 },
        ),
      ),
    )
    const { container } = await renderAsync(<ResortEditor slug={KOTELNICA} />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('on slug change after an error, the boundary unsticks and re-fetches the new slug (Codex round-1 P2)', async (): Promise<void> => {
    server.use(
      http.get('/api/resorts/:slug', ({ params }): Response => {
        if (params.slug === 'kotelnica-bialczanska') {
          return HttpResponse.json(
            { error: { code: 'not-found', message: 'no such slug' } },
            { status: 404 },
          )
        }
        return HttpResponse.json(makeFullDetail('spindleruv-mlyn'))
      }),
    )
    const { rerender } = await renderAsync(<ResortEditor slug={KOTELNICA} />)
    expect(screen.getByText('Resort not found.')).toBeInTheDocument()

    await act(async (): Promise<void> => {
      rerender(<ResortEditor slug={SPINDLERUV} />)
      for (let i = 0; i < 20; i += 1) {
        await Promise.resolve()
      }
    })

    expect(screen.queryByText('Resort not found.')).toBeNull()
    expect(screen.getByRole('tablist', { name: 'Editor sections' })).toBeInTheDocument()
  })

  it('passes jest-axe in the generic-fallback error state', async (): Promise<void> => {
    server.use(
      http.get('/api/resorts/:slug', (): Response =>
        HttpResponse.json(
          { error: { code: 'internal', message: 'boom' } },
          { status: 500 },
        ),
      ),
    )
    const { container } = await renderAsync(<ResortEditor slug={KOTELNICA} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
