import { describe, expect, it } from 'vitest'
import { PACKAGE_NAME } from './index'

describe('schema package', (): void => {
  it('exposes its package name constant', (): void => {
    expect(PACKAGE_NAME).toBe('@snowboard-trip-advisor/schema')
  })
})
