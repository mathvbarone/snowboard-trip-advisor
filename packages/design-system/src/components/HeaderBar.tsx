import type { JSX, ReactNode } from 'react'

// Top-of-page brand strip. Renders a semantic `<header>` with:
//   - brand link (left)
//   - view-toggle slot (centre/right) — PR 3.4 fills it with the cards /
//     matrix `<ToggleButtonGroup>`. PR 3.2 leaves it empty.
//   - shortlist slot (right) — PR 3.3 fills it with the shortlist drawer
//     trigger. Apps/public passes the appropriate component in via the
//     slot prop.
//
// We deliberately do NOT hardcode `role="banner"` on this reusable
// component. The `banner` landmark is meant to be the single top-level
// site header — appropriate when the app shell renders this at the
// document root, but invalid when nested inside another landmark (e.g.
// `<main>`, `<article>`) or when multiple instances exist. Letting the
// browser/AT assign the implicit `banner` role from a semantic
// `<header>` keeps the landmark structure context-correct without the
// design-system asserting a context it can't verify.

export interface HeaderBarProps {
  brandLabel: string
  brandHref: string
  shortlistSlot: ReactNode
  viewToggleSlot?: ReactNode
}

export function HeaderBar({
  brandLabel,
  brandHref,
  shortlistSlot,
  viewToggleSlot,
}: HeaderBarProps): JSX.Element {
  return (
    <header className="sta-header-bar">
      <a className="sta-header-bar__brand" href={brandHref}>
        {brandLabel}
      </a>
      {viewToggleSlot !== undefined ? (
        <div data-region="view-toggle">{viewToggleSlot}</div>
      ) : null}
      <div data-region="shortlist">{shortlistSlot}</div>
    </header>
  )
}
