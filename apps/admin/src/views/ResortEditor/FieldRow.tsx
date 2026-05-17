import {
  Button,
  Input,
  SourceBadge,
  StatusPill,
} from '@snowboard-trip-advisor/design-system'
import type {
  FieldState,
  MetricPath,
  Money,
  ResortSlug,
  SourceKey,
} from '@snowboard-trip-advisor/schema'
import type { JSX } from 'react'
import { lazy, Suspense, useId, useRef, useState } from 'react'

import type { RouteState } from '../../lib/urlState'
import { useResponsiveTabOrder } from '../../lib/useResponsiveTabOrder'
import {
  useAnalystNoteDraft,
  type NoteDraftStatus,
} from '../../state/useAnalystNoteDraft'
import { useAnalystNotes } from '../../state/useAnalystNotes'
import { useModeToggle } from '../../state/useModeToggle'
import { useURLState } from '../../state/useURLState'
import { useWorkspaceState } from '../../state/useWorkspaceState'

import { ModeToggle } from './ModeToggle'

// PR N.c4 §6.6 — LOAD-BEARING lazy boundary. AnalystNoteSection statically
// imports `@snowboard-trip-advisor/schema/markdown` (the ~150 KB `unified`
// renderer chain). It is reachable from FieldRow ONLY through this
// `lazy(() => import())` so the renderer chunk is fetched on the first
// "Notes" expand and never pulled by Dashboard / ResortsTable /
// PublishDialog / PublishHistory. NEVER add a static `import` of
// './AnalystNoteSection' (or the renderer) anywhere in this module — that
// would collapse the code split (spec §6.6 / §10.4). The Suspense fallback
// is `null` and the section is mounted ONLY when `notesExpanded` is true.
// `lazy` infers the component type from the dynamic-import module shape;
// no `import()` type annotation is needed (and it is lint-forbidden). The
// import specifier is the ONLY reference to this module in FieldRow — keeping
// it inside `lazy(() => import(...))` is exactly what preserves the split.
const AnalystNoteSection = lazy(() => import('./AnalystNoteSection'))

// Spec §6.1 — N is the rendered-HTML *text* character count (markup
// excluded), 0 when there is no note. Parsing the server-sanitized html
// string into a detached element and reading textContent keeps the count in
// lockstep with what the preview pane will actually display. The string is
// already sanitized by renderAnalystNoteMarkdown server-side; this never
// attaches to the live document.
function noteTextContent(html: string | undefined): string {
  if (html === undefined || html === '') {
    return ''
  }
  const el = document.createElement('div')
  el.innerHTML = html
  // `HTMLDivElement.textContent` is non-null (TS narrows it for an Element
  // with content); the empty-html / undefined cases are handled above.
  return el.textContent
}

// FieldRow only ever renders on the editor route (MetricPanel → ResortEditor).
// useWorkspaceState() higher in the body already throws the analogous error
// on a non-editor route, so the non-editor branch here is a defensive
// invariant — exported + unit-tested directly so both branches are covered
// without an inline coverage suppression (CLAUDE.md Coverage Rules).
// eslint-disable-next-line react-refresh/only-export-components -- pure helper co-located inside FieldRow.tsx; same rationale as `formatMetricValue` / `labelForPath`. Honors the PR §11.1 8-file budget (no extra module).
export function editorSlug(route: RouteState): ResortSlug {
  if (route.route !== 'editor') {
    throw new Error('FieldRow rendered outside the editor route')
  }
  return route.slug
}

const TOOLTIP_MAX = 80

// PR 4.4b §D2 formatters. Exhaustive switch on MetricPath; never throws;
// shape-mismatch / null / undefined inputs render as '—'. Money values use
// Intl.NumberFormat with literal 'EUR' (Money.currency is z.literal('EUR') in
// packages/schema/src/primitives.ts:5-9; non-EUR upstream prices live on
// field_sources.<path>.fx.native_currency per ADR-0003 — Codex round-8 P2-11
// fold corrected the v9 plan's `currency: 'PLN'` test).
//
// PR 4.4d adds the MANUAL input + responsive gate per Decision D11. Per
// AGENTS.md "Admin App Rules" the editor is read-only below the md
// breakpoint — the interactive ModeToggle button + the MANUAL input are
// REPLACED with a render-only `<span role="switch" aria-disabled="true">`
// below md, and the input is absent from the DOM entirely.

