import { formatMoney, formatNumber } from '@snowboard-trip-advisor/design-system'
import type { FieldValue, MetricPath, ResortView } from '@snowboard-trip-advisor/schema'

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
  // Months are 1-indexed in the schema (Jan=1, Dec=12). Schema validation
  // (`validatePublishedDataset`) already pins month ∈ 1..12 before publish,
  // so MONTH_LABELS[monthIndex - 1] is always a defined string for any
  // ResortView that traversed loadResortDataset — no positional fallback.
  return MONTH_LABELS[monthIndex - 1] as string
}

// Helper: collapses the recurring `never_fetched ? MISSING : formatNumber(...)`
// shape used by every numeric metric. `get` lifts the FieldValue<T> off the
// view; `pick` projects the numeric primitive out of T (identity for scalar
// fields, accessor for record-valued fields like altitude_m / lifts_open).
function numeric<TValue>(
  get: (view: ResortView) => FieldValue<TValue>,
  pick: (value: TValue) => number,
): (view: ResortView) => string {
  return (view): string => {
    const f = get(view)
    if (f.state === 'never_fetched') {
      return MISSING
    }
    return formatNumber({ value: pick(f.value) })
  }
}

export const METRIC_RENDERERS: Record<MetricPath, (view: ResortView) => string> = {
  'altitude_m.min': numeric((v): FieldValue<{ min: number; max: number }> => v.altitude_m, (x): number => x.min),
  'altitude_m.max': numeric((v): FieldValue<{ min: number; max: number }> => v.altitude_m, (x): number => x.max),
  'slopes_km': numeric((v): FieldValue<number> => v.slopes_km, (x): number => x),
  'lift_count': numeric((v): FieldValue<number> => v.lift_count, (x): number => x),
  'skiable_terrain_ha': numeric((v): FieldValue<number> => v.skiable_terrain_ha, (x): number => x),
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
  'snow_depth_cm': numeric((v): FieldValue<number> => v.snow_depth_cm, (x): number => x),
  'lifts_open.count': numeric((v): FieldValue<{ count: number; total: number }> => v.lifts_open, (x): number => x.count),
  'lifts_open.total': numeric((v): FieldValue<{ count: number; total: number }> => v.lifts_open, (x): number => x.total),
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
