import type { JSX } from 'react'

// Native <input> wrapper.
//
// Per ADR-0004 (`docs/adr/0004-public-app-form-controls-native.md`) the
// public app form controls are deliberately native — the date variant gets
// the OS picker for free, the text variant inherits SR + autocomplete +
// password-manager affordances. The trade-off is less visual control over
// the date picker chrome; the ADR documents the rationale.
//
// `label` is required; the wrapping <label> hosts the visible text and
// the form association. `aria-invalid` surfaces validation state without
// requiring a separate error-message slot at this PR (a `helperText` slot
// can land alongside the first call site that needs it).

export type InputType = 'text' | 'date'

export interface InputProps {
  label: string
  value: string
  onChange: (value: string) => void
  type?: InputType
  disabled?: boolean
  'aria-invalid'?: boolean
}

export function Input({
  label,
  value,
  onChange,
  type = 'text',
  disabled,
  'aria-invalid': ariaInvalid,
}: InputProps): JSX.Element {
  return (
    <label className="sta-input">
      <span className="sta-input__label">{label}</span>
      <input
        className="sta-input__control"
        type={type}
        value={value}
        disabled={disabled}
        aria-invalid={ariaInvalid}
        onChange={(e): void => {
          onChange(e.target.value)
        }}
      />
    </label>
  )
}
