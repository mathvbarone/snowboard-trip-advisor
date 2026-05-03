import { Button, DropdownMenu, Sidebar } from '@snowboard-trip-advisor/design-system'
import type { JSX, ReactNode } from 'react'

// Admin app shell (Epic 4 §5.1). The PR 4.1b placeholder set the
// `banner` / `navigation` / `main` landmarks; this PR (4.1c) replaces the
// placeholder header / nav contents with the real `<DropdownMenu>` and
// `<Sidebar>` chrome. Landmarks themselves are unchanged so App.test.tsx
// + tests/integration/apps/admin/shell.test.tsx continue to pass without
// modification.
//
// Sidebar items + dropdown items below are static for now; PR 4.2's
// router work wires `activeHref` from URL state, and the dropdown's
// onSelect handlers route to the real Sources / Integrations / History
// views as those land.

const SIDEBAR_ITEMS = [
  { href: '/', label: 'Dashboard' },
  { href: '/resorts', label: 'Resorts' },
  { href: '/publishes', label: 'Publishes' },
] as const

export interface ShellProps {
  readonly children: ReactNode
}

export function Shell({ children }: ShellProps): JSX.Element {
  return (
    <div className="app-shell">
      <header role="banner" className="app-shell__header">
        <span className="app-shell__brand">Admin</span>
        <DropdownMenu
          trigger={<Button>Account</Button>}
          label="Account menu"
          items={[
            { label: 'Sources', onSelect: (): void => {} },
            { label: 'Integrations', onSelect: (): void => {} },
            { label: 'History', onSelect: (): void => {} },
          ]}
        />
      </header>
      <Sidebar items={SIDEBAR_ITEMS} />
      <main>{children}</main>
    </div>
  )
}
