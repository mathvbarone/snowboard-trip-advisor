import { ISOCountryCode, ResortSlug } from '@snowboard-trip-advisor/schema'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { __resetForTests, setRoute, useURLState } from './useURLState'

beforeEach((): void => {
  __resetForTests()
  window.history.replaceState({}, '', '/')
})

afterEach((): void => {
  __resetForTests()
  window.history.replaceState({}, '', '/')
  vi.restoreAllMocks()
})

describe('useURLState (PR 4.2)', (): void => {
  it('returns parsed Route from window.location.search', (): void => {
    window.history.replaceState({}, '', '/?route=dashboard')
    const { result } = renderHook(() => useURLState())
    expect(result.current).toEqual({ route: 'dashboard' })
  })

  it('returns dashboard route when URL has no route param (default)', (): void => {
    window.history.replaceState({}, '', '/')
    const { result } = renderHook(() => useURLState())
    expect(result.current).toEqual({ route: 'dashboard' })
  })

  it('re-renders on popstate', (): void => {
    const { result } = renderHook(() => useURLState())
    act((): void => {
      window.history.pushState({}, '', '/?route=dashboard')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(result.current).toEqual({ route: 'dashboard' })
  })

  it('re-renders on programmatic setRoute (no popstate dispatched)', (): void => {
    const { result } = renderHook(() => useURLState())
    act((): void => { setRoute({ route: 'dashboard' }) })
    expect(result.current).toEqual({ route: 'dashboard' })
    // serializeURL omits the default 'dashboard' route → empty search
    expect(window.location.search).toBe('')
  })

  it('two concurrent consumers both see the post-setRoute Route', (): void => {
    const { result: r1 } = renderHook(() => useURLState())
    const { result: r2 } = renderHook(() => useURLState())
    act((): void => { setRoute({ route: 'dashboard' }) })
    expect(r1.current).toEqual({ route: 'dashboard' })
    expect(r2.current).toEqual({ route: 'dashboard' })
  })

  it('removes popstate listener on unsubscribe', (): void => {
    const { unmount } = renderHook(() => useURLState())
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    unmount()
    expect(removeSpy).toHaveBeenCalledWith('popstate', expect.any(Function))
  })

  it('__resetForTests clears subscribers so subsequent tests start clean', (): void => {
    const { result } = renderHook(() => useURLState())
    // setRoute before reset
    act((): void => { setRoute({ route: 'dashboard' }) })
    expect(result.current).toEqual({ route: 'dashboard' })

    // reset — now subscribers Set is empty
    __resetForTests()

    // A fresh hook after reset re-derives from window.location
    window.history.replaceState({}, '', '/')
    const { result: r2 } = renderHook(() => useURLState())
    expect(r2.current).toEqual({ route: 'dashboard' })
  })

  it('setRoute pushes serializeURL output to the URL bar (resorts + country)', (): void => {
    const { result } = renderHook(() => useURLState())
    act((): void => {
      setRoute({ route: 'resorts', country: ISOCountryCode.parse('PL') })
    })
    // The URL bar must reflect the search so deep links + reload preserve state.
    expect(window.location.search).toBe('?route=resorts&country=PL')
    // Subscribers re-derive against the new URL via the cache invalidation.
    expect(result.current).toEqual({
      route: 'resorts',
      country: ISOCountryCode.parse('PL'),
    })
  })

  it('setRoute pushes editor route + slug to the URL bar', (): void => {
    const { result } = renderHook(() => useURLState())
    act((): void => {
      setRoute({ route: 'editor', slug: ResortSlug.parse('kotelnica-bialczanska') })
    })
    expect(window.location.search).toBe('?route=editor&slug=kotelnica-bialczanska')
    expect(result.current).toEqual({
      route: 'editor',
      slug: ResortSlug.parse('kotelnica-bialczanska'),
    })
  })
})
