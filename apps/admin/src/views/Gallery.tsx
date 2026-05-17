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
  Chip,
  Drawer,
  DropdownMenu,
  EmptyStateLayout,
  ExternalLink,
  FieldValueRenderer,
  HeaderBar,
  IconButton,
  Input,
  Modal,
  Pill,
  Popover,
  Select,
  Shell,
  Sidebar,
  Skeleton,
  SourceBadge,
  StatusPill,
  Tab,
  TabList,
  TabPanel,
  Table,
  Tabs,
  Textarea,
  ToggleButtonGroup,
  Tooltip,
  useToast,
  type DropdownMenuItem,
} from '@snowboard-trip-advisor/design-system'
import { ISODateTimeString } from '@snowboard-trip-advisor/schema'
import { useEffect, useRef, useState, type JSX } from 'react'

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
// S1c-1 shipped the first 4 (Pill/StatusPill/SourceBadge/Skeleton); S1c-2
// ADDED Chip (a seeded-pressed controlled toggle + a disabled example),
// FieldValueRenderer (one exemplar per data-state — fresh/stale/
// never_fetched, the never_fetched one carrying a missingTooltip so its
// `.sta-field-value__missing` trigger renders) and ExternalLink (both
// inline AND button variants). All 7 share the one
// `data-gallery-family="S1c-feedback-status"` section, each in its own
// `data-gallery-component` anchor (one-exemplar-per-component invariant).
// FieldValueRenderer needs a typed FieldValue<number> for each of its three
// states. Kept inline (no domain vocabulary baked into a design-system
// primitive — the consumer owns wording, S1.0 precedent). One exemplar per
// state covers the data-state fresh/stale/never_fetched contract hooks; the
// never_fetched one carries a missingTooltip so the `.sta-field-value__
// missing` trigger part renders too.
// `observed_at` is the branded ISODateTimeString — build it through the
// schema constructor (the apps/** ESLint rule bans `as ISODateTimeString`
// casts; mirrors FieldValueRenderer.test.tsx's fixture convention).
const FIELD_FRESH = {
  state: 'fresh',
  value: 120,
  source: 'opensnow',
  observed_at: ISODateTimeString.parse('2026-05-17T08:00:00Z'),
} as const
const FIELD_STALE = {
  state: 'stale',
  value: 95,
  source: 'snowforecast',
  observed_at: ISODateTimeString.parse('2026-05-05T08:00:00Z'),
  age_days: 12,
} as const
const FIELD_NEVER = { state: 'never_fetched' } as const

function FeedbackStatusFamily(): JSX.Element {
  // The Chip exemplar is controlled so the live gallery toggle stays
  // interactive (mirrors FormControlsFamily's controlled-state precedent);
  // it is seeded pressed so the `[aria-pressed="true"]` on-state renders for
  // the smoke without a click. The disabled Chip reuses the shared `noop`.
  const [chipOn, setChipOn] = useState<boolean>(true)

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

      <section data-gallery-component="Chip">
        <h2>Chip</h2>
        <Chip pressed={chipOn} onToggle={setChipOn}>
          Toggleable chip (seeded pressed)
        </Chip>
        <Chip pressed={false} disabled onToggle={noop}>
          Disabled
        </Chip>
      </section>

      <section data-gallery-component="FieldValueRenderer">
        <h2>FieldValueRenderer</h2>
        <FieldValueRenderer field={FIELD_FRESH} formatter="number" unit="cm" />
        <FieldValueRenderer field={FIELD_STALE} formatter="number" unit="cm" />
        <FieldValueRenderer
          field={FIELD_NEVER}
          formatter="number"
          missingTooltip="No snow-depth reading has been fetched yet."
        />
      </section>

      <section data-gallery-component="ExternalLink">
        <h2>ExternalLink</h2>
        <ExternalLink href="https://opensnow.com" variant="inline">
          Inline external link
        </ExternalLink>
        <ExternalLink href="https://opensnow.com" variant="button">
          Button-styled external link
        </ExternalLink>
      </section>
    </>
  )
}

