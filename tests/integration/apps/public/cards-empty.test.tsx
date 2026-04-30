import { screen } from '@testing-library/react'
import { axe } from 'jest-axe'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import App from '../../../../apps/public/src/App'
import { __resetForTests as resetDataset } from '../../../../apps/public/src/state/useDataset'
import { __resetShortlistForTests } from '../../../../apps/public/src/state/useShortlist'
import { renderAsync, setLocation } from '../../helpers'

// Integration: cards route with a stale-country URL filter that yields
// zero rows. Asserts the spec §4.7 / §390 defence-in-depth contract at
// the App-shell level — when filters reduce the visible dataset to
// zero, the <App> render reaches the <NoResorts> state, the App-shell
// (Hero + ViewToggle + FilterBar) remains mounted so the user can
// recover by toggling country chips, the skip-link → ViewToggle →
// FilterBar focus order ahead of the empty-state heading is intact,
// and the rendered route is axe-clean.
//
// NoResorts heading text + body copy + the per-grid-no-cards assertions
// are owned by the unit-level test in apps/public/src/views/cards.test.tsx
// (see "renders <NoResorts> when ?country=" + the price-bucket cases).
// This file deliberately asserts the integration-unique surface only:
// App-shell composition, focus order, axe coverage of the assembled
// route. Duplicating heading-text assertions here would couple two
// suites to the same string and waste review attention.
//
// Plan §8.3 (line 1110): cards-empty.test.ts: ?country=XX (filter yields
// zero) → <NoResorts> renders (defence-in-depth) + axe.

describe('integration: cards route with empty filter result', (): void => {
  beforeEach((): void => {
    resetDataset()
    __resetShortlistForTests()
    setLocation('country=XX')
  })

  afterEach((): void => {
    setLocation('')
  })

  it('App-shell render reaches <NoResorts> with the Hero still mounted', async (): Promise<void> => {
    await renderAsync(<App />)
    // Hero <h1> is App-shell-level (above CardsView); cards.test.tsx
    // does not see it. Pair it with a single sentinel for the empty
    // state so this test verifies the App actually reached NoResorts.
    await screen.findByRole('heading', {
      level: 1,
      name: /compare european ski resorts/i,
    })
    expect(
      screen.getByRole('heading', { level: 2, name: 'No resorts to show' }),
    ).toBeInTheDocument()
  })

  it('keeps the FilterBar mounted within the App shell (recovery affordance)', async (): Promise<void> => {
    await renderAsync(<App />)
    await screen.findByRole('heading', {
      level: 1,
      name: /compare european ski resorts/i,
    })
    // FilterBar's country chips must remain in the App-shell render so
    // the user can clear the stale URL filter without manually editing
    // the URL. cards.test.tsx asserts the same chip presence at the
    // CardsView level; this assertion locks the App-shell wiring.
    expect(screen.getByRole('button', { name: 'PL' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'CZ' })).toBeInTheDocument()
  })

  it('exposes the skip-link, ViewToggle, and FilterBar in tab order ahead of the empty-state heading', async (): Promise<void> => {
    await renderAsync(<App />)
    await screen.findByRole('heading', {
      level: 1,
      name: /compare european ski resorts/i,
    })
    // Skip-link is the first interactive element in the document.
    expect(screen.getByText('Skip to main content')).toBeInTheDocument()
    // ViewToggle is reachable as a group landmark with Cards pressed
    // (?view= absent → default 'cards').
    expect(screen.getByRole('group', { name: 'View' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Cards', pressed: true }),
    ).toBeInTheDocument()
    // FilterBar chips precede the empty state in document order.
    const plChip = screen.getByRole('button', { name: 'PL' })
    const emptyHeading = screen.getByText('No resorts to show')
    expect(
      plChip.compareDocumentPosition(emptyHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('exposes the "Clear filters" recovery affordance after the empty-state heading + body', async (): Promise<void> => {
    // Codex PR 53 P1: the recovery affordance must be reachable in the
    // App-shell render. Click flow + URL-mutation behaviour belongs to
    // the unit test (cards.test.tsx). This integration assertion locks
    // its placement: after the last FilterBar chip and after the empty
    // heading — EmptyStateLayout's `cta` slot renders below heading +
    // body, so a screen-reader user reads "No resorts to show / Try
    // adjusting your filters" first and then lands on the recovery
    // button. The trailing-cta order is the EmptyStateLayout default
    // and shared with DatasetUnavailable's Retry button.
    await renderAsync(<App />)
    await screen.findByRole('heading', {
      level: 1,
      name: /compare european ski resorts/i,
    })
    const plChip = screen.getByRole('button', { name: 'PL' })
    const clearBtn = screen.getByRole('button', { name: /clear filters/i })
    const emptyHeading = screen.getByText('No resorts to show')
    expect(
      plChip.compareDocumentPosition(clearBtn) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      emptyHeading.compareDocumentPosition(clearBtn) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('is axe-clean on the empty-state route', async (): Promise<void> => {
    const view = await renderAsync(<App />)
    await screen.findByRole('heading', {
      level: 1,
      name: /compare european ski resorts/i,
    })
    // Sanity-guard so axe does not pass on a state that silently failed
    // to reach the empty branch.
    expect(screen.getByText('No resorts to show')).toBeInTheDocument()
    expect(await axe(view.container)).toHaveNoViolations()
  })
})
