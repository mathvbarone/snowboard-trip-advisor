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

import {
  Button,
  Card,
  Drawer,
  EmptyStateLayout,
  HeaderBar,
  IconButton,
  Input,
  Pill,
  Select,
  Shell,
  Sidebar,
  Skeleton,
  SourceBadge,
  StatusPill,
  Table,
  Textarea,
  ToggleButtonGroup,
  useToast,
} from '@snowboard-trip-advisor/design-system'
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

// S1a form-control options. Kept inline (no domain vocabulary baked into a
// design-system primitive — the consumer owns wording, S1.0 precedent).
const SELECT_OPTIONS = [
  { value: 'a', label: 'Option A' },
  { value: 'b', label: 'Option B' },
] as const

const TOGGLE_OPTIONS = [
  { value: 'cards', label: 'Cards' },
  { value: 'matrix', label: 'Matrix' },
] as const

// Single shared no-op for the required-but-inert handlers on the disabled
// exemplars (IconButton.onClick / Select.onChange are non-optional). One
// module-level function instead of N inline closures keeps the gallery's
// function-coverage at 100% — the enabled IconButton wires it too and the
// interaction test clicks that one, so the single noop is exercised.
const noop = (): void => undefined

// S1a form-controls family. Each component is rendered once per route
// (one-exemplar-per-component invariant from gallery-smoke.md) inside its
// own `data-gallery-component` anchor, exercising every variant/state the
// smoke needs: all Button data-variants, an aria-invalid Input AND
// Textarea, a pressed ToggleButtonGroup item, and a :disabled example for
// every interactive control. The controlled controls hold local state so
// the native elements stay editable in the live gallery.
function FormControlsFamily(): JSX.Element {
  const [text, setText] = useState<string>('Editable input value')
  const [selectValue, setSelectValue] = useState<string>('a')
  const [note, setNote] = useState<string>('Editable textarea value')
  const [view, setView] = useState<string>('cards')

  return (
    <>
      <section data-gallery-component="Button">
        <h2>Button</h2>
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="primary" aria-pressed>
          Pressed
        </Button>
        <Button variant="primary" disabled>
          Disabled
        </Button>
      </section>

      <section data-gallery-component="IconButton">
        <h2>IconButton</h2>
        <IconButton aria-label="Star" onClick={noop}>
          ★
        </IconButton>
        <IconButton aria-label="Starred" aria-pressed onClick={noop}>
          ★
        </IconButton>
        <IconButton aria-label="Disabled action" disabled onClick={noop}>
          ★
        </IconButton>
      </section>

      <section data-gallery-component="Input">
        <h2>Input</h2>
        <Input label="Editable input" value={text} onChange={setText} />
        <Input label="Invalid input" value="bad value" aria-invalid readOnly />
        <Input
          label="Disabled input"
          value="disabled value"
          disabled
          readOnly
        />
      </section>

      <section data-gallery-component="Select">
        <h2>Select</h2>
        <Select
          label="Editable select"
          value={selectValue}
          options={SELECT_OPTIONS}
          onChange={setSelectValue}
        />
        <Select
          label="Disabled select"
          value="a"
          options={SELECT_OPTIONS}
          onChange={noop}
          disabled
        />
      </section>

      <section data-gallery-component="Textarea">
        <h2>Textarea</h2>
        {/*
          Textarea's closed TextareaProps interface does NOT expose
          `aria-invalid` (it associates via aria-label, not a wrapping
          label, and never emits an invalid hook) — the S1a contract
          table for Textarea correctly omits the aria-invalid selector.
          Adding it would require widening the primitive's prop surface,
          which is out of scope for this CSS-only PR. So the Textarea
          exemplar exercises only the base + :disabled states it actually
          emits (see PR report — flagged divergence from the gallery note
          that said "Input AND Textarea" need an aria-invalid example).
        */}
        <Textarea aria-label="Editable note" value={note} onChange={setNote} />
        <Textarea
          aria-label="Disabled note"
          value="disabled note"
          disabled
          readOnly
        />
      </section>

      <section data-gallery-component="ToggleButtonGroup">
        <h2>ToggleButtonGroup</h2>
        <ToggleButtonGroup
          label="View"
          options={TOGGLE_OPTIONS}
          selected={view}
          onChange={setView}
        />
        <ToggleButtonGroup
          label="Disabled view"
          options={TOGGLE_OPTIONS}
          selected="cards"
          onChange={noop}
          disabled
        />
      </section>
    </>
  )
}

