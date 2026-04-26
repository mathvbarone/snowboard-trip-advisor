import { z } from 'zod'
import { ResortSlug, ISOCountryCode } from './branded'
import { LocalizedString, PublishState, FieldSource } from './primitives'

export const Resort = z.object({
  schema_version: z.literal(1),
  slug: ResortSlug,
  name: LocalizedString,
  country: ISOCountryCode,
  region: LocalizedString,
  altitude_m: z.object({ min: z.number(), max: z.number() }),
  slopes_km: z.number(),
  lift_count: z.number().int(),
  skiable_terrain_ha: z.number(),
  season: z.object({
    start_month: z.number().int().min(1).max(12),
    end_month: z.number().int().min(1).max(12)
  }),
  publish_state: PublishState,
  field_sources: z.record(z.string(), FieldSource)
})
export type Resort = z.infer<typeof Resort>
