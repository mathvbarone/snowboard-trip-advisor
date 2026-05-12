import { tokens } from '@snowboard-trip-advisor/design-system'

// Tier 5 PR 4.6a — admin Shell responsive overlay (parent spec §3.2 +
// Tier 5 plan Decision H1).
//
// **Phase-1 limitation:** the admin app currently ships zero CSS files; the
// classNames `.app-shell`, `.app-shell__header`, `.app-shell__brand` are
// defined as hooks in Shell.tsx but have no base styles. This file is the
// FIRST admin CSS surface and ships an overlay rule that becomes visible only
// when base styles ship. Tab-order discipline lives in TSX render gates per
// spec §7.16 — CSS cannot apply `disabled` / `tabindex`.

const MAX_BELOW_MD = `${(tokens.breakpoint.md - 1).toString()}px`

export const RESPONSIVE_CSS = `@media (max-width: ${MAX_BELOW_MD}) {
  .app-shell__header { padding: 0.5rem; gap: 0.5rem; }
  .app-shell__brand { display: none; }
}`
