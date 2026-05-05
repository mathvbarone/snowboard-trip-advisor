// ResortsTable view tests — PR 4.3 §2.4
// Covers (a) loading state, (b) populated table with the 6 visible columns,
// (c) cold-start empty state with §10.9 pointer + filtered-empty variant,
// (d) sort by name and by failed_field_count via column-header click,
// (e) country filter via Select dropdown drives the useResortList query,
// (f) row-click pushes the editor route to URL state,
// (g) axe-clean across loading, populated, and cold-start states.
//
// Mirrors Dashboard.test.tsx patterns: MSW for handler overrides, jest-axe
// for accessibility, in-flight cache reset in beforeEach/afterEach.

import { ListResortsResponse } from '@snowboard-trip-advisor/schema/api'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { axe } from 'jest-axe'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { server } from '../mocks/server'
import { __resetForTests as resetResortList } from '../state/useResortList'
import * as urlStateModule from '../state/useURLState'
import { __resetForTests as resetUrlState } from '../state/useURLState'

import { ResortsTable } from './ResortsTable'

// Two fixture resorts that exercise the sort orderings: 'aurora-peak' (PL,
// failed=2) sorts BEFORE 'zermatt-test' (CH, failed=5) by name ASC; flip on
// failed_field_count ASC and aurora still wins. We need a contrast on at
// least one of the two sort keys to assert order changes after click.
const FIXTURE_ITEMS = [
  {
    slug: 'zermatt-test',
    name: { en: 'Zermatt Test' },
    country: 'CH',
    last_updated: '2026-04-26T08:00:00Z',
    stale_field_count: 1,
    failed_field_count: 5,
    publish_state: 'published',
  },
  {
    slug: 'aurora-peak',
    name: { en: 'Aurora Peak' },
    country: 'PL',
    last_updated: '2026-04-25T08:00:00Z',
    stale_field_count: 0,
    failed_field_count: 2,
    publish_state: 'draft',
  },
] as const

const FIXTURE_RESPONSE = ListResortsResponse.parse({
  items: FIXTURE_ITEMS,
  page: { offset: 0, limit: 50, total: FIXTURE_ITEMS.length },
})

beforeEach((): void => {
  resetResortList()
  resetUrlState()
  window.history.replaceState({}, '', '/?route=resorts')
})

afterEach((): void => {
  resetResortList()
  resetUrlState()
  window.history.replaceState({}, '', '/')
  server.resetHandlers()
  vi.restoreAllMocks()
})

