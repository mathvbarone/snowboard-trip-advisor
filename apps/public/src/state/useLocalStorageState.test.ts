import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { useLocalStorageState } from './useLocalStorageState'

const schema = z.object({ count: z.number() })

describe('useLocalStorageState', (): void => {
  beforeEach((): void => {
    window.localStorage.clear()
  })
  afterEach((): void => {
    window.localStorage.clear()
  })

  it('returns the default when localStorage has no value for the key', (): void => {
    const { result } = renderHook(() =>
      useLocalStorageState('test-key', schema, { count: 0 }),
    )
    expect(result.current[0]).toEqual({ count: 0 })
  })

  it('reads a parsed value from localStorage on mount', (): void => {
    window.localStorage.setItem('test-key', JSON.stringify({ count: 7 }))
    const { result } = renderHook(() =>
      useLocalStorageState('test-key', schema, { count: 0 }),
    )
    expect(result.current[0]).toEqual({ count: 7 })
  })

  it('falls back to the default when stored JSON is invalid', (): void => {
    window.localStorage.setItem('test-key', '{not json')
    const { result } = renderHook(() =>
      useLocalStorageState('test-key', schema, { count: 0 }),
    )
    expect(result.current[0]).toEqual({ count: 0 })
  })

  it('falls back to the default when stored JSON fails schema parse', (): void => {
    window.localStorage.setItem('test-key', JSON.stringify({ unexpected: 'shape' }))
    const { result } = renderHook(() =>
      useLocalStorageState('test-key', schema, { count: 0 }),
    )
    expect(result.current[0]).toEqual({ count: 0 })
  })

  it('writes to localStorage when setter is called', (): void => {
    const { result } = renderHook(() =>
      useLocalStorageState('test-key', schema, { count: 0 }),
    )
    act((): void => {
      result.current[1]({ count: 5 })
    })
    expect(result.current[0]).toEqual({ count: 5 })
    expect(window.localStorage.getItem('test-key')).toBe(JSON.stringify({ count: 5 }))
  })
})
