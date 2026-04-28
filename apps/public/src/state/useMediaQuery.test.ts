import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useMediaQuery } from './useMediaQuery'

function createMockMQL(matches: boolean): MediaQueryList & {
  __fire: (next: boolean) => void
} {
  const listeners = new Set<EventListener>()
  const mql = {
    matches,
    media: '(min-width: 768px)',
    onchange: null,
    addListener: (): void => undefined,
    removeListener: (): void => undefined,
    addEventListener: (_event: string, cb: EventListenerOrEventListenerObject): void => {
      if (typeof cb === 'function') {
        listeners.add(cb)
      }
    },
    removeEventListener: (_event: string, cb: EventListenerOrEventListenerObject): void => {
      if (typeof cb === 'function') {
        listeners.delete(cb)
      }
    },
    dispatchEvent: (): boolean => false,
    __fire: (next: boolean): void => {
      Object.defineProperty(mql, 'matches', { value: next, configurable: true })
      const event = { matches: next, media: mql.media } as MediaQueryListEvent
      for (const cb of listeners) {
        cb(event)
      }
    },
  } as MediaQueryList & { __fire: (next: boolean) => void }
  return mql
}

describe('useMediaQuery', (): void => {
  afterEach((): void => {
    vi.restoreAllMocks()
  })

  it('returns the initial matchMedia matches value', (): void => {
    const mql = createMockMQL(true)
    vi.spyOn(window, 'matchMedia').mockReturnValue(mql)
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))
    expect(result.current).toBe(true)
  })

  it('updates when the matchMedia change event fires', (): void => {
    const mql = createMockMQL(false)
    vi.spyOn(window, 'matchMedia').mockReturnValue(mql)
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))
    expect(result.current).toBe(false)
    act((): void => {
      mql.__fire(true)
    })
    expect(result.current).toBe(true)
  })

  it('removes the change listener on unmount', (): void => {
    const mql = createMockMQL(false)
    const removeSpy = vi.spyOn(mql, 'removeEventListener')
    vi.spyOn(window, 'matchMedia').mockReturnValue(mql)
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 768px)'))
    unmount()
    expect(removeSpy).toHaveBeenCalledWith('change', expect.any(Function))
  })
})
