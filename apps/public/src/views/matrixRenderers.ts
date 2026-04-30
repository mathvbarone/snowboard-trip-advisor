import { formatMoney, formatNumber } from '@snowboard-trip-advisor/design-system'
import type { MetricPath, ResortView } from '@snowboard-trip-advisor/schema'

// Per-metric display renderer for MatrixView. Kept in a sibling module so
// branches involving `never_fetched` fields are unit-testable against
// synthetic ResortView fixtures — the published seed dataset populates
// every METRIC_FIELDS entry, so the view-level test driven by the MSW
// seed cannot reach the missing-state code paths in isolation (mirrors
// the cardsSelectors.ts pattern).
//
// Each renderer takes a ResortView and returns a display string — either
// the formatted primitive or `MISSING` ("—") for `never_fetched` fields.
// The dispatch is a typed Record so adding a new metric to METRIC_FIELDS
// is a compile error here until the corresponding renderer lands.

export const MISSING = '—'

const MONTH_LABELS: ReadonlyArray<string> = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function monthLabel(monthIndex: number): string {
  // Months are 1-indexed in the schema (Jan=1, Dec=12); out-of-range
  // values fall back to a positional placeholder rather than throwing
  // — the renderer's contract is "best-effort display".
  return MONTH_LABELS[monthIndex - 1] ?? `M${String(monthIndex)}`
}

export const METRIC_RENDERERS: Record<MetricPath, (view: ResortView) => string> = {
  'altitude_m.min': (view): string => {
    const f = view.altitude_m
    if (f.state === 'never_fetched') {
      return MISSING
    }
    return formatNumber({ value: f.value.min })
  },
  'altitude_m.max': (view): string => {
    const f = view.altitude_m
    if (f.state === 'never_fetched') {
      return MISSING
    }
    return formatNumber({ value: f.value.max })
  },
  'slopes_km': (view): string => {
    const f = view.slopes_km
    if (f.state === 'never_fetched') {
      return MISSING
    }
    return formatNumber({ value: f.value })
  },
  'lift_count': (view): string => {
    const f = view.lift_count
    if (f.state === 'never_fetched') {
      return MISSING
    }
    return formatNumber({ value: f.value })
  },
  'skiable_terrain_ha': (view): string => {
    const f = view.skiable_terrain_ha
    if (f.state === 'never_fetched') {
      return MISSING
    }
    return formatNumber({ value: f.value })
  },
  'season.start_month': (view): string => {
    const f = view.season
    if (f.state === 'never_fetched') {
      return MISSING
    }
    return monthLabel(f.value.start_month)
  },
  'season.end_month': (view): string => {
    const f = view.season
    if (f.state === 'never_fetched') {
      return MISSING
    }
    return monthLabel(f.value.end_month)
  },
  'snow_depth_cm': (view): string => {
    const f = view.snow_depth_cm
    if (f.state === 'never_fetched') {
      return MISSING
    }
    return formatNumber({ value: f.value })
  },
  'lifts_open.count': (view): string => {
    const f = view.lifts_open
    if (f.state === 'never_fetched') {
      return MISSING
    }
    return formatNumber({ value: f.value.count })
  },
  'lifts_open.total': (view): string => {
    const f = view.lifts_open
    if (f.state === 'never_fetched') {
      return MISSING
    }
    return formatNumber({ value: f.value.total })
  },
  'lift_pass_day': (view): string => {
    const f = view.lift_pass_day
    if (f.state === 'never_fetched') {
      return MISSING
    }
    return formatMoney(f.value)
  },
  'lodging_sample.median_eur': (view): string => {
    const f = view.lodging_sample_median_eur
    if (f.state === 'never_fetched') {
      return MISSING
    }
    return formatMoney(f.value.amount)
  },
}

export const METRIC_LABELS: Record<MetricPath, string> = {
  'altitude_m.min': 'Altitude min (m)',
  'altitude_m.max': 'Altitude max (m)',
  'slopes_km': 'Slopes (km)',
  'lift_count': 'Lift count',
  'skiable_terrain_ha': 'Skiable terrain (ha)',
  'season.start_month': 'Season start',
  'season.end_month': 'Season end',
  'snow_depth_cm': 'Snow depth (cm)',
  'lifts_open.count': 'Lifts open',
  'lifts_open.total': 'Lifts total',
  'lift_pass_day': 'Lift pass / day',
  'lodging_sample.median_eur': 'Lodging median (€)',
}
