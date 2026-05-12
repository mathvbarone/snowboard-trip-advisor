import { Button, DropdownMenu, Sidebar, ToastProvider } from '@snowboard-trip-advisor/design-system'
import { useState, type JSX, type ReactNode } from 'react'

import { PublishDialog } from './PublishDialog'

// Admin app shell (Epic 4 §5.1). PR 4.5c adds the Publish header button +
// ToastProvider wrapper + the conditionally-mounted PublishDialog. The
// dialog is mounted only when `publishOpen` so each open re-runs
// useHealth() on mount (Decision G1; round-3 + round-17 + round-19 folds
// of the plan-PR loop). Mounting unconditionally would freeze the dialog's
// health snapshot at app boot and let stale Dashboard health leak into the
// dialog's pre-publish gate.

const SIDEBAR_ITEMS = [
  { href: '/', label: 'Dashboard' },
  { href: '/resorts', label: 'Resorts' },
  { href: '/publishes', label: 'Publishes' },
] as const

export interface ShellProps {
  readonly children: ReactNode
}

export function Shell({ children }: ShellProps): JSX.Element {
  const [publishOpen, setPublishOpen] = useState<boolean>(false)
  return (
    <ToastProvider>
      <div className="app-shell">
        <header role="banner" className="app-shell__header">
          <span className="app-shell__brand">Admin</span>
          <Button
            onClick={(): void => {
              setPublishOpen(true)
            }}
          >
            Publish
          </Button>
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
        {publishOpen && (
          <PublishDialog open={publishOpen} onOpenChange={setPublishOpen} />
        )}
      </div>
    </ToastProvider>
  )
}
