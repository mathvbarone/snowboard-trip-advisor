import {
  Button,
  DropdownMenu,
  Sidebar,
  ToastProvider,
  useToast,
} from '@snowboard-trip-advisor/design-system'
import { useState, type JSX, type ReactNode } from 'react'

import { useShortcuts } from '../lib/shortcuts'
import { useResponsiveTabOrder } from '../lib/useResponsiveTabOrder'
import { setRoute } from '../state/useURLState'

import { PublishDialog } from './PublishDialog'
import { RESPONSIVE_CSS } from './Shell.responsive.css'

// Admin app shell (Epic 4 §5.1). PR 4.5c added the Publish header button +
// ToastProvider wrapper + the conditionally-mounted PublishDialog. PR 4.6a
// adds:
//   - useResponsiveTabOrder() → readOnly flag for Shell header action buttons
//     (Publish + Account dropdown trigger get native disabled={readOnly} below
//     the md breakpoint per Tier 5 plan Decision D1; native disabled removes
//     from tab order, prevents mouse activation, AND triggers :disabled CSS
//     for visual state — all three of which aria-disabled/tabindex=-1 do not).
//   - useShortcuts() with 4 of 5 spec §3.10 callbacks (the / shortcut is
//     deferred to Phase 2 when search functionality lands per Decision B1).
//     `g i` surfaces the Toast "Integrations management isn't available yet."
//     per Decision G3. `mod+enter` and `Escape` are no-op callbacks in Phase 1
//     (mod+enter wires to flushNow in PR 4.6c per Decision G2; Radix Dialog
//     handles modal Escape internally per Decision G1).
//   - <style>{RESPONSIVE_CSS}</style> overlay (hides .app-shell__brand and
//     tightens .app-shell__header padding below md per Decision H1).
//
// The PublishDialog is mounted only when `publishOpen` so each open re-runs
// useHealth() on mount (PR 4.5c Decision G1).
//
// The Publishes link uses the query-string form so urlState's parser
// (?route=publishes branch) routes correctly. Dashboard / Resorts keep their
// pathname-form hrefs — fixing the full Sidebar pathname-vs-query mismatch is
// out of scope for PR 4.6a (deferred to a separate Sidebar cleanup PR).

const SIDEBAR_ITEMS = [
  { href: '/', label: 'Dashboard' },
  { href: '/resorts', label: 'Resorts' },
  { href: '/?route=publishes', label: 'Publishes' },
] as const

export interface ShellProps {
  readonly children: ReactNode
}

export function Shell({ children }: ShellProps): JSX.Element {
  return (
    <ToastProvider>
      <ShellInterior>{children}</ShellInterior>
    </ToastProvider>
  )
}

// ShellInterior is INSIDE the ToastProvider so useToast() resolves. Splitting
// the outer/inner shell keeps the ToastProvider mount stable (children are the
// only re-mount target) AND lets useToast / useShortcuts coexist in one
// component without a separate context plumbing layer.
function ShellInterior({ children }: { readonly children: ReactNode }): JSX.Element {
  const [publishOpen, setPublishOpen] = useState<boolean>(false)
  const { readOnly } = useResponsiveTabOrder()
  const toast = useToast()
  useShortcuts({
    onGoResorts: (): void => {
      setRoute({ route: 'resorts' })
    },
    onGoIntegrations: (): void => {
      toast.show({
        variant: 'info',
        message: "Integrations management isn't available yet.",
      })
    },
    // Phase 1 no-ops per Tier 5 plan Decisions G1, G2: Radix Dialog handles
    // modal Escape; mod+enter flush wires in PR 4.6c via flushNow.
    onModEnter: (): void => {},
    onEscape: (): void => {},
  })
  return (
    <>
      <style>{RESPONSIVE_CSS}</style>
      <div className="app-shell">
        <header role="banner" className="app-shell__header">
          <span className="app-shell__brand">Admin</span>
          <Button
            disabled={readOnly}
            onClick={(): void => {
              setPublishOpen(true)
            }}
          >
            Publish
          </Button>
          <DropdownMenu
            trigger={<Button disabled={readOnly}>Account</Button>}
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
    </>
  )
}
