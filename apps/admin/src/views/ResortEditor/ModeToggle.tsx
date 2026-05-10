import { Button } from '@snowboard-trip-advisor/design-system'
import type { JSX } from 'react'

// PR 4.4d Task 5 — interactive ModeToggle. Above the md breakpoint only;
// below md FieldRow renders the v4.4b inline render-only <span role="switch"
// aria-disabled="true"> form per Decision D11 + AGENTS.md "Admin App Rules"
// (edit controls removed from the tab order below md).
//
// Per Codex round-15 P2-19: raw <button> JSX is banned in apps/admin/src/**
// by `eslint.config.js`'s RAW_HTML_ELS rule — use DS `Button` with
// `variant="ghost"` and `aria-pressed`. Semantics shift from `role="switch"`
// to "toggle button" but functionally equivalent for the editor UX.
//
// Per Codex round-22 P2-30: live paths can't be MANUAL-flagged (cross-key
// invariant restricts editor_modes keys to the durable subset). FieldRow
// passes `disabled` for live paths so the toggle visibly indicates the
// constraint instead of silently no-op'ing on click.
//
// `label` is passed by FieldRow (which co-locates `labelForPath`); accepting
// the formatted aria-label as a prop avoids importing labelForPath here
// (would form a FieldRow ↔ ModeToggle cycle that import-x/no-cycle flags).

export interface ModeToggleProps {
  readonly label: string
  readonly mode: 'manual' | 'auto'
  readonly onToggle: () => void
  readonly disabled?: boolean
}

export function ModeToggle({ label, mode, onToggle, disabled }: ModeToggleProps): JSX.Element {
  return (
    <Button
      variant="ghost"
      disabled={disabled === true}
      aria-label={`Mode for ${label}`}
      aria-pressed={mode === 'manual'}
      onClick={onToggle}
    >
      {mode === 'manual' ? 'MANUAL' : 'AUTO'}
    </Button>
  )
}
