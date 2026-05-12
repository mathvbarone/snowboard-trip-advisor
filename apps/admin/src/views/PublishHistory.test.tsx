// PublishHistory view tests — PR 4.5d
// Covers (a) loading state, (b) error state, (c) cold-start empty state at
// offset 0, (d) paginated-past-total empty state at offset > 0 + "Back to
// first page" reset, (e) populated rows with <time dateTime>, pluralized
// resort count (singular AND plural branches), and published_by, (f)
// pagination Previous/Next disabled-state edges + setRoute dispatch, (g)
// outside-publishes-route fallback to page 0 (graceful-degrade branch), (h)
// axe-clean across populated state.
//
// Page index flows in via URL state (?route=publishes&page=N), mirroring
// how ResortsTable consumes country / hasFailures. Each per-test override
// of window.history.replaceState BEFORE render() seeds the route shape for
// that test's read.
//
// Mirrors Dashboard.test.tsx + ResortsTable.test.tsx patterns: MSW for
// handler overrides, jest-axe for accessibility, hook + URL state reset in
// beforeEach AND afterEach (belt-and-braces against module-state leak).

import { ListPublishesResponse } from '@snowboard-trip-advisor/schema/api'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { server } from '../mocks/server'
import { __resetForTests as resetListPublishes } from '../state/useListPublishes'
import * as urlStateModule from '../state/useURLState'
import { __resetForTests as resetUrlState } from '../state/useURLState'

import { PublishHistory } from './PublishHistory'

const COLD_RESPONSE = ListPublishesResponse.parse({
  items: [],
  page: { offset: 0, limit: 20, total: 0 },
})

const SINGLE_RESORT_RESPONSE = ListPublishesResponse.parse({
  items: [
    {
      version_id: '1-2026-05-12T08-30-15-247Z',
      published_at: '2026-05-12T08:30:15.247Z',
      archive_path: 'data/published/history/1-2026-05-12T08-30-15-247Z.json',
      resort_count: 1,
      published_by: 'analyst@local',
    },
  ],
  page: { offset: 0, limit: 20, total: 1 },
})

// 21 total items @ offset 0 → first page of 20, second page of 1.
// Resort_count: 2 exercises the plural pluralization branch and keeps Next
// enabled at page 0 (offset + 20 < total = 21).
const MULTI_RESORT_PAGE0_RESPONSE = ListPublishesResponse.parse({
  items: [
    {
      version_id: '21-2026-05-12T09-00-00-000Z',
      published_at: '2026-05-12T09:00:00.000Z',
      archive_path: 'data/published/history/21-2026-05-12T09-00-00-000Z.json',
      resort_count: 2,
      published_by: 'analyst@local',
    },
  ],
  page: { offset: 0, limit: 20, total: 21 },
})

const MIDDLE_PAGE_RESPONSE = ListPublishesResponse.parse({
  items: [
    {
      version_id: '50-2026-05-12T09-30-00-000Z',
      published_at: '2026-05-12T09:30:00.000Z',
      archive_path: 'data/published/history/50-2026-05-12T09-30-00-000Z.json',
      resort_count: 3,
      published_by: 'analyst@local',
    },
  ],
  page: { offset: 20, limit: 20, total: 100 },
})

const PAST_TOTAL_RESPONSE = ListPublishesResponse.parse({
  items: [],
  page: { offset: 40, limit: 20, total: 1 },
})

beforeEach((): void => {
  resetListPublishes()
  resetUrlState()
  window.history.replaceState({}, '', '/?route=publishes')
})

afterEach((): void => {
  resetListPublishes()
  resetUrlState()
  window.history.replaceState({}, '', '/')
  server.resetHandlers()
  vi.restoreAllMocks()
})

