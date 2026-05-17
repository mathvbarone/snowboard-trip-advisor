import {
  forwardRef,
  type ChangeEvent,
  type FocusEvent,
  type ForwardedRef,
  type JSX,
  type KeyboardEvent,
} from 'react'

// Native <textarea> wrapper — the multi-line sibling of Input.tsx.
//
// Input.tsx is deliberately single-line (spec §6.2 — the public app form
// controls never need a multi-line surface). The analyst-note source pane
// (admin, spec §6.2) is the first multi-line call site, so the primitive
// lands here rather than widening Input's prop surface with a `multiline`
// branch. Same token-driven className contract as Input: the component emits
// `sta-textarea*` class hooks; visual styling is owned by the design-system
// stylesheet, never inline color/size literals.
//
// `aria-label` (not a wrapping <label>) is the association mechanism: the
// note source/preview panes sit inside an already-labelled Collapsible and a
// visible <label> would double-announce. `forwardRef` exposes the underlying
// element so callers can manage selection/caret (the Tab-indent feature
// re-reads selectionStart/End below; the note view also focuses it on
// expand).
//
// Tab interception: a bare <textarea> moves focus on Tab, which makes it
// impossible to indent markdown. We `preventDefault()` and instead splice two
// spaces in at the caret (or over the current selection), surfacing the new
// value through `onChange` so the controlled-value contract is preserved.
// Focus deliberately stays on the textarea.

const TAB_INDENT = '  '

export interface TextareaProps {
  'aria-label': string
  value: string
  onChange?: (value: string) => void
  rows?: number
  disabled?: boolean
  readOnly?: boolean
  onFocus?: (event: FocusEvent<HTMLTextAreaElement>) => void
  onBlur?: (event: FocusEvent<HTMLTextAreaElement>) => void
  // Composed AFTER the built-in Tab-indent handler. The consumer's handler
  // still runs for Tab unless the built-in called preventDefault (it does),
  // so consumers should branch on `e.key` and ignore Tab — the analyst-note
  // view binds mod+enter / mod+backspace / Escape here.
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void
}

function TextareaImpl(
  {
    'aria-label': ariaLabel,
    value,
    onChange,
    rows = 6,
    disabled,
    readOnly,
    onFocus,
    onBlur,
    onKeyDown,
  }: TextareaProps,
  ref: ForwardedRef<HTMLTextAreaElement>,
): JSX.Element {
  const handleChange =
    onChange === undefined
      ? undefined
      : (e: ChangeEvent<HTMLTextAreaElement>): void => {
          onChange(e.target.value)
        }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Tab' && onChange !== undefined) {
      // Indent instead of moving focus. Splice TAB_INDENT over the current
      // selection (a collapsed selection = plain caret insert).
      e.preventDefault()
      const el = e.currentTarget
      const start = el.selectionStart
      const end = el.selectionEnd
      onChange(value.slice(0, start) + TAB_INDENT + value.slice(end))
      return
    }
    // Tab is fully handled above (focus stays put); any other key falls
    // through to the consumer's handler (analyst-note mod+enter / Escape).
    onKeyDown?.(e)
  }

  return (
    <textarea
      ref={ref}
      className="sta-textarea__control"
      aria-label={ariaLabel}
      value={value}
      rows={rows}
      disabled={disabled}
      readOnly={readOnly}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  )
}

export const Textarea = forwardRef(TextareaImpl)
Textarea.displayName = 'Textarea'
