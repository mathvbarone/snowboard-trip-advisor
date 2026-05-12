import { ListResortsResponse } from '@snowboard-trip-advisor/schema/api'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// Cross-package deep import via relative path — apps/admin/package.json declares
// no `exports` map and the eslint config bans @snowboard-trip-advisor/admin-app/*
// deep imports. Mirrors the existing tests/integration/apps/admin/shell.test.tsx
// pattern.
import App from '../../../../apps/admin/src/App'
import { __resetForTests as resetResortList } from '../../../../apps/admin/src/state/useResortList'
import { __resetForTests as resetURLState } from '../../../../apps/admin/src/state/useURLState'
import { server } from '../../../../apps/public/src/mocks/server'

// PR 4.6b Task 4.6b-2 — canned-tier integration test for the ResortsTable view.
// Mirrors apps/admin/src/views/ResortsTable.tsx's branch table:
//   - error  → ErrorPanel (section role="alert" aria-label="Resorts list error")
//   - null   → ResortsTableSkeleton (section aria-label="Loading resorts")
//   - empty + no filter → ColdStartEmptyState (section aria-label="No resorts to display") per §10.9
//   - empty + filter active → inline "No resorts match the filter" (Select stays mounted)
//   - populated → ResortsTableContent (Select + Table + optional Clear filters)
//
// Cross-cuts:
//   - Sort: Name + "Failed fields" column headers wrap their label in a sort
//     button; click toggles asc → desc → asc (sort indicator " ↑" / " ↓" appended).
//   - Country filter: Select.onChange → setRoute({ route: 'resorts', country }).
//   - Row click: Table.onRowSelect → setRoute({ route: 'editor', slug }). The row
//     header is wrapped in a <button> with the resort name — that button is the
//     keyboard activation target (Table primitive contract).
//   - Clear filters: visible when ?country / ?hasFailures is set; click resets BOTH.

const POPULATED_RESPONSE = ListResortsResponse.parse({
  items: [
    {
      slug: 'kotelnica-bialczanska',
      name: { en: 'Kotelnica Białczańska' },
      country: 'PL',
      last_updated: '2026-04-29T08:00:00Z',
      stale_field_count: 0,
      failed_field_count: 2,
      publish_state: 'published',
    },
    {
      slug: 'spindleruv-mlyn',
      name: { en: 'Špindlerův Mlýn' },
      country: 'CZ',
      last_updated: '2026-04-29T08:00:00Z',
      stale_field_count: 1,
      failed_field_count: 0,
      publish_state: 'published',
    },
  ],
  page: { offset: 0, limit: 50, total: 2 },
})

const EMPTY_RESPONSE = ListResortsResponse.parse({
  items: [],
  page: { offset: 0, limit: 50, total: 0 },
})

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
  resetURLState()
  resetResortList()
  window.history.replaceState({}, '', '/?route=resorts')
})

afterEach((): void => {
  resetURLState()
  resetResortList()
  window.history.replaceState({}, '', '/')
})