// S1b surfaces/layout family. Each component is rendered once per route
// (one-exemplar-per-component invariant from gallery-smoke.md) inside its
// own `data-gallery-component` anchor, exercising every contract state the
// smoke needs: Card in BOTH elevated AND flat variants with all three
// regions; Sidebar with an aria-current="page" active item; HeaderBar with
// brand + view-toggle + shortlist; EmptyStateLayout with icon + cta +
// details; Shell's skip-link.
//
// Shell COMPROMISE (see PR report): the design-system <Shell> is not a
// slot-based primitive — it always renders `<a class="sta-skip-link">`
// PLUS `<main id="main" tabIndex={-1}>` as a coupled unit (it is the
// app's outer chrome). Mounting it inside the admin app's own <main>
// nests a second <main>/`id="main"`. We render the real component
// unmodified (faking the markup the component doesn't emit is barred by
// the plan) with minimal children; the `.sta-skip-link` element is
// present and queryable in the DOM, off-screen until :focus per its
// own contract (NOT forced permanently visible). The smoke targets
// `[data-gallery-component="Shell"] .sta-skip-link`.
const SIDEBAR_ITEMS = [
  { href: '#overview', label: 'Overview' },
  { href: '#resorts', label: 'Resorts' },
] as const

function SurfacesFamily(): JSX.Element {
  return (
    <>
      <section data-gallery-component="Card">
        <h2>Card</h2>
        <Card
          variant="elevated"
          header="Elevated card header"
          footer="Elevated card footer"
        >
          Elevated card body — header / body / footer regions.
        </Card>
        <Card
          variant="flat"
          header="Flat card header"
          footer="Flat card footer"
        >
          Flat card body — borderless inline variant.
        </Card>
      </section>

      <section data-gallery-component="Sidebar">
        <h2>Sidebar</h2>
        <Sidebar items={SIDEBAR_ITEMS} activeHref="#resorts" />
      </section>

      <section data-gallery-component="HeaderBar">
        <h2>HeaderBar</h2>
        <HeaderBar
          brandLabel="Snowboard Trip Advisor"
          brandHref="#home"
          viewToggleSlot={<span>View toggle slot</span>}
          shortlistSlot={<span>Shortlist slot</span>}
        />
      </section>

      <section data-gallery-component="EmptyStateLayout">
        <h2>EmptyStateLayout</h2>
        <EmptyStateLayout
          icon={<span aria-hidden="true">❄</span>}
          heading="No resorts yet"
          body="Token-styled empty-state shell with icon, cta and details regions."
          cta={<Button variant="primary">Refresh</Button>}
          details={<span>Diagnostic detail text.</span>}
        />
      </section>

      <section data-gallery-component="Shell">
        <h2>Shell</h2>
        <Shell>
          <p>
            Shell renders its <code>.sta-skip-link</code> (off-screen until
            keyboard focus) plus a coupled <code>&lt;main&gt;</code>; see the
            SurfacesFamily comment for the nested-main compromise.
          </p>
        </Shell>
      </section>
    </>
  )
}

// S1c feedback/status family. Each component is rendered once per route
// (one-exemplar-per-component invariant from gallery-smoke.md) inside its
// own `data-gallery-component` anchor, exercising every contract state the
// smoke needs: Pill in BOTH default AND stale variants; StatusPill in all
// FOUR variants (live/stale/failed/manual); SourceBadge for representative
// sources including the required `opensnow` and `manual` (the full emitted
// SourceKey set is opensnow/snowforecast/resort-feed/booking/airbnb/manual);
// Skeleton in all THREE variants (line/block/card).
//
// This is PR S1c-1 (4 components). PR S1c-2 ADDS Chip, FieldValueRenderer
// and ExternalLink to THIS SAME family component at the marked insertion
// point below, so its 3 components share the one
// `data-gallery-family="S1c-feedback-status"` section without disrupting
// these 4 anchors.
function FeedbackStatusFamily(): JSX.Element {
  return (
    <>
      <section data-gallery-component="Pill">
        <h2>Pill</h2>
        <Pill variant="default">Powder</Pill>
        <Pill variant="stale">12d ago</Pill>
      </section>

      <section data-gallery-component="StatusPill">
        <h2>StatusPill</h2>
        <StatusPill variant="live">Live</StatusPill>
        <StatusPill variant="stale">Stale</StatusPill>
        <StatusPill variant="failed">Failed</StatusPill>
        <StatusPill variant="manual">Manual</StatusPill>
      </section>

      <section data-gallery-component="SourceBadge">
        <h2>SourceBadge</h2>
        <SourceBadge source="opensnow" />
        <SourceBadge source="manual" />
      </section>

      <section data-gallery-component="Skeleton">
        <h2>Skeleton</h2>
        <Skeleton variant="line" />
        <Skeleton variant="block" />
        <Skeleton variant="card" />
      </section>

      {/* S1c-2 adds: Chip, FieldValueRenderer, ExternalLink here */}
    </>
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
        <FormControlsFamily />
      </section>
      <section data-gallery-family="S1b-surfaces">
        <SurfacesFamily />
      </section>
      <section data-gallery-family="S1c-feedback-status">
        <FeedbackStatusFamily />
      </section>
      <section data-gallery-family="S1d-overlays">
        {/* TODO: filled by later S1 PR */}
      </section>
    </section>
  )
}
