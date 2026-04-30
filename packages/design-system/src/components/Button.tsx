import type { JSX, ReactNode } from 'react'

// Minimal Button wrapper. apps/** ESLint rules ban raw <button> (spec §6.3 +
// CLAUDE.md "UI Code Rules"); this is the design-system entry point so call
// sites stay token-driven and consistent.
//
// PR 3.1c shipped the minimal prop surface (children/onClick/type/disabled/
// aria-label) for DatasetUnavailable's Retry CTA. PR 3.2 extends it with
// `variant: 'primary' | 'secondary' | 'ghost'` (default `'primary'`) for the
// cards-path call sites — primary for "Browse lodging near X", secondary for
// other inline CTAs, ghost for low-emphasis actions. Variants are surfaced via
// `data-variant` so CSS can style with a single token-driven attribute selector
// (no per-variant className branching).
//
// `aria-pressed` is exposed for toggle-style usage (e.g. consumers that want a
// rectangular pressable surface; IconButton remains the icon-only toggle
// surface for the star button per spec §5.5).

export type ButtonVariant = 'primary' | 'secondary' | 'ghost'

export interface ButtonProps {
  children: ReactNode
  onClick: () => void
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  variant?: ButtonVariant
  'aria-label'?: string
  'aria-pressed'?: boolean
  // Pass-through for data-detail-trigger (§5.5) and any future data-* hooks.
  // Mirrors IconButton's catch-all signature so apps/public can mark the
  // "View details" Button as the drawer-open trigger without inflating the
  // typed prop surface here.
  [key: `data-${string}`]: string | undefined
}

export function Button({
  children,
  onClick,
  type = 'button',
  disabled,
  variant = 'primary',
  'aria-label': ariaLabel,
  'aria-pressed': ariaPressed,
  ...rest
}: ButtonProps): JSX.Element {
  // The raw-<button> ban fires in apps/**, not in packages/design-system —
  // this is the canonical wrapper that the apps/** call sites import.
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      data-variant={variant}
      className="sta-button"
      {...rest}
    >
      {children}
    </button>
  )
}