// S1d overlays/primitives family. Each component is rendered once per route
// (one-exemplar-per-component invariant from gallery-smoke.md) inside its
// own `data-gallery-component` anchor. The smoke targets each component's
// own `.sta-<name>` root (off `document` for the portalled ones, scoped to
// the section for the inline ones — see gallery-smoke.md generalizable
// rule). Forced-open handling per component:
//
//  - Modal     — CANNOT be seeded open declaratively here. The design-system
//                `Modal` wraps a Radix Dialog with the default `modal=true`,
//                which applies `aria-hidden="true"` to EVERY sibling of the
//                dialog portal — i.e. the entire gallery page — for as long
//                as it is open, destroying the gallery's own accessibility
//                tree (true in real browsers too). `Modal` exposes no
//                `modal={false}` escape hatch (unlike Drawer's deliberately
//                non-modal exemplar) and Modal.tsx is frozen. So the
//                exemplar renders only its trigger (a closed Modal with an
//                open button); the `.sta-modal` root (+ overlay + title) is
//                verified by INTERACTION in the smoke — the controller
//                clicks the trigger, THEN measures `.sta-modal` (PORTALLED).
//                Mirrors the Tooltip interaction handling below.
//  - Popover   — controlled, seeded `open` so `.sta-popover` mounts. It is
//                NOT portalled (FocusScope + DismissableLayer render it
//                in-tree), so its root is a descendant of this section; the
//                generalizable smoke rule (query `.sta-popover` off
//                `document`, exactly one instance) still resolves it.
//  - Tabs      — INLINE. Rendered controlled with the second tab seeded
//                selected so `.sta-tabs__tab[aria-selected="true"]` AND a
//                `.sta-tabs__panel` are both in the DOM without a click.
//  - Tooltip   — CANNOT be forced open declaratively: the design-system
//                `Tooltip` exposes only `content`/`children`/`delayDuration`
//                and wraps an UNCONTROLLED Radix Tooltip.Root (no
//                `open`/`defaultOpen` prop to forward). It opens only on
//                trigger focus/hover. So the exemplar renders the trigger
//                only; the `.sta-tooltip` bubble + `.sta-tooltip__arrow`
//                are verified by INTERACTION in the smoke (the controller
//                hovers/focuses the trigger, then measures `.sta-tooltip`).
//                Documented here + in the PR report.
//  - DropdownMenu — its `open` is INTERNAL state (`useState(false)`); the
//                design-system component exposes no controlled-open /
//                `defaultOpen` prop. We therefore drive it open on mount by
//                programmatically clicking its own trigger via a ref +
//                effect (mirrors ToastExemplar's on-mount side-effect
//                precedent), so `.sta-dropdown-menu__menu` + ≥2
//                `.sta-dropdown-menu__item` (with :hover/:focus-visible
//                styling) are in the DOM for the smoke without a manual
//                click. It renders INLINE (no portal).
// Reuse the shared module-level `noop` for the inert item handlers (the
// smoke never selects a menu item). Inline closures here would be
// uncovered functions — the gallery's one-shared-noop convention (see the
// `noop` comment above) keeps function coverage at 100%.
const DROPDOWN_ITEMS: ReadonlyArray<DropdownMenuItem> = [
  { label: 'Sources', onSelect: noop },
  { label: 'Integrations', onSelect: noop },
] as const

