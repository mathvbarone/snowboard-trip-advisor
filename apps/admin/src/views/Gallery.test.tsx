// Gallery view tests — S1.0
// Covers (a) the page heading renders, (b) the three already-styled exemplar
// wrappers (Table / Toast / Drawer) are present so a Playwright smoke can
// target `[data-gallery-component="<Name>"]`, (c) the later-S1 family
// placeholder <section>s exist and are empty.
//
// Gallery calls useToast(), so it must render inside a <ToastProvider>
// (App mounts every route inside Shell, which provides it). Mirrors the
// sibling view-test conventions: @testing-library render, vitest describe/it.

import { ToastProvider } from '@snowboard-trip-advisor/design-system'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Gallery } from './Gallery'

// Inlined matchMedia stub — keeps the test file self-contained per
// ai-clean-code-adherence §3 (no cross-file shared fixtures). The Drawer
// exemplar's usePrefersReducedMotion subscribes to matchMedia, which jsdom
// does not implement; the admin test-setup deliberately omits the global
// stub so files mounting Radix primitives opt in (Shell.test.tsx precedent).
function stubMatchMedia(): void {
  const mql = {
    matches: false,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addListener: (): void => undefined,
    removeListener: (): void => undefined,
    addEventListener: (): void => undefined,
    removeEventListener: (): void => undefined,
    dispatchEvent: (): boolean => false,
  } as unknown as MediaQueryList
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql))
}

