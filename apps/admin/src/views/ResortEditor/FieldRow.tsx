import {
  Input,
  SourceBadge,
  StatusPill,
  tokens,
} from '@snowboard-trip-advisor/design-system'
import type {
  FieldState,
  MetricPath,
  Money,
  SourceKey,
} from '@snowboard-trip-advisor/schema'
import type { JSX } from 'react'
import { useRef, useState, useSyncExternalStore } from 'react'

import { useModeToggle } from '../../state/useModeToggle'
import { useWorkspaceState } from '../../state/useWorkspaceState'

import { ModeToggle } from './ModeToggle'

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

// Per Codex round-7 P2-9: drive the responsive query from `tokens.breakpoint.md`
// (= 900) so the responsive gate stays aligned to the design-system token
// (NOT the hardcoded 768 from an earlier plan revision — that would leave
// 768-899px tablet widths interactive in violation of AGENTS.md "Admin App
// Rules: edit controls are removed from the tab order below md").
const MD_QUERY = `(min-width: ${tokens.breakpoint.md.toString()}px)`

// Subscribes to viewport changes via matchMedia. addEventListener fires when
// the viewport crosses the threshold. useSyncExternalStore handles the React
// side. Per Codex round-6 P2-8: jsdom does not implement matchMedia natively
// so FieldRow.test.tsx stubs it with vi.stubGlobal. Other test files that
// mount FieldRow indirectly (ResortEditor.test.tsx, integration tests) do
// NOT stub it — the implementation falls back to the above-md default
// (the admin runs loopback-only on desktop in Phase 1) so callers without
// matchMedia get the interactive editor surface, matching the dev-loopback
// reality. PR 4.4d's file budget excludes test-setup.ts modification per
// Decision D11.
function hasMatchMedia(): boolean {
  return typeof window.matchMedia === 'function'
}

function useIsAboveMd(): boolean {
  const subscribe = (cb: () => void): (() => void) => {
    if (!hasMatchMedia()) { return (): void => {} }
    const mql = window.matchMedia(MD_QUERY)
    mql.addEventListener('change', cb)
    return (): void => { mql.removeEventListener('change', cb) }
  }
  const getSnapshot = (): boolean => {
    if (!hasMatchMedia()) { return true }
    return window.matchMedia(MD_QUERY).matches
  }
  // No getServerSnapshot: admin is loopback dev-only (`apps/admin/vite.config.ts`
  // binds 127.0.0.1:5174 with strictPort) and never reaches React's SSR
  // machinery, so the SSR fallback would be dead code in every test
  // environment we run.
  return useSyncExternalStore(subscribe, getSnapshot)
}

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
  const isAboveMd = useIsAboveMd()

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

  return (
    <div data-path={path} aria-label={label} className="sta-field-row">
      <span className="sta-field-row__label">{label}</span>
      <StatusPill variant={state.state} />
      <span className="sta-field-row__value">{displayValue(path, state)}</span>
      {badgeSource !== null ? <SourceBadge source={badgeSource} /> : null}
      {modeToggleEl}
      {inputElement}
    </div>
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
