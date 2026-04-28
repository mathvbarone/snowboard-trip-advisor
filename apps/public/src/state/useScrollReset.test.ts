import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useScrollReset } from './useScrollReset'

describe('useScrollReset (stub — full impl in PR 3.6)', (): void => {
  it('is callable and returns void', (): void => {
    const { result } = renderHook((): unknown => {
      useScrollReset()
      return undefined
    })
    expect(result.current).toBeUndefined()
  })
})