describe('ResortsTable integration (PR 4.6b Task 4.6b-2)', (): void => {
  it('cold-start (§10.9): empty list with no filter renders the "No resorts to display" empty state', async (): Promise<void> => {
    server.use(
      http.get('/api/resorts', (): Response => HttpResponse.json(EMPTY_RESPONSE)),
    )
    await renderAsync(<App />)
    expect(
      screen.getByRole('region', { name: 'No resorts to display' }),
    ).toBeInTheDocument()
    // No filter Select rendered in cold-start (Content sub-component is not mounted).
    expect(screen.queryByLabelText('Country')).toBeNull()
  })

  it('populated: renders all rows + the canonical column set', async (): Promise<void> => {
    server.use(
      http.get('/api/resorts', (): Response => HttpResponse.json(POPULATED_RESPONSE)),
    )
    await renderAsync(<App />)
    const tableSection = screen.getByRole('region', { name: 'Resorts' })
    const table = within(tableSection).getByRole('table', { name: 'Resorts list' })
    // Row headers are wrapped in a <button> per the Table primitive's
    // onRowSelect contract — query both names via that button accessible name.
    expect(within(table).getByRole('button', { name: 'Kotelnica Białczańska' })).toBeInTheDocument()
    expect(within(table).getByRole('button', { name: 'Špindlerův Mlýn' })).toBeInTheDocument()
    // Sortable column headers: Name + "Failed fields" wrap their label in a
    // sort button (initial sort key === 'name', dir === 'asc' → " ↑" suffix).
    expect(within(table).getByRole('button', { name: 'Name ↑' })).toBeInTheDocument()
    expect(within(table).getByRole('button', { name: 'Failed fields' })).toBeInTheDocument()
    // Non-sortable column header labels surface as plain text in <th>.
    expect(within(table).getByText('Country')).toBeInTheDocument()
    expect(within(table).getByText('Last updated')).toBeInTheDocument()
    expect(within(table).getByText('Stale fields')).toBeInTheDocument()
    expect(within(table).getByText('Publish state')).toBeInTheDocument()
  })

  // Helper: shape the result of getAllByRole('row') for index-by-position
  // assertions while satisfying @typescript-eslint/no-non-null-assertion.
  // The first body row is at index 1 (index 0 is the <thead> row).
  function getBodyRows(table: HTMLElement): readonly [HTMLElement, HTMLElement] {
    const rows = within(table).getAllByRole('row')
    expect(rows.length).toBeGreaterThanOrEqual(3)
    const [, first, second] = rows
    if (first === undefined || second === undefined) {
      throw new Error('expected at least two body rows')
    }
    return [first, second]
  }

  it('sort: clicking Name toggles asc → desc; Špindlerův now precedes Kotelnica', async (): Promise<void> => {
    server.use(
      http.get('/api/resorts', (): Response => HttpResponse.json(POPULATED_RESPONSE)),
    )
    const user = userEvent.setup()
    await renderAsync(<App />)
    const table = screen.getByRole('table', { name: 'Resorts list' })
    // Initial asc order: Kotelnica row precedes Špindlerův row in DOM order.
    const [ascFirst, ascSecond] = getBodyRows(table)
    expect(within(ascFirst).getByRole('button', { name: 'Kotelnica Białczańska' })).toBeInTheDocument()
    expect(within(ascSecond).getByRole('button', { name: 'Špindlerův Mlýn' })).toBeInTheDocument()
    // Click Name header → flips to desc.
    await user.click(within(table).getByRole('button', { name: 'Name ↑' }))
    // After the click the indicator flips to " ↓"; the rendered Name button now reads "Name ↓".
    expect(within(table).getByRole('button', { name: 'Name ↓' })).toBeInTheDocument()
    const [descFirst, descSecond] = getBodyRows(table)
    expect(within(descFirst).getByRole('button', { name: 'Špindlerův Mlýn' })).toBeInTheDocument()
    expect(within(descSecond).getByRole('button', { name: 'Kotelnica Białczańska' })).toBeInTheDocument()
  })

  it('sort: clicking Failed fields applies a numeric asc sort (Špindlerův 0 before Kotelnica 2)', async (): Promise<void> => {
    server.use(
      http.get('/api/resorts', (): Response => HttpResponse.json(POPULATED_RESPONSE)),
    )
    const user = userEvent.setup()
    await renderAsync(<App />)
    const table = screen.getByRole('table', { name: 'Resorts list' })
    await user.click(within(table).getByRole('button', { name: 'Failed fields' }))
    // The Failed fields header now carries " ↑" (initial asc when switching to a new key).
    expect(within(table).getByRole('button', { name: 'Failed fields ↑' })).toBeInTheDocument()
    const [first, second] = getBodyRows(table)
    // Špindlerův (failed=0) precedes Kotelnica (failed=2).
    expect(within(first).getByRole('button', { name: 'Špindlerův Mlýn' })).toBeInTheDocument()
    expect(within(second).getByRole('button', { name: 'Kotelnica Białczańska' })).toBeInTheDocument()
  })

  it('country filter: changing the Select pushes ?route=resorts&country=PL into the URL', async (): Promise<void> => {
    server.use(
      http.get('/api/resorts', (): Response => HttpResponse.json(POPULATED_RESPONSE)),
    )
    const user = userEvent.setup()
    await renderAsync(<App />)
    // Select.label is "Country"; native <select> is wired by <label>.
    await user.selectOptions(screen.getByLabelText('Country'), 'PL')
    expect(window.location.search).toBe('?route=resorts&country=PL')
  })

  it('row click: clicking the row-header button navigates to ?route=editor&slug=<slug>', async (): Promise<void> => {
    server.use(
      http.get('/api/resorts', (): Response => HttpResponse.json(POPULATED_RESPONSE)),
    )
    const user = userEvent.setup()
    await renderAsync(<App />)
    await user.click(screen.getByRole('button', { name: 'Kotelnica Białczańska' }))
    expect(window.location.search).toBe('?route=editor&slug=kotelnica-bialczanska')
  })

  it('filter-active empty: deep-link with country=PL + empty items renders the inline "No resorts match the filter" message AND keeps the Select mounted', async (): Promise<void> => {
    server.use(
      http.get('/api/resorts', (): Response => HttpResponse.json(EMPTY_RESPONSE)),
    )
    window.history.replaceState({}, '', '/?route=resorts&country=PL')
    await renderAsync(<App />)
    expect(screen.getByText('No resorts match the filter')).toBeInTheDocument()
    // The Select is still in the DOM so the user can clear or change the filter.
    expect(screen.getByLabelText('Country')).toBeInTheDocument()
  })

  it('clear filters: deep-link with hasFailures=true surfaces the "Clear filters" button; click resets BOTH filters in URL', async (): Promise<void> => {
    server.use(
      http.get('/api/resorts', (): Response => HttpResponse.json(POPULATED_RESPONSE)),
    )
    window.history.replaceState({}, '', '/?route=resorts&hasFailures=true')
    const user = userEvent.setup()
    await renderAsync(<App />)
    const clearButton = screen.getByRole('button', { name: 'Clear filters' })
    await user.click(clearButton)
    expect(window.location.search).toBe('?route=resorts')
  })
})
