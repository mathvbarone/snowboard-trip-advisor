import type { MetricPath, Money } from '@snowboard-trip-advisor/schema'

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
