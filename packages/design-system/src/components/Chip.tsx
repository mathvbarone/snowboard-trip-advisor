import type { JSX, ReactNode } from 'react'

// Toggleable filter chip used in `<FilterBar>` for the country selector.
//
// The control is a button — `aria-pressed` communicates the on/off state
// (parent §2.4: "use button + aria-pressed, not role='checkbox'"). Click
// invokes `onToggle(!pressed)` so the call site sees a single state-machine
// edge rather than separate add / remove handlers.

export interface ChipProps {
  children: ReactNode
  pressed: boolean
  onToggle: (next: boolean) => void
  disabled?: boolean
}

export function Chip({
  children,
  pressed,
  onToggle,
  disabled,
}: ChipProps): JSX.Element {
  return (
    <button
      type="button"
      className="sta-chip"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={(): void => {
        onToggle(!pressed)
      }}
    >
      {children}
    </button>
  )
}
