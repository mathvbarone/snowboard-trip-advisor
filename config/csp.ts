// Single source of truth for the project's Content-Security-Policy posture.
//
// Consumers:
//   - Dev Vite plugin (Epic 3) — injects the serialized header into the
//     dev server response with a per-request nonce.
//   - Prod nginx config (Epic 6) — emits the same header from the edge.
//
// Spec ref: §2.6 (CSP posture). Keep this file authoritative; do not
// duplicate directive lists into the dev plugin or the nginx config.

export const csp = {
  'default-src': ["'self'"],
  'img-src': ["'self'", 'data:', 'https:'],
  'font-src': ["'self'"],
  'connect-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'frame-ancestors': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'upgrade-insecure-requests': [],
} as const

export interface CspOptions {
  readonly mode: 'development' | 'production'
  readonly nonce?: string
}

// Build the directive map for the requested mode. Dev adds Vite HMR
// websocket origins to connect-src and (when a nonce is supplied) a
// `'nonce-…'` source to script-src. Prod stays at the locked-down
// baseline; Vite's hashed bundle filenames are covered by `'self'`.
function buildDirectives(
  options: CspOptions,
): readonly (readonly [string, readonly string[]])[] {
  const baseline: ReadonlyArray<readonly [string, readonly string[]]> = [
    ['default-src', csp['default-src']],
    ['img-src', csp['img-src']],
    ['font-src', csp['font-src']],
    ['connect-src', csp['connect-src']],
    ['script-src', csp['script-src']],
    ['style-src', csp['style-src']],
    ['frame-ancestors', csp['frame-ancestors']],
    ['base-uri', csp['base-uri']],
    ['form-action', csp['form-action']],
    ['upgrade-insecure-requests', csp['upgrade-insecure-requests']],
  ]
  if (options.mode === 'production') {
    return baseline
  }
  // development: extend connect-src with HMR origins; if nonce supplied, extend script-src.
  const nonce = options.nonce
  return baseline.map(([directive, sources]) => {
    if (directive === 'connect-src') {
      return [
        directive,
        [
          ...sources,
          'ws://localhost:*',
          'wss://localhost:*',
          'http://localhost:*',
        ],
      ] as const
    }
    if (directive === 'script-src' && nonce !== undefined) {
      return [directive, [...sources, `'nonce-${nonce}'`]] as const
    }
    return [directive, sources] as const
  })
}

export function cspHeader(options: CspOptions): string {
  return buildDirectives(options)
    .map(([directive, sources]) =>
      sources.length > 0 ? `${directive} ${sources.join(' ')}` : directive,
    )
    .join('; ')
}
