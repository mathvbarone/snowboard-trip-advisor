import {
  act,
  render,
  screen,
  type RenderResult,
} from '@testing-library/react'
import { axe } from 'jest-axe'
import { type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import App from '../../../../apps/public/src/App'
import { __resetForTests as resetDataset } from '../../../../apps/public/src/state/useDataset'
import { __resetShortlistForTests } from '../../../../apps/public/src/state/useShortlist'

// Integration: matrix route with both seed resorts shortlisted and the
// snow_depth_cm row highlighted via &highlight=. Asserts the table
// renders with the seed resorts as columns, the highlighted row
// carries the Table primitive's data-highlighted="true" passthrough,
// the ViewToggle shows Matrix as pressed, the focus order is correct,
// and the route is axe-clean.
//
// Viewport: useMediaQuery is stubbed at the test-setup level
// (matchMedia returns matches=false for every query), which means the
// matrix's <md redirect path is NOT active in tests — the table
// renders. The redirect path is exercised at the unit level in
// apps/public/src/views/matrix.test.tsx.

async function renderAsync(node: ReactNode): Promise<RenderResult> {
  let view!: RenderResult
  await act(async (): Promise<void> => {
    view = render(node)
    for (let i = 0; i < 10; i += 1) {
      await Promise.resolve()
    }
  })
  return view
}

function setLocation(search: string): void {
  window.history.replaceState({}, '', `/${search.length > 0 ? `?${search}` : ''}`)
}

describe('integration: matrix route with shortlist + highlight', (): void => {
  beforeEach((): void => {
    resetDataset()
    __resetShortlistForTests()
    setLocation('view=matrix&shortlist=kotelnica-bialczanska,spindleruv-mlyn&highlight=snow_depth_cm')
  })

  afterEach((): void => {
    setLocation('')
  })

  it('renders the comparison table with both resorts as columns', async (): Promise<void> => {
    await renderAsync(<App />)
    const table = await screen.findByRole('table')
    expect(table).toBeInTheDocument()
    // Seed resort names appear as column headers.
    expect(
      screen.getByRole('columnheader', { name: 'Kotelnica Białczańska' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('columnheader', { name: 'Špindlerův Mlýn' }),
    ).toBeInTheDocument()
  })

  it('flags the snow_depth_cm row header + cells with data-highlighted="true"', async (): Promise<void> => {
    await renderAsync(<App />)
    await screen.findByRole('table')
    // The Table primitive (packages/design-system) sets
    // data-highlighted="true" on the <th scope="row"> AND on every
    // mirrored data cell when row.highlighted is true. MatrixView sets
    // row.highlighted via `url.highlight === path`, so
    // &highlight=snow_depth_cm flags the matching row. Locate the row
    // header by its visible label "Snow depth (cm)"
    // (METRIC_LABELS['snow_depth_cm']) and assert the attribute lives
    // on the header itself; then walk siblings to assert the cells in
    // the same row are also flagged.
    const snowRowHeader = screen.getByRole('rowheader', { name: 'Snow depth (cm)' })
    expect(snowRowHeader).toHaveAttribute('data-highlighted', 'true')
    const row = snowRowHeader.closest('tr')
    expect(row).not.toBeNull()
    const cells = row?.querySelectorAll('td') ?? []
    expect(cells.length).toBeGreaterThan(0)
    cells.forEach((cell): void => {
      expect(cell).toHaveAttribute('data-highlighted', 'true')
    })
  })

  it('shows the ViewToggle with Matrix pressed and Cards not pressed', async (): Promise<void> => {
    await renderAsync(<App />)
    await screen.findByRole('table')
    expect(
      screen.getByRole('button', { name: 'Matrix', pressed: true }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Cards', pressed: false }),
    ).toBeInTheDocument()
  })

  it('exposes the expected focus order: skip-link → ViewToggle → table', async (): Promise<void> => {
    await renderAsync(<App />)
    const table = await screen.findByRole('table')
    const skipLink = screen.getByText('Skip to main content')
    const matrixBtn = screen.getByRole('button', { name: 'Matrix', pressed: true })

    function follows(a: Node, b: Node): boolean {
      const FOLLOWING = 4
      return (b.compareDocumentPosition(a) & FOLLOWING) === FOLLOWING
    }
    expect(follows(matrixBtn, skipLink)).toBe(true)
    expect(follows(table, matrixBtn)).toBe(true)
  })

  it('is axe-clean on the rendered route', async (): Promise<void> => {
    const view = await renderAsync(<App />)
    await screen.findByRole('table')
    expect(await axe(view.container)).toHaveNoViolations()
  })
})
