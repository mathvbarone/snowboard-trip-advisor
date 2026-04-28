import type { JSX, ReactNode } from 'react'

// External-link wrapper. apps/** ESLint rules ban raw <a> (spec §6.3 +
// CLAUDE.md "UI Code Rules"); this is the design-system entry point for
// any external link.
//
// Always emits `rel="noopener noreferrer"` + `referrerpolicy="no-referrer"`
// — the public app's affiliate / lodging deep links must not leak the
// referrer to third parties (privacy invariant per spec §2.6).
//
// `variant="button"` styles the anchor as a CTA pill (e.g. "Browse lodging
// near X" on ResortCard) without changing the underlying element type.

export type ExternalLinkVariant = 'inline' | 'button'

export interface ExternalLinkProps {
  children: ReactNode
  href: string
  target?: '_blank' | '_self'
  variant?: ExternalLinkVariant
}

export function ExternalLink({
  children,
  href,
  target,
  variant = 'inline',
}: ExternalLinkProps): JSX.Element {
  return (
    <a
      className="sta-external-link"
      href={href}
      target={target}
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
      data-variant={variant}
    >
      {children}
    </a>
  )
}
