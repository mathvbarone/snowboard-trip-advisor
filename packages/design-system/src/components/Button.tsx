import type { JSX, ReactNode } from 'react'

// Minimal Button wrapper. apps/** ESLint rules ban raw <button> (spec §6.3 +
// CLAUDE.md "UI Code Rules"); this is the design-system entry point so call
// sites stay token-driven and consistent.
//
// Phase 1 needs only the affordances DatasetUnavailable's Retry surface
// requires: `onClick`, `type` (defaulting to 'button' so we don't submit an
// ambient form), `disabled`, `children`, plus `aria-label` for icon-only
// variants. More props (variant tokens, loading state, icon slots) ship as
// real call sites land downstream.

export interface ButtonProps {
  children: ReactNode
  onClick: () => void
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  'aria-label'?: string
}

export function Button({
  children,
  onClick,
  type = 'button',
  disabled,
  'aria-label': ariaLabel,
}: ButtonProps): JSX.Element {
  // The raw-<button> ban fires in apps/**, not in packages/design-system —
  // this is the canonical wrapper that the apps/** call sites import.
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="sta-button"
    >
      {children}
    </button>
  )
}
