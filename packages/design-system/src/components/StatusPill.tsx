import type { JSX, ReactNode } from 'react'

// Per-field status indicator (Epic 4 §5.1). Four variants map to existing
// semantic color tokens:
//   live   → success (adapter-fed, fresh)
//   stale  → warning (older than the staleness window)
//   failed → danger  (adapter call errored or schema rejected)
//   manual → accent  (analyst override; not adapter-driven)
//
// Information conveyed by color alone fails WCAG. Every variant therefore
// renders a visually-hidden state label (e.g. "Live") so screen readers
// announce the state regardless of whether the consumer app has wired
// color CSS yet — same redundancy pattern Pill uses for `stale`.

export type StatusPillVariant = 'live' | 'stale' | 'failed' | 'manual'

export interface StatusPillProps {
  variant: StatusPillVariant
  children?: ReactNode
}

const VARIANT_LABEL: Record<StatusPillVariant, string> = {
  live: 'Live',
  stale: 'Stale',
  failed: 'Failed',
  manual: 'Manual',
}

export function StatusPill({ variant, children }: StatusPillProps): JSX.Element {
  const label = VARIANT_LABEL[variant]
  // When children is omitted the variant label is itself the visible content;
  // when children carries the value (e.g. "12d") the label rides as a
  // visually-hidden prefix so SR users hear "Live 12d" not just "12d".
  return (
    <span className="sta-status-pill" data-variant={variant}>
      {children === undefined ? (
        label
      ) : (
        <>
          <span className="sta-visually-hidden">{label}</span>
          {children}
        </>
      )}
    </span>
  )
}