describe('ResortsTable (PR 4.3 §2.4)', (): void => {
  // ---------------------------------------------------------------------------
  // (a) Loading state — skeleton placeholder before the fetch resolves
  // ---------------------------------------------------------------------------
  it('renders a loading skeleton before the fetch resolves', async (): Promise<void> => {
    const { container } = render(<ResortsTable />)

    // Skeleton placeholders share the role="status" + aria-busy="true"
    // ARIA pattern from Dashboard's DashboardSkeleton.
    const skeletons = screen.getAllByRole('status')
    expect(skeletons.length).toBeGreaterThan(0)
    expect(skeletons[0]).toHaveAttribute('aria-busy', 'true')

    // axe (g) — loading state
    expect(await axe(container)).toHaveNoViolations()
  })

  // ---------------------------------------------------------------------------
  // (a2) Error state — renders ErrorPanel when the fetch fails.
  // ---------------------------------------------------------------------------
  it('renders an error message when the resorts fetch fails', async (): Promise<void> => {
    server.use(
      http.get('/api/resorts', (): Response =>
        HttpResponse.json(
          { error: { code: 'internal', message: 'test error' } },
          { status: 500 },
        ),
      ),
    )

    const { container } = render(<ResortsTable />)

    await waitFor((): void => {
      expect(screen.getByText(/failed to load resorts/i)).toBeInTheDocument()
    })

    // axe (g) — error state
    expect(await axe(container)).toHaveNoViolations()
  })

  // ---------------------------------------------------------------------------
  // (b) Populated state — 1 row per ResortSummary with the 6 visible columns:
  // name (row header) + country + last_updated + stale_field_count +
  // failed_field_count + publish_state. Plus axe-clean on the populated state.
  // ---------------------------------------------------------------------------
  it('renders 1 row per ResortSummary with the 6 visible columns', async (): Promise<void> => {
    server.use(
      http.get('/api/resorts', (): Response => HttpResponse.json(FIXTURE_RESPONSE)),
    )

    const { container } = render(<ResortsTable />)

    await waitFor((): void => {
      expect(screen.getByText('Aurora Peak')).toBeInTheDocument()
    })

    // 6 columns visible: Name, Country, Last updated, Stale fields,
    // Failed fields, Publish state. The name column uses the row-header
    // corner-cell label "Resort", so column count above the corner is 5
    // (Country / Last updated / Stale fields / Failed fields / Publish state).
    expect(screen.getByRole('columnheader', { name: /country/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /last updated/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /stale fields/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /failed fields/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /publish state/i })).toBeInTheDocument()

    // The name column header is rendered as a sortable button — its
    // accessible name lives inside the <Button>. Hidden corner-cell label
    // is "Resort" (rowHeaderLabel prop).
    expect(screen.getByRole('button', { name: /^name/i })).toBeInTheDocument()
    // The leftmost column-header has the visually-hidden "Resort" label.
    expect(screen.getByText('Resort')).toBeInTheDocument()

    // 2 data rows — both fixtures.
    expect(screen.getByRole('rowheader', { name: 'Aurora Peak' })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: 'Zermatt Test' })).toBeInTheDocument()

    // Country / failed-field-count / publish-state values rendered.
    const auroraRow = screen.getByRole('rowheader', { name: 'Aurora Peak' }).closest('tr')
    expect(auroraRow).not.toBeNull()
    if (auroraRow !== null) {
      const auroraScope = within(auroraRow)
      expect(auroraScope.getByText('PL')).toBeInTheDocument()
      // failed_field_count = 2
      expect(auroraScope.getByText('2')).toBeInTheDocument()
      expect(auroraScope.getByText(/draft/i)).toBeInTheDocument()
    }

    // axe (g) — populated state
    expect(await axe(container)).toHaveNoViolations()
  })

  // ---------------------------------------------------------------------------
  // (c) Empty state — cold-start variant with §10.9 pointer
  // ---------------------------------------------------------------------------
  it('renders cold-start empty-state with §10.9 pointer when no resorts and no filter', async (): Promise<void> => {
    // Default canned handler returns items: [] — use it as-is. URL has no
    // country filter (set in beforeEach).
    const { container } = render(<ResortsTable />)

    await waitFor((): void => {
      expect(screen.getByText(/no resorts to display/i)).toBeInTheDocument()
    })

    // §10.9 pointer + manual-creation hint
    expect(screen.getByText(/§10\.9/)).toBeInTheDocument()
    expect(screen.getByText(/data\/admin-workspace/)).toBeInTheDocument()

    // axe (g) — cold-start state
    expect(await axe(container)).toHaveNoViolations()
  })

  // (c2) Filtered-empty variant — distinct from cold-start. When a country
  // filter is active and the response is empty, the message points to
  // clearing the filter, NOT the §10.9 manual-creation steps.
  it('renders filtered-empty variant when a country filter yields no results', async (): Promise<void> => {
    window.history.replaceState({}, '', '/?route=resorts&country=PL')
    server.use(
      http.get('/api/resorts', (): Response =>
        HttpResponse.json(
          ListResortsResponse.parse({
            items: [],
            page: { offset: 0, limit: 50, total: 0 },
          }),
        ),
      ),
    )

    render(<ResortsTable />)

    await waitFor((): void => {
      expect(screen.getByText(/no resorts match the filter/i)).toBeInTheDocument()
    })

    // §10.9 pointer is NOT shown in the filtered-empty variant — that text
    // belongs to the cold-start path.
    expect(screen.queryByText(/§10\.9/)).not.toBeInTheDocument()

    // Codex round-2 fold: the country Select MUST stay mounted in the
    // filtered-empty branch so the user can clear or change the filter from
    // within the view (without editing the URL bar by hand). Pin both:
    // (1) the Select is present, and (2) it carries the URL country PL even
    // though items[] is empty (the dropdown options union the URL country
    // with the loaded items' countries).
    const select = screen.getByLabelText(/country/i)
    expect(select).toBeInTheDocument()
    expect((select as HTMLSelectElement).value).toBe('PL')
    expect(within(select).getByRole('option', { name: 'PL' })).toBeInTheDocument()
  })

  // (c3) hasFailures filter from the URL is forwarded into the useResortList
  // query (Codex round-2 fold). Without this wiring, deep links like
  // ?route=resorts&hasFailures=true would be parsed but silently ignored.
  it('forwards hasFailures from the URL into the listResorts query', async (): Promise<void> => {
    window.history.replaceState({}, '', '/?route=resorts&hasFailures=true')
    // Object holder so the closure-side mutation isn't lost to TS flow
    // narrowing (a `let captured: string | null = null` would be typed as
    // `null` outside the closure, tripping no-unnecessary-condition).
    const captured: { search: string | null } = { search: null }
    server.use(
      http.get('/api/resorts', ({ request }): Response => {
        captured.search = new URL(request.url).search
        return HttpResponse.json(FIXTURE_RESPONSE)
      }),
    )

    render(<ResortsTable />)

    await waitFor((): void => {
      expect(captured.search).not.toBeNull()
    })

    // apiClient.serializeQuery JSON-stringifies values, so the wire form
    // for filter is filter={"hasFailures":true} (URL-encoded).
    const params = new URLSearchParams(captured.search ?? '')
    const filterRaw = params.get('filter')
    expect(filterRaw).not.toBeNull()
    const parsed = JSON.parse(filterRaw ?? '{}') as { hasFailures?: boolean; country?: string }
    expect(parsed.hasFailures).toBe(true)
  })

  // (c4) hasFailures is preserved when the country dropdown changes
  // (Codex round-2 fold). A deep link with both filters must keep the
  // hasFailures filter through dropdown interactions on country.
  it('preserves hasFailures when the country dropdown changes', async (): Promise<void> => {
    window.history.replaceState({}, '', '/?route=resorts&country=PL&hasFailures=true')
    server.use(
      http.get('/api/resorts', (): Response => HttpResponse.json(FIXTURE_RESPONSE)),
    )

    const setRouteSpy = vi.spyOn(urlStateModule, 'setRoute')

    render(<ResortsTable />)

    await waitFor((): void => {
      expect(screen.getByRole('rowheader', { name: 'Aurora Peak' })).toBeInTheDocument()
    })

    const select = screen.getByLabelText(/country/i)
    fireEvent.change(select, { target: { value: '' } })

    expect(setRouteSpy).toHaveBeenCalledWith({
      route: 'resorts',
      hasFailures: true,
    })
  })

  // (c5) Clear-filters button — Codex round-4 P2: with a hasFailures-only
  // deep link there is no in-view control to drop the failures filter
  // (country dropdown only carries it). The button surfaces only when at
  // least one filter is active and resets BOTH at once.
  it('does NOT render the Clear-filters button when no filter is active', async (): Promise<void> => {
    server.use(
      http.get('/api/resorts', (): Response => HttpResponse.json(FIXTURE_RESPONSE)),
    )

    render(<ResortsTable />)

    await waitFor((): void => {
      expect(screen.getByRole('rowheader', { name: 'Aurora Peak' })).toBeInTheDocument()
    })

    expect(screen.queryByRole('button', { name: /clear filters/i })).toBeNull()
  })

  it('renders the Clear-filters button when a country filter is active', async (): Promise<void> => {
    window.history.replaceState({}, '', '/?route=resorts&country=PL')
    server.use(
      http.get('/api/resorts', (): Response => HttpResponse.json(FIXTURE_RESPONSE)),
    )

    render(<ResortsTable />)

    await waitFor((): void => {
      expect(screen.getByRole('rowheader', { name: 'Aurora Peak' })).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument()
  })

  it('Clear-filters button drops both country AND hasFailures at once', async (): Promise<void> => {
    window.history.replaceState({}, '', '/?route=resorts&country=PL&hasFailures=true')
    server.use(
      http.get('/api/resorts', (): Response => HttpResponse.json(FIXTURE_RESPONSE)),
    )

    const setRouteSpy = vi.spyOn(urlStateModule, 'setRoute')

    render(<ResortsTable />)

    await waitFor((): void => {
      expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }))

    expect(setRouteSpy).toHaveBeenCalledWith({ route: 'resorts' })
  })

  it('Clear-filters button surfaces on a hasFailures-only deep link (no country)', async (): Promise<void> => {
    window.history.replaceState({}, '', '/?route=resorts&hasFailures=true')
    server.use(
      http.get('/api/resorts', (): Response => HttpResponse.json(FIXTURE_RESPONSE)),
    )

    render(<ResortsTable />)

    await waitFor((): void => {
      expect(screen.getByRole('rowheader', { name: 'Aurora Peak' })).toBeInTheDocument()
    })

    // The country dropdown alone could not drop hasFailures (it preserves
    // the flag); the Clear-filters button is the recovery path.
    expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument()
  })

  // ---------------------------------------------------------------------------
  // (d) Sort — clicking the Name column header toggles the row order;
  // clicking the Failed-fields column header sorts by failed_field_count.
  // ---------------------------------------------------------------------------
  it('sorts rows by name ASC by default, toggles to DESC on column-header click', async (): Promise<void> => {
    server.use(
      http.get('/api/resorts', (): Response => HttpResponse.json(FIXTURE_RESPONSE)),
    )

    render(<ResortsTable />)

    await waitFor((): void => {
      expect(screen.getByRole('rowheader', { name: 'Aurora Peak' })).toBeInTheDocument()
    })

    // Default sort: name ASC → Aurora before Zermatt.
    const rowheadersAsc = screen.getAllByRole('rowheader')
    expect(rowheadersAsc[0]?.textContent).toBe('Aurora Peak')
    expect(rowheadersAsc[1]?.textContent).toBe('Zermatt Test')

    // Click the Name sort button — toggles to DESC.
    const nameSortBtn = screen.getByRole('button', { name: /^name/i })
    fireEvent.click(nameSortBtn)

    const rowheadersDesc = screen.getAllByRole('rowheader')
    expect(rowheadersDesc[0]?.textContent).toBe('Zermatt Test')
    expect(rowheadersDesc[1]?.textContent).toBe('Aurora Peak')
  })

  it('sorts rows by failed_field_count when its column header is clicked', async (): Promise<void> => {
    server.use(
      http.get('/api/resorts', (): Response => HttpResponse.json(FIXTURE_RESPONSE)),
    )

    render(<ResortsTable />)

    await waitFor((): void => {
      expect(screen.getByRole('rowheader', { name: 'Aurora Peak' })).toBeInTheDocument()
    })

    // Click Failed-fields sort button — ASC → aurora (2) before zermatt (5).
    const failedBtn = screen.getByRole('button', { name: /^failed fields/i })
    fireEvent.click(failedBtn)

    const rowheadersAsc = screen.getAllByRole('rowheader')
    expect(rowheadersAsc[0]?.textContent).toBe('Aurora Peak')
    expect(rowheadersAsc[1]?.textContent).toBe('Zermatt Test')

    // Second click → DESC.
    fireEvent.click(failedBtn)
    const rowheadersDesc = screen.getAllByRole('rowheader')
    expect(rowheadersDesc[0]?.textContent).toBe('Zermatt Test')
    expect(rowheadersDesc[1]?.textContent).toBe('Aurora Peak')

    // Third click → back to ASC (covers the desc → asc branch of the
    // toggle ternary).
    fireEvent.click(failedBtn)
    const rowheadersAsc2 = screen.getAllByRole('rowheader')
    expect(rowheadersAsc2[0]?.textContent).toBe('Aurora Peak')
    expect(rowheadersAsc2[1]?.textContent).toBe('Zermatt Test')
  })

  // ---------------------------------------------------------------------------
  // (e) Country filter — selecting a country dispatches setRoute with the
  // resorts route + parsed (branded) country code. The setRoute → useURLState
  // round-trip is exercised by useURLState's own test suite; this view-level
  // test pins that the Select change is forwarded into the route writer with
  // the right shape (resorts route, branded ISOCountryCode).
  // ---------------------------------------------------------------------------
  it('forwards the Select change into setRoute with a branded country code', async (): Promise<void> => {
    server.use(
      http.get('/api/resorts', (): Response => HttpResponse.json(FIXTURE_RESPONSE)),
    )

    const setRouteSpy = vi.spyOn(urlStateModule, 'setRoute')

    render(<ResortsTable />)

    await waitFor((): void => {
      expect(screen.getByRole('rowheader', { name: 'Aurora Peak' })).toBeInTheDocument()
    })

    // The country Select is built from the loaded items' unique country
    // codes (CH, PL) plus the "All countries" placeholder.
    const select = screen.getByLabelText(/country/i)
    fireEvent.change(select, { target: { value: 'PL' } })

    expect(setRouteSpy).toHaveBeenCalledWith({
      route: 'resorts',
      country: 'PL',
    })
  })

  // (e2) Clearing the filter — selecting "All countries" emits the resorts
  // route with no country field at all (exactOptionalPropertyTypes forbids
  // an explicit `undefined`).
  it('clears the country filter when "All countries" is selected', async (): Promise<void> => {
    window.history.replaceState({}, '', '/?route=resorts&country=PL')
    server.use(
      http.get('/api/resorts', (): Response => HttpResponse.json(FIXTURE_RESPONSE)),
    )

    const setRouteSpy = vi.spyOn(urlStateModule, 'setRoute')

    render(<ResortsTable />)

    await waitFor((): void => {
      expect(screen.getByRole('rowheader', { name: 'Aurora Peak' })).toBeInTheDocument()
    })

    const select = screen.getByLabelText(/country/i)
    fireEvent.change(select, { target: { value: '' } })

    expect(setRouteSpy).toHaveBeenCalledWith({ route: 'resorts' })
  })

  // ---------------------------------------------------------------------------
  // (f) Row click — pushes the editor route to URL state via setRoute.
  // ---------------------------------------------------------------------------
  it('pushes the editor route to URL state when a row is clicked', async (): Promise<void> => {
    server.use(
      http.get('/api/resorts', (): Response => HttpResponse.json(FIXTURE_RESPONSE)),
    )

    const setRouteSpy = vi.spyOn(urlStateModule, 'setRoute')

    render(<ResortsTable />)

    await waitFor((): void => {
      expect(screen.getByRole('rowheader', { name: 'Aurora Peak' })).toBeInTheDocument()
    })

    // Click the Aurora row — the Table primitive marks each <tr> with
    // role="button" + onClick when onRowSelect is wired.
    const auroraRowheader = screen.getByRole('rowheader', { name: 'Aurora Peak' })
    const auroraRow = auroraRowheader.closest('tr')
    expect(auroraRow).not.toBeNull()
    if (auroraRow !== null) {
      fireEvent.click(auroraRow)
    }

    expect(setRouteSpy).toHaveBeenCalledWith({
      route: 'editor',
      slug: 'aurora-peak',
    })
  })
})
