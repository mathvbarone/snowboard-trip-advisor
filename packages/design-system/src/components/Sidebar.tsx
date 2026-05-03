import type { JSX, ReactNode } from 'react'

// Left-rail navigation primitive (Epic 4 §5.1). Renders a single
// `aria-label="Primary"` `<nav>` landmark containing real `<a href>`
// anchors so middle-click / cmd-click open in a new tab — consumers in
// `apps/admin` route via URL state per the existing Epic-3 pattern,
// not via a router library.
//
// Active-route highlighting is delegated to `aria-current="page"` on the
// matching link; consumers pass `activeHref` from their own URL-state hook.

export interface SidebarItem {
  href: string
  label: ReactNode
}

export interface SidebarProps {
  items: ReadonlyArray<SidebarItem>
  activeHref?: string
}

export function Sidebar({ items, activeHref }: SidebarProps): JSX.Element {
  return (
    <nav className="sta-sidebar" aria-label="Primary">
      <ul className="sta-sidebar__list">
        {items.map((item): JSX.Element => (
          <li key={item.href} className="sta-sidebar__item">
            <a
              className="sta-sidebar__link"
              href={item.href}
              aria-current={item.href === activeHref ? 'page' : undefined}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
