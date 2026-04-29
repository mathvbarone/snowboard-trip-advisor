import { Button, HeaderBar } from '@snowboard-trip-advisor/design-system'
import {
  act,
  render,
  screen,
  type RenderResult,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { Suspense, useState, type JSX, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { __resetForTests } from '../state/useDataset'
import { __resetShortlistForTests } from '../state/useShortlist'

import ShortlistDrawer from './ShortlistDrawer'

// Spec §7.9 + plan step 5.5 contract:
//   - Drawer renders the names of the slugs in `useShortlist().shortlist`.
//   - Per-row `<IconButton>` removes the slug.
//   - "Open Matrix" CTA at the foot. Hidden `<md` (the matrix view itself
//     redirects below `md` per §7.10) — and removed from the tab order, not
//     just visually hidden, when below the breakpoint.
//   - Trigger lives in HeaderBar's `shortlistSlot`. The drawer takes
//     controlled `open` / `onOpenChange` props so PR 3.4's Shell wiring
//     can compose it in without amendment.

async function flushSuspense(): Promise<void> {
  await act(async (): Promise<void> => {
    for (let i = 0; i < 20; i += 1) {
      await Promise.resolve()
    }
  })
}

async function renderAsync(node: ReactNode): Promise<RenderResult> {
  let view!: RenderResult
  await act(async (): Promise<void> => {
    view = render(node)
    for (let i = 0; i < 20; i += 1) {
      await Promise.resolve()
    }
  })
  // Wait for the Suspense fallback ("loading") to clear. The brand link is
  // inside HeaderBar which doesn't suspend itself but is hidden under the
  // boundary's fallback while ShortlistDrawer awaits useDataset().
  await screen.findByRole('link', { name: 'STA' }, { timeout: 2000 })
  return view
}

function setLocation(search: string): void {
  window.history.replaceState({}, '', `/${search.length > 0 ? `?${search}` : ''}`)
}

function Harness({
  initialOpen = false,
}: {
  initialOpen?: boolean
}): JSX.Element {
  const [open, setOpen] = useState<boolean>(initialOpen)
  return (
    <Suspense fallback={<p>loading</p>}>
      <HeaderBar
        brandLabel="STA"
        brandHref="/"
        shortlistSlot={
          <Button
            onClick={(): void => {
              setOpen(true)
            }}
            aria-label="Open shortlist"
          >
            Shortlist
          </Button>
        }
      />
      <ShortlistDrawer open={open} onOpenChange={setOpen} />
    </Suspense>
  )
}

describe('ShortlistDrawer', (): void => {
  beforeEach((): void => {
    __resetForTests()
    __resetShortlistForTests()
    setLocation('')
    window.localStorage.clear()
    vi.restoreAllMocks()
  })
  afterEach((): void => {
    setLocation('')
    window.localStorage.clear()
    vi.restoreAllMocks()
    __resetShortlistForTests()
  })

  it('opens when the HeaderBar shortlist trigger is clicked', async (): Promise<void> => {
    setLocation('shortlist=kotelnica-bialczanska')
    const user = userEvent.setup()
    await renderAsync(<Harness />)
    expect(screen.queryByRole('dialog', { name: /shortlist/i })).toBeNull()
    await user.click(screen.getByRole('button', { name: /open shortlist/i }))
    expect(screen.getByRole('dialog', { name: /shortlist/i })).toBeInTheDocument()
  })

  it('renders the resort name for each shortlisted slug', async (): Promise<void> => {
    setLocation('shortlist=kotelnica-bialczanska,spindleruv-mlyn')
    await renderAsync(<Harness initialOpen />)
    expect(screen.getByText('Kotelnica Białczańska')).toBeInTheDocument()
    expect(screen.getByText('Špindlerův Mlýn')).toBeInTheDocument()
  })

  it('renders an empty-state message when the shortlist is empty', async (): Promise<void> => {
    await renderAsync(<Harness initialOpen />)
    // No shortlist items → guidance copy. Must NOT display any resort
    // names from the underlying dataset.
    expect(screen.getByText(/no resorts shortlisted/i)).toBeInTheDocument()
    expect(screen.queryByText('Kotelnica Białczańska')).toBeNull()
  })

  it('per-row IconButton removes the slug from the shortlist', async (): Promise<void> => {
    setLocation('shortlist=kotelnica-bialczanska,spindleruv-mlyn')
    const user = userEvent.setup()
    await renderAsync(<Harness initialOpen />)
    const removeButton = screen.getByRole('button', {
      name: /remove kotelnica/i,
    })
    await user.click(removeButton)
    await flushSuspense()
    expect(screen.queryByText('Kotelnica Białczańska')).toBeNull()
    expect(screen.getByText('Špindlerův Mlýn')).toBeInTheDocument()
    expect(window.location.search).not.toContain('kotelnica-bialczanska')
  })

  it('renders the "Open Matrix" CTA at md+ and routes to ?view=matrix', async (): Promise<void> => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (q: string): MediaQueryList => ({
        matches: q === '(min-width: 900px)',
        media: q,
        onchange: null,
        addListener: (): void => undefined,
        removeListener: (): void => undefined,
        addEventListener: (): void => undefined,
        removeEventListener: (): void => undefined,
        dispatchEvent: (): boolean => false,
      }),
    )
    setLocation('shortlist=kotelnica-bialczanska')
    const user = userEvent.setup()
    await renderAsync(<Harness initialOpen />)
    const openMatrix = screen.getByRole('button', { name: /open matrix/i })
    expect(openMatrix).toBeInTheDocument()
    await user.click(openMatrix)
    expect(window.location.search).toContain('view=matrix')
  })

  it('removes the "Open Matrix" CTA from the tab order below md (not just disabled)', async (): Promise<void> => {
    // Default test-setup matchMedia stub returns matches:false for every
    // query — including (min-width: 900px). Spec: "removed from the tab
    // order, not merely disabled". We assert the CTA is absent from the
    // accessibility tree below md.
    setLocation('shortlist=kotelnica-bialczanska')
    await renderAsync(<Harness initialOpen />)
    expect(
      screen.queryByRole('button', { name: /open matrix/i }),
    ).toBeNull()
  })

  it('is axe-clean when open with shortlisted resorts', async (): Promise<void> => {
    setLocation('shortlist=kotelnica-bialczanska,spindleruv-mlyn')
    const view = await renderAsync(<Harness initialOpen />)
    expect(await axe(view.container)).toHaveNoViolations()
  })

  it('is axe-clean when open with an empty shortlist', async (): Promise<void> => {
    const view = await renderAsync(<Harness initialOpen />)
    expect(await axe(view.container)).toHaveNoViolations()
  })

  it('does not render anything when closed', async (): Promise<void> => {
    setLocation('shortlist=kotelnica-bialczanska')
    await renderAsync(<Harness />)
    expect(
      screen.queryByRole('dialog', { name: /shortlist/i }),
    ).toBeNull()
  })

  it('falls back to the slug as label when the dataset has no matching view', async (): Promise<void> => {
    // Defensive: a share-URL with a stale or unknown slug must not crash.
    // The drawer renders the slug verbatim when the dataset has no
    // matching ResortView. (The DroppedSlugsBanner — wired in PR 3.6 —
    // surfaces these to the user separately.)
    setLocation('shortlist=ghost-resort-not-in-dataset')
    await renderAsync(<Harness initialOpen />)
    expect(
      screen.getByText('ghost-resort-not-in-dataset'),
    ).toBeInTheDocument()
  })
})
