import type { JSX, ReactNode } from 'react'

// Icon-only button. Always requires `aria-label` because there is no
// visible text label — without it screen readers announce no name.
//
// `data-hit-area="square"` is the contract the design-system CSS uses to
// enforce a square (≥44×44 css px) hit-area target — WCAG 2.5.5 minimum.
//
// `data-*` attributes pass through so consumers can attach the
// `data-detail-trigger="<slug>"` marker required by spec §5.5 (focus
// returns to the matching trigger when the detail drawer closes). The
// star button on ResortCard is the canonical caller.

export interface IconButtonProps {
  children: ReactNode
  onClick: () => void
  'aria-label': string
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  'aria-pressed'?: boolean
  // Pass-through for data-detail-trigger (§5.5) and any future data-* hooks.
  // ESLint's no-explicit-any rule rejects `unknown` here for index access on
  // standard JSX attributes, so we widen with a typed catch-all that mirrors
  // React's HTMLAttributes data-* shape.
  [key: `data-${string}`]: string | undefined
}

export function IconButton({
  children,
  onClick,
  'aria-label': ariaLabel,
  type = 'button',
  disabled,
  'aria-pressed': ariaPressed,
  ...rest
}: IconButtonProps): JSX.Element {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      data-hit-area="square"
      className="sta-icon-button"
      {...rest}
    >
      {children}
    </button>
  )
}
