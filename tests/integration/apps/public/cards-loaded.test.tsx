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

// Integration: default cards landing — both seed resorts visible, the
// view toggle's Cards button is pressed, focus order is correct, the
// route is axe-clean. This is the canonical happy-path App render
// against the MSW-served seed dataset.

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

describe('integration: cards route loaded against the seed dataset', (): void => {
  beforeEach((): void => {
    resetDataset()
    __resetShortlistForTests()
    setLocation('')
  })

  afterEach((): void => {
    setLocation('')
  })

  it('renders both seed resort cards (Kotelnica + Špindlerův Mlýn)', async (): Promise<void> => {
    await renderAsync(<App />)
    await screen.findByRole('heading', {
      level: 1,
      name: /compare european ski resorts/i,
    })
    expect(
      screen.getByRole('heading', { level: 2, name: 'Kotelnica Białczańska' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: 'Špindlerův Mlýn' }),
    ).toBeInTheDocument()
  })

  it('shows the ViewToggle with Cards pressed and Matrix not pressed', async (): Promise<void> => {
    await renderAsync(<App />)
    await screen.findByRole('heading', {
      level: 1,
      name: /compare european ski resorts/i,
    })
    expect(
      screen.getByRole('button', { name: 'Cards', pressed: true }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Matrix', pressed: false }),
    ).toBeInTheDocument()
  })

  it('exposes the expected focus order: skip-link → ViewToggle → first card View-details', async (): Promise<void> => {
    await renderAsync(<App />)
    await screen.findByRole('heading', {
      level: 1,
      name: /compare european ski resorts/i,
    })
    // The skip-link is the first focusable element in the document
    // (header-of-document anchor target). The two ViewToggle buttons
    // come next as the cross-route view affordance, then the per-card
    // View-details Buttons appear in card order.
    const skipLink = screen.getByText('Skip to main content')
    const cardsBtn = screen.getByRole('button', { name: 'Cards', pressed: true })
    const matrixBtn = screen.getByRole('button', { name: 'Matrix' })
    const viewDetailsButtons = screen.getAllByRole('button', { name: /view details/i })
    expect(viewDetailsButtons.length).toBeGreaterThanOrEqual(2)
    const firstViewDetails = viewDetailsButtons[0]
    if (firstViewDetails === undefined) {
      throw new Error('Expected at least one View-details button')
    }

    // Document-order assertion: each later element comes after the
    // previous in tree order. Node.compareDocumentPosition returns
    // DOCUMENT_POSITION_FOLLOWING (4) when `arg` follows the receiver.
    function follows(a: Node, b: Node): boolean {
      // a follows b if (b.compareDocumentPosition(a) & FOLLOWING) is set.
      const FOLLOWING = 4
      return (b.compareDocumentPosition(a) & FOLLOWING) === FOLLOWING
    }
    expect(follows(cardsBtn, skipLink)).toBe(true)
    expect(follows(matrixBtn, cardsBtn)).toBe(true)
    expect(follows(firstViewDetails, matrixBtn)).toBe(true)
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