const MONTH_NAMES_LONG: ReadonlyArray<string> = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Per F1 + Codex round-1 P2-1: only the 7 durable numeric paths can be
// MANUAL-edited. The cross-key invariant in WorkspaceFile restricts
// editor_modes keys to resort.field_sources (durable subset). Live paths
// render explanatory copy unconditionally per Codex round-22 P2-30 and
// their ModeToggle is `disabled` so the constraint is visible at the
// control instead of silently no-op'ing on click.
const MANUAL_EDITABLE_PATHS: ReadonlySet<MetricPath> = new Set([
  'altitude_m.min', 'altitude_m.max', 'slopes_km', 'lift_count',
  'skiable_terrain_ha', 'season.start_month', 'season.end_month',
])

// Per PR 4.6a Tier 5 plan Decision E1: the responsive gate is provided by the
// shared `useResponsiveTabOrder` hook in `apps/admin/src/lib/`. This file
// previously inlined a `useIsAboveMd` impl + `MD_QUERY` constant + matchMedia
// subscription; PR 4.6a extracts them into the dedicated hook (token-driven
// breakpoint preserved; jsdom-friendly fallback preserved). FieldRow consumes
// `readOnly` and inverts to local `isAboveMd` so all downstream branches stay
// unchanged.

function isMoney(v: unknown): v is Money {
  if (typeof v !== 'object' || v === null) {
    return false
  }
  const obj = v as Record<string, unknown>
  return typeof obj['amount'] === 'number' && obj['currency'] === 'EUR'
}

function formatMoney(value: unknown): string {
  if (!isMoney(value)) {
    return '—'
  }
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'EUR',
  }).format(value.amount)
}

function formatMonth(value: unknown): string {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return '—'
  }
  const month = MONTH_NAMES_LONG[value - 1]
  if (month === undefined) {
    return '—'
  }
  return month
}

function formatNumberWithUnit(value: unknown, unit: string): string {
  if (typeof value !== 'number') {
    return '—'
  }
  return `${String(value)} ${unit}`
}

function formatPlainNumber(value: unknown): string {
  if (typeof value !== 'number') {
    return '—'
  }
  return String(value)
}

// eslint-disable-next-line react-refresh/only-export-components -- helper co-located inside FieldRow.tsx to honour the PR 4.4b 8-file budget. PR 4.4d keeps the export so ModeToggle.tsx and useModeToggle can reuse the labels.
export function formatMetricValue(path: MetricPath, value: unknown): string {
  switch (path) {
    case 'altitude_m.min':
    case 'altitude_m.max':
      return formatNumberWithUnit(value, 'm')
    case 'slopes_km':
      return formatNumberWithUnit(value, 'km')
    case 'lift_count':
    case 'lifts_open.count':
    case 'lifts_open.total':
      return formatPlainNumber(value)
    case 'skiable_terrain_ha':
      return formatNumberWithUnit(value, 'ha')
    case 'season.start_month':
    case 'season.end_month':
      return formatMonth(value)
    case 'snow_depth_cm':
      return formatNumberWithUnit(value, 'cm')
    case 'lift_pass_day':
    case 'lodging_sample.median_eur':
      return formatMoney(value)
  }
}

function sourceForBadge(state: FieldState): SourceKey | null {
  if (state.state === 'live' || state.state === 'stale') {
    return state.source
  }
  if (state.state === 'manual') {
    return 'manual'
  }
  return null
}

function valueOfState(state: FieldState): unknown {
  if (state.state === 'failed') {
    return undefined
  }
  return state.value
}

function displayValue(path: MetricPath, state: FieldState): string {
  if (state.state === 'failed') {
    return '—'
  }
  return formatMetricValue(path, state.value)
}