// DropdownMenu has no controlled-open / defaultOpen prop (open is internal
// useState). Click its trigger once on mount so the menu panel + items are
// rendered for the smoke. The ref targets the trigger <button> the
// component clones from our <Button>; a single mount-time click opens it.
function DropdownMenuExemplar(): JSX.Element {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  useEffect((): void => {
    // The cloned trigger is the first <button> inside `.sta-dropdown-menu`.
    // Click it once on mount to open the menu (optional-chained: the ref is
    // always populated before effects run and DropdownMenu always renders
    // the cloned trigger, so the call is taken — `?.` only avoids an
    // explicit unreachable null-branch, keeping branch coverage at 100%).
    wrapperRef.current
      ?.querySelector<HTMLButtonElement>('.sta-dropdown-menu > button')
      ?.click()
  }, [])
  return (
    <div ref={wrapperRef}>
      <DropdownMenu
        trigger={<Button variant="secondary">Account</Button>}
        label="Account menu"
        items={DROPDOWN_ITEMS}
      />
    </div>
  )
}

function OverlaysFamily(): JSX.Element {
  // Popover is controlled, seeded open so its styled root is mounted for the
  // smoke (it is non-modal — FocusScope-only, no aria-hidden trap — so
  // seeding it open is safe). Tabs is controlled with the second tab seeded
  // selected. Modal is NOT seeded open (see OverlaysFamily comment): it is
  // rendered closed with an open trigger and verified by interaction.
  const [modalOpen, setModalOpen] = useState<boolean>(false)
  const [popoverOpen, setPopoverOpen] = useState<boolean>(true)
  const [tab, setTab] = useState<string>('two')

  return (
    <>
      <section data-gallery-component="Modal">
        <h2>Modal</h2>
        {/*
          The design-system Modal wraps a Radix Dialog with the default
          `modal=true`, which sets `aria-hidden="true"` on every sibling of
          the dialog portal (the whole gallery page) while open. Seeding it
          open would destroy the gallery's accessibility tree, and Modal
          exposes no `modal={false}` escape hatch. So the exemplar renders
          the trigger only (a closed Modal + an open button); the
          `.sta-modal` bubble + overlay + title are verified by interaction
          in the smoke (the controller clicks this trigger, then measures
          `.sta-modal`). Mirrors the Tooltip handling below. See
          OverlaysFamily comment + gallery-smoke.md.
        */}
        <Button
          variant="secondary"
          onClick={(): void => {
            setModalOpen(true)
          }}
        >
          Open modal
        </Button>
        <Modal open={modalOpen} onOpenChange={setModalOpen} title="Modal exemplar">
          <p>Token-styled Modal body — opened by interaction for the smoke.</p>
        </Modal>
      </section>

      <section data-gallery-component="Popover">
        <h2>Popover</h2>
        <Popover
          open={popoverOpen}
          onOpenChange={setPopoverOpen}
          label="Popover exemplar"
        >
          <p>Token-styled Popover body — seeded open for the cascade smoke.</p>
        </Popover>
      </section>

      <section data-gallery-component="Tabs">
        <h2>Tabs</h2>
        <Tabs value={tab} onValueChange={setTab} label="Tabs exemplar">
          <TabList>
            <Tab value="one">First</Tab>
            <Tab value="two">Second</Tab>
          </TabList>
          <TabPanel value="one">First panel content.</TabPanel>
          <TabPanel value="two">
            Second panel content — this tab is seeded selected.
          </TabPanel>
        </Tabs>
      </section>

      <section data-gallery-component="Tooltip">
        <h2>Tooltip</h2>
        {/*
          The design-system Tooltip wraps an UNCONTROLLED Radix
          Tooltip.Root and exposes no open/defaultOpen prop, so it cannot
          be forced open declaratively. The `.sta-tooltip` bubble +
          `.sta-tooltip__arrow` are verified by interaction in the smoke
          (the controller hovers/focuses this trigger, then measures
          `.sta-tooltip`). See OverlaysFamily comment + the PR report.
        */}
        <Tooltip content="Token-styled tooltip exemplar">
          <Button variant="secondary">Hover or focus me</Button>
        </Tooltip>
      </section>

      <section data-gallery-component="DropdownMenu">
        <h2>DropdownMenu</h2>
        <DropdownMenuExemplar />
      </section>
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
        <OverlaysFamily />
      </section>
    </section>
  )
}
