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
//
// Toast has no `persist`/`Infinity` option — `ToastInput` exposes only
// `variant`, `message`, and `dismissAfterMs`, and <Toast> unconditionally
// schedules `setTimeout(onDismiss, dismissAfterMs)`. With the per-variant
// default (success → 5000ms) the exemplar auto-dismisses out of the DOM
// before a manual or Playwright smoke can read its computed styles. We
// therefore pass an explicit, effectively-non-expiring duration so the
// `.sta-toast` node stays mounted for the cascade check. The value is kept
// well under the 32-bit `setTimeout` ceiling (2^31-1 ms ≈ 24.8 days): a
// delay above that overflows and fires immediately, which would silently
// reintroduce this exact defect. 24h is far longer than any smoke run yet
// safely inside the safe range.
const SMOKE_STABLE_TOAST_MS = 86_400_000 // 24h — see comment above.

function ToastExemplar(): JSX.Element {
  const { show } = useToast()
  useEffect((): void => {
    show({
      variant: 'success',
      message: 'Token-styled toast exemplar',
      dismissAfterMs: SMOKE_STABLE_TOAST_MS,
    })
  }, [show])
  return (
    <p>
      A success Toast is shown on mount via <code>useToast().show</code> with
      an effectively-non-expiring <code>dismissAfterMs</code> so it stays
      mounted for the smoke; it renders fixed top-right through the
      Shell-level provider, OUTSIDE this section (see gallery-smoke.md).
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

      {/*
        `data-gallery-component` markers are SECTION ANCHORS / LABELS only —
        they are NOT the styled node the smoke measures. None of the S1
        design-system components forward arbitrary `data-*` onto their own
        `.sta-*` root (Table/Drawer have closed typed props; Toast renders
        via <ToastProvider>), and the portalled ones (Drawer, Toast) render
        their `.sta-*` node OUTSIDE this wrapper via a Radix/provider portal.
        The smoke therefore targets each component's own design-system root
        selector (`.sta-table` / `.sta-toast` / `.sta-drawer`), using these
        sections only to scope inline components and as human labels. Every
        later S1 PR follows the same rule — see gallery-smoke.md.
      */}
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