// Exhaustive read of a MetricPath leaf from draft.resort. MetricPath is a
// closed enum of 12 dotted-path strings (none deeper than two segments per
// `packages/schema/src/metricFields.ts`), so an explicit switch is both
// the simplest expression AND keeps coverage testable without contrived
// invalid-shape inputs. Live paths return undefined since they live on
// draft.live_signal (the caller falls through to the canonical FieldState
// value via `valueOfState`).
function readDraftLeaf(
  draftResort: { readonly [k: string]: unknown } | undefined,
  path: MetricPath,
): unknown {
  if (draftResort === undefined) { return undefined }
  switch (path) {
    case 'slopes_km': return draftResort['slopes_km']
    case 'lift_count': return draftResort['lift_count']
    case 'skiable_terrain_ha': return draftResort['skiable_terrain_ha']
    case 'altitude_m.min': return readNested(draftResort['altitude_m'], 'min')
    case 'altitude_m.max': return readNested(draftResort['altitude_m'], 'max')
    case 'season.start_month': return readNested(draftResort['season'], 'start_month')
    case 'season.end_month': return readNested(draftResort['season'], 'end_month')
    case 'snow_depth_cm':
    case 'lifts_open.count':
    case 'lifts_open.total':
    case 'lift_pass_day':
    case 'lodging_sample.median_eur':
      return undefined
  }
}

// The 2-segment durable parents (altitude_m, season) are typed as
// `{ min, max }` / `{ start_month, end_month }` when defined on Resort, so
// the only runtime shape we have to handle here is "undefined parent" (cold
// canonical / never edited). All other shapes are unreachable through the
// schema-guarded write paths in useWorkspaceState.
function readNested(parent: unknown, leaf: string): unknown {
  if (parent === undefined) { return undefined }
  return (parent as Record<string, unknown>)[leaf]
}

export interface FieldRowProps {
  readonly path: MetricPath
  // FieldState is the Zod-inferred, wire-shaped union (`author?: string | undefined`
  // on the manual variant). FieldStateFor<unknown> in resortView.ts is the
  // strict-TS equivalent (`author?: string`); under exactOptionalPropertyTypes
  // they diverge, so we accept the wire shape here. Tests can still construct
  // FieldStateFor literals — they're a structural subtype.
  readonly state: FieldState
}

