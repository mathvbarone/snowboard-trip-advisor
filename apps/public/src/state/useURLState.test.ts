import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setURLState, useURLState } from './useURLState'

function setLocation(search: string): void {
  window.history.replaceState({}, '', `/${search.length > 0 ? `?${search}` : ''}`)
}

describe('useURLState', (): void => {
  beforeEach((): void => {
    setLocation('')
  })
  afterEach((): void => {
    setLocation('')
    vi.restoreAllMocks()
  })

  it('returns the parsed URL state', (): void => {
    setLocation('view=matrix&sort=price_asc')
    const { result } = renderHook(() => useURLState())
    expect(result.current.view).toBe('matrix')
    expect(result.current.sort).toBe('price_asc')
  })

  it('re-renders on popstate', (): void => {
    setLocation('view=cards')
    const { result } = renderHook(() => useURLState())
    expect(result.current.view).toBe('cards')
    act((): void => {
      window.history.replaceState({}, '', '/?view=matrix')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(result.current.view).toBe('matrix')
  })

  it('uses pushState when a PUSH_KEYS field changes', (): void => {
    setLocation('view=cards')
    // Render the hook first so subscribe-time normalization (which strips
    // the default `view=cards` from the address bar) finishes before we
    // start counting history writes. The spies below only see the writes
    // driven by setURLState.
    const { result } = renderHook(() => useURLState())
    const pushSpy = vi.spyOn(window.history, 'pushState')
    const replaceSpy = vi.spyOn(window.history, 'replaceState')
    act((): void => {
      setURLState({ view: 'matrix' })
    })
    expect(pushSpy).toHaveBeenCalledTimes(1)
    expect(replaceSpy).not.toHaveBeenCalled()
    expect(result.current.view).toBe('matrix')
  })

  it('uses replaceState when only non-PUSH fields change', (): void => {
    setLocation('view=cards&sort=name')
    const { result } = renderHook(() => useURLState())
    const pushSpy = vi.spyOn(window.history, 'pushState')
    const replaceSpy = vi.spyOn(window.history, 'replaceState')
    act((): void => {
      setURLState({ sort: 'price_asc' })
    })
    expect(replaceSpy).toHaveBeenCalledTimes(1)
    expect(pushSpy).not.toHaveBeenCalled()
    expect(result.current.sort).toBe('price_asc')
  })

  it('uses pushState when detail (a PUSH key) opens', (): void => {
    setLocation('view=cards')
    const pushSpy = vi.spyOn(window.history, 'pushState')
    const { result } = renderHook(() => useURLState())
    act((): void => {
      setURLState({ detail: 'kotelnica-bialczanska' })
    })
    expect(pushSpy).toHaveBeenCalledTimes(1)
    expect(result.current.detail).toBe('kotelnica-bialczanska')
  })

  it('two same-tick setters compose serially (each transition computed against latest URL)', (): void => {
    setLocation('view=cards')
    const { result } = renderHook(() => useURLState())
    act((): void => {
      setURLState({ view: 'matrix' })
      setURLState({ sort: 'price_asc' })
    })
    expect(result.current.view).toBe('matrix')
    expect(result.current.sort).toBe('price_asc')
  })

  it('removes its popstate listener on unsubscribe', (): void => {
    setLocation('view=cards')
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useURLState())
    unmount()
    expect(removeSpy).toHaveBeenCalledWith('popstate', expect.any(Function))
  })

  // mergeURLState branches — exactOptionalPropertyTypes-safe merge.
  // PR 3.5 added explicit-undefined clearing so DetailDrawer can call
  // `setURLState({ detail: undefined })` to close the drawer. The
  // merge function preserves untouched optional keys and clears the
  // ones the caller explicitly nulls.

  it('clears detail when partial sets detail: undefined explicitly', (): void => {
    setLocation('detail=kotelnica-bialczanska')
    const { result } = renderHook(() => useURLState())
    expect(result.current.detail).toBe('kotelnica-bialczanska')
    act((): void => {
      setURLState({ detail: undefined })
    })
    expect(result.current.detail).toBeUndefined()
    expect(window.location.search).not.toContain('detail=')
  })

  it('preserves detail when partial does not include the detail key', (): void => {
    setLocation('detail=kotelnica-bialczanska&sort=name')
    const { result } = renderHook(() => useURLState())
    act((): void => {
      // sort change must not blow away an unrelated detail key.
      setURLState({ sort: 'price_asc' })
    })
    expect(result.current.detail).toBe('kotelnica-bialczanska')
  })

  it('sets highlight from partial when partial.highlight is defined', (): void => {
    setLocation('')
    const { result } = renderHook(() => useURLState())
    act((): void => {
      setURLState({ highlight: 'snow_depth_cm' })
    })
    expect(result.current.highlight).toBe('snow_depth_cm')
  })

  it('clears highlight when partial sets highlight: undefined explicitly', (): void => {
    setLocation('highlight=snow_depth_cm')
    const { result } = renderHook(() => useURLState())
    expect(result.current.highlight).toBe('snow_depth_cm')
    act((): void => {
      setURLState({ highlight: undefined })
    })
    expect(result.current.highlight).toBeUndefined()
  })

  it('preserves highlight when partial does not include the highlight key', (): void => {
    setLocation('highlight=snow_depth_cm&sort=name')
    const { result } = renderHook(() => useURLState())
    act((): void => {
      setURLState({ sort: 'price_asc' })
    })
    expect(result.current.highlight).toBe('snow_depth_cm')
  })

  it('serializes a default-only state to a clean pathname URL (no query string)', (): void => {
    setLocation('sort=price_asc')
    renderHook(() => useURLState())
    act((): void => {
      setURLState({ sort: 'name' })
    })
    expect(window.location.search).toBe('')
  })

  it('normalizes invalid URL params back into the address bar on mount (spec §3.2)', (): void => {
    // parseURL drops invalid values silently. Spec §3.2 also requires the
    // URL to be rewritten to its valid subset on the same render commit,
    // otherwise copied/shared links keep the bad query string and every
    // popstate re-parses junk.
    setLocation('view=garbage&sort=alsogarbage')
    const replaceSpy = vi.spyOn(window.history, 'replaceState')
    const { result } = renderHook(() => useURLState())
    // Both view and sort were invalid → defaults → serializeURL returns ''.
    expect(window.location.search).toBe('')
    expect(result.current.view).toBe('cards')
    expect(result.current.sort).toBe('name')
    expect(replaceSpy).toHaveBeenCalled()
  })

  it('preserves valid params while stripping invalid ones (canonical subset rewrite)', (): void => {
    // Mixed case: `view=matrix` is valid; `sort=garbage` is invalid. The
    // canonical serialization is `view=matrix` only, and the address bar
    // should be rewritten to that subset (covering the non-empty-canonical
    // branch of normalizeIfNeeded).
    setLocation('view=matrix&sort=garbage')
    const { result } = renderHook(() => useURLState())
    expect(window.location.search).toBe('?view=matrix')
    expect(result.current.view).toBe('matrix')
    expect(result.current.sort).toBe('name')
  })

  it('does not call replaceState when the URL is already canonical', (): void => {
    setLocation('view=matrix')
    const replaceSpy = vi.spyOn(window.history, 'replaceState')
    renderHook(() => useURLState())
    // The URL was already in canonical form — no extra history write.
    expect(replaceSpy).not.toHaveBeenCalled()
    expect(window.location.search).toBe('?view=matrix')
  })

  it('re-normalizes after popstate restores a malformed share URL', (): void => {
    setLocation('view=cards')
    const { result } = renderHook(() => useURLState())
    expect(result.current.view).toBe('cards')
    act((): void => {
      // Simulate browser back/forward landing on a malformed URL — the
      // popstate handler must normalize before notifying subscribers.
      window.history.replaceState({}, '', '/?view=garbage&sort=alsogarbage')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(window.location.search).toBe('')
    expect(result.current.view).toBe('cards')
    expect(result.current.sort).toBe('name')
  })

  it('carries the @warning JSDoc forbidding setURLState inside startTransition', (): void => {
    const path = resolve(import.meta.dirname, 'useURLState.ts')
    const source = readFileSync(path, 'utf8')
    expect(source).toContain('@warning')
    expect(source).toContain('startTransition')
  })
})
