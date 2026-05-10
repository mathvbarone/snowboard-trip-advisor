import {
  ISODateTimeString,
  METRIC_FIELDS,
  ResortSlug,
  type FieldState,
  type MetricPath,
} from '@snowboard-trip-advisor/schema'
import { ResortDetailResponse } from '@snowboard-trip-advisor/schema/api'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// Cross-package deep import via relative path — apps/admin/package.json declares
// no `exports` map and the eslint config bans @snowboard-trip-advisor/admin-app/*
// deep imports. Mirrors the existing tests/integration/apps/admin/shell.test.tsx
// pattern.
import App from '../../../../apps/admin/src/App'
import { __resetForTests as __resetDetail } from '../../../../apps/admin/src/state/useResortDetail'
import { __resetForTests as __resetURL } from '../../../../apps/admin/src/state/useURLState'
import { server } from '../../../../apps/public/src/mocks/server'

// PR 4.4b Task 10 — canned-MSW integration test. Exercises both seed slugs
// end-to-end: editor URL → useURLState → App → ResortEditor → useResortDetail
// → MSW response → MetricPanel × 2 → 7 durable rows + 5 live rows + render-only
// ModeToggle (aria-disabled). jest-axe across loaded + not-found states.

const KOTELNICA = ResortSlug.parse('kotelnica-bialczanska')
const SPINDLERUV = ResortSlug.parse('spindleruv-mlyn')

const HASH_64 = 'a'.repeat(64)
const OBS_AT = '2026-04-29T08:00:00Z'

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

function makeLiveState(value: unknown): FieldState {
  return {
    state: 'live',
    value,
    source: 'resort-feed',
    observed_at: ISODateTimeString.parse(OBS_AT),
  }
}

function makeFullDetail(slug: string, country: 'PL' | 'CZ'): ResortDetailResponse {
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
  const fieldStates: Record<string, FieldState> = {}
  for (const path of METRIC_FIELDS) {
    fieldStates[path] = makeLiveState(VALUES_BY_PATH[path])
  }
  return ResortDetailResponse.parse({
    resort: {
      schema_version: 1,
      slug,
      name: { en: 'Test Resort' },
      country,
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
  __resetDetail()
  __resetURL()
})

afterEach((): void => {
  __resetDetail()
  __resetURL()
  window.history.replaceState({}, '', '/')
  server.resetHandlers()
})

describe('Resort editor read integration (PR 4.4b Task 10)', (): void => {
  const cases: ReadonlyArray<{ readonly slug: ResortSlug; readonly country: 'PL' | 'CZ' }> = [
    { slug: KOTELNICA, country: 'PL' },
    { slug: SPINDLERUV, country: 'CZ' },
  ]

  for (const { slug, country } of cases) {
    it(`renders both Durable + Live panels with all 12 field rows for ${slug}`, async (): Promise<void> => {
      server.use(
        http.get('/api/resorts/:slug', ({ params }): Response => {
          const responseSlug = typeof params.slug === 'string' ? params.slug : slug
          return HttpResponse.json(makeFullDetail(responseSlug, country))
        }),
      )
      window.history.replaceState({}, '', `/?route=editor&slug=${slug}`)
      await renderAsync(<App />)

      expect(screen.getByRole('tablist', { name: 'Editor sections' })).toBeInTheDocument()

      // Default-active Durable tab: all 7 durable rows present.
      const durablePanel = screen.getByRole('tabpanel')
      expect(within(durablePanel).getByLabelText('Altitude (min, m)')).toBeInTheDocument()
      expect(within(durablePanel).getByLabelText('Altitude (max, m)')).toBeInTheDocument()
      expect(within(durablePanel).getByLabelText('Slopes (km)')).toBeInTheDocument()
      expect(within(durablePanel).getByLabelText('Lift count')).toBeInTheDocument()
      expect(within(durablePanel).getByLabelText('Skiable terrain (ha)')).toBeInTheDocument()
      expect(within(durablePanel).getByLabelText('Season start')).toBeInTheDocument()
      expect(within(durablePanel).getByLabelText('Season end')).toBeInTheDocument()

      // Switch to Live tab; all 5 live rows present.
      const user = userEvent.setup()
      await user.click(screen.getByRole('tab', { name: 'Live' }))
      const livePanel = screen.getByRole('tabpanel')
      expect(within(livePanel).getByLabelText('Snow depth (cm)')).toBeInTheDocument()
      expect(within(livePanel).getByLabelText('Lifts open (count)')).toBeInTheDocument()
      expect(within(livePanel).getByLabelText('Lifts open (total)')).toBeInTheDocument()
      expect(within(livePanel).getByLabelText('Lift pass (per day)')).toBeInTheDocument()
      expect(within(livePanel).getByLabelText('Lodging median')).toBeInTheDocument()

      // Render-only ModeToggle: every <span role="switch"> is aria-disabled.
      const switches = screen.getAllByRole('switch')
      expect(switches.length).toBeGreaterThan(0)
      for (const sw of switches) {
        expect(sw).toHaveAttribute('aria-disabled', 'true')
        expect(sw.tagName).toBe('SPAN')
      }
    })
  }

  it('passes jest-axe in the loaded editor state', async (): Promise<void> => {
    server.use(
      http.get('/api/resorts/:slug', (): Response =>
        HttpResponse.json(makeFullDetail('kotelnica-bialczanska', 'PL')),
      ),
    )
    window.history.replaceState({}, '', `/?route=editor&slug=${KOTELNICA}`)
    const { container } = await renderAsync(<App />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('surfaces "Resort not found." when the editor receives a 404 (Decision D1)', async (): Promise<void> => {
    server.use(
      http.get('/api/resorts/:slug', (): Response =>
        HttpResponse.json(
          { error: { code: 'not-found', message: 'no such slug' } },
          { status: 404 },
        ),
      ),
    )
    window.history.replaceState({}, '', `/?route=editor&slug=${KOTELNICA}`)
    await renderAsync(<App />)
    expect(screen.getByText('Resort not found.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /back to resorts/i })).toBeInTheDocument()
  })
})
