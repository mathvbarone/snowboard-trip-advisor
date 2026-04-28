import type { JSX, ReactNode } from 'react'

// Top-of-page brand strip. Renders a `<header role="banner">` with:
//   - brand link (left)
//   - view-toggle slot (centre/right) — PR 3.4 fills it with the cards /
//     matrix `<ToggleButtonGroup>`. PR 3.2 leaves it empty.
//   - shortlist slot (right) — PR 3.3 fills it with the shortlist drawer
//     trigger. Apps/public passes the appropriate component in via the
//     slot prop.

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
    <header className="sta-header-bar" role="banner">
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
