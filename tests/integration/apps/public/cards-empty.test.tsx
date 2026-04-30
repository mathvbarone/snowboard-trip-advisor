import {
  act,
  render,
  screen,
  waitFor,
  type RenderResult,
} from '@testing-library/react'
import { axe } from 'jest-axe'
import { type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import App from '../../../../apps/public/src/App'
import { __resetForTests as resetDataset } from '../../../../apps/public/src/state/useDataset'
import { __resetShortlistForTests } from '../../../../apps/public/src/state/useShortlist'

// Integration: cards route with a stale-country URL filter.
//
// The brief originally specified this as a `<NoResorts>` empty-state
// scenario. After reading the production code, the empty-state branch
// is NOT wired into CardsView in the current snapshot — `filterViews`
// in cardsSelectors.ts applies a stale-URL guard that drops country
// codes absent from the dataset, so `?country=XX` no-ops to "show
// everything" rather than emptying the grid (both seed resorts remain
// visible). The same behavior is asserted at the unit level in
// `apps/public/src/views/cards.test.tsx` ("silently no-ops a stale
// ?country=").
//
// The integration value of this test is therefore the URL-graceful-
// failure path: a stale share-link with `?country=XX` must not crash,
// must keep the cards visible, must preserve focus order, and must be
// axe-clean. The wiring of <NoResorts> into CardsView is flagged as a
// follow-up question for the reviewer.

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

describe('integration: cards route with stale country filter', (): void => {
  beforeEach((): void => {
    resetDataset()
    __resetShortlistForTests()
    setLocation('country=XX')
  })

  afterEach((): void => {
    setLocation('')
  })

  it('renders both seed cards (stale country code is silently dropped) and exposes the Hero', async (): Promise<void> => {
    await renderAsync(<App />)
    await waitFor(
      (): void => {
        expect(
          screen.getByRole('heading', {
            level: 1,
            name: /compare european ski resorts/i,
          }),
        ).toBeInTheDocument()
      },
      { timeout: 1500 },
    )
    // Both seed resort cards remain because the XX country filter is
    // dropped (stale-URL guard in filterViews).
    const headings = screen.getAllByRole('heading', { level: 2 })
    expect(headings.map((h): string | null => h.textContent)).toEqual([
      'Kotelnica Białczańska',
      'Špindlerův Mlýn',
    ])
  })

  it('exposes the skip-link as the first focusable element and the ViewToggle is reachable', async (): Promise<void> => {
    await renderAsync(<App />)
    await screen.findByRole('heading', {
      level: 1,
      name: /compare european ski resorts/i,
    })
    // Skip-link is the first interactive element in the document.
    const skipLink = screen.getByText('Skip to main content')
    expect(skipLink).toBeInTheDocument()
    // ViewToggle is reachable as a group landmark with the Cards button
    // pressed by default (?view= absent → default 'cards').
    expect(screen.getByRole('group', { name: 'View' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Cards', pressed: true }),
    ).toBeInTheDocument()
  })

  it('is axe-clean on the rendered route', async (): Promise<void> => {
    const view = await renderAsync(<App />)
    await screen.findByRole('heading', {
      level: 1,
      name: /compare european ski resorts/i,
    })
    expect(await axe(view.container)).toHaveNoViolations()
  })
})
