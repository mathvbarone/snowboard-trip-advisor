import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useShortlist } from './useShortlist'

function setLocation(search: string): void {
  window.history.replaceState({}, '', `/${search.length > 0 ? `?${search}` : ''}`)
}

describe('useShortlist (skeleton — full impl in PR 3.3)', (): void => {
  beforeEach((): void => {
    setLocation('')
  })
  afterEach((): void => {
    setLocation('')
  })

  it('returns an empty shortlist on first mount when URL has no &shortlist=', (): void => {
    const { result } = renderHook(() => useShortlist())
    expect(result.current.shortlist).toEqual([])
  })

  it('returns the URL slugs when &shortlist= is present', (): void => {
    setLocation('shortlist=kotelnica-bialczanska,spindleruv-mlyn')
    const { result } = renderHook(() => useShortlist())
    expect(result.current.shortlist).toEqual(['kotelnica-bialczanska', 'spindleruv-mlyn'])
  })
})
