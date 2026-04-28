// Pure helpers backing the dev CSP plugin in vite.config.ts.
//
// `generateNonce` produces a per-request 16-byte base64url nonce
// (no `=` padding, `-`/`_` substitutions). The dev plugin emits this
// as the `'nonce-…'` source on script-src AND mirrors it on every
// inline script tag the Vite HMR transform injected into the served
// HTML.
//
// `injectNonce` is the HTML rewrite that ties the two together.
// Vite's `transformIndexHtml` adds inline scripts (the React refresh
// runtime, the HMR preamble) without a `nonce` attribute; without
// rewriting, the dev CSP would block them.
//
// Both helpers are pure and unit-tested directly; the lifecycle
// adapter that wires them into a `configureServer` middleware lives
// in vite.config.ts and is coverage-excluded there.

const NONCE_BYTES = 16

export function generateNonce(): string {
  const buf = new Uint8Array(NONCE_BYTES)
  crypto.getRandomValues(buf)
  // base64url: btoa is browser+Node 20 friendly via `globalThis.btoa`.
  let binary = ''
  for (const byte of buf) {
    binary += String.fromCharCode(byte)
  }
  const b64 = btoa(binary)
  return b64.replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

const NONCE_META_RE = /<meta\s+name="csp-nonce"/i
const HMR_MARKERS = [
  'import.meta.url',
  '__vite_plugin_react_preamble_installed__',
]

function injectMetaTag(html: string, nonce: string): string {
  if (NONCE_META_RE.test(html)) {
    return html
  }
  const meta = `<meta name="csp-nonce" content="${nonce}">`
  const headOpenMatch = /<head(\s[^>]*)?>/i.exec(html)
  if (headOpenMatch !== null) {
    const idx = headOpenMatch.index + headOpenMatch[0].length
    return `${html.slice(0, idx)}${meta}${html.slice(idx)}`
  }
  const htmlOpenMatch = /<html(\s[^>]*)?>/i.exec(html)
  if (htmlOpenMatch !== null) {
    const idx = htmlOpenMatch.index + htmlOpenMatch[0].length
    return `${html.slice(0, idx)}${meta}${html.slice(idx)}`
  }
  return `${meta}${html}`
}

// Rewrite inline <script> tags whose body contains a Vite HMR marker
// to carry `nonce="<nonce>"`. Tags with `src=` are external and stay
// untouched — CSP `'self'` covers them.
function rewriteInlineScripts(html: string, nonce: string): string {
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
  return html.replace(re, (full, attrs: string, body: string): string => {
    if (/\bsrc\s*=/.test(attrs)) {
      return full
    }
    if (/\bnonce\s*=/.test(attrs)) {
      return full
    }
    const hasMarker = HMR_MARKERS.some((m): boolean => body.includes(m))
    if (!hasMarker) {
      return full
    }
    const trimmed = attrs.replace(/\s+$/, '')
    return `<script${trimmed} nonce="${nonce}">${body}</script>`
  })
}

export function injectNonce(html: string, nonce: string): string {
  const withMeta = injectMetaTag(html, nonce)
  return rewriteInlineScripts(withMeta, nonce)
}
