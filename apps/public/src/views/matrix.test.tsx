import { METRIC_FIELDS } from '@snowboard-trip-advisor/schema'
import { act, render, screen, type RenderResult } from '@testing-library/react'
import { axe } from 'jest-axe'
import { Suspense, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { __resetForTests } from '../state/useDataset'
import { __resetShortlistForTests } from '../state/useShortlist'

import MatrixView from './matrix'

// Mirror of cards.test.tsx's renderAsync pattern: drains microtasks so React
// 19 `use()` Suspense resolves the cached MSW-served dataset within a single
// act() scope.
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

async function renderMatrix(): Promise<RenderResult> {
  const view = await renderAsync(
    <Suspense fallback={<p>loading</p>}>
      <MatrixView />
    </Suspense>,
  )
  // Wait for Suspense boundary to resolve. Either the redirect copy, the
  // empty-state copy, or the table-region landmark must materialize.
  await Promise.resolve()
  return view
}

describe('MatrixView', (): void => {
  beforeEach((): void => {
    __resetForTests()
    __resetShortlistForTests()
    setLocation('')
  })
  afterEach((): void => {
    setLocation('')
    __resetShortlistForTests()
    vi.restoreAllMocks()
  })

  it('renders the empty-shortlist EmptyStateLayout with no <table> when shortlist is empty', async (): Promise<void> => {
    await renderMatrix()
    await screen.findByText(/add resorts to compare/i, undefined, { timeout: 1500 })
    expect(
      screen.getByText(/star resorts in cards view to populate the matrix/i),
    ).toBeInTheDocument()
    expect(document.querySelector('table')).toBeNull()
  })

  it('renders the comparison <table> with one column per shortlisted resort', async (): Promise<void> => {
    setLocation('shortlist=kotelnica-bialczanska,spindleruv-mlyn')
    await renderMatrix()
    await screen.findByRole('table', undefined, { timeout: 1500 })
    const dataHeaders = Array.from(
      document.querySelectorAll('thead th[scope="col"]'),
    ).slice(1) // skip the visually-hidden corner cell
    expect(dataHeaders).toHaveLength(2)
    expect(dataHeaders[0]?.textContent).toContain('Kotelnica')
    expect(dataHeaders[1]?.textContent).toContain('Špindlerův')
  })

  it('renders one row per METRIC_FIELDS entry (12 metric rows)', async (): Promise<void> => {
    setLocation('shortlist=kotelnica-bialczanska,spindleruv-mlyn')
    await renderMatrix()
    await screen.findByRole('table', undefined, { timeout: 1500 })
    const rowHeaders = document.querySelectorAll('tbody th[scope="row"]')
    expect(rowHeaders).toHaveLength(METRIC_FIELDS.length)
  })

  it('flags the matching row data-highlighted="true" when &highlight=<field_key>', async (): Promise<void> => {
    setLocation('shortlist=kotelnica-bialczanska&highlight=snow_depth_cm')
    await renderMatrix()
    await screen.findByRole('table', undefined, { timeout: 1500 })
    const rowHeaders = Array.from(
      document.querySelectorAll('tbody th[scope="row"]'),
    )
    const highlighted = rowHeaders.filter(
      (el): boolean => el.getAttribute('data-highlighted') === 'true',
    )
    expect(highlighted).toHaveLength(1)
    expect(highlighted[0]?.textContent ?? '').toMatch(/snow/i)
  })

  it('renders the redirect EmptyState when viewport <md (matchMedia matches)', async (): Promise<void> => {
    // Mock matchMedia to report match=true for the (max-width: 899.98px) query.
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string): MediaQueryList => ({
        matches: query.includes('899.98px'),
        media: query,
        onchange: null,
        addListener: (): void => undefined,
        removeListener: (): void => undefined,
        addEventListener: (): void => undefined,
        removeEventListener: (): void => undefined,
        dispatchEvent: (): boolean => false,
      }),
    )
    setLocation('shortlist=kotelnica-bialczanska,spindleruv-mlyn')
    await renderMatrix()
    await screen.findByText(/matrix view requires a wider screen/i, undefined, { timeout: 1500 })
    // Even with a populated shortlist, no table renders below md.
    expect(document.querySelector('table')).toBeNull()
  })

  it('marks the redirect block with data-region="matrix-redirect" for layout targeting', async (): Promise<void> => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string): MediaQueryList => ({
        matches: query.includes('899.98px'),
        media: query,
        onchange: null,
        addListener: (): void => undefined,
        removeListener: (): void => undefined,
        addEventListener: (): void => undefined,
        removeEventListener: (): void => undefined,
        dispatchEvent: (): boolean => false,
      }),
    )
    await renderMatrix()
    await screen.findByText(/matrix view requires a wider screen/i, undefined, { timeout: 1500 })
    expect(
      document.querySelector('[data-region="matrix-redirect"]'),
    ).not.toBeNull()
  })

  it('marks the table block with data-region="matrix-table" for layout targeting', async (): Promise<void> => {
    setLocation('shortlist=kotelnica-bialczanska')
    await renderMatrix()
    await screen.findByRole('table', undefined, { timeout: 1500 })
    expect(document.querySelector('[data-region="matrix-table"]')).not.toBeNull()
  })

  it('renders fresh-state metric values for the seed fixture (snow depth, lift pass)', async (): Promise<void> => {
    // Sanity check on the per-metric renderer dispatch: the seed dataset
    // populates every METRIC_FIELDS entry, so concrete values like
    // snow_depth_cm=80 + lift_pass_day=€51 should appear in the table body
    // for Kotelnica.
    setLocation('shortlist=kotelnica-bialczanska')
    await renderMatrix()
    await screen.findByRole('table', undefined, { timeout: 1500 })
    // snow_depth_cm row → "80" cell.
    expect(screen.getByText('80')).toBeInTheDocument()
    // lift_pass_day row → "€51" cell (en-GB locale, no decimals).
    expect(screen.getByText('€51')).toBeInTheDocument()
  })

  it('is axe-clean in the empty-shortlist state', async (): Promise<void> => {
    const view = await renderMatrix()
    await screen.findByText(/add resorts to compare/i, undefined, { timeout: 1500 })
    expect(await axe(view.container)).toHaveNoViolations()
  })

  it('is axe-clean in the populated state', async (): Promise<void> => {
    setLocation('shortlist=kotelnica-bialczanska,spindleruv-mlyn')
    const view = await renderMatrix()
    await screen.findByRole('table', undefined, { timeout: 1500 })
    expect(await axe(view.container)).toHaveNoViolations()
  })

  it('is axe-clean in the <md redirect state', async (): Promise<void> => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string): MediaQueryList => ({
        matches: query.includes('899.98px'),
        media: query,
        onchange: null,
        addListener: (): void => undefined,
        removeListener: (): void => undefined,
        addEventListener: (): void => undefined,
        removeEventListener: (): void => undefined,
        dispatchEvent: (): boolean => false,
      }),
    )
    const view = await renderMatrix()
    await screen.findByText(/matrix view requires a wider screen/i, undefined, { timeout: 1500 })
    expect(await axe(view.container)).toHaveNoViolations()
  })

  it('skips unknown shortlist slugs (defence-in-depth against stale URLs)', async (): Promise<void> => {
    // 'unknown-resort' is a syntactically valid slug but absent from the
    // dataset. The matrix should silently drop it rather than throw or
    // render a column with no data.
    setLocation('shortlist=kotelnica-bialczanska,unknown-resort')
    await renderMatrix()
    await screen.findByRole('table', undefined, { timeout: 1500 })
    const dataHeaders = Array.from(
      document.querySelectorAll('thead th[scope="col"]'),
    ).slice(1)
    expect(dataHeaders).toHaveLength(1)
    expect(dataHeaders[0]?.textContent).toContain('Kotelnica')
  })
})
