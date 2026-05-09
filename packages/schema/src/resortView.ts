import { z } from 'zod'

import { ISODateTimeString, type ISOCountryCode, type ResortSlug } from './branded'
import type { ResortLiveSignal } from './liveSignal'
import { FRESHNESS_TTL_DAYS } from './loadResortDatasetFromObject'
import { METRIC_FIELDS, type MetricPath } from './metricFields'
import { SourceKey, type FieldSource, type LocalizedString, type Money } from './primitives'
import type { Resort } from './resort'

export type FieldValue<T> =
  | { state: 'never_fetched' }
  | { state: 'fresh'; value: T; source: SourceKey; observed_at: ISODateTimeString }
  | { state: 'stale'; value: T; source: SourceKey; observed_at: ISODateTimeString; age_days: number }

export type ResortView = {
  slug: ResortSlug
  name: LocalizedString
  country: ISOCountryCode
  region: LocalizedString
  altitude_m: FieldValue<{ min: number; max: number }>
  slopes_km: FieldValue<number>
  lift_count: FieldValue<number>
  skiable_terrain_ha: FieldValue<number>
  season: FieldValue<{ start_month: number; end_month: number }>
  snow_depth_cm: FieldValue<number>
  lifts_open: FieldValue<{ count: number; total: number }>
  lift_pass_day: FieldValue<Money>
  lodging_sample_median_eur: FieldValue<{ amount: Money; sample_size: number }>
}

export type FieldStateFor<T> =
  | { state: 'live'; value: T; source: SourceKey; observed_at: ISODateTimeString }
  | { state: 'stale'; value: T; source: SourceKey; observed_at: ISODateTimeString; age_days: number }
  | { state: 'failed'; reason: string; observed_at: ISODateTimeString }
  | { state: 'manual'; value: T; author?: string; observed_at: ISODateTimeString }

export const FieldState = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('live'),
    value: z.unknown(),
    source: SourceKey,
    observed_at: ISODateTimeString,
  }),
  z.object({
    state: z.literal('stale'),
    value: z.unknown(),
    source: SourceKey,
    observed_at: ISODateTimeString,
    age_days: z.number(),
  }),
  z.object({
    state: z.literal('failed'),
    reason: z.string(),
    observed_at: ISODateTimeString,
  }),
  z.object({
    state: z.literal('manual'),
    value: z.unknown(),
    author: z.string().optional(),
    observed_at: ISODateTimeString,
  }),
])
export type FieldState = z.infer<typeof FieldState>

export function toFieldValue<T>(state: FieldStateFor<T>): FieldValue<T> {
  switch (state.state) {
    case 'live':
      return { state: 'fresh', value: state.value, source: state.source, observed_at: state.observed_at }
    case 'stale':
      return {
        state: 'stale', value: state.value, source: state.source,
        observed_at: state.observed_at, age_days: state.age_days,
      }
    case 'failed':
      return { state: 'never_fetched' }
    case 'manual':
      return { state: 'fresh', value: state.value, source: 'manual', observed_at: state.observed_at }
  }
}

// Per A1.6 / Codex round-2 P2-3: clock-aging applies to LIVE paths only.
// Durable resort attributes are 'live' whenever a field_sources entry exists;
// their observed_at age never makes them 'stale' or 'failed (never_fetched)'.
// Mirrors loadResortDatasetFromObject.ts:83-99.
const DURABLE_PATHS: ReadonlySet<MetricPath> = new Set<MetricPath>([
  'altitude_m.min', 'altitude_m.max', 'slopes_km', 'lift_count',
  'skiable_terrain_ha', 'season.start_month', 'season.end_month',
])

export function projectFieldStates(
  resort: Resort,
  live: ResortLiveSignal | null,
  modes: Partial<Record<MetricPath, 'manual' | 'auto'>>,
  now: Date,
): Record<MetricPath, FieldStateFor<unknown>> {
  // Per Codex round-14 P2-18: select source map per path's durable-vs-live class.
  // No merge — durable paths read ONLY from resort.field_sources; live paths
  // read ONLY from live_signal?.field_sources. A merged map would let a
  // durable-style entry on resort.field_sources mask a missing live entry.
  const out = {} as Record<MetricPath, FieldStateFor<unknown>>
  for (const path of METRIC_FIELDS) {
    const isDurable = DURABLE_PATHS.has(path)
    const fs = isDurable ? resort.field_sources[path] : live?.field_sources[path]
    out[path] = projectOne(path, fs, resolveValue(path, resort, live), modes[path], now)
  }
  return out
}

function projectOne(
  path: MetricPath,
  fs: FieldSource | undefined,
  value: unknown,
  mode: 'manual' | 'auto' | undefined,
  now: Date,
): FieldStateFor<unknown> {
  if (mode === 'manual' && fs !== undefined && value !== undefined) {
    return { state: 'manual', value, observed_at: fs.observed_at }
  }
  if (fs === undefined || value === undefined) {
    return { state: 'failed', reason: 'no field_sources entry', observed_at: ISODateTimeString.parse(now.toISOString()) }
  }
  if (DURABLE_PATHS.has(path)) {
    return { state: 'live', value, source: fs.source, observed_at: fs.observed_at }
  }
  const ageDays = (now.getTime() - new Date(fs.observed_at).getTime()) / (24 * 60 * 60 * 1000)
  if (ageDays > FRESHNESS_TTL_DAYS.max_stale) {
    return { state: 'failed', reason: 'never_fetched', observed_at: fs.observed_at }
  }
  if (ageDays > FRESHNESS_TTL_DAYS.default) {
    return { state: 'stale', value, source: fs.source, observed_at: fs.observed_at, age_days: ageDays }
  }
  return { state: 'live', value, source: fs.source, observed_at: fs.observed_at }
}

function resolveValue(path: MetricPath, resort: Resort, live: ResortLiveSignal | null): unknown {
  switch (path) {
    case 'altitude_m.min': return resort.altitude_m.min
    case 'altitude_m.max': return resort.altitude_m.max
    case 'slopes_km': return resort.slopes_km
    case 'lift_count': return resort.lift_count
    case 'skiable_terrain_ha': return resort.skiable_terrain_ha
    case 'season.start_month': return resort.season.start_month
    case 'season.end_month': return resort.season.end_month
    case 'snow_depth_cm': return live?.snow_depth_cm
    case 'lifts_open.count': return live?.lifts_open?.count
    case 'lifts_open.total': return live?.lifts_open?.total
    case 'lift_pass_day': return live?.lift_pass_day
    case 'lodging_sample.median_eur': return live?.lodging_sample?.median_eur
  }
}
