import { SourceBadge, StatusPill } from '@snowboard-trip-advisor/design-system'
import type {
  FieldStateFor,
  MetricPath,
  Money,
  SourceKey,
} from '@snowboard-trip-advisor/schema'
import type { JSX } from 'react'

// PR 4.4b §D2 formatters. Exhaustive switch on MetricPath; never throws;
// shape-mismatch / null / undefined inputs render as '—'. Money values use
// Intl.NumberFormat with literal 'EUR' (Money.currency is z.literal('EUR') in
// packages/schema/src/primitives.ts:5-9; non-EUR upstream prices live on
// field_sources.<path>.fx.native_currency per ADR-0003 — Codex round-8 P2-11
// fold corrected the v9 plan's `currency: 'PLN'` test). PR 4.4d will widen
// the file with a render-only component, MANUAL <input>, and the responsive
// gate; this PR ships the formatter half so ResortEditor's view layer has
// a stable display contract before edit interaction lands.

const MONTH_NAMES_LONG: ReadonlyArray<string> = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function isMoney(v: unknown): v is Money {
  if (typeof v !== 'object' || v === null) {
    return false
  }
  const obj = v as Record<string, unknown>
  return typeof obj.amount === 'number' && obj.currency === 'EUR'
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
  // 1-indexed input → 0-indexed array lookup. Out-of-range values land on the
  // undefined fallback (covered by the season.{start,end}_month=0/13 tests);
  // the bounds check is *inside* the lookup so coverage stays measurable
  // without an unreachable defensive arm above.
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

// eslint-disable-next-line react-refresh/only-export-components -- helper co-located inside FieldRow.tsx to honour the PR 4.4b 8-file budget; PR 4.4d widens this file with the MANUAL <input> + responsive gate, splitting becomes worthwhile then. The render-only FieldRow has no production HMR path that depends on this re-export.
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

function sourceForBadge(state: FieldStateFor<unknown>): SourceKey | null {
  if (state.state === 'live' || state.state === 'stale') {
    return state.source
  }
  if (state.state === 'manual') {
    return 'manual'
  }
  return null
}

function displayValue(path: MetricPath, state: FieldStateFor<unknown>): string {
  if (state.state === 'failed') {
    return '—'
  }
  return formatMetricValue(path, state.value)
}

export interface FieldRowProps {
  readonly path: MetricPath
  readonly state: FieldStateFor<unknown>
}

// Render-only FieldRow (PR 4.4b). PR 4.4d adds the MANUAL <input> for the 7
// durable numeric paths, the interactive <ModeToggle> button, and the responsive
// gate per Decision D11. The render-only ModeToggle below (`<span role="switch"
// aria-disabled="true">`) is the visible-but-inert placeholder that PR 4.4d
// will replace with a button-based primitive — the spec deviation is flagged
// in the PR description.
export function FieldRow({ path, state }: FieldRowProps): JSX.Element {
  const label = labelForPath(path)
  const badgeSource = sourceForBadge(state)
  const isManual = state.state === 'manual'
  return (
    <div data-path={path} aria-label={label} className="sta-field-row">
      <span className="sta-field-row__label">{label}</span>
      <StatusPill variant={state.state} />
      <span className="sta-field-row__value">{displayValue(path, state)}</span>
      {badgeSource !== null ? <SourceBadge source={badgeSource} /> : null}
      <span
        role="switch"
        aria-checked={isManual}
        aria-disabled="true"
        className="sta-field-row__mode-toggle"
      >
        {isManual ? 'Manual' : 'Auto'}
      </span>
    </div>
  )
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
