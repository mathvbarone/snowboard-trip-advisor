import type { JSX, ReactNode } from 'react'

// Composable layout shell for empty / error / no-data states. Slots:
//   icon    — optional decorative graphic above the heading
//   heading — required string; rendered as <h2>
//   body    — required string; primary explanatory copy
//   cta     — optional ReactNode for action affordances (Retry, Refresh, …)
//   details — optional ReactNode for dev-only diagnostics
//             (DatasetUnavailable wraps these in <details>)
//
// Consumers drive the role / aria-live semantics from the outside (e.g.
// DatasetUnavailable adds role="alert" to its wrapping element when it
// composes EmptyStateLayout). Keeping that surface layered upstream lets
// NoResorts render without an alert announcement.
export function EmptyStateLayout({
  heading,
  body,
  icon,
  cta,
  details,
}: {
  heading: string
  body: string
  icon?: ReactNode
  cta?: ReactNode
  details?: ReactNode
}): JSX.Element {
  return (
    <div className="sta-empty-state">
      {icon !== undefined ? (
        <div data-region="icon" aria-hidden="true">{icon}</div>
      ) : null}
      <h2 className="sta-empty-state__heading">{heading}</h2>
      <p className="sta-empty-state__body">{body}</p>
      {cta !== undefined ? (
        <div data-region="cta">{cta}</div>
      ) : null}
      {details !== undefined ? (
        <div data-region="details">{details}</div>
      ) : null}
    </div>
  )
}
