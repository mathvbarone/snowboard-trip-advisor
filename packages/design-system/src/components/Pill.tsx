import type { JSX, ReactNode } from 'react'

// Inline status pill used by `<FieldValueRenderer>` to mark stale data and
// by `<ResortCard>` to surface conditions ("powder", "wet", …).
//
// `variant="stale"` adds a visually-hidden "stale value" announcement so SR
// users learn the value is older than the freshness TTL even when the visible
// pill text is just an age (e.g. "12d ago"). Sighted users see styling driven
// off `data-variant` (CSS owns the colour token mapping per spec §6.2).

export type PillVariant = 'default' | 'stale'

export interface PillProps {
  children: ReactNode
  variant?: PillVariant
}

export function Pill({ children, variant = 'default' }: PillProps): JSX.Element {
  return (
    <span className="sta-pill" data-variant={variant}>
      {variant === 'stale' ? (
        <span className="sta-visually-hidden">stale value</span>
      ) : null}
      {children}
    </span>
  )
}
