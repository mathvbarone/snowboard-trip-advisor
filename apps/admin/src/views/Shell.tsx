import type { JSX, ReactNode } from 'react'

// Placeholder shell — PR 4.1c replaces the inner placeholder header/nav with
// the real <HeaderBar>/<Sidebar> + <DropdownMenu>. The landmark roles
// (banner, navigation, main) are stable across the placeholder→real
// transition so App.test.tsx + the integration test do NOT churn when
// 4.1c lands. Text content is placeholder; landmarks are the contract.
export interface ShellProps {
  readonly children: ReactNode
}

export function Shell({ children }: ShellProps): JSX.Element {
  return (
    <div className="app-shell">
      <header role="banner">Admin (placeholder header)</header>
      <nav aria-label="Primary">Admin (placeholder nav)</nav>
      <main>{children}</main>
    </div>
  )
}
