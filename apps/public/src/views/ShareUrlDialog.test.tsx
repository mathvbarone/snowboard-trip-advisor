import { Button } from '@snowboard-trip-advisor/design-system'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { useState, type JSX } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setURLState } from '../state/useURLState'

import ShareUrlDialog from './ShareUrlDialog'

// Spec §3.5 + plan step 5.7 contract:
//   - Modal-based dialog. Renders the current URL (with shortlist) so the
//     user can share it.
//   - Happy path: clicking "Copy link" calls navigator.clipboard.writeText
//     with the full URL; a transient success message is shown to confirm.
//   - Fallback path: when navigator.clipboard is undefined (older browsers,
//     non-https contexts), render a readonly text input so the user can
//     manually copy. The input is auto-focused and pre-selected.
//   - Axe-clean.

function setLocation(search: string): void {
  window.history.replaceState({}, '', `/${search.length > 0 ? `?${search}` : ''}`)
}

// Stub ONLY the clipboard getter on navigator, not the entire navigator
// object. The previous `vi.stubGlobal('navigator', { clipboard: undefined })`
// replaced navigator wholesale, which clobbered userEvent v14's keyboard
// polyfills and forced "fallback" tests to dance around that side effect.
// Targeted getter-spy keeps the rest of navigator intact; restoreAllMocks
// in afterEach undoes the spy.
function stubClipboardUndefined(): void {
  vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue(
    // The runtime clipboard property is `Clipboard | undefined`; the DOM
    // typing narrows the getter to `Clipboard`, so cast through unknown.
    undefined as unknown as Clipboard,
  )
}

function Harness({
  initialOpen = true,
}: {
  initialOpen?: boolean
}): JSX.Element {
  const [open, setOpen] = useState<boolean>(initialOpen)
  return (
    <>
      <Button
        onClick={(): void => {
          setOpen(true)
        }}
      >
        Open share
      </Button>
      <ShareUrlDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

describe('ShareUrlDialog', (): void => {
  beforeEach((): void => {
    setLocation('shortlist=kotelnica-bialczanska,spindleruv-mlyn')
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })
  afterEach((): void => {
    setLocation('')
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('does not render when closed', (): void => {
    render(<Harness initialOpen={false} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders the dialog with the current URL when open', (): void => {
    render(<Harness />)
    expect(
      screen.getByRole('dialog', { name: /share/i }),
    ).toBeInTheDocument()
    // The full URL the user would copy: contains the shortlist query.
    expect(
      screen.getByText(/shortlist=kotelnica-bialczanska/),
    ).toBeInTheDocument()
  })

  it('Copy link button calls navigator.clipboard.writeText with the URL', async (): Promise<void> => {
    // Order matters: userEvent.setup() attaches its own clipboard stub via
    // navigator.clipboard. We spy on `writeText` on the spied object AFTER
    // setup so our mock wins.
    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined)
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: /copy link/i }))
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith(window.location.href)
  })

  it('shows a success message after a successful copy', async (): Promise<void> => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: /copy link/i }))
    expect(await screen.findByText(/copied/i)).toBeInTheDocument()
  })

  it('fallback input is marked readOnly so user typing is rejected by the native control (Codex P3)', async (): Promise<void> => {
    // Previously the fallback used a controlled Input with a no-op onChange,
    // which silently discarded user keystrokes — focus + type appeared to
    // work but edits vanished. The fix is `readOnly`: the native control
    // surfaces the read-only affordance to the user (and to assistive tech)
    // and suppresses user-driven input events at the source.
    const user = userEvent.setup()
    stubClipboardUndefined()
    render(<Harness />)
    const input = screen.getByLabelText(/share url/i)
    expect(input).toHaveAttribute('readonly')
    await user.type(input, 'x')
    expect((input as HTMLInputElement).value).toBe(window.location.href)
  })

  it('renders a readonly fallback input when navigator.clipboard is undefined', (): void => {
    // userEvent.setup polyfills navigator.clipboard for click-side support;
    // we model "no clipboard support" by stubbing only the navigator
    // .clipboard getter (helper above). afterEach's vi.restoreAllMocks
    // undoes the spy.
    stubClipboardUndefined()
    render(<Harness />)
    // Fallback: a text-input control showing the URL. The user copies
    // manually (Cmd/Ctrl+C on the pre-selected text).
    const input = screen.getByLabelText(/share url/i)
    expect(input).toBeInTheDocument()
    expect(input).toHaveAttribute('readonly')
    expect((input as HTMLInputElement).value).toBe(window.location.href)
    // The clipboard button is NOT rendered when the API is unavailable —
    // the fallback path replaces it.
    expect(
      screen.queryByRole('button', { name: /copy link/i }),
    ).toBeNull()
  })

  it('shows an error message when the clipboard write rejects', async (): Promise<void> => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(
      new Error('permission denied'),
    )
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: /copy link/i }))
    expect(
      await screen.findByText(/couldn't copy/i),
    ).toBeInTheDocument()
  })

  it('is axe-clean when open with the clipboard API available', async (): Promise<void> => {
    // userEvent.setup attaches a clipboard stub; spy after setup.
    const user = userEvent.setup()
    void user
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    const view = render(<Harness />)
    expect(await axe(view.container)).toHaveNoViolations()
  })

  it('is axe-clean when open in clipboard-fallback mode', async (): Promise<void> => {
    // Targeted clipboard-only stub (helper above) — keeps the rest of
    // navigator (and userEvent's polyfills) intact.
    stubClipboardUndefined()
    const view = render(<Harness />)
    expect(await axe(view.container)).toHaveNoViolations()
  })

  it('Escape dismisses the dialog', async (): Promise<void> => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('displayed url updates when the URL state changes while open', (): void => {
    // Reviewer's SUGGESTION: ShareUrlDialog used to read window.location.href
    // on every render but did not subscribe to URL changes — the dialog only
    // re-rendered if some other state change happened to push it. Now the
    // dialog reads from useURLState() so URL transitions while the dialog is
    // open update the displayed share link without depending on a parent
    // re-render.
    render(<Harness />)
    expect(
      screen.getByText(/shortlist=kotelnica-bialczanska/),
    ).toBeInTheDocument()
    act((): void => {
      setURLState({ shortlist: ['spindleruv-mlyn'] })
    })
    expect(screen.getByText(/shortlist=spindleruv-mlyn/)).toBeInTheDocument()
    expect(
      screen.queryByText(/shortlist=kotelnica-bialczanska/),
    ).toBeNull()
  })

  it('resets copyState to idle when the dialog is reopened after a copy', async (): Promise<void> => {
    // Reviewer's SUGGESTION: ShareUrlDialog is mounted unconditionally by
    // App.tsx (only Radix's Content unmounts on close), so a top-level
    // useState in the dialog persists across open/close cycles. Without an
    // explicit reset, "Copied!" leaks into the next open.
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: /copy link/i }))
    expect(await screen.findByText(/copied/i)).toBeInTheDocument()
    // Close via Escape, then reopen via the Harness's "Open share" button.
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    await user.click(screen.getByRole('button', { name: /open share/i }))
    expect(screen.getByRole('dialog', { name: /share/i })).toBeInTheDocument()
    // The "Copied!" feedback must NOT carry over from the previous session.
    expect(screen.queryByText(/copied/i)).toBeNull()
  })
})
