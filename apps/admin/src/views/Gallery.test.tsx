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

  it('renders the Component gallery heading', (): void => {
    render(
      <ToastProvider>
        <Gallery />
      </ToastProvider>,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: /component gallery/i }),
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

  it('renders empty family placeholders for the still-pending S1 PRs', (): void => {
    const { container } = render(
      <ToastProvider>
        <Gallery />
      </ToastProvider>,
    )
    // S1a-form-controls, S1b-surfaces and S1c-feedback-status are now
    // FILLED (asserted below); only the S1d family remains an empty
    // placeholder for the later PR.
    for (const family of [
      'S1d-overlays',
    ]) {
      const placeholder = container.querySelector(
        `[data-gallery-family="${family}"]`,
      )
      expect(placeholder).not.toBeNull()
      expect(placeholder?.textContent).toBe('')
    }
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

  // The S1a editable exemplars are controlled — exercising their handlers
  // proves the live gallery controls stay editable (not just visually
  // present) and keeps Gallery.tsx's interactive closures covered.
  it('keeps the S1a editable form controls interactive', (): void => {
    render(
      <ToastProvider>
        <Gallery />
      </ToastProvider>,
    )
    // Editable Input round-trips through local state.
    const input = screen.getByLabelText('Editable input')
    fireEvent.change(input, { target: { value: 'typed text' } })
    expect(input).toHaveValue('typed text')

    const select = screen.getByLabelText('Editable select')
    fireEvent.change(select, { target: { value: 'b' } })
    expect(select).toHaveValue('b')

    const textarea = screen.getByLabelText('Editable note')
    fireEvent.change(textarea, { target: { value: 'typed note' } })
    expect(textarea).toHaveValue('typed note')

    // Enabled toggle commits selection on click (pressed state flips).
    // "Matrix" appears in both the enabled and disabled groups, so scope
    // to the enabled group by its accessible name first.
    const enabledGroup = screen.getByRole('group', { name: 'View' })
    const matrixBtn = within(enabledGroup).getByRole('button', {
      name: 'Matrix',
    })
    fireEvent.click(matrixBtn)
    expect(matrixBtn).toHaveAttribute('aria-pressed', 'true')

    // The shared `noop` is wired to the enabled IconButton — click it so
    // the single module-level handler is exercised (function coverage).
    fireEvent.click(screen.getByRole('button', { name: 'Star' }))

    // S1c-2: the controlled Chip exemplar is seeded pressed; clicking it
    // flips its aria-pressed off through local state. Exercising the
    // `setChipOn` toggle keeps FeedbackStatusFamily's interactive closure
    // covered (mirrors the editable-form-control assertions above).
    const chip = screen.getByRole('button', {
      name: 'Toggleable chip (seeded pressed)',
    })
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'false')
  })
})
