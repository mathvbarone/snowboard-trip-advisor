import type { JSX } from 'react'

// Native <select> wrapper.
//
// Per ADR-0004 (`docs/adr/0004-public-app-form-controls-native.md`) the
// public app form controls are deliberately native, not headless / custom
// dropdowns: native gets keyboard nav, mobile sheet UI, and SR announcement
// for free, at the cost of less style control. The cards-path's bucketed
// price + sort selectors are well-served by the native control.
//
// `label` is required (no visible-label-less native selects). The wrapping
// <label> hosts the visible text and the form association.

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps {
  label: string
  value: string
  options: ReadonlyArray<SelectOption>
  onChange: (value: string) => void
  disabled?: boolean
}

export function Select({
  label,
  value,
  options,
  onChange,
  disabled,
}: SelectProps): JSX.Element {
  return (
    <label className="sta-select">
      <span className="sta-select__label">{label}</span>
      <select
        className="sta-select__control"
        value={value}
        disabled={disabled}
        onChange={(e): void => {
          onChange(e.target.value)
        }}
      >
        {options.map((opt): JSX.Element => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  )
}