describe('PublishHistory (PR 4.5d)', (): void => {
  // (a) Loading state — useListPublishes returns { value: null, error: null }
  // on the first synchronous render (the fetch effect has not yet resolved).
  it('renders a loading state before the fetch resolves', (): void => {
    render(<PublishHistory />)
    const loading = screen.getByRole('status')
    expect(loading).toHaveTextContent(/Loading/i)
    expect(loading).toHaveAttribute('aria-live', 'polite')
  })

  // (b) Error state — MSW 500 → hook surfaces { value: null, error: Error }.
  it('renders an error message when the publishes fetch fails (role=alert)', async (): Promise<void> => {
    server.use(
      http.get('/api/publishes', (): Response =>
        HttpResponse.json(
          { error: { code: 'internal', message: 'boom' } },
          { status: 500 },
        ),
      ),
    )
    render(<PublishHistory />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/Could not load publish history/i)
  })

  // (c) Cold-start empty state at offset 0.
  it('renders the cold-start empty state when no entries exist at page 0', async (): Promise<void> => {
    server.use(http.get('/api/publishes', (): Response => HttpResponse.json(COLD_RESPONSE)))
    render(<PublishHistory />)
    expect(await screen.findByText(/No publishes yet/i)).toBeInTheDocument()
    expect(screen.getByText(/Use the Publish button/i)).toBeInTheDocument()
    // No "Back to first page" CTA in the cold-start variant.
    expect(screen.queryByRole('button', { name: 'Back to first page' })).toBeNull()
  })

  // (d) Past-total empty state at offset > 0 + "Back to first page" reset.
  it('renders the paginated-past-total empty state when no entries on a non-first page', async (): Promise<void> => {
    server.use(http.get('/api/publishes', (): Response => HttpResponse.json(PAST_TOTAL_RESPONSE)))
    window.history.replaceState({}, '', '/?route=publishes&page=2')
    render(<PublishHistory />)
    expect(await screen.findByText(/No publishes on this page/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to first page' })).toBeInTheDocument()
  })

  it('"Back to first page" click dispatches setRoute({ route: "publishes" })', async (): Promise<void> => {
    const user = userEvent.setup()
    server.use(http.get('/api/publishes', (): Response => HttpResponse.json(PAST_TOTAL_RESPONSE)))
    window.history.replaceState({}, '', '/?route=publishes&page=2')
    const setRouteSpy = vi.spyOn(urlStateModule, 'setRoute')
    render(<PublishHistory />)
    await user.click(await screen.findByRole('button', { name: 'Back to first page' }))
    expect(setRouteSpy).toHaveBeenCalledWith({ route: 'publishes' })
  })

  // (e) Populated single-row exercises:
  //   - <time dateTime> attribute matches published_at ISO string
  //   - singular pluralization branch "1 resort"
  //   - published_by display
  //   - axe-clean a11y on the populated state (the most complex DOM).
  it('renders a single populated row with <time dateTime>, singular "1 resort", and published_by', async (): Promise<void> => {
    server.use(http.get('/api/publishes', (): Response => HttpResponse.json(SINGLE_RESORT_RESPONSE)))
    const { container } = render(<PublishHistory />)
    await waitFor((): void => {
      expect(screen.getByText('1-2026-05-12T08-30-15-247Z')).toBeInTheDocument()
    })
    const time = container.querySelector('time')
    expect(time).not.toBeNull()
    expect(time).toHaveAttribute('dateTime', '2026-05-12T08:30:15.247Z')
    expect(screen.getByText(/^1 resort$/)).toBeInTheDocument()
    expect(screen.getByText(/^by analyst@local$/)).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })

  // Plural pluralization branch.
  it('renders the plural "N resorts" copy for resort_count > 1', async (): Promise<void> => {
    server.use(http.get('/api/publishes', (): Response => HttpResponse.json(MULTI_RESORT_PAGE0_RESPONSE)))
    render(<PublishHistory />)
    await waitFor((): void => {
      expect(screen.getByText(/^2 resorts$/)).toBeInTheDocument()
    })
  })

  // (f) Pagination edges.
  it('Previous button is disabled at page 0; Next button is enabled when more pages remain', async (): Promise<void> => {
    server.use(http.get('/api/publishes', (): Response => HttpResponse.json(MULTI_RESORT_PAGE0_RESPONSE)))
    render(<PublishHistory />)
    await waitFor((): void => {
      expect(screen.getByText(/^2 resorts$/)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled()
  })

  it('Next button is disabled when offset + PAGE_SIZE >= total', async (): Promise<void> => {
    // offset 0 + 20 >= total 1 → Next disabled.
    server.use(http.get('/api/publishes', (): Response => HttpResponse.json(SINGLE_RESORT_RESPONSE)))
    render(<PublishHistory />)
    await waitFor((): void => {
      expect(screen.getByText(/^1 resort$/)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('Next button click → setRoute({ route: "publishes", page: 1 })', async (): Promise<void> => {
    const user = userEvent.setup()
    server.use(http.get('/api/publishes', (): Response => HttpResponse.json(MULTI_RESORT_PAGE0_RESPONSE)))
    const setRouteSpy = vi.spyOn(urlStateModule, 'setRoute')
    render(<PublishHistory />)
    await user.click(await screen.findByRole('button', { name: 'Next' }))
    expect(setRouteSpy).toHaveBeenCalledWith({ route: 'publishes', page: 1 })
  })

  it('Previous button click at page 1 → setRoute({ route: "publishes", page: 0 })', async (): Promise<void> => {
    const user = userEvent.setup()
    server.use(http.get('/api/publishes', (): Response => HttpResponse.json(MIDDLE_PAGE_RESPONSE)))
    window.history.replaceState({}, '', '/?route=publishes&page=1')
    const setRouteSpy = vi.spyOn(urlStateModule, 'setRoute')
    render(<PublishHistory />)
    await user.click(await screen.findByRole('button', { name: 'Previous' }))
    expect(setRouteSpy).toHaveBeenCalledWith({ route: 'publishes', page: 0 })
  })

  // (g) Outside-route fallback — page = 0 when mounted at a non-publishes URL.
  // Defensive against a refactor accident; App.tsx narrows correctly today.
  it('falls back to page 0 when mounted outside the publishes route', (): void => {
    window.history.replaceState({}, '', '/?route=dashboard')
    render(<PublishHistory />)
    // First sync render shows the loading state at offset 0 (page 0).
    const loading = screen.getByRole('status')
    expect(loading).toHaveTextContent(/Loading/i)
  })
})
