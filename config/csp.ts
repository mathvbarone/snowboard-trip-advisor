// Single source of truth for the project's Content-Security-Policy posture.
//
// Consumers:
//   - Dev Vite plugin (Epic 3) — injects the serialized header into the
//     dev server response.
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

export function cspHeader(): string {
  return (Object.entries(csp) as [string, readonly string[]][])
    .map(([directive, sources]) =>
      sources.length > 0 ? `${directive} ${sources.join(' ')}` : directive,
    )
    .join('; ')
}
