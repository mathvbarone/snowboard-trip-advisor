import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import type { ViewValue } from '../lib/urlState'

import { useScrollReset } from './useScrollReset'

// useScrollReset (spec §6.1, line 244) fires `window.scrollTo(0, 0)` on
// cards ↔ matrix transitions only. The first-mount fire is suppressed via
// a ref so the cards-landing initial render does NOT auto-scroll. All
// other URL keys (sort / country / shortlist / detail / highlight) must
// NOT scroll-reset; the dep array enforces this — the test rerenders with
// the same `view` value to assert no spurious fires.

describe('useScrollReset', (): void => {
  let scrollSpy: MockInstance<typeof window.scrollTo>

  beforeEach((): void => {
    scrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation((): void => {})
  })

  afterEach((): void => {
    scrollSpy.mockRestore()
  })

  it('does NOT call scrollTo on first mount (cards landing keeps any user scroll position)', (): void => {
    renderHook((): void => {
      useScrollReset('cards')
    })
    expect(scrollSpy).not.toHaveBeenCalled()
  })

  it('calls scrollTo(0, 0) on cards → matrix transition', (): void => {
    const { rerender } = renderHook(
      ({ view }: { view: ViewValue }): void => {
        useScrollReset(view)
      },
      { initialProps: { view: 'cards' as ViewValue } },
    )
    expect(scrollSpy).not.toHaveBeenCalled()
    rerender({ view: 'matrix' })
    expect(scrollSpy).toHaveBeenCalledTimes(1)
    expect(scrollSpy).toHaveBeenCalledWith(0, 0)
  })

  it('calls scrollTo(0, 0) on matrix → cards transition', (): void => {
    const { rerender } = renderHook(
      ({ view }: { view: ViewValue }): void => {
        useScrollReset(view)
      },
      { initialProps: { view: 'matrix' as ViewValue } },
    )
    expect(scrollSpy).not.toHaveBeenCalled()
    rerender({ view: 'cards' })
    expect(scrollSpy).toHaveBeenCalledTimes(1)
    expect(scrollSpy).toHaveBeenCalledWith(0, 0)
  })

  it('does NOT call scrollTo when re-rendered with the same view', (): void => {
    const { rerender } = renderHook(
      ({ view }: { view: ViewValue }): void => {
        useScrollReset(view)
      },
      { initialProps: { view: 'cards' as ViewValue } },
    )
    rerender({ view: 'cards' })
    rerender({ view: 'cards' })
    rerender({ view: 'cards' })
    expect(scrollSpy).not.toHaveBeenCalled()
  })

  // Non-fire URL keys: a rerender with the same `view` value simulates a
  // sort / country / shortlist / detail / highlight transition (those keys
  // never reach the hook — its dep array is `[view]` only). The assertion
  // proves the dep-array narrowing does the right thing structurally.
  it('does NOT call scrollTo when sort / country / shortlist / detail / highlight change (view stable)', (): void => {
    const { rerender } = renderHook(
      ({ view }: { view: ViewValue }): void => {
        useScrollReset(view)
      },
      { initialProps: { view: 'cards' as ViewValue } },
    )
    // Five rerenders, each representing a different non-view URL key change.
    rerender({ view: 'cards' })
    rerender({ view: 'cards' })
    rerender({ view: 'cards' })
    rerender({ view: 'cards' })
    rerender({ view: 'cards' })
    expect(scrollSpy).not.toHaveBeenCalled()
  })
})
