import { describe, expect, it, vi } from 'vitest'

import { generateNonce, injectNonce } from './csp'

describe('generateNonce', (): void => {
  it('produces a fresh value on each call', (): void => {
    const a = generateNonce()
    const b = generateNonce()
    expect(a).not.toBe(b)
  })

  it('uses crypto.getRandomValues', (): void => {
    const spy = vi.spyOn(globalThis.crypto, 'getRandomValues')
    generateNonce()
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  it('returns base64url-shaped output of length >= 20', (): void => {
    const nonce = generateNonce()
    expect(nonce.length).toBeGreaterThanOrEqual(20)
    // base64url = A-Z a-z 0-9 - _  (no '=' padding, no '+' or '/')
    expect(nonce).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})

describe('injectNonce', (): void => {
  it('is pure: same input → identical output', (): void => {
    const html = '<html><head><title>x</title></head><body></body></html>'
    const a = injectNonce(html, 'nonce-A')
    const b = injectNonce(html, 'nonce-A')
    expect(a).toBe(b)
  })

  it('injects the csp-nonce meta tag once into <head>', (): void => {
    const html = '<html><head><title>x</title></head><body></body></html>'
    const out = injectNonce(html, 'aaa')
    expect(out).toContain('<meta name="csp-nonce" content="aaa">')
    // exactly one occurrence
    const matches = out.match(/<meta name="csp-nonce"/g) ?? []
    expect(matches.length).toBe(1)
  })

  it('is idempotent: re-running on already-injected HTML does not duplicate the meta', (): void => {
    const html = '<html><head><title>x</title></head><body></body></html>'
    const once = injectNonce(html, 'aaa')
    const twice = injectNonce(once, 'aaa')
    const matches = twice.match(/<meta name="csp-nonce"/g) ?? []
    expect(matches.length).toBe(1)
  })

  it('injects after the <html> opening tag if no <head> is present', (): void => {
    const html = '<html><body></body></html>'
    const out = injectNonce(html, 'bbb')
    expect(out).toContain('<meta name="csp-nonce" content="bbb">')
  })

  it('rewrites Vite HMR inline scripts (import.meta.url marker) to carry the nonce', (): void => {
    const html =
      '<html><head><title>x</title></head><body>' +
      '<script type="module">import RefreshRuntime from "/@react-refresh"; ' +
      'RefreshRuntime.injectIntoGlobalHook(window); ' +
      'console.log(import.meta.url);</script>' +
      '</body></html>'
    const out = injectNonce(html, 'ccc')
    expect(out).toMatch(/<script[^>]*nonce="ccc"[^>]*>/)
  })

  it('rewrites Vite HMR inline scripts (vite preamble marker) to carry the nonce', (): void => {
    const html =
      '<html><head></head><body>' +
      '<script type="module">window.__vite_plugin_react_preamble_installed__ = true;</script>' +
      '</body></html>'
    const out = injectNonce(html, 'ddd')
    expect(out).toMatch(/<script[^>]*nonce="ddd"[^>]*>/)
  })

  it('rewrites Vite HMR inline scripts (react-refresh injectIntoGlobalHook marker)', (): void => {
    const html =
      '<html><head></head><body>' +
      '<script type="module">' +
      'import { injectIntoGlobalHook } from "/@react-refresh";' +
      'injectIntoGlobalHook(window);' +
      '</script></body></html>'
    const out = injectNonce(html, 'rrr')
    expect(out).toMatch(/<script[^>]*nonce="rrr"[^>]*>/)
  })

  it('rewrites Vite HMR inline scripts (RefreshReg marker)', (): void => {
    const html =
      '<html><head></head><body>' +
      '<script type="module">window.$RefreshReg$ = () => {};</script>' +
      '</body></html>'
    const out = injectNonce(html, 'sss')
    expect(out).toMatch(/<script[^>]*nonce="sss"[^>]*>/)
  })

  it('does NOT rewrite scripts with src= (external scripts)', (): void => {
    const html =
      '<html><head></head><body>' +
      '<script type="module" src="/src/main.tsx"></script>' +
      '</body></html>'
    const out = injectNonce(html, 'eee')
    // External script tags must not gain a nonce attribute (CSP 'self' covers them).
    expect(out).not.toMatch(/<script[^>]*src="\/src\/main\.tsx"[^>]*nonce="eee"/)
  })

  it('leaves inline scripts WITHOUT HMR markers alone (no false positives)', (): void => {
    const html =
      '<html><head></head><body>' +
      '<script>console.log("plain script")</script>' +
      '</body></html>'
    const out = injectNonce(html, 'fff')
    expect(out).not.toMatch(/<script[^>]*nonce="fff"/)
  })

  it('skips inline scripts that already carry a nonce attribute', (): void => {
    const html =
      '<html><head></head><body>' +
      '<script type="module" nonce="preset">console.log(import.meta.url)</script>' +
      '</body></html>'
    const out = injectNonce(html, 'replacement')
    // The pre-existing nonce stays; we do not rewrite.
    expect(out).toContain('nonce="preset"')
    expect(out).not.toContain('nonce="replacement"')
  })

  it('falls back to prepending the meta tag when neither <html> nor <head> are present', (): void => {
    const html = '<body><p>fragment</p></body>'
    const out = injectNonce(html, 'ggg')
    expect(out.startsWith('<meta name="csp-nonce" content="ggg">')).toBe(true)
    expect(out.endsWith('<body><p>fragment</p></body>')).toBe(true)
  })
})
