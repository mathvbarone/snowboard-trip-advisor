import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useResponsiveTabOrder } from './useResponsiveTabOrder'

// Mirrors the FieldRow.test.tsx matchMedia stub pattern (lines 122-127). jsdom
// does not implement window.matchMedia; tests that mount the hook directly stub
// it explicitly.
function stubMatchMedia(matches: boolean): { fire: (next: boolean) => void } {
  const listeners = new Set<EventListener>()
  const mql: MediaQueryList = {
    matches,
    media: '(min-width: 900px)',
    onchange: null,
    addListener: (): void => undefined,
    removeListener: (): void => undefined,
    addEventListener: (_event: string, cb: EventListenerOrEventListenerObject): void => {
      if (typeof cb === 'function') { listeners.add(cb) }
    },
    removeEventListener: (_event: string, cb: EventListenerOrEventListenerObject): void => {
      if (typeof cb === 'function') { listeners.delete(cb) }
    },
    dispatchEvent: (): boolean => false,
  }
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql))
  return {
    fire: (next: boolean): void => {
      Object.defineProperty(mql, 'matches', { value: next, configurable: true })
      const event = { matches: next, media: mql.media } as unknown as Event
      for (const cb of listeners) { cb(event) }
    },
  }
}

describe('useResponsiveTabOrder', (): void => {
  afterEach((): void => {
    vi.unstubAllGlobals()
  })

  it('returns { readOnly: false } when matchMedia matches (above md)', (): void => {
    stubMatchMedia(true)
    const { result } = renderHook(() => useResponsiveTabOrder())
    expect(result.current).toEqual({ readOnly: false })
  })

  it('returns { readOnly: true } when matchMedia does NOT match (below md)', (): void => {
    stubMatchMedia(false)
    const { result } = renderHook(() => useResponsiveTabOrder())
    expect(result.current).toEqual({ readOnly: true })
  })

  it('flips when the matchMedia change event fires', (): void => {
    const { fire } = stubMatchMedia(true)
    const { result, rerender } = renderHook(() => useResponsiveTabOrder())
    expect(result.current.readOnly).toBe(false)
    fire(false)
    rerender()
    expect(result.current.readOnly).toBe(true)
  })

  it('returns { readOnly: false } when window.matchMedia is unavailable (jsdom fallback)', (): void => {
    // Per Tier 5 plan Decision E1: matches the FieldRow useIsAboveMd fallback
    // pattern. Tests that mount components without explicit matchMedia stubs
    // (e.g., ResortEditor.test.tsx) should not crash; hook returns the
    // desktop-default readOnly: false (= aboveMd: true).
    vi.stubGlobal('matchMedia', undefined)
    const { result } = renderHook(() => useResponsiveTabOrder())
    expect(result.current).toEqual({ readOnly: false })
  })

  it('removes the matchMedia change listener on unmount', (): void => {
    const removeSpy = vi.fn()
    const mql = {
      matches: true,
      media: '(min-width: 900px)',
      onchange: null,
      addListener: (): void => undefined,
      removeListener: (): void => undefined,
      addEventListener: (): void => undefined,
      removeEventListener: removeSpy,
      dispatchEvent: (): boolean => false,
    } as unknown as MediaQueryList
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql))
    const { unmount } = renderHook(() => useResponsiveTabOrder())
    unmount()
    expect(removeSpy).toHaveBeenCalledWith('change', expect.any(Function))
  })
})