export function FieldRow({ path, state }: FieldRowProps): JSX.Element {
  const label = labelForPath(path)
  const badgeSource = sourceForBadge(state)
  const { draft, setFieldValue, clearFieldValue } = useWorkspaceState()
  const { toggleMode, modeFor } = useModeToggle()
  const { readOnly } = useResponsiveTabOrder()
  const isAboveMd = !readOnly

  // Analyst-note affordance (spec §6.1 / §6.4 / §6.6). FieldRow only renders
  // on the editor route — useWorkspaceState() above already enforced that
  // invariant (it throws on a non-editor route first), so route.slug is
  // statically present (editorSlug's non-editor branch is a defensive,
  // separately-unit-tested guard). The `useAnalystNotes` read is Suspense-
  // based; it is isolated inside <NoteAffordance> behind a LOCAL <Suspense>
  // below so a cold notes cache only shows the "📝 …" placeholder for this
  // one row instead of bubbling the throw up to ResortEditor's boundary and
  // forcing a whole-tree concurrent re-render.
  const route = useURLState()
  const slug = editorSlug(route)
  const [notesExpanded, setNotesExpanded] = useState(false)
  const sectionId = useId()

  // Resolve the displayed/edited value. Draft overrides canonical for paths
  // the user has edited in-session; otherwise fall back to the canonical
  // FieldState value (or undefined for failed states).
  const persistedValue = readDraftLeaf(draft.resort, path) ?? valueOfState(state)
  const currentMode = modeFor(path)
  const isManual = currentMode === 'manual'
  const isMonth = path === 'season.start_month' || path === 'season.end_month'
  // Codex round-22 P2-30 / F1: live-path toggle is `disabled` so the
  // cross-key constraint is visible at the control instead of silently
  // no-op'ing. The 5 live paths render explanatory copy unconditionally.
  const isToggleable = MANUAL_EDITABLE_PATHS.has(path)

  // Per Codex round-11 P2-15 + round-17 P2-23 + round-22 P2-31: local
  // string state for the numeric input so empty / whitespace / transient
  // / out-of-range / non-finite strings don't coerce to 0 or NaN and
  // persist via the 500ms autosave. The local string syncs from
  // `persistedValue` via a render-time ref check when the persisted value
  // changes externally (post-PUT canonical update, navigation reload).
  //
  // Codex P2-A fold (PR 4.4d): sync ONLY when `localString` still matches
  // the previously-synced `persistedValue` (string form). If the user has
  // edited locally to a value that disagrees with the prior sync (e.g.,
  // typed `'155'` then cleared the input — `clearFieldValue` removes the
  // draft → `persistedValue` falls back to the canonical `state.value`),
  // we MUST NOT overwrite the user's transient input with a stale
  // canonical value. Without this guard, clearing or typing an invalid
  // intermediate restores the old canonical immediately and the user
  // can't even hold the field blank to start over. The ref still advances
  // so a subsequent external change (slug-switch / reload) can re-sync
  // when localString matches the new baseline.
  const [localString, setLocalString] = useState((): string => persistedValueToString(persistedValue))
  const lastPersistedRef = useRef<unknown>(persistedValue)
  if (lastPersistedRef.current !== persistedValue) {
    const prevPersistedStr = persistedValueToString(lastPersistedRef.current)
    const nextPersistedStr = persistedValueToString(persistedValue)
    lastPersistedRef.current = persistedValue
    if (localString === prevPersistedStr) {
      setLocalString(nextPersistedStr)
    }
  }

  // ModeToggle: above md → interactive DS Button (disabled for live paths);
  // below md → render-only span per D11 + AGENTS.md "Admin App Rules".
  const modeToggleEl = isAboveMd
    ? (
        <ModeToggle
          label={label}
          mode={currentMode}
          disabled={!isToggleable}
          onToggle={(): void => { toggleMode(path) }}
        />
      )
    : (
        <span
          role="switch"
          aria-checked={isManual}
          aria-disabled="true"
          className="sta-field-row__mode-toggle"
        >
          {isManual ? 'Manual' : 'Auto'}
        </span>
      )

  // Per Codex round-11 P2-15 / round-15 P2-20 / round-17 P2-23 / round-19
  // P2-26 / round-22 P2-31: empty / whitespace / NaN / Infinity / out-of-
  // range / non-integer-where-required strings are local-only transient
  // state — do NOT call setFieldValue. Each transient branch calls
  // clearFieldValue (Codex round-20 P2-28) so a previously-typed valid
  // value doesn't get PUT by a pending debounce after the user clears.
  // editor_modes[path] is preserved by clearFieldValue.
  const onLocalChange = (raw: string): void => {
    setLocalString(raw)
    if (raw.trim() === '') { clearFieldValue(path); return }
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) { clearFieldValue(path); return }
    if (isMonth && (parsed < 1 || parsed > 12 || !Number.isInteger(parsed))) {
      clearFieldValue(path)
      return
    }
    if (path === 'lift_count' && !Number.isInteger(parsed)) {
      clearFieldValue(path)
      return
    }
    setFieldValue(path, parsed)
  }

  // Above-md render-mode logic:
  //   - live path → explanatory copy (toggle is disabled, MANUAL unreachable).
  //   - durable + MANUAL → DS Input (type='text' per Codex round-15 P2-20).
  //   - durable + AUTO → no input.
  const inputElement = pickInputElement({
    isAboveMd,
    isToggleable,
    isManual,
    path,
    label,
    localString,
    onLocalChange,
  })

  const onToggleNotes = (): void => {
    setNotesExpanded((open): boolean => !open)
  }

  return (
    <div data-path={path} aria-label={label} className="sta-field-row">
      <span className="sta-field-row__label">{label}</span>
      <StatusPill variant={state.state} />
      <span className="sta-field-row__value">{displayValue(path, state)}</span>
      {badgeSource !== null ? <SourceBadge source={badgeSource} /> : null}
      {modeToggleEl}
      {/* Both the affordance AND the adjacent save-status read the notes GET
          via Suspense (NoteAffordance → useAnalystNotes; NoteSaveStatus →
          useAnalystNoteDraft → useAnalystNotes). Keep BOTH inside this ONE
          LOCAL <Suspense> so a cold cache shows only this row's placeholder
          (📝 …, disabled) instead of bubbling the throw to ResortEditor's
          route boundary and collapsing the WHOLE editor into "Loading…".
          The placeholder is itself the affordance shape so layout doesn't
          shift when the count resolves; on a cold cache there is no
          save-status to show yet (status is idle → renders nothing), so the
          fallback needs no status placeholder.

          Spec §6.2 — the save-status indicator stays NEXT TO THE AFFORDANCE
          (DOM-adjacent, inside the same boundary) and, once the cache is
          warm, is ALWAYS mounted at FieldRow level. It subscribes to
          useAnalystNoteDraft's module-level write-hook state, so a
          saving→saved→save-failed transition stays visible whether the
          collapsible AnalystNoteSection is expanded OR collapsed (Escape /
          second affordance click / dropping below md all unmount the
          section). Without this, a flush that fails AFTER the analyst
          collapses the row would be silent (data loss). It renders
          regardless of isAboveMd so a failure stays visible in the
          read-only layout too. The hook reads from the already-cached
          useAnalystNotes(slug) — no new network — and uses
          useSyncExternalStore internally (declarative subscription, no
          effect / state mirroring). idle/dirty render nothing so untouched
          rows show no noise; and per the round-5 P2-A fold the
          seeded-on-mount `saved` (a pre-existing persisted note with no edit
          this session) is suppressed too — `saved` only shows once a real
          save lifecycle (a `saving` was observed) has run for this path. */}
      <Suspense
        fallback={
          <NoteAffordanceButton
            charCount={null}
            hasNote={false}
            tooltip="Add note"
            expanded={notesExpanded}
            sectionId={sectionId}
            isAboveMd={isAboveMd}
            onToggle={onToggleNotes}
          />
        }
      >
        <NoteAffordance
          slug={slug}
          path={path}
          expanded={notesExpanded}
          sectionId={sectionId}
          isAboveMd={isAboveMd}
          onToggle={onToggleNotes}
        />
        <NoteSaveStatus slug={slug} path={path} />
      </Suspense>
      {inputElement}
      {isAboveMd && notesExpanded ? (
        <div id={sectionId}>
          {/* Spec §6.6: the renderer chunk loads ONLY here, on first expand.
              fallback={null} per spec (no flash of a spinner for a ~150ms
              chunk fetch). The `isAboveMd &&` gate enforces the §6.5
              read-only-below-md rule — the editable Textarea + Delete button
              are ABSENT from the DOM below md (consistent with `modeToggleEl`
              / the MANUAL input), not merely disabled. `notesExpanded` state
              is preserved so the section re-appears declaratively when the
              viewport returns above md (no imperative collapse needed). */}
          <Suspense fallback={null}>
            <AnalystNoteSection
              slug={slug}
              path={path}
              onCollapse={(): void => {
                setNotesExpanded(false)
              }}
            />
          </Suspense>
        </div>
      ) : null}
    </div>
  )
}

