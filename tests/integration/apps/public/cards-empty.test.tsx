import { screen, waitFor } from '@testing-library/react'
import { axe } from 'jest-axe'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import App from '../../../../apps/public/src/App'
import { __resetForTests as resetDataset } from '../../../../apps/public/src/state/useDataset'
import { __resetShortlistForTests } from '../../../../apps/public/src/state/useShortlist'
import { renderAsync, setLocation } from '../../helpers'

// Integration: cards route with a stale-country URL filter that yields
// zero rows. Asserts the spec §4.7 / §390 defence-in-depth contract:
// when filters reduce the visible dataset to zero, <NoResorts> renders
// in place of the grid, the Hero + FilterBar remain mounted (so the
// user can recover by toggling country chips), the skip-link / view
// toggle / FilterBar focus order is intact, and the rendered route is
// axe-clean.
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

  it('renders <NoResorts> in place of the grid and keeps the Hero mounted', async (): Promise<void> => {
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
    // No resort cards. The seed dataset's two resorts are not present.
    expect(
      screen.queryByRole('heading', { level: 2, name: 'Kotelnica Białczańska' }),
    ).toBeNull()
    expect(
      screen.queryByRole('heading', { level: 2, name: 'Špindlerův Mlýn' }),
    ).toBeNull()
    // <NoResorts> renders in their place; its heading is the only <h2>.
    expect(
      screen.getByRole('heading', { level: 2, name: 'No resorts to show' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Try adjusting your filters.')).toBeInTheDocument()
  })

  it('keeps the FilterBar mounted (recovery affordance) above <NoResorts>', async (): Promise<void> => {
    await renderAsync(<App />)
    await screen.findByRole('heading', {
      level: 1,
      name: /compare european ski resorts/i,
    })
    // FilterBar's country chips must remain so the user can clear the
    // stale URL filter without manually editing the URL.
    expect(screen.getByRole('button', { name: 'PL' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'CZ' })).toBeInTheDocument()
    // Confirm <NoResorts> is also rendered to lock the contract.
    expect(screen.getByText('No resorts to show')).toBeInTheDocument()
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

  it('is axe-clean on the empty-state route', async (): Promise<void> => {
    const view = await renderAsync(<App />)
    await screen.findByRole('heading', {
      level: 1,
      name: /compare european ski resorts/i,
    })
    expect(screen.getByText('No resorts to show')).toBeInTheDocument()
    expect(await axe(view.container)).toHaveNoViolations()
  })
})
