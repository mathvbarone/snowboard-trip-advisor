import { describe, expect, it, vi } from 'vitest'

import {
  createCspDevMiddleware,
  type CspMiddlewareNext,
  type CspMiddlewareReq,
  type CspMiddlewareRes,
} from '../lib/csp'

interface CapturedRes extends CspMiddlewareRes {
  readonly headers: Record<string, string>
  body: string
}

function makeRes(): CapturedRes {
  const headers: Record<string, string> = {}
  return {
    headers,
    body: '',
    setHeader(name: string, value: string): void {
      headers[name] = value
    },
    end(chunk?: string): void {
      this.body = chunk ?? ''
    },
  }
}

const HMR_INDEX_HTML =
  '<!doctype html><html lang="en"><head><title>x</title></head><body>' +
  '<script type="module">import RefreshRuntime from "/@react-refresh"; ' +
  'RefreshRuntime.injectIntoGlobalHook(window); ' +
  'console.log(import.meta.url);</script>' +
  '<script type="module" src="/src/main.tsx"></script>' +
  '</body></html>'

describe('cspDevPlugin middleware (smoke)', (): void => {
  it('issues a fresh nonce per request and matches it on the script tags + CSP header', async (): Promise<void> => {
    // Stub the deps: readIndexHtml returns a static fixture; the
    // transformIndexHtml stub returns the fixture unchanged (we are
    // testing the nonce/inject pipeline, not Vite's HTML pipeline).
    const readIndexHtml = vi.fn((): Promise<string> => Promise.resolve(HMR_INDEX_HTML))
    const transformIndexHtml = vi.fn(
      (_url: string, html: string): Promise<string> => Promise.resolve(html),
    )
    const middleware = createCspDevMiddleware({
      readIndexHtml,
      transformIndexHtml,
    })

    const req: CspMiddlewareReq = { url: '/', originalUrl: '/' }
    const next: CspMiddlewareNext = vi.fn()

    const res1 = makeRes()
    await middleware(req, res1, next)
    const res2 = makeRes()
    await middleware(req, res2, next)

    // Both responses set CSP and Content-Type
    expect(res1.headers['Content-Security-Policy']).toBeDefined()
    expect(res2.headers['Content-Security-Policy']).toBeDefined()
    expect(res1.headers['Content-Type']).toBe('text/html; charset=utf-8')
    expect(res2.headers['Content-Type']).toBe('text/html; charset=utf-8')

    // Extract the nonce from each CSP header
    const nonceRe = /'nonce-([A-Za-z0-9_-]+)'/
    const csp1 = res1.headers['Content-Security-Policy'] ?? ''
    const csp2 = res2.headers['Content-Security-Policy'] ?? ''
    const m1 = nonceRe.exec(csp1)
    const m2 = nonceRe.exec(csp2)
    expect(m1).not.toBeNull()
    expect(m2).not.toBeNull()
    const n1 = m1?.[1] ?? ''
    const n2 = m2?.[1] ?? ''
    expect(n1).not.toBe(n2)

    // The body's HMR inline script carries the matching nonce
    expect(res1.body).toContain(`nonce="${n1}"`)
    expect(res2.body).toContain(`nonce="${n2}"`)
    // External script (src=) is NOT rewritten with the nonce
    expect(res1.body).not.toMatch(
      new RegExp(`<script[^>]*src="/src/main\\.tsx"[^>]*nonce="${n1}"`),
    )
  })

  it('passes through requests for non-HTML URLs to next()', async (): Promise<void> => {
    const readIndexHtml = vi.fn((): Promise<string> => Promise.resolve(HMR_INDEX_HTML))
    const transformIndexHtml = vi.fn(
      (_url: string, html: string): Promise<string> => Promise.resolve(html),
    )
    const middleware = createCspDevMiddleware({
      readIndexHtml,
      transformIndexHtml,
    })

    const req: CspMiddlewareReq = { url: '/main.tsx', originalUrl: '/main.tsx' }
    const res = makeRes()
    const next = vi.fn<CspMiddlewareNext>()
    await middleware(req, res, next)
    expect(next).toHaveBeenCalledOnce()
    expect(readIndexHtml).not.toHaveBeenCalled()
  })

  it('passes through requests with no url to next()', async (): Promise<void> => {
    const readIndexHtml = vi.fn((): Promise<string> => Promise.resolve(HMR_INDEX_HTML))
    const transformIndexHtml = vi.fn(
      (_url: string, html: string): Promise<string> => Promise.resolve(html),
    )
    const middleware = createCspDevMiddleware({
      readIndexHtml,
      transformIndexHtml,
    })

    const req: CspMiddlewareReq = {}
    const res = makeRes()
    const next = vi.fn<CspMiddlewareNext>()
    await middleware(req, res, next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('forwards thrown errors via next(err)', async (): Promise<void> => {
    const readIndexHtml = vi.fn(
      (): Promise<string> => Promise.reject(new Error('disk read failed')),
    )
    const transformIndexHtml = vi.fn(
      (_url: string, html: string): Promise<string> => Promise.resolve(html),
    )
    const middleware = createCspDevMiddleware({
      readIndexHtml,
      transformIndexHtml,
    })

    const req: CspMiddlewareReq = { url: '/' }
    const res = makeRes()
    let captured: unknown
    const next: CspMiddlewareNext = (err): void => {
      captured = err
    }
    await middleware(req, res, next)
    expect(captured).toBeInstanceOf(Error)
    expect(res.body).toBe('')
  })
})