// Presentational affordance button (spec §6.1). `charCount === null` is the
// Suspense-fallback (cache cold) state — render "📝 …" so the row's layout is
// stable and the control is still focusable-but-shows-nothing-changed. With a
// resolved count: N===0 → outlined + "Add note"; N>0 → filled + "Edit note".
// Disabled below md per the PR 4.6a responsive rule (native `disabled`).
//
// Spec §6.1 specifies `<Button size="sm">`; the DS Button (PR 3.1c/3.2) has
// no `size` prop, so mirror the sibling ModeToggle's `variant="ghost"`-only
// usage. PR N.c4 adds the additive `aria-expanded`/`aria-controls`/`title`
// disclosure props to Button (spec §6.5 — see Button.tsx).
function NoteAffordanceButton({
  charCount,
  hasNote,
  tooltip,
  expanded,
  sectionId,
  isAboveMd,
  onToggle,
}: {
  readonly charCount: number | null
  readonly hasNote: boolean
  readonly tooltip: string
  readonly expanded: boolean
  readonly sectionId: string
  readonly isAboveMd: boolean
  readonly onToggle: () => void
}): JSX.Element {
  return (
    <Button
      variant="ghost"
      data-note-filled={hasNote ? 'true' : 'false'}
      aria-label={hasNote ? 'Edit note' : 'Add note'}
      aria-expanded={expanded}
      aria-controls={sectionId}
      disabled={!isAboveMd}
      title={tooltip}
      onClick={onToggle}
    >
      {`📝 ${charCount === null ? '…' : String(charCount)}`}
    </Button>
  )
}

