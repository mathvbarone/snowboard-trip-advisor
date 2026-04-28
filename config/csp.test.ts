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
  })
})

describe('cspHeader', (): void => {
  it('serializes directives in stable order (dev mode)', (): void => {
    const header = cspHeader({ mode: 'development', nonce: 'abc123' })
    expect(header).toMatch(/^default-src 'self';/)
    expect(header).toContain("frame-ancestors 'none'")
    expect(header).toContain('upgrade-insecure-requests')
  })

  it('dev mode includes nonce on script-src and websocket origins on connect-src', (): void => {
    const header = cspHeader({ mode: 'development', nonce: 'devNonce' })
    expect(header).toContain("script-src 'self' 'nonce-devNonce'")
    expect(header).toContain('ws://localhost:*')
    expect(header).toContain('wss://localhost:*')
    expect(header).toContain('http://localhost:*')
  })

  it('prod mode excludes the nonce and websocket origins', (): void => {
    const header = cspHeader({ mode: 'production' })
    expect(header).toContain("script-src 'self'")
    expect(header).not.toContain('nonce-')
    expect(header).not.toContain('ws://')
    expect(header).not.toContain('wss://')
    expect(header).not.toContain('http://localhost')
    // connect-src in prod is only 'self'
    expect(header).toMatch(/connect-src 'self'(?:;|$)/)
  })

  it('keeps style-src and img-src directives consistent across modes', (): void => {
    const dev = cspHeader({ mode: 'development', nonce: 'x' })
    const prod = cspHeader({ mode: 'production' })
    expect(dev).toContain("style-src 'self' 'unsafe-inline'")
    expect(prod).toContain("style-src 'self' 'unsafe-inline'")
    expect(dev).toContain("img-src 'self' data: https:")
    expect(prod).toContain("img-src 'self' data: https:")
  })

  it('is pure: identical input yields identical output', (): void => {
    const a = cspHeader({ mode: 'development', nonce: 'same-nonce' })
    const b = cspHeader({ mode: 'development', nonce: 'same-nonce' })
    expect(a).toBe(b)
    const p1 = cspHeader({ mode: 'production' })
    const p2 = cspHeader({ mode: 'production' })
    expect(p1).toBe(p2)
  })

  it('dev mode without nonce omits the nonce token (defensive default)', (): void => {
    const header = cspHeader({ mode: 'development' })
    expect(header).not.toContain('nonce-')
    expect(header).toContain("script-src 'self'")
  })
})
