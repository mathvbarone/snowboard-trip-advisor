// PR 2.4: ResortView + FieldValue<T> — the public-app projection of durable + live resort data.
// Note: FieldStateFor<T> (admin-side discriminated state) and toFieldValue<T> (admin → public mapper)
// are DEFERRED to Epic 4 PR 4.4 per the ai-clean-code-adherence audit. Epic 2 has zero callers for
// either symbol — they would ship purely as future-proofing. Epic 4 introduces them alongside the
// admin editor that consumes them.

import type { ISOCountryCode, ISODateTimeString, ResortSlug } from './branded'
import type { LocalizedString, Money, SourceKey } from './primitives'

export type FieldValue<T> =
  | { state: 'never_fetched' }
  | { state: 'fresh'; value: T; source: SourceKey; observed_at: ISODateTimeString }
  | { state: 'stale'; value: T; source: SourceKey; observed_at: ISODateTimeString; age_days: number }

export type ResortView = {
  slug: ResortSlug
  name: LocalizedString
  country: ISOCountryCode
  region: LocalizedString
  // durable
  altitude_m: FieldValue<{ min: number; max: number }>
  slopes_km: FieldValue<number>
  lift_count: FieldValue<number>
  skiable_terrain_ha: FieldValue<number>
  season: FieldValue<{ start_month: number; end_month: number }>
  // live
  snow_depth_cm: FieldValue<number>
  lifts_open: FieldValue<{ count: number; total: number }>
  lift_pass_day: FieldValue<Money>
  lodging_sample_median_eur: FieldValue<{ amount: Money; sample_size: number }>
  // forecast deliberately omitted — public app shows only the latest value
}