describe('Gallery (S1.0 — dev-only component gallery surface)', (): void => {
  beforeEach((): void => {
    stubMatchMedia()
  })
  afterEach((): void => {
    vi.unstubAllGlobals()
  })

  // The S1d OverlaysFamily mounts a seeded-OPEN Modal. Radix Dialog with
  // the default `modal=true` sets `aria-hidden="true"` on every sibling of
  // the dialog (the documented modal focus/AT trap — true in real browsers
  // too), so the page heading is hidden from the accessibility tree while
  // the modal is open. The element is still in the DOM (the style-only
  // gallery smoke uses getComputedStyle, which is immune to aria-hidden),
  // so we assert presence with `hidden: true` — the assertion still proves
  // the heading renders; it just acknowledges the accurate open-modal a11y
  // state rather than asserting a now-false un-hidden one.
  it('renders the Component gallery heading', (): void => {
    render(
      <ToastProvider>
        <Gallery />
      </ToastProvider>,
    )
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /component gallery/i,
        hidden: true,
      }),
    ).toBeInTheDocument()
  })

  it('renders the three already-styled exemplar wrappers', (): void => {
    const { container } = render(
      <ToastProvider>
        <Gallery />
      </ToastProvider>,
    )
    expect(
      container.querySelector('[data-gallery-component="Table"]'),
    ).not.toBeNull()
    expect(
      container.querySelector('[data-gallery-component="Toast"]'),
    ).not.toBeNull()
    expect(
      container.querySelector('[data-gallery-component="Drawer"]'),
    ).not.toBeNull()
  })

  // Defect 1 (S1.0 Codex P2) regression pin: the Toast exemplar must stay
  // mounted long enough for the smoke to read its computed styles. The
  // gallery passes an effectively-non-expiring `dismissAfterMs`; with fake
  // timers we advance well past Toast's 5000ms success default and assert
  // the `.sta-toast` styled node is STILL in the DOM. A regression to the
  // default duration (auto-dismiss) makes this fail.
  it('keeps the Toast exemplar mounted past the default auto-dismiss', (): void => {
    vi.useFakeTimers()
    try {
      const { container } = render(
        <ToastProvider>
          <Gallery />
        </ToastProvider>,
      )
      // Flush the on-mount show() effect + provider's deferred microtask.
      act((): void => {
        vi.advanceTimersByTime(0)
      })
      expect(container.querySelector('.sta-toast')).not.toBeNull()
      // Advance far past every per-variant default (success = 5000ms,
      // error = 8000ms). A non-expiring exemplar survives this.
      act((): void => {
        vi.advanceTimersByTime(60_000)
      })
      expect(container.querySelector('.sta-toast')).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('has no empty family placeholders — every S1 family is now filled', (): void => {
    const { container } = render(
      <ToastProvider>
        <Gallery />
      </ToastProvider>,
    )
    // S1d-overlays was the LAST empty placeholder; this PR fills it, so the
    // set of still-empty `[data-gallery-family]` sections is now {} (every
    // S1a/S1b/S1c/S1d family is populated). Assert NONE is empty rather
    // than leaving a stale assertion that names S1d-overlays as empty.
    const families = Array.from(
      container.querySelectorAll('[data-gallery-family]'),
    )
    expect(families.length).toBeGreaterThan(0)
    const empty = families.filter(
      (section): boolean => section.textContent === '',
    )
    expect(empty).toHaveLength(0)
  })

  // S1a — the form-controls family is now populated. The Playwright smoke
  // targets each component's own `.sta-<name>` root; these assertions pin
  // the per-component anchor wrappers (mirrors the S1.0 exemplar-wrapper
  // assertion above) so a future PR cannot silently drop one.
  it('renders the six S1a form-control component wrappers', (): void => {
    const { container } = render(
      <ToastProvider>
        <Gallery />
      </ToastProvider>,
    )
    for (const name of [
      'Button',
      'IconButton',
      'Input',
      'Select',
      'Textarea',
      'ToggleButtonGroup',
    ]) {
      expect(
        container.querySelector(`[data-gallery-component="${name}"]`),
      ).not.toBeNull()
    }
  })

  // S1b — the surfaces/layout family is now populated. The Playwright
  // smoke targets each component's own `.sta-<name>` root; these
  // assertions pin the per-component anchor wrappers (mirrors the S1a
  // assertion above) so a future PR cannot silently drop one. Shell is
  // included: its `.sta-skip-link` lives inside this wrapper (off-screen
  // until focus per its own contract).
  it('renders the five S1b surface component wrappers', (): void => {
    const { container } = render(
      <ToastProvider>
        <Gallery />
      </ToastProvider>,
    )
    for (const name of [
      'Card',
      'Sidebar',
      'HeaderBar',
      'EmptyStateLayout',
      'Shell',
    ]) {
      expect(
        container.querySelector(`[data-gallery-component="${name}"]`),
      ).not.toBeNull()
    }
  })

  // S1c — the feedback/status family is now populated by PR S1c-1 (4
  // components). The Playwright smoke targets each component's own
  // `.sta-<name>` root; these assertions pin the per-component anchor
  // wrappers (mirrors the S1a/S1b assertions above) so a future PR cannot
  // silently drop one. PR S1c-2 will ADD Chip/FieldValueRenderer/
  // ExternalLink to the same family without disturbing these 4.
  it('renders the four S1c-1 feedback/status component wrappers', (): void => {
    const { container } = render(
      <ToastProvider>
        <Gallery />
      </ToastProvider>,
    )
    for (const name of [
      'Pill',
      'StatusPill',
      'SourceBadge',
      'Skeleton',
    ]) {
      expect(
        container.querySelector(`[data-gallery-component="${name}"]`),
      ).not.toBeNull()
    }
  })

  // S1c-2 — the same feedback/status family now also carries Chip,
  // FieldValueRenderer and ExternalLink (added at S1c-1's marker without
  // disturbing the 4 anchors asserted above). The Playwright smoke targets
  // each component's own `.sta-<name>` root; these assertions pin the new
  // per-component anchor wrappers so a future PR cannot silently drop one.
  it('renders the three S1c-2 feedback/status component wrappers', (): void => {
    const { container } = render(
      <ToastProvider>
        <Gallery />
      </ToastProvider>,
    )
    for (const name of [
      'Chip',
      'FieldValueRenderer',
      'ExternalLink',
    ]) {
      expect(
        container.querySelector(`[data-gallery-component="${name}"]`),
      ).not.toBeNull()
    }
  })

  // S1d — the overlays/primitives family is now populated (the LAST S1
  // family filled). The Playwright smoke targets each component's own
  // `.sta-<name>` root; these assertions pin the per-component anchor
  // wrappers (mirrors the S1a/S1b/S1c assertions above) so a future PR
  // cannot silently drop one.
  it('renders the five S1d overlay/primitive component wrappers', (): void => {
    const { container } = render(
      <ToastProvider>
        <Gallery />
      </ToastProvider>,
    )
    for (const name of [
      'Modal',
      'Popover',
      'Tabs',
      'Tooltip',
      'DropdownMenu',
    ]) {
      expect(
        container.querySelector(`[data-gallery-component="${name}"]`),
      ).not.toBeNull()
    }
  })

  // The S1a editable exemplars are controlled — exercising their handlers
  // proves the live gallery controls stay editable (not just visually
  // present) and keeps Gallery.tsx's interactive closures covered.
  //
  // S1d note: the seeded-open Modal applies `aria-hidden="true"` to every
  // sibling of the dialog (documented Radix modal trap — true in real
  // browsers too), so accessible-name queries (`getByLabelText` /
  // `getByRole`) can no longer see these controls. The DOM nodes and their
  // values/handlers are unaffected (aria-hidden is an a11y-tree attribute,
  // not a functional one), so we scope by DOM selectors off `container` —
  // every assertion's intent (control present, state round-trips, pressed
  // flips) is preserved exactly; only the lookup mechanism changed.
  it('keeps the S1a editable form controls interactive', (): void => {
    const { container } = render(
      <ToastProvider>
        <Gallery />
      </ToastProvider>,
    )
    const scope = (sel: string): HTMLElement => {
      const el = container.querySelector<HTMLElement>(sel)
      if (el === null) {
        throw new Error(`Gallery interactive control not found: ${sel}`)
      }
      return el
    }

    // Editable Input round-trips through local state.
    const input = scope(
      '[data-gallery-component="Input"] input:not([disabled]):not([readonly])',
    )
    fireEvent.change(input, { target: { value: 'typed text' } })
    expect(input).toHaveValue('typed text')

    const select = scope(
      '[data-gallery-component="Select"] select:not([disabled])',
    )
    fireEvent.change(select, { target: { value: 'b' } })
    expect(select).toHaveValue('b')

    const textarea = scope(
      '[data-gallery-component="Textarea"] textarea:not([disabled]):not([readonly])',
    )
    fireEvent.change(textarea, { target: { value: 'typed note' } })
    expect(textarea).toHaveValue('typed note')

    // Enabled toggle commits selection on click (pressed state flips).
    // The enabled ToggleButtonGroup is the first <div role="group"> in the
    // ToggleButtonGroup section (the disabled one is second); its "Matrix"
    // button is the one we click.
    const enabledGroup = within(
      scope('[data-gallery-component="ToggleButtonGroup"] [role="group"]'),
    )
    const matrixBtn = enabledGroup.getByRole('button', {
      name: 'Matrix',
      hidden: true,
    })
    fireEvent.click(matrixBtn)
    expect(matrixBtn).toHaveAttribute('aria-pressed', 'true')

    // The shared `noop` is wired to the enabled IconButton — click it so
    // the single module-level handler is exercised (function coverage).
    fireEvent.click(
      scope('[data-gallery-component="IconButton"] button:not([disabled])'),
    )

    // S1c-2: the controlled Chip exemplar is seeded pressed; clicking it
    // flips its aria-pressed off through local state. Exercising the
    // `setChipOn` toggle keeps FeedbackStatusFamily's interactive closure
    // covered (mirrors the editable-form-control assertions above).
    const chip = scope(
      '[data-gallery-component="Chip"] button[aria-pressed="true"]',
    )
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'false')
  })
})
