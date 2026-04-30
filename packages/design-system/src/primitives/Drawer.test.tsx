import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { useRef, useState } from 'react'
import type { JSX } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Drawer } from './Drawer'

// Spec §7.9: Drawer must be **non-modal** — keyboard focus stays inside when
// the user is keyboard-driving, but mouse-clicks behind the drawer continue
// to work (cards stay clickable). Escape and outside-click dismiss; focus
// returns to the trigger; the full prop superset (`defaultOpen`,
// `initialFocus`, `onAnimationEnd`, `position`) is exercised so PR 3.5
// inherits the primitive without primitive-amendment.
//
// matchMedia is stubbed in test-setup.ts; per-test breakpoint mocking uses
// vi.spyOn(window, 'matchMedia') overrides.

function ControlledDrawer({
  initialOpen = true,
  position = 'right',
}: {
  initialOpen?: boolean
  position?: 'left' | 'right'
}): JSX.Element {
  const [open, setOpen] = useState<boolean>(initialOpen)
  return (
    <Drawer open={open} onOpenChange={setOpen} position={position} title="Shortlist">
      <p>Body</p>
      <button type="button">Inside</button>
    </Drawer>
  )
}

describe('Drawer', (): void => {
  // Always restore matchMedia — many tests stub it per-case.
  beforeEach((): void => {
    vi.restoreAllMocks()
  })
  afterEach((): void => {
    vi.restoreAllMocks()
  })

  it('renders the title and children when open', (): void => {
    render(<ControlledDrawer />)
    expect(
      screen.getByRole('dialog', { name: 'Shortlist' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Body')).toBeInTheDocument()
  })

  it('does not render when closed', (): void => {
    render(<ControlledDrawer initialOpen={false} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does NOT lock body scroll (non-modal)', (): void => {
    // Modal toggles document.body.style.overflow = 'hidden'; Drawer must
    // NOT — the spec contract is "mouse-clicks behind work". A scroll lock
    // would also block scrolling on the cards behind the drawer.
    render(<ControlledDrawer />)
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('dismisses on Escape', async (): Promise<void> => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(
      <Drawer open onOpenChange={onOpenChange} title="Shortlist">
        <p>Body</p>
      </Drawer>,
    )
    await user.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('dismisses on outside-click', async (): Promise<void> => {
    const onOpenChange = vi.fn()
    function Harness(): JSX.Element {
      return (
        <>
          <button type="button" data-testid="outside">
            Outside
          </button>
          <Drawer open onOpenChange={onOpenChange} title="Shortlist">
            <p>Body</p>
          </Drawer>
        </>
      )
    }
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByTestId('outside'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('returns focus to the trigger on close', async (): Promise<void> => {
    function TriggerHarness(): JSX.Element {
      const [open, setOpen] = useState<boolean>(false)
      return (
        <>
          <button
            type="button"
            data-testid="trigger"
            onClick={(): void => {
              setOpen(true)
            }}
          >
            Open
          </button>
          <Drawer open={open} onOpenChange={setOpen} title="Shortlist">
            <p>Body</p>
          </Drawer>
        </>
      )
    }
    const user = userEvent.setup()
    render(<TriggerHarness />)
    const trigger = screen.getByTestId('trigger')
    trigger.focus()
    await user.click(trigger)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(trigger).toHaveFocus()
  })

  it('traps keyboard Tab focus inside the drawer (spec §5.3 contract)', async (): Promise<void> => {
    // Per spec §5.3: non-modal "keyboard focus inside drawer when keyboard-active;
    // cards behind stay clickable via mouse". This test asserts the
    // keyboard-trap half: tabbing past the last focusable in the drawer must
    // wrap back to the first focusable inside, NOT escape to a button outside.
    const user = userEvent.setup()
    function Harness(): JSX.Element {
      return (
        <>
          <button type="button" data-testid="outside-before">
            Before
          </button>
          <Drawer
            open
            onOpenChange={(): void => {
              /* no-op */
            }}
            title="Shortlist"
          >
            <button type="button" data-testid="inside-1">
              Inside 1
            </button>
            <button type="button" data-testid="inside-2">
              Inside 2
            </button>
          </Drawer>
          <button type="button" data-testid="outside-after">
            After
          </button>
        </>
      )
    }
    render(<Harness />)
    // Radix moves focus into the drawer on open. Tab through every focusable
    // and confirm we never land outside the dialog.
    for (let i = 0; i < 6; i++) {
      await user.tab()
      expect(document.activeElement?.closest('[role="dialog"]')).not.toBeNull()
    }
  })

  it('keeps mouse-clicks behind the drawer working (non-modal)', async (): Promise<void> => {
    const onBackdropClick = vi.fn()
    const onOpenChange = vi.fn()
    function Harness(): JSX.Element {
      return (
        <>
          <button type="button" data-testid="behind" onClick={onBackdropClick}>
            Behind
          </button>
          <Drawer open onOpenChange={onOpenChange} title="Shortlist">
            <p>Body</p>
          </Drawer>
        </>
      )
    }
    const user = userEvent.setup()
    render(<Harness />)
    // The drawer is non-modal: clicking a button outside the drawer fires
    // its onClick handler. (It also dismisses the drawer via outside-click,
    // but the click event still reaches the underlying button — Modal would
    // block it via the overlay's pointer-events.)
    await user.click(screen.getByTestId('behind'))
    expect(onBackdropClick).toHaveBeenCalledTimes(1)
  })

  it('opens on mount when defaultOpen=true (uncontrolled-style hint)', (): void => {
    function DefaultOpenHarness(): JSX.Element {
      const [open, setOpen] = useState<boolean>(false)
      return (
        <Drawer
          open={open}
          onOpenChange={setOpen}
          title="Shortlist"
          defaultOpen
        >
          <p>Body</p>
        </Drawer>
      )
    }
    render(<DefaultOpenHarness />)
    // defaultOpen surfaces the open-on-mount intent; the Drawer reflects it
    // by setting `open` on first effect tick (parent is told via
    // onOpenChange(true) and re-renders).
    expect(screen.getByRole('dialog', { name: 'Shortlist' })).toBeInTheDocument()
  })

  it('does not call onOpenChange(true) when defaultOpen=true and open is already true', (): void => {
    // Defensive guard: if the parent passes both `defaultOpen` and
    // `open={true}` on first render, the open-on-mount effect must
    // detect the already-open state and skip the redundant
    // `onOpenChange(true)` call (otherwise a parent reducer with side
    // effects would fire spuriously). Exercise the `if (!open)` guard's
    // open=true branch.
    const onOpenChange = vi.fn()
    render(
      <Drawer
        open={true}
        onOpenChange={onOpenChange}
        title="Shortlist"
        defaultOpen
      >
        <p>Body</p>
      </Drawer>,
    )
    expect(screen.getByRole('dialog', { name: 'Shortlist' })).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('focuses the initialFocus ref on open', (): void => {
    function FocusHarness(): JSX.Element {
      const focusRef = useRef<HTMLButtonElement>(null)
      const [open, setOpen] = useState<boolean>(true)
      return (
        <Drawer
          open={open}
          onOpenChange={setOpen}
          title="Shortlist"
          initialFocus={focusRef}
        >
          <button type="button">First</button>
          <button type="button" ref={focusRef} data-testid="focus-target">
            Focus me
          </button>
        </Drawer>
      )
    }
    render(<FocusHarness />)
    expect(screen.getByTestId('focus-target')).toHaveFocus()
  })

  it('fires onAnimationEnd after the slide transition', (): void => {
    const onAnimationEnd = vi.fn()
    render(
      <Drawer
        open
        onOpenChange={(): void => {
          /* no-op */
        }}
        title="Shortlist"
        onAnimationEnd={onAnimationEnd}
      >
        <p>Body</p>
      </Drawer>,
    )
    // Drawer wires onAnimationEnd onto the sliding panel; jsdom does not
    // run real CSS transitions, so we dispatch the synthetic React event
    // by firing a native animationend on the panel element.
    const panel = screen.getByRole('dialog', { name: 'Shortlist' })
    panel.dispatchEvent(new Event('animationend', { bubbles: true }))
    expect(onAnimationEnd).toHaveBeenCalledTimes(1)
  })

  it('reflects position via data-position', (): void => {
    const { rerender } = render(<ControlledDrawer position="right" />)
    expect(
      screen.getByRole('dialog', { name: 'Shortlist' }),
    ).toHaveAttribute('data-position', 'right')
    rerender(<ControlledDrawer position="left" />)
    expect(
      screen.getByRole('dialog', { name: 'Shortlist' }),
    ).toHaveAttribute('data-position', 'left')
  })

  it.each([
    ['xs', '(min-width: 360px)'],
    ['sm', '(min-width: 600px)'],
    ['md', '(min-width: 900px)'],
    ['lg', '(min-width: 1280px)'],
  ])('mounts at named breakpoint %s (%s)', (_label, query): void => {
    // Per spec §7.9 acceptance: drawer renders at every named breakpoint.
    // We mock matchMedia so the named breakpoint matches; the drawer must
    // mount unchanged.
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (q: string): MediaQueryList => ({
        matches: q === query,
        media: q,
        onchange: null,
        addListener: (): void => undefined,
        removeListener: (): void => undefined,
        addEventListener: (): void => undefined,
        removeEventListener: (): void => undefined,
        dispatchEvent: (): boolean => false,
      }),
    )
    render(<ControlledDrawer />)
    expect(
      screen.getByRole('dialog', { name: 'Shortlist' }),
    ).toBeInTheDocument()
  })

  it('honors prefers-reduced-motion via data-reduced-motion', (): void => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (q: string): MediaQueryList => ({
        matches: q === '(prefers-reduced-motion: reduce)',
        media: q,
        onchange: null,
        addListener: (): void => undefined,
        removeListener: (): void => undefined,
        addEventListener: (): void => undefined,
        removeEventListener: (): void => undefined,
        dispatchEvent: (): boolean => false,
      }),
    )
    render(<ControlledDrawer />)
    expect(
      screen.getByRole('dialog', { name: 'Shortlist' }),
    ).toHaveAttribute('data-reduced-motion', 'true')
  })

  it('omits data-reduced-motion when the user has not opted in', (): void => {
    // Default matchMedia stub returns matches:false for everything.
    render(<ControlledDrawer />)
    expect(
      screen.getByRole('dialog', { name: 'Shortlist' }),
    ).not.toHaveAttribute('data-reduced-motion', 'true')
  })

  it('subscribes to prefers-reduced-motion changes (live OS preference toggle)', (): void => {
    // Capture the listener so we can simulate an OS-level preference toggle.
    let capturedListener: ((e: MediaQueryListEvent) => void) | null = null
    let currentMatches = false
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (q: string): MediaQueryList => ({
        get matches(): boolean {
          return q === '(prefers-reduced-motion: reduce)' && currentMatches
        },
        media: q,
        onchange: null,
        addListener: (): void => undefined,
        removeListener: (): void => undefined,
        addEventListener: (
          _evt: string,
          listener: EventListenerOrEventListenerObject,
        ): void => {
          if (q === '(prefers-reduced-motion: reduce)') {
            capturedListener = listener as (e: MediaQueryListEvent) => void
          }
        },
        removeEventListener: (): void => undefined,
        dispatchEvent: (): boolean => false,
      }),
    )
    render(<ControlledDrawer />)
    const dialog = screen.getByRole('dialog', { name: 'Shortlist' })
    expect(dialog).not.toHaveAttribute('data-reduced-motion', 'true')

    // Flip the OS preference and fire the captured change listener.
    expect(capturedListener).not.toBeNull()
    act((): void => {
      currentMatches = true
      capturedListener?.({} as MediaQueryListEvent)
    })
    expect(dialog).toHaveAttribute('data-reduced-motion', 'true')
  })

  it('is axe-clean when open', async (): Promise<void> => {
    const { container } = render(<ControlledDrawer />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('is axe-clean when closed', async (): Promise<void> => {
    const { container } = render(<ControlledDrawer initialOpen={false} />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('does not throw if the activeElement at open is not an HTMLElement', async (): Promise<void> => {
    // jsdom's default activeElement is <body> (an HTMLElement). To exercise
    // the "not an HTMLElement" branch we stub activeElement with a getter
    // that returns an SVGElement; close path skips restore silently.
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    document.body.appendChild(svg)
    const restoreDescriptor = Object.getOwnPropertyDescriptor(
      Document.prototype,
      'activeElement',
    )
    Object.defineProperty(document, 'activeElement', {
      configurable: true,
      get: (): SVGElement => svg,
    })
    try {
      const user = userEvent.setup()
      render(<ControlledDrawer />)
      await user.keyboard('{Escape}')
    } finally {
      if (restoreDescriptor !== undefined) {
        Object.defineProperty(document, 'activeElement', restoreDescriptor)
      }
      svg.remove()
    }
  })
})
