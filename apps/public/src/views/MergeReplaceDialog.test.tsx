import {
  act,
  render,
  screen,
  type RenderResult,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { Suspense, type JSX, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { __resetForTests } from '../state/useDataset'
import { __resetShortlistForTests } from '../state/useShortlist'

import MergeReplaceDialog from './MergeReplaceDialog'

// Spec §3.5 + plan step 5.6 contract:
//   - Opens when `useShortlist().pendingCollision` is non-null (collision
//     detected on mount).
//   - Renders a `<form onSubmit>` wrapping the action controls so pressing
//     Enter submits the default action (Merge — preserves the most user
//     intent).
//   - Previews the merged shortlist with URL order first, then unique
//     stored extras (matches `setEqual`-driven merge logic in useShortlist).
//   - Three buttons: "Merge", "Replace" (URL wins), "Keep mine" (stored
//     wins).
//   - Built on `<Modal>` so focus-trap + scroll-lock + Escape are inherited.

const STORAGE_KEY = 'sta-shortlist-last-known'

async function renderAsync(node: ReactNode): Promise<RenderResult> {
  let view!: RenderResult
  await act(async (): Promise<void> => {
    view = render(node)
    for (let i = 0; i < 20; i += 1) {
      await Promise.resolve()
    }
  })
  return view
}

function setLocation(search: string): void {
  window.history.replaceState({}, '', `/${search.length > 0 ? `?${search}` : ''}`)
}

function Harness(): JSX.Element {
  return (
    <Suspense fallback={<p>loading</p>}>
      <MergeReplaceDialog />
    </Suspense>
  )
}

describe('MergeReplaceDialog', (): void => {
  beforeEach((): void => {
    __resetForTests()
    __resetShortlistForTests()
    setLocation('')
    window.localStorage.clear()
  })
  afterEach((): void => {
    setLocation('')
    window.localStorage.clear()
    __resetShortlistForTests()
  })

  it('does not render when there is no pending collision', async (): Promise<void> => {
    setLocation('shortlist=kotelnica-bialczanska')
    await renderAsync(<Harness />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens when useShortlist detects a collision on mount', async (): Promise<void> => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(['spindleruv-mlyn']),
    )
    setLocation('shortlist=kotelnica-bialczanska')
    await renderAsync(<Harness />)
    expect(
      screen.getByRole('dialog', { name: /shortlist/i }),
    ).toBeInTheDocument()
  })

  it('does NOT open when URL and LS contain the same set in different order', async (): Promise<void> => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(['spindleruv-mlyn', 'kotelnica-bialczanska']),
    )
    setLocation('shortlist=kotelnica-bialczanska,spindleruv-mlyn')
    await renderAsync(<Harness />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('previews the merged shortlist with URL order first, then unique stored extras', async (): Promise<void> => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(['kotelnica-bialczanska']),
    )
    setLocation('shortlist=spindleruv-mlyn')
    await renderAsync(<Harness />)
    // Look up the preview region — order is preserved.
    const preview = screen.getByTestId('merge-preview')
    const items = preview.querySelectorAll('li')
    expect([...items].map((li): string | null => li.textContent)).toEqual([
      'spindleruv-mlyn',
      'kotelnica-bialczanska',
    ])
  })

  it('Replace button accepts URL and dismisses the dialog', async (): Promise<void> => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(['kotelnica-bialczanska']),
    )
    setLocation('shortlist=spindleruv-mlyn')
    const user = userEvent.setup()
    await renderAsync(<Harness />)
    await user.click(screen.getByRole('button', { name: /replace/i }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(window.location.search).toContain('shortlist=spindleruv-mlyn')
    expect(window.location.search).not.toContain('kotelnica')
  })

  it('Keep mine button writes stored back to URL and dismisses', async (): Promise<void> => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(['kotelnica-bialczanska']),
    )
    setLocation('shortlist=spindleruv-mlyn')
    const user = userEvent.setup()
    await renderAsync(<Harness />)
    await user.click(screen.getByRole('button', { name: /keep mine/i }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(window.location.search).toContain('shortlist=kotelnica-bialczanska')
    expect(window.location.search).not.toContain('spindleruv')
  })

  it('Merge button writes the union and dismisses', async (): Promise<void> => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(['kotelnica-bialczanska']),
    )
    setLocation('shortlist=spindleruv-mlyn')
    const user = userEvent.setup()
    await renderAsync(<Harness />)
    await user.click(screen.getByRole('button', { name: /^merge$/i }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(window.location.search).toContain(
      'shortlist=spindleruv-mlyn,kotelnica-bialczanska',
    )
  })

  it('pressing Enter submits the form (default action = Merge)', async (): Promise<void> => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(['kotelnica-bialczanska']),
    )
    setLocation('shortlist=spindleruv-mlyn')
    const user = userEvent.setup()
    await renderAsync(<Harness />)
    // The dialog renders a <form>; pressing Enter while focus is inside
    // submits it. Default Merge button is `type="submit"`.
    await user.keyboard('{Enter}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(window.location.search).toContain(
      'shortlist=spindleruv-mlyn,kotelnica-bialczanska',
    )
  })

  it('Escape dismisses the dialog and treats it as Replace (URL wins)', async (): Promise<void> => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(['kotelnica-bialczanska']),
    )
    setLocation('shortlist=spindleruv-mlyn')
    const user = userEvent.setup()
    await renderAsync(<Harness />)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(window.location.search).toContain('shortlist=spindleruv-mlyn')
    expect(window.location.search).not.toContain('kotelnica')
  })

  it('is axe-clean when open', async (): Promise<void> => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(['kotelnica-bialczanska']),
    )
    setLocation('shortlist=spindleruv-mlyn')
    const view = await renderAsync(<Harness />)
    expect(await axe(view.container)).toHaveNoViolations()
  })
})
