import { ResortSlug } from '@snowboard-trip-advisor/schema'
import { act, render, screen, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { Suspense, type JSX, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { __resetForTests } from '../state/useDataset'
import { useURLState } from '../state/useURLState'

import DetailDrawer from './detail'

// Test harness mirrors cards.test.tsx — drains microtasks so React 19's
// `use()` Suspense resolves the cached MSW-served dataset within a
// single act() scope.
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

const KOTELNICA_SLUG = ResortSlug.parse('kotelnica-bialczanska')
const SPINDLERUV_SLUG = ResortSlug.parse('spindleruv-mlyn')

// Test harness mirrors App.tsx's mount gate: DetailDrawer is mounted
// only when `?detail=<slug>` is set in the URL. When the drawer's
// onOpenChange handler clears `detail` via setURLState, this Harness
// unmounts the drawer — which fires the focus-restore cleanup inside
// Drawer.tsx (the production-equivalent path; App.tsx does the same).
function Harness({ slug }: { slug: ResortSlug }): JSX.Element | null {
  const url = useURLState()
  if (url.detail !== slug) {
    return null
  }
  return <DetailDrawer slug={slug} />
}

async function renderDrawer(slug: ResortSlug): Promise<RenderResult> {
  setLocation(`detail=${slug}`)
  const view = await renderAsync(
    <Suspense fallback={<p>loading</p>}>
      <Harness slug={slug} />
    </Suspense>,
  )
  // Wait for Suspense to resolve. The drawer's title (resort name) is a
  // stable post-Suspense sentinel.
  await screen.findByRole('dialog', undefined, { timeout: 1500 })
  return view
}

describe('DetailDrawer', (): void => {
  beforeEach((): void => {
    __resetForTests()
    setLocation('')
  })
  afterEach((): void => {
    setLocation('')
  })

  it('mounts with the resort name in the dialog title (Polish characters preserved)', async (): Promise<void> => {
    await renderDrawer(KOTELNICA_SLUG)
    // Radix renders the title prop into a <DialogTitle>. The <h2> we
    // render inside the body is the lang-tagged copy; assert both
    // surfaces show the name.
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Kotelnica Białczańska')
  })

  // The body <h2 lang={lang} aria-hidden="true"> is intentionally hidden
  // from the a11y tree (DialogTitle owns the dialog's accessible name —
  // see detail.tsx for the SR-double-read rationale). `getByRole` would
  // therefore exclude it; we select via the class hook instead.
  function getBodyHeading(): HTMLElement {
    const dialog = screen.getByRole('dialog')
    const tagged = dialog.querySelector<HTMLHeadingElement>(
      'h2.sta-detail-drawer__name',
    )
    if (tagged === null) {
      throw new Error('body heading (.sta-detail-drawer__name) not rendered')
    }
    return tagged
  }

  it('renders the body-level heading with lang="pl" for a PL resort', async (): Promise<void> => {
    await renderDrawer(KOTELNICA_SLUG)
    const heading = getBodyHeading()
    expect(heading.textContent).toBe('Kotelnica Białczańska')
    expect(heading.getAttribute('lang')).toBe('pl')
  })

  it('renders the body-level heading with lang="cs" for a CZ resort', async (): Promise<void> => {
    await renderDrawer(SPINDLERUV_SLUG)
    const heading = getBodyHeading()
    expect(heading.textContent).toBe('Špindlerův Mlýn')
    expect(heading.getAttribute('lang')).toBe('cs')
  })

  it('hides the body-level heading from the a11y tree (single SR read via DialogTitle)', async (): Promise<void> => {
    // DialogTitle is the dialog's accessible name (Radix sets
    // aria-labelledby automatically). The body <h2> carries the visual
    // heading + the BCP 47 lang attribute for browser-level hints, but
    // is aria-hidden so screen readers announce the resort name once,
    // not twice. See the comment block in detail.tsx for the trade-off.
    await renderDrawer(KOTELNICA_SLUG)
    const heading = getBodyHeading()
    expect(heading.getAttribute('aria-hidden')).toBe('true')
    // DialogTitle continues to carry the dialog's accessible name.
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Kotelnica Białczańska')
  })

  it('clears &detail=… from the URL when the drawer closes', async (): Promise<void> => {
    await renderDrawer(KOTELNICA_SLUG)
    expect(window.location.search).toContain('detail=kotelnica-bialczanska')
    // Drive Radix Dialog's onOpenChange(false) directly via the dialog's
    // close button (Radix renders a visually-hidden close button by
    // default? — no, it doesn't on Dialog.Content alone). Instead, focus
    // the dialog and dispatch Escape via userEvent. With `modal={false}`
    // Radix attaches the Escape handler to the dialog content; focus
    // needs to be inside.
    const dialog = screen.getByRole('dialog')
    dialog.focus()
    const user = userEvent.setup()
    await user.keyboard('{Escape}')
    expect(window.location.search).not.toContain('detail=')
  })

  it('returns focus to [data-detail-trigger="<slug>"] on close', async (): Promise<void> => {
    // Plant a trigger element in the DOM with focus before mounting the
    // drawer. The Drawer primitive captures `document.activeElement` on
    // open (a useEffect inside Drawer.tsx) and restores focus when the
    // effect's cleanup runs — driven by `open` flipping to false on
    // Escape.
    const trigger = document.createElement('button')
    trigger.setAttribute('data-detail-trigger', KOTELNICA_SLUG)
    trigger.textContent = 'trigger'
    document.body.appendChild(trigger)
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    await renderDrawer(KOTELNICA_SLUG)
    // Focus the dialog so Radix's Escape handler fires (modal={false}
    // attaches the listener to the dialog content; focus must be inside).
    const dialog = screen.getByRole('dialog')
    dialog.focus()
    const user = userEvent.setup()
    await user.keyboard('{Escape}')
    expect(document.activeElement).toBe(trigger)
    document.body.removeChild(trigger)
  })

  it('is axe-clean in drawer-open state', async (): Promise<void> => {
    const view = await renderDrawer(KOTELNICA_SLUG)
    expect(await axe(view.container)).toHaveNoViolations()
  })

  it('renders the Booking deep-link CTA with encodeURIComponent(name) in the href', async (): Promise<void> => {
    await renderDrawer(KOTELNICA_SLUG)
    const cta = screen.getByRole('link', {
      name: /browse booking\.com near kotelnica białczańska/i,
    })
    const href = cta.getAttribute('href') ?? ''
    expect(href.startsWith('https://www.booking.com/searchresults.html?ss=')).toBe(true)
    expect(href).toContain(encodeURIComponent('Kotelnica Białczańska'))
  })

  it('renders the Airbnb deep-link CTA with encodeURIComponent(name) in the href', async (): Promise<void> => {
    await renderDrawer(KOTELNICA_SLUG)
    const cta = screen.getByRole('link', {
      name: /browse airbnb near kotelnica białczańska/i,
    })
    const href = cta.getAttribute('href') ?? ''
    expect(href.startsWith('https://www.airbnb.com/s/')).toBe(true)
    expect(href).toContain(encodeURIComponent('Kotelnica Białczańska'))
  })

  it('shows the honesty micro-copy covering both Booking and Airbnb below the deep-link CTAs', async (): Promise<void> => {
    await renderDrawer(KOTELNICA_SLUG)
    // Widened from the parent §1 line 131 Booking-only wording to cover
    // the second provider (Airbnb). Disclosure intent ("we may receive
    // a commission") is character-pinned per the parent spec; only the
    // provider list expands. See P1.1 fold rationale.
    const honesty =
      'Opens Booking.com or Airbnb in a new tab. We may receive a commission if you book; this does not affect the data shown.'
    expect(screen.getByText(honesty)).toBeInTheDocument()
  })

  it('every external <a> in the drawer carries rel + referrerpolicy security attrs', async (): Promise<void> => {
    await renderDrawer(KOTELNICA_SLUG)
    const dialog = screen.getByRole('dialog')
    const links = Array.from(dialog.querySelectorAll('a'))
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) {
      expect(link.getAttribute('rel')).toBe('noopener noreferrer')
      expect(link.getAttribute('referrerpolicy')).toBe('no-referrer')
    }
  })

  it('renders the resort name as the body heading regardless of which seed slug is passed', async (): Promise<void> => {
    // App.tsx gates the mount on `slugs.has(url.detail)`; this test
    // exercises the body's slug → resort lookup contract for the second
    // seed resort. (App-level "missing slug" cases are not retested here
    // — they are App.tsx's responsibility.)
    await renderDrawer(SPINDLERUV_SLUG)
    const heading = getBodyHeading()
    expect(heading.textContent).toBe('Špindlerův Mlýn')
  })

  it('returns null (renders nothing) when the slug is not in the dataset', async (): Promise<void> => {
    // Defensive belt-and-braces: App.tsx already gates the mount on
    // `slugs.has(url.detail)` before passing the slug to DetailDrawer,
    // so this branch is not reached in production. Still, the body's
    // explicit `return null` for a missing resort is exercised here so
    // the unreachable-in-practice branch carries 100% coverage and
    // never surfaces as dead code (CLAUDE.md: "if a line cannot be
    // tested, restructure the design instead of suppressing coverage").
    // Render a sentinel sibling so we can assert "Suspense has resolved"
    // by `findByText(sentinel)` — when it appears, DetailDrawer has
    // committed and `screen.queryByRole('dialog')` is meaningful.
    const ghost = ResortSlug.parse('ghost-resort-not-in-dataset')
    setLocation(`detail=${ghost}`)
    await renderAsync(
      <Suspense fallback={<p>loading</p>}>
        <>
          <DetailDrawer slug={ghost} />
          <p data-testid="sentinel">post-suspense</p>
        </>
      </Suspense>,
    )
    await screen.findByTestId('sentinel', undefined, { timeout: 1500 })
    // Suspense has resolved and DetailDrawer's body has run; with no
    // matching resort the body returned null → no dialog committed.
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  // Spec §7.11 acceptance gate names "lazy chunk fetch via MSW request log
  // assertion in detail.test.tsx". This is structurally untestable in
  // JSDOM/Vite-dev: MSW only intercepts handlers registered against fetch
  // URLs; lazy-imported modules are served from Vite's in-process module
  // graph, never via fetch. The bundle-visualizer assertion (detail in its
  // own dist chunk) is the executable surrogate; PR 3.6 wires it into CI
  // (mirrors the pattern matrix.test.tsx already uses for the matrix
  // chunk — see `matrix.test.tsx` "asserts the matrix lazy chunk is fetched
  // on view=matrix navigation (deferred to PR 3.6 dist-chunk smoke)" for
  // the precedent and the surrogate that PR 3.6 will land in
  // `scripts/check-chunks.ts`).
  it.skip('asserts the detail lazy chunk is fetched on detail-drawer open (deferred to PR 3.6 dist-chunk smoke)', (): void => {})
})
