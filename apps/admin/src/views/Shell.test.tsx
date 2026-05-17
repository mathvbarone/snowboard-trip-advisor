import '@testing-library/jest-dom/vitest'
import { tokens } from '@snowboard-trip-advisor/design-system'
import { ResortSlug } from '@snowboard-trip-advisor/schema'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as flushAllModule from '../state/flushAll'
import { setRoute, __resetForTests as resetURLState } from '../state/useURLState'

import { Shell } from './Shell'
import { RESPONSIVE_CSS } from './Shell.responsive.css'

// Inlined matchMedia stub — keeps the test file self-contained per
// ai-clean-code-adherence §3 (no cross-file shared fixtures).
function stubMatchMedia(matches: boolean): void {
  const mql = {
    matches,
    media: '(min-width: 900px)',
    onchange: null,
    addListener: (): void => undefined,
    removeListener: (): void => undefined,
    addEventListener: (): void => undefined,
    removeEventListener: (): void => undefined,
    dispatchEvent: (): boolean => false,
  } as unknown as MediaQueryList
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql))
}

describe('RESPONSIVE_CSS export shape (Decision H1)', (): void => {
  it('targets max-width: (md-1)px', (): void => {
    const expectedMax = `${(tokens.breakpoint.md - 1).toString()}px`
    expect(RESPONSIVE_CSS).toContain(`@media (max-width: ${expectedMax})`)
  })

  it('hides .app-shell__brand below md', (): void => {
    expect(RESPONSIVE_CSS).toMatch(/\.app-shell__brand\s*\{[^}]*display:\s*none/)
  })

  it('tightens .app-shell__header padding below md', (): void => {
    expect(RESPONSIVE_CSS).toMatch(/\.app-shell__header\s*\{[^}]*padding/)
  })
})

describe('Shell — responsive tab-order discipline (Decision D1)', (): void => {
  afterEach((): void => {
    vi.unstubAllGlobals()
  })

  it('Publish button is NOT disabled above md', (): void => {
    stubMatchMedia(true)
    render(<Shell><div /></Shell>)
    const publish = screen.getByRole('button', { name: 'Publish' })
    expect(publish).not.toBeDisabled()
  })

  it('Publish button IS disabled below md (native disabled, NOT aria-disabled, NOT tabindex)', (): void => {
    stubMatchMedia(false)
    render(<Shell><div /></Shell>)
    const publish = screen.getByRole('button', { name: 'Publish' })
    expect(publish).toBeDisabled()
    expect(publish).not.toHaveAttribute('aria-disabled')
    expect(publish).not.toHaveAttribute('tabindex', '-1')
  })

  it('Account dropdown trigger IS disabled below md', (): void => {
    stubMatchMedia(false)
    render(<Shell><div /></Shell>)
    const account = screen.getByRole('button', { name: 'Account' })
    expect(account).toBeDisabled()
  })

  it('Account dropdown trigger is NOT disabled above md', (): void => {
    stubMatchMedia(true)
    render(<Shell><div /></Shell>)
    const account = screen.getByRole('button', { name: 'Account' })
    expect(account).not.toBeDisabled()
  })
})

describe('Shell — responsive CSS injection (Decision H1)', (): void => {
  afterEach((): void => {
    vi.unstubAllGlobals()
  })

  it('renders the RESPONSIVE_CSS overlay inside a <style> tag', (): void => {
    stubMatchMedia(true)
    const { container } = render(<Shell><div /></Shell>)
    const styleTag = container.querySelector('style')
    expect(styleTag?.textContent).toContain('@media (max-width:')
    expect(styleTag?.textContent).toContain('.app-shell__brand')
  })
})

