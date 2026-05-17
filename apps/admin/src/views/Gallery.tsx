// Gallery — dev-only component-gallery verification surface (S1.0).
//
// This route is the one sanctioned apps/* scope exception for the otherwise
// design-system-only S1 CSS stack: a flat page that renders each structural
// design-system component so a Playwright smoke (see gallery-smoke.md) can
// assert each one resolves token-derived computed styles in both light and
// OS-dark. It is deliberately UNLINKED — never added to Shell's SIDEBAR_ITEMS
// — so it stays a verification tool, not a user feature.
//
// Theme follows the OS `prefers-color-scheme` via the S0 base/token CSS
// cascade. There is intentionally NO in-app theme toggle and NO
// `[data-theme]` attribute here: ADR-0005 fixes theme selection to the OS
// preference, and S1.0 must not introduce a competing mechanism.
//
// S1.0 ships ONLY the three already-styled exemplars — Table, Toast, Drawer —
// the components that already carry co-located token CSS and are the
// precedent the rest of the S1 stack mirrors. They are rendered here
// unmodified. The empty `data-gallery-family` placeholder <section>s below
// are filled by the later S1a–S1d PRs.

import { Drawer, Table, useToast } from '@snowboard-trip-advisor/design-system'
import { useEffect, useState, type JSX } from 'react'

// Static exemplar data for the Table primitive. Kept inline (no domain
// vocabulary in the design-system primitive — the consumer owns wording).
const TABLE_COLUMNS = [
  { key: 'a', label: 'Resort A' },
  { key: 'b', label: 'Resort B', highlighted: true },
] as const

const TABLE_ROWS = [
  { key: 'snow', header: 'Snow depth', cells: ['120 cm', '95 cm'] },
  { key: 'lifts', header: 'Open lifts', cells: ['18 / 20', '12 / 14'] },
] as const

// Toast renders through the Shell-level <ToastProvider> (App wraps every
// route in Shell). A passive auto-show on mount surfaces the styled toast
// for the smoke without a manual click.
function ToastExemplar(): JSX.Element {
  const { show } = useToast()
  useEffect((): void => {
    show({ variant: 'success', message: 'Token-styled toast exemplar' })
  }, [show])
  return (
    <p>
      A success Toast is shown on mount via <code>useToast().show</code>; it
      renders fixed top-right through the Shell-level provider.
    </p>
  )
}

export function Gallery(): JSX.Element {
  // Drawer is a controlled primitive; seed it open so the smoke can inspect
  // its portalled panel. It mounts non-modal (clicks behind still work).
  const [drawerOpen, setDrawerOpen] = useState<boolean>(true)

  return (
    <section aria-label="Component gallery">
      <h1>Component gallery</h1>
      <p>
        Dev-only verification surface. Theme follows the OS
        {' '}
        <code>prefers-color-scheme</code> via the S0 token/base CSS cascade —
        there is no in-app theme toggle (ADR-0005). This route is intentionally
        unlinked from the sidebar.
      </p>

      <section data-gallery-component="Table">
        <h2>Table</h2>
        <Table
          caption="Table exemplar"
          columns={TABLE_COLUMNS}
          rows={TABLE_ROWS}
          rowHeaderLabel="Metric"
        />
      </section>

      <section data-gallery-component="Toast">
        <h2>Toast</h2>
        <ToastExemplar />
      </section>

      <section data-gallery-component="Drawer">
        <h2>Drawer</h2>
        <Drawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          title="Drawer exemplar"
        >
          <p>Token-styled Drawer body.</p>
        </Drawer>
      </section>

      {/* Family placeholders — filled by later S1 PRs. */}
      <section data-gallery-family="S1a-form-controls">
        {/* TODO: filled by later S1 PR */}
      </section>
      <section data-gallery-family="S1b-surfaces">
        {/* TODO: filled by later S1 PR */}
      </section>
      <section data-gallery-family="S1c-feedback-status">
        {/* TODO: filled by later S1 PR */}
      </section>
      <section data-gallery-family="S1d-overlays">
        {/* TODO: filled by later S1 PR */}
      </section>
    </section>
  )
}
