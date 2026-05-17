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
import { render, screen } from '@testing-library/react'
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

  it('renders empty family placeholders for the later S1 PRs', (): void => {
    const { container } = render(
      <ToastProvider>
        <Gallery />
      </ToastProvider>,
    )
    for (const family of [
      'S1a-form-controls',
      'S1b-surfaces',
      'S1c-feedback-status',
      'S1d-overlays',
    ]) {
      const placeholder = container.querySelector(
        `[data-gallery-family="${family}"]`,
      )
      expect(placeholder).not.toBeNull()
      expect(placeholder?.textContent).toBe('')
    }
  })
})
