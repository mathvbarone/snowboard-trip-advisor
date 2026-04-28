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
    const pushSpy = vi.spyOn(window.history, 'pushState')
    const replaceSpy = vi.spyOn(window.history, 'replaceState')
    const { result } = renderHook(() => useURLState())
    act((): void => {
      setURLState({ view: 'matrix' })
    })
    expect(pushSpy).toHaveBeenCalledTimes(1)
    expect(replaceSpy).not.toHaveBeenCalled()
    expect(result.current.view).toBe('matrix')
  })

  it('uses replaceState when only non-PUSH fields change', (): void => {
    setLocation('view=cards&sort=name')
    const pushSpy = vi.spyOn(window.history, 'pushState')
    const replaceSpy = vi.spyOn(window.history, 'replaceState')
    const { result } = renderHook(() => useURLState())
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

  it('serializes a default-only state to a clean pathname URL (no query string)', (): void => {
    setLocation('sort=price_asc')
    renderHook(() => useURLState())
    act((): void => {
      setURLState({ sort: 'name' })
    })
    expect(window.location.search).toBe('')
  })

  it('carries the @warning JSDoc forbidding setURLState inside startTransition', (): void => {
    const path = resolve(import.meta.dirname, 'useURLState.ts')
    const source = readFileSync(path, 'utf8')
    expect(source).toContain('@warning')
    expect(source).toContain('startTransition')
  })
})
