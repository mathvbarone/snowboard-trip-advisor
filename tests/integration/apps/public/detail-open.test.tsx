import {
  act,
  render,
  screen,
  waitFor,
  within,
  type RenderResult,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import App from '../../../../apps/public/src/App'
import { __resetForTests as resetDataset } from '../../../../apps/public/src/state/useDataset'
import { __resetShortlistForTests } from '../../../../apps/public/src/state/useShortlist'

// Integration: cards route with the detail drawer pre-opened via
// ?detail=<slug>. Asserts the cards still render behind the drawer,
// the drawer mounts (Radix DialogTitle with the resort name), the
// drawer carries data-position='right' and data-state='open' on the
// Radix DialogContent, focus returns to a pre-seeded
// data-detail-trigger button on Escape close, and the drawer-open
// container is axe-clean.
//
// The focus-return assertion synthesizes the production focus-restore
// path manually: on a fresh share-link cold start, no card-level
// View-details button has been clicked yet, so the
// previousFocusRef Drawer captures on open is whatever was active on
// the document. We pre-mount a fixture button with
// data-detail-trigger='kotelnica-bialczanska' and focus it BEFORE
// rendering; the Drawer's open-edge effect then captures it and
// restores focus to it on Escape close.

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

describe('integration: detail drawer open via URL', (): void => {
  beforeEach((): void => {
    resetDataset()
    __resetShortlistForTests()
    setLocation('detail=kotelnica-bialczanska')
  })

  afterEach((): void => {
    setLocation('')
  })

  it('renders cards behind the drawer + mounts the drawer with the resort name as the dialog title', async (): Promise<void> => {
    await renderAsync(<App />)
    // Cards are still in the DOM beneath the (non-modal) drawer.
    await screen.findByRole('heading', {
      level: 1,
      name: /compare european ski resorts/i,
    })
    // Drawer dialog with the resort name as accessible name.
    const dialog = await screen.findByRole('dialog', {
      name: 'Kotelnica Białczańska',
    })
    expect(dialog).toBeInTheDocument()
  })

  it('drawer DialogContent carries data-position=right and data-state=open', async (): Promise<void> => {
    await renderAsync(<App />)
    const dialog = await screen.findByRole('dialog', {
      name: 'Kotelnica Białczańska',
    })
    // Radix's DialogContent IS the dialog node — confirm both attrs.
    expect(dialog).toHaveAttribute('data-position', 'right')
    expect(dialog).toHaveAttribute('data-state', 'open')
  })

  it('returns focus to the pre-seeded data-detail-trigger button on Escape close', async (): Promise<void> => {
    // Pre-seed the focus-restore target. In production, the View-details
    // Button on the originating ResortCard carries this attribute (see
    // apps/public/src/views/ResortCard.tsx) and is the active element at
    // the moment the drawer opens. On a share-link cold start there is
    // no prior click, so we synthesize the same condition by mounting a
    // fixture button + focusing it before rendering App.
    const fixture = document.createElement('button')
    fixture.setAttribute('data-detail-trigger', 'kotelnica-bialczanska')
    fixture.textContent = 'View details (fixture)'
    document.body.append(fixture)
    fixture.focus()
    expect(document.activeElement).toBe(fixture)

    await renderAsync(<App />)
    const dialog = await screen.findByRole('dialog', {
      name: 'Kotelnica Białczańska',
    })
    expect(dialog).toBeInTheDocument()

    // Focus the dialog so Radix's Escape handler fires. With
    // `modal={false}` Radix attaches the dismiss listener to the dialog
    // content; focus needs to be inside the panel for `{Escape}` to
    // route there.
    dialog.focus()
    const user = userEvent.setup()
    await user.keyboard('{Escape}')
    await waitFor(
      (): void => {
        expect(
          screen.queryByRole('dialog', { name: 'Kotelnica Białczańska' }),
        ).toBeNull()
      },
      { timeout: 1500 },
    )
    expect(document.activeElement).toBe(fixture)
    fixture.remove()
  })

  it('is axe-clean on the drawer-open container', async (): Promise<void> => {
    const view = await renderAsync(<App />)
    await screen.findByRole('dialog', { name: 'Kotelnica Białczańska' })
    // Run axe against the RTL view.container (the cards subtree)
    // rather than the document body. The drawer renders inside a Radix
    // Portal that mounts as a sibling of view.container in <body>, and
    // Radix's popper-content-wrapper trips axe's `region` rule because
    // it is not contained by a landmark — that's a primitive-level
    // structural artifact, not an integration-route concern. The drawer
    // panel itself is verified for axe-cleanness in the design-system
    // Drawer.test.tsx unit suite. The integration value here is the
    // axe-cleanness of the cards-behind-the-drawer subtree.
    expect(await axe(view.container)).toHaveNoViolations()
    // Sanity: the drawer is in the document while we're asserting; the
    // within(body) guard catches a regression where the drawer fails to
    // mount and the integration assertion silently no-ops.
    expect(within(document.body).queryByRole('dialog')).not.toBeNull()
  })
})
