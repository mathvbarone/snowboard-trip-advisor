import { describe, expect, it } from 'vitest'
import { csp, cspHeader } from './csp'

describe('csp', (): void => {
  it("default-src is 'self'", (): void => {
    expect(csp['default-src']).toEqual(["'self'"])
  })
  it('forbids framing entirely', (): void => {
    expect(csp['frame-ancestors']).toEqual(["'none'"])
  })
  it('blocks data: URIs except for images', (): void => {
    expect(csp['img-src']).toContain('data:')
    expect(csp['connect-src']).not.toContain('data:')
  })
})

describe('cspHeader', (): void => {
  it('serializes directives in stable order', (): void => {
    expect(cspHeader()).toMatch(/^default-src 'self';/)
    expect(cspHeader()).toContain("frame-ancestors 'none'")
    expect(cspHeader()).toContain('upgrade-insecure-requests')
  })
})