// Reads the slug's notes (Suspense) and renders the affordance for `path`.
// Isolated so the suspend stays inside FieldRow's LOCAL <Suspense> boundary.
function NoteAffordance({
  slug,
  path,
  expanded,
  sectionId,
  isAboveMd,
  onToggle,
}: {
  readonly slug: ResortSlug
  readonly path: MetricPath
  readonly expanded: boolean
  readonly sectionId: string
  readonly isAboveMd: boolean
  readonly onToggle: () => void
}): JSX.Element {
  const notes = useAnalystNotes(slug)
  const noteText = noteTextContent(notes.notes[path]?.html)
  const noteCharCount = noteText.length
  const hasNote = noteCharCount > 0
  return (
    <NoteAffordanceButton
      charCount={noteCharCount}
      hasNote={hasNote}
      tooltip={hasNote ? noteText.slice(0, TOOLTIP_MAX) : 'Add note'}
      expanded={expanded}
      sectionId={sectionId}
      isAboveMd={isAboveMd}
      onToggle={onToggle}
    />
  )
}

// Spec §6.2 status→label mapping. Kept verbatim-equivalent to the mapping
// AnalystNoteSection previously owned (it now consumes THIS as the single
// source of truth) so the indicator text/aria is identical wherever it
// renders. idle/dirty → null (render nothing): an untouched or
// mid-keystroke row shows no noise; only the post-edit
// saving/saved/save-failed lifecycle is surfaced.
// eslint-disable-next-line react-refresh/only-export-components -- pure helper co-located inside FieldRow.tsx; same rationale as `formatMetricValue` / `labelForPath`. Exported so its status→label branches are unit-tested directly without contrived component renders (CLAUDE.md Coverage Rules). Honors the PR §11.1 file budget (no extra module).
export function noteSaveStatusLabel(status: NoteDraftStatus): string | null {
  switch (status) {
    case 'saving':
      return 'saving…'
    case 'saved':
      return 'saved'
    case 'save-failed':
      return 'save-failed'
    case 'idle':
    case 'dirty':
      return null
  }
}

