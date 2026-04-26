import { describe, expect, it } from 'vitest'
import { PACKAGE_NAME } from './index'

describe('integrations package', (): void => {
  it('exposes its package name constant', (): void => {
    expect(PACKAGE_NAME).toBe('@snowboard-trip-advisor/integrations')
  })
})
