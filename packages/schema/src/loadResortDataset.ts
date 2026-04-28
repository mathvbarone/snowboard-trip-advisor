import { readFile } from 'node:fs/promises'

import type { ResortLiveSignal } from './liveSignal'
import type { FieldSource } from './primitives'
import type { Resort } from './resort'
import type { FieldValue, ResortView } from './resortView'
import { validatePublishedDataset, type ValidationIssue } from './validatePublishedDataset'

export const FRESHNESS_TTL_DAYS = { default: 14, max_stale: 30 } as const

export type LoadOptions = {
  now?: Date                                                    // for tests; defaults to new Date()
}

export type LoadResult =
  | { ok: true; views: ReadonlyArray<ResortView> }
  | { ok: false; issues: ReadonlyArray<ValidationIssue> }

export async function loadResortDataset(
  path: string,
  { now = new Date() }: LoadOptions = {},
): Promise<LoadResult> {
  const raw = JSON.parse(await readFile(path, 'utf8')) as unknown
  const validation = validatePublishedDataset(raw)
  if (!validation.ok) {
    return { ok: false, issues: validation.issues }
  }
  const dataset = validation.dataset

  const liveBySlug = new Map<string, ResortLiveSignal>(
    dataset.live_signals.map((l): [string, ResortLiveSignal] => [l.resort_slug, l]),
  )

  const views: ResortView[] = dataset.resorts.map((resort): ResortView =>
    projectResort(resort, liveBySlug.get(resort.slug), now),
  )

  return { ok: true, views }
}

function projectResort(
  resort: Resort,
  live: ResortLiveSignal | undefined,
  now: Date,
): ResortView {
  // After validatePublishedDataset passes, all 7 durable field_source paths are guaranteed
  // present in resort.field_sources (altitude_m.min, altitude_m.max, slopes_km, lift_count,
  // skiable_terrain_ha, season.start_month, season.end_month). The casts below tell TypeScript
  // what the validator has already verified. These are not branded types — FieldSource is a plain
  // Zod object type; the cast is safe and eliminates the undefined branch from the coverage surface.
  const rfs = resort.field_sources
  return {
    slug: resort.slug,
    name: resort.name,
    country: resort.country,
    region: resort.region,
    // altitude_m uses 'altitude_m.min' as the representative key — see plan §4.5 note.
    altitude_m: durableField(rfs['altitude_m.min'] as FieldSource, resort.altitude_m),
    slopes_km: durableField(rfs['slopes_km'] as FieldSource, resort.slopes_km),
    lift_count: durableField(rfs['lift_count'] as FieldSource, resort.lift_count),
    skiable_terrain_ha: durableField(rfs['skiable_terrain_ha'] as FieldSource, resort.skiable_terrain_ha),
    season: durableField(rfs['season.start_month'] as FieldSource, resort.season),
    snow_depth_cm: liveField(live, 'snow_depth_cm', live?.snow_depth_cm, now),
    lifts_open: liveField(live, 'lifts_open.count', live?.lifts_open, now),
    lift_pass_day: liveField(live, 'lift_pass_day', live?.lift_pass_day, now),
    lodging_sample_median_eur: liveField(
      live,
      'lodging_sample.median_eur',
      live?.lodging_sample !== undefined
        ? { amount: live.lodging_sample.median_eur, sample_size: live.lodging_sample.sample_size }
        : undefined,
      now,
    ),
  }
}

function durableField<T>(
  fs: FieldSource,
  value: T,
): FieldValue<T> {
  // Durable data does not go stale by clock; editorial review (Phase 2 concern) handles staleness.
  // A resort's terrain stats are treated as fresh until a human editor publishes an update.
  // Post-validation invariant: fs is always defined for the 7 required durable metric paths
  // (altitude_m.min, altitude_m.max, slopes_km, lift_count, skiable_terrain_ha,
  // season.start_month, season.end_month) — guaranteed by validatePublishedDataset.
  return {
    state: 'fresh',
    value,
    source: fs.source,
    observed_at: fs.observed_at,
  }
}

function liveField<T>(
  live: ResortLiveSignal | undefined,
  metricPath: string,
  value: T | undefined,
  now: Date,
): FieldValue<T> {
  if (live === undefined || value === undefined) {
    return { state: 'never_fetched' }
  }
  // Post-validation invariant: when value !== undefined, validatePublishedDataset has already
  // guaranteed that live.field_sources[metricPath] exists. The cast tells TypeScript what the
  // validator has already verified. FieldSource is not a branded type — the cast is safe.
  const fs = live.field_sources[metricPath] as FieldSource
  const ageMs = now.getTime() - new Date(fs.observed_at).getTime()
  const ageDays = ageMs / (24 * 60 * 60 * 1000)
  if (ageDays > FRESHNESS_TTL_DAYS.max_stale) {
    return { state: 'never_fetched' }                           // older than max_stale → effectively missing
  }
  if (ageDays > FRESHNESS_TTL_DAYS.default) {
    return {
      state: 'stale',
      value,
      source: fs.source,
      observed_at: fs.observed_at,
      age_days: ageDays,
    }
  }
  return {
    state: 'fresh',
    value,
    source: fs.source,
    observed_at: fs.observed_at,
  }
}