// FieldRow-level save-status indicator (spec §6.2), rendered adjacent to the
// 📝 affordance and ALWAYS mounted (unlike AnalystNoteSection). Subscribes
// declaratively to the per-path module-level write-hook state via
// useAnalystNoteDraft — the same handle AnalystNoteSection uses — so the
// status survives the section unmounting (collapse / below-md). Reading the
// hook here seeds per-path state from the already-cached useAnalystNotes(slug)
// with no extra network (spec §6.2 / N.c2 design). Renders nothing while the
// label is null (idle/dirty) so untouched rows stay quiet.
//
// Codex round-5 P2-A fold — seeded-`saved` suppression. useAnalystNoteDraft
// SEEDS a path that already has a persisted note with status `'saved'` on
// mount (N.c2 spec §5.3 initial-state) even though NO save just occurred.
// Because this component is ALWAYS mounted, mapping that seeded `saved`
// straight to "saved" would slap a persistent badge on EVERY pre-noted row
// at page load / after collapse — noise, and contrary to spec §6.2's
// lifecycle (`saving… → saved → save-failed` only AFTER a local edit/flush).
// Fix: only surface `saved` once a real save lifecycle has been observed
// this session for this path. `sawSavingRef` is a monotonic render-latch
// (the accepted React "track-seen" idiom — no effect, no extra render): it
// flips true the first render where `status === 'saving'`, which can only
// arise after an edit/flush. `saving` and `save-failed` ALWAYS render
// (save-failed visibility is the round-3 silent-data-loss guarantee — never
// gate it; it too only follows an edit). NoteSaveStatus is mounted for the
// FieldRow's whole lifetime (only AnalystNoteSection unmounts on collapse),
// so the latch persists across expand/collapse: edit → dirty → saving (latch
// set, "saving…") → saved ("saved") / save-failed ("save-failed").
function NoteSaveStatus({
  slug,
  path,
}: {
  readonly slug: ResortSlug
  readonly path: MetricPath
}): JSX.Element | null {
  const { status } = useAnalystNoteDraft(slug, path)
  const sawSavingRef = useRef(false)
  if (status === 'saving') {
    sawSavingRef.current = true
  }
  // Suppress the seeded-on-mount `saved` (a pre-existing persisted note with
  // no edit this session): if `saved` is reached without ever passing
  // through `saving`, no real save happened — render nothing. Every other
  // status (incl. `saving` / `save-failed`, which only arise post-edit) maps
  // through the pure helper unchanged.
  const label =
    status === 'saved' && !sawSavingRef.current
      ? null
      : noteSaveStatusLabel(status)
  if (label === null) {
    return null
  }
  return (
    <span role="status" className="sta-analyst-note__status">
      {label}
    </span>
  )
}

function pickInputElement(args: {
  readonly isAboveMd: boolean
  readonly isToggleable: boolean
  readonly isManual: boolean
  readonly path: MetricPath
  readonly label: string
  readonly localString: string
  readonly onLocalChange: (raw: string) => void
}): JSX.Element | null {
  if (!args.isAboveMd) { return null }
  if (!args.isToggleable) {
    return <span data-testid="manual-pending-copy">MANUAL editing for {args.path} lands in PR 4.6a.</span>
  }
  if (!args.isManual) { return null }
  return (
    <Input
      label={args.label}
      type="text"
      value={args.localString}
      onChange={args.onLocalChange}
    />
  )
}

function persistedValueToString(v: unknown): string {
  if (v === null || v === undefined) { return '' }
  if (typeof v === 'number') { return String(v) }
  // Money / lifts_open / etc. shapes don't surface as MANUAL-editable in
  // Phase 1 (only the 7 durable numeric paths are MANUAL_EDITABLE), so this
  // branch is reachable only as a defensive fallback for unexpected shapes.
  // Empty string keeps the input usable instead of rendering [object Object].
  return ''
}

// eslint-disable-next-line react-refresh/only-export-components -- helper co-located inside FieldRow.tsx; same rationale as `formatMetricValue` above. PR 4.4d's interactive ModeToggle still consumes labelForPath for its aria-label.
export function labelForPath(path: MetricPath): string {
  switch (path) {
    case 'altitude_m.min': return 'Altitude (min, m)'
    case 'altitude_m.max': return 'Altitude (max, m)'
    case 'slopes_km': return 'Slopes (km)'
    case 'lift_count': return 'Lift count'
    case 'skiable_terrain_ha': return 'Skiable terrain (ha)'
    case 'season.start_month': return 'Season start'
    case 'season.end_month': return 'Season end'
    case 'snow_depth_cm': return 'Snow depth (cm)'
    case 'lifts_open.count': return 'Lifts open (count)'
    case 'lifts_open.total': return 'Lifts open (total)'
    case 'lift_pass_day': return 'Lift pass (per day)'
    case 'lodging_sample.median_eur': return 'Lodging median'
  }
}
