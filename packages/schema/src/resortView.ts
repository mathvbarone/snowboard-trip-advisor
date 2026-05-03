import { z } from 'zod'

import { ISODateTimeString, type ISOCountryCode, type ResortSlug } from './branded'
import { SourceKey, type LocalizedString, type Money } from './primitives'

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
