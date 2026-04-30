import { act, render, screen, within, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { Suspense, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { __resetForTests } from '../state/useDataset'
import { __resetShortlistForTests } from '../state/useShortlist'

import CardsView from './cards'

// Test harness — drains microtasks twice so React 19's `use()` Suspense
// resolves the cached MSW-served dataset within a single act() scope.
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

async function renderCardsView(): Promise<RenderResult> {
  const view = await renderAsync(
    <Suspense fallback={<p>loading</p>}>
      <CardsView />
    </Suspense>,
  )
  // Wait for Suspense to resolve. The Hero <h1> is always present once the
  // dataset has hydrated, regardless of any country / price / sort filter
  // outcome — a stable sentinel for "post-Suspense" in every test below.
  await screen.findByText(/compare european ski resorts/i, undefined, { timeout: 1500 })
  return view
}

describe('CardsView', (): void => {
  beforeEach((): void => {
    __resetForTests()
    __resetShortlistForTests()
    setLocation('')
  })
  afterEach((): void => {
    setLocation('')
    __resetShortlistForTests()
  })

  it('renders the Hero <h1>', async (): Promise<void> => {
    await renderCardsView()
    expect(
      screen.getByRole('heading', { level: 1, name: /compare european ski resorts/i }),
    ).toBeInTheDocument()
  })

  it('renders the FilterBar with country chips for the seed (PL + CZ)', async (): Promise<void> => {
    await renderCardsView()
    expect(screen.getByRole('button', { name: 'PL' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'CZ' })).toBeInTheDocument()
  })

  it('renders one card per seed resort with both names as <h2>', async (): Promise<void> => {
    await renderCardsView()
    expect(
      screen.getByRole('heading', { level: 2, name: 'Kotelnica Białczańska' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: 'Špindlerův Mlýn' }),
    ).toBeInTheDocument()
  })

  it('renders the four named durable + live fields for Kotelnica', async (): Promise<void> => {
    await renderCardsView()
    // altitude_m (durable), slopes_km (durable), snow_depth_cm (live),
    // lift_pass_day (live).
    expect(screen.getByText('770–920 m')).toBeInTheDocument()
    expect(screen.getByText('8 km')).toBeInTheDocument()
    expect(screen.getByText('80 cm')).toBeInTheDocument()
    expect(screen.getByText('€51')).toBeInTheDocument()
  })

  it('renders the four named durable + live fields for Špindlerův Mlýn', async (): Promise<void> => {
    await renderCardsView()
    expect(screen.getByText('715–1,310 m')).toBeInTheDocument()
    expect(screen.getByText('27 km')).toBeInTheDocument()
    expect(screen.getByText('65 cm')).toBeInTheDocument()
    expect(screen.getByText('€60')).toBeInTheDocument()
  })

  it('default sort is alphabetical by name (Kotelnica before Špindlerův)', async (): Promise<void> => {
    await renderCardsView()
    const headings = screen.getAllByRole('heading', { level: 2 })
    expect(headings.map((h): string | null => h.textContent)).toEqual([
      'Kotelnica Białczańska',
      'Špindlerův Mlýn',
    ])
  })

  it('?sort=price_desc reorders cards (Špindlerův €60 before Kotelnica €51)', async (): Promise<void> => {
    setLocation('sort=price_desc')
    await renderCardsView()
    const headings = screen.getAllByRole('heading', { level: 2 })
    expect(headings.map((h): string | null => h.textContent)).toEqual([
      'Špindlerův Mlýn',
      'Kotelnica Białczańska',
    ])
  })

  it('?sort=price_asc reorders cards (Kotelnica €51 before Špindlerův €60)', async (): Promise<void> => {
    setLocation('sort=price_asc')
    await renderCardsView()
    const headings = screen.getAllByRole('heading', { level: 2 })
    expect(headings.map((h): string | null => h.textContent)).toEqual([
      'Kotelnica Białczańska',
      'Špindlerův Mlýn',
    ])
  })

  it('?sort=snow_depth_desc reorders cards (Kotelnica 80cm before Špindlerův 65cm)', async (): Promise<void> => {
    setLocation('sort=snow_depth_desc')
    await renderCardsView()
    const headings = screen.getAllByRole('heading', { level: 2 })
    expect(headings.map((h): string | null => h.textContent)).toEqual([
      'Kotelnica Białczańska',
      'Špindlerův Mlýn',
    ])
  })

  it('cards re-sort LIVE when the sort <Select> changes (no remount)', async (): Promise<void> => {
    await renderCardsView()
    // Initial — alphabetic default.
    const initial = screen
      .getAllByRole('heading', { level: 2 })
      .map((h): string | null => h.textContent)
    expect(initial).toEqual(['Kotelnica Białczańska', 'Špindlerův Mlýn'])

    const user = userEvent.setup()
    await user.selectOptions(
      screen.getByRole('combobox', { name: /sort/i }),
      'price_desc',
    )

    const after = screen
      .getAllByRole('heading', { level: 2 })
      .map((h): string | null => h.textContent)
    expect(after).toEqual(['Špindlerův Mlýn', 'Kotelnica Białczańska'])
    expect(window.location.search).toContain('sort=price_desc')
  })

  it('?country=PL filters cards to PL resorts only', async (): Promise<void> => {
    setLocation('country=PL')
    await renderCardsView()
    expect(
      screen.getByRole('heading', { level: 2, name: 'Kotelnica Białczańska' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { level: 2, name: 'Špindlerův Mlýn' }),
    ).toBeNull()
  })

  it('?country=CZ,PL keeps both resorts (multi-country filter)', async (): Promise<void> => {
    setLocation('country=CZ,PL')
    await renderCardsView()
    expect(
      screen.getByRole('heading', { level: 2, name: 'Kotelnica Białczańska' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: 'Špindlerův Mlýn' }),
    ).toBeInTheDocument()
  })

  it('renders <NoResorts> when ?country= filters the grid to zero rows (defence-in-depth)', async (): Promise<void> => {
    // 'XX' is a syntactically valid ISO-2 string per CountrySchema and is
    // preserved through parseURL, but no seed resort uses it. Strict
    // country filtering returns []; per spec §390, <NoResorts> ships as
    // defence-in-depth for views.length === 0. FilterBar must remain
    // mounted above NoResorts so the user can recover by toggling chips.
    setLocation('country=XX')
    await renderCardsView()
    // No resort cards render. The only <h2> in the subtree is the
    // <NoResorts> empty-state heading from EmptyStateLayout.
    expect(
      screen.queryByRole('heading', { level: 2, name: 'Kotelnica Białczańska' }),
    ).toBeNull()
    expect(
      screen.queryByRole('heading', { level: 2, name: 'Špindlerův Mlýn' }),
    ).toBeNull()
    expect(
      screen.getByRole('heading', { level: 2, name: 'No resorts to show' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Try adjusting your filters.')).toBeInTheDocument()
    // FilterBar (with country chips for the dataset countries) is still
    // visible — that's the recovery affordance.
    expect(screen.getByRole('button', { name: 'PL' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'CZ' })).toBeInTheDocument()
  })

  it('price-bucket Select filters cards by lift_pass_day amount (private filter UX)', async (): Promise<void> => {
    await renderCardsView()
    const user = userEvent.setup()
    // 'lo' bucket is ≤ €40; both seed resorts (€51, €60) are above, so the
    // grid empties and <NoResorts> renders.
    await user.selectOptions(
      screen.getByRole('combobox', { name: /price/i }),
      'lo',
    )
    expect(
      screen.queryByRole('heading', { level: 2, name: 'Kotelnica Białczańska' }),
    ).toBeNull()
    expect(
      screen.queryByRole('heading', { level: 2, name: 'Špindlerův Mlýn' }),
    ).toBeNull()
    expect(
      screen.getByRole('heading', { level: 2, name: 'No resorts to show' }),
    ).toBeInTheDocument()
    // The price bucket is private — never serialized to URL (spec §3.1).
    expect(window.location.search).not.toContain('price')
  })

  it('mid bucket (€40–80) keeps both Kotelnica (€51) and Špindlerův (€60)', async (): Promise<void> => {
    await renderCardsView()
    const user = userEvent.setup()
    await user.selectOptions(
      screen.getByRole('combobox', { name: /price/i }),
      'mid',
    )
    expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(2)
  })

  it('hi bucket (€80+) excludes both seed resorts', async (): Promise<void> => {
    await renderCardsView()
    const user = userEvent.setup()
    await user.selectOptions(
      screen.getByRole('combobox', { name: /price/i }),
      'hi',
    )
    expect(
      screen.queryByRole('heading', { level: 2, name: 'Kotelnica Białczańska' }),
    ).toBeNull()
    expect(
      screen.queryByRole('heading', { level: 2, name: 'Špindlerův Mlýn' }),
    ).toBeNull()
    // <NoResorts> takes over (spec §4.7 / §390 defence-in-depth).
    expect(
      screen.getByRole('heading', { level: 2, name: 'No resorts to show' }),
    ).toBeInTheDocument()
  })

  it('exposes a <main>-shaped landmark with the cards grid', async (): Promise<void> => {
    const view = await renderCardsView()
    // The cards grid is rendered as a list; assert at least one card is
    // inside the rendered tree.
    const list = view.container.querySelector('[data-region="cards-grid"]')
    expect(list).not.toBeNull()
    expect(within(list as HTMLElement).getAllByRole('heading', { level: 2 }))
      .toHaveLength(2)
  })

  it('is axe-clean (default landing)', async (): Promise<void> => {
    const view = await renderCardsView()
    expect(await axe(view.container)).toHaveNoViolations()
  })

  it('is axe-clean when <NoResorts> is rendered for ?country=XX', async (): Promise<void> => {
    setLocation('country=XX')
    const view = await renderCardsView()
    expect(screen.getByText('No resorts to show')).toBeInTheDocument()
    expect(await axe(view.container)).toHaveNoViolations()
  })
})
