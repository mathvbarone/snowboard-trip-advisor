export type MetricPath =
  | 'altitude_m.min' | 'altitude_m.max' | 'slopes_km' | 'lift_count'
  | 'skiable_terrain_ha' | 'season.start_month' | 'season.end_month'
  | 'snow_depth_cm' | 'lifts_open.count' | 'lifts_open.total'
  | 'lift_pass_day' | 'lodging_sample.median_eur'

export const METRIC_FIELDS: readonly MetricPath[] = Object.freeze([
  'altitude_m.min', 'altitude_m.max', 'slopes_km', 'lift_count',
  'skiable_terrain_ha', 'season.start_month', 'season.end_month',
  'snow_depth_cm', 'lifts_open.count', 'lifts_open.total',
  'lift_pass_day', 'lodging_sample.median_eur'
] as const)
