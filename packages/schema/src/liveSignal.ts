import { z } from 'zod'

import { ResortSlug, ISODateTimeString } from './branded'
import { Money, FieldSource } from './primitives'

export const ResortLiveSignal = z.object({
  schema_version: z.literal(1),
  resort_slug: ResortSlug,
  observed_at: ISODateTimeString,
  fetched_at: ISODateTimeString,
  snow_depth_cm: z.number().optional(),
  lifts_open: z.object({ count: z.number().int(), total: z.number().int() }).optional(),
  lift_pass_day: Money.optional(),
  forecast_next_7d: z.array(z.object({ date: z.string(), snow_cm: z.number() })).optional(),
  lodging_sample: z.object({ median_eur: Money, sample_size: z.number().int() }).optional(),
  field_sources: z.record(z.string(), FieldSource)
})
export type ResortLiveSignal = z.infer<typeof ResortLiveSignal>
