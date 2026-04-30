import { useRef, type JSX, type KeyboardEvent, type ReactNode } from 'react'

// Aria-pressed group of toggle buttons (parent §2.4 — explicitly NOT
// role="tab", since views are routes not tab panels). Used by FilterBar
// (PR 3.4) for the cards / matrix view toggle.
//
// Activation is plain button click / Enter / Space (native button
// behavior — no extra handler needed). Arrow keys / Home / End move
// FOCUS only; selection is committed by activating the focused button
// via Enter/Space/click.
//
// Wrapping behavior: ArrowLeft on the first option focuses the last;
// ArrowRight on the last focuses the first. Home/End jump to the
// extremes regardless of starting position.

export interface ToggleButtonOption {
  value: string
  label: ReactNode
}

export interface ToggleButtonGroupProps {
  label: string
  options: ReadonlyArray<ToggleButtonOption>
  selected: string
  onChange: (next: string) => void
  disabled?: boolean
}

export function ToggleButtonGroup({
  label,
  options,
  selected,
  onChange,
  disabled,
}: ToggleButtonGroupProps): JSX.Element {
  // Refs index aligned with `options` order; arrow-key navigation reads
  // current focus position by element identity, not by tracking state, so
  // a re-render that flips `selected` doesn't disturb focus management.
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([])

  function focusAt(index: number): void {
    // Optional chain handles both `null` (unmounted ref slot) and `undefined`
    // (`noUncheckedIndexedAccess` widening on out-of-range index) in a single
    // branch — keeps coverage measurable without an unreachable defensive arm.
    buttonRefs.current[index]?.focus()
  }

  function onKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ): void {
    // Disabled buttons are skipped by browsers' native focus-cycling AND
    // we refuse to drive focus into them via arrow keys — every option
    // shares the same `disabled` flag, so navigation has no valid target.
    if (disabled === true) {
      return
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      const nextIndex = (currentIndex + 1) % options.length
      focusAt(nextIndex)
      return
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      const nextIndex = (currentIndex - 1 + options.length) % options.length
      focusAt(nextIndex)
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      focusAt(0)
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      focusAt(options.length - 1)
    }
  }

  return (
    <div role="group" aria-label={label} className="sta-toggle-button-group">
      {options.map((option, index): JSX.Element => (
        <button
          key={option.value}
          ref={(el): void => {
            buttonRefs.current[index] = el
          }}
          type="button"
          aria-pressed={option.value === selected}
          disabled={disabled}
          className="sta-toggle-button"
          onClick={(): void => {
            onChange(option.value)
          }}
          onKeyDown={(event): void => {
            onKeyDown(event, index)
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