describe('Shell — composition smoke (mounts ToastProvider + useShortcuts)', (): void => {
  beforeEach((): void => {
    stubMatchMedia(true)
    // Reset URL between tests so the g r assertion sees a deterministic
    // window.location.search starting state.
    window.history.replaceState({}, '', '/')
  })

  afterEach((): void => {
    vi.unstubAllGlobals()
    window.history.replaceState({}, '', '/')
  })

  it('renders without crashing', (): void => {
    render(<Shell><div /></Shell>)
    // Smoke: full keyboard-shortcut behaviour lives in shortcuts.test.ts; here
    // we only verify the Shell-level wiring composes (ToastProvider on the
    // outside so useToast resolves; useShortcuts mounts cleanly).
    expect(screen.getByRole('banner')).toBeInTheDocument()
  })

  it('renders the children inside <main>', (): void => {
    render(<Shell><div data-testid="child" /></Shell>)
    const main = screen.getByRole('main')
    expect(main).toContainElement(screen.getByTestId('child'))
  })

  it('g r → setRoute({ route: "resorts" }) updates window.location.search', async (): Promise<void> => {
    const user = userEvent.setup()
    render(<Shell><div /></Shell>)
    await user.keyboard('g')
    await user.keyboard('r')
    expect(window.location.search).toBe('?route=resorts')
  })

  it('g i → Toast surfaces "Integrations management isn\'t available yet."', async (): Promise<void> => {
    const user = userEvent.setup()
    render(<Shell><div /></Shell>)
    await user.keyboard('g')
    await user.keyboard('i')
    // Toast renders the message in two places (visible UI + sr-only live
    // region) — match both via getAllByText to avoid the multiplicity error.
    await waitFor((): void => {
      expect(screen.getAllByText("Integrations management isn't available yet.").length).toBeGreaterThan(0)
    })
  })

  it('Escape fires as a no-op callback (Phase 1 — Decision G1: Radix Dialog handles modal Escape internally)', async (): Promise<void> => {
    const user = userEvent.setup()
    render(<Shell><div /></Shell>)
    await user.keyboard('{Escape}')
    expect(screen.getByRole('banner')).toBeInTheDocument()
  })

  it('mod+enter is route-aware (PR N.c3): off-route is a no-op; on-route calls flushAllForSlug(slug) — same Shell mount through setRoute', async (): Promise<void> => {
    // The Shell mounts once and stays mounted through the setRoute
    // transition; the route-aware onModEnter closure must read the LATEST
    // route via the useShortcuts handlers-ref pin (lib/shortcuts.ts:66
    // Decision F5). If a future refactor adds a stale dependency array on
    // the document-level keydown listener, this test catches the
    // regression: the first mod+enter (off-route) wouldn't fire
    // flushAllForSlug, but the second mod+enter (post-setRoute) MUST call
    // flushAllForSlug(slug). PR N.c3 switched onModEnter from the direct
    // useWorkspaceState.flushNow(slug) to void flushAllForSlug(route.slug)
    // so EVERY slug-level SlugStore registered into the flushAll.ts registry
    // (useWorkspaceState + useAnalystNoteDraft) flushes on the shortcut.
    const flushAllSpy = vi
      .spyOn(flushAllModule, 'flushAllForSlug')
      .mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<Shell><div /></Shell>)

    // Off-route (dashboard) — mod+enter must NOT call flushAllForSlug.
    await user.keyboard('{Meta>}{Enter}{/Meta}')
    expect(flushAllSpy).not.toHaveBeenCalled()

    // Navigate to the editor route via setRoute (same Shell mount).
    const slug = ResortSlug.parse('kotelnica-bialczanska')
    act((): void => { setRoute({ route: 'editor', slug }) })

    // On-route — mod+enter MUST call flushAllForSlug with the route's slug.
    await user.keyboard('{Meta>}{Enter}{/Meta}')
    expect(flushAllSpy).toHaveBeenCalledTimes(1)
    expect(flushAllSpy).toHaveBeenCalledWith(slug)

    flushAllSpy.mockRestore()
    resetURLState()
  })
})
