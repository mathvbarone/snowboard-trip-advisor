import { ResortSlug } from '@snowboard-trip-advisor/schema'
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useDroppedSlugs } from './useDroppedSlugs'

describe('useDroppedSlugs', (): void => {
  it('returns an empty set when every URL slug is in the dataset', (): void => {
    const dataset = new Set([
      ResortSlug.parse('kotelnica-bialczanska'),
      ResortSlug.parse('spindleruv-mlyn'),
    ])
    const { result } = renderHook(() =>
      useDroppedSlugs(['kotelnica-bialczanska', 'spindleruv-mlyn'], dataset),
    )
    expect(result.current.size).toBe(0)
  })

  it('returns each URL slug that is not present in the dataset', (): void => {
    const dataset = new Set([ResortSlug.parse('kotelnica-bialczanska')])
    const { result } = renderHook(() =>
      useDroppedSlugs(['kotelnica-bialczanska', 'unknown-resort'], dataset),
    )
    expect(result.current.size).toBe(1)
    expect(result.current.has('unknown-resort')).toBe(true)
  })

  it('returns an empty set when the URL list is empty', (): void => {
    const dataset = new Set([ResortSlug.parse('kotelnica-bialczanska')])
    const { result } = renderHook(() => useDroppedSlugs([], dataset))
    expect(result.current.size).toBe(0)
  })
})
