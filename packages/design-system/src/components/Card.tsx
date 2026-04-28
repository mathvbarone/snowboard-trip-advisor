import type { JSX, ReactNode } from 'react'

// Card container used by `<ResortCard>` and other content blocks. Renders
// as `<article>` so screen readers expose it as a discrete content region;
// header/body/footer slots project as data-region marked divs so the CSS
// can space them via tokens.
//
// `variant="elevated"` (default) carries a shadow + border-radius treatment
// driven from CSS tokens; `variant="flat"` is the borderless inline variant
// used for nested compositions (e.g. detail drawer cards).

export type CardVariant = 'elevated' | 'flat'

export interface CardProps {
  children: ReactNode
  variant?: CardVariant
  header?: ReactNode
  footer?: ReactNode
}

export function Card({
  children,
  variant = 'elevated',
  header,
  footer,
}: CardProps): JSX.Element {
  return (
    <article className="sta-card" data-variant={variant}>
      {header !== undefined ? <div data-region="header">{header}</div> : null}
      <div data-region="body">{children}</div>
      {footer !== undefined ? <div data-region="footer">{footer}</div> : null}
    </article>
  )
}
