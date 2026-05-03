import { DismissableLayer } from '@radix-ui/react-dismissable-layer'
import { FocusScope } from '@radix-ui/react-focus-scope'
import type { JSX, ReactNode } from 'react'

// Anchored floating panel (Epic 4 §5.1). Used by the editor's per-field
// actions menu (PR 4.4b's `FieldRow`) and indirectly by `<DropdownMenu>`,
// which composes this primitive with menu-item semantics.
//
// Composes the same Radix lower-level primitives `<Modal>` already wraps —
// `<FocusScope>` for the focus trap, `<DismissableLayer>` for Escape +
// outside-click dismissal. This avoids depending on a higher-level Radix
// package for the popover surface itself; the consumer owns positioning
// (Phase 1 has no positioning-library dependency per Epic 4 spec §5.1).
//
// `aria-modal` is intentionally NOT set: a popover is non-modal — content
// outside remains technically reachable, just dismisses the popover when
// interacted with. The `dialog` role + accessible name (`label`) match
// the WAI-ARIA non-modal dialog pattern.

export interface PopoverProps {
  /** Controlled open flag. */
  open: boolean
  /** Called with the next open state on Escape / outside-click / programmatic close. */
  onOpenChange: (open: boolean) => void
  /** Required accessible name for the dialog. */
  label: string
  /** Popover body. */
  children: ReactNode
}

export function Popover({ open, onOpenChange, label, children }: PopoverProps): JSX.Element | null {
  if (!open) {
    return null
  }
  return (
    <FocusScope asChild loop trapped>
      <DismissableLayer
        role="dialog"
        aria-label={label}
        className="sta-popover"
        onEscapeKeyDown={(): void => {
          onOpenChange(false)
        }}
        onPointerDownOutside={(): void => {
          onOpenChange(false)
        }}
      >
        {children}
      </DismissableLayer>
    </FocusScope>
  )
}
