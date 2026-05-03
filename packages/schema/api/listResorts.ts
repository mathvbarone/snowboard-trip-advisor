import { z } from 'zod'

import { ISOCountryCode, ISODateTimeString, ResortSlug } from '../src/branded'
import { LocalizedString, PublishState } from '../src/primitives'

export const ListResortsQuery = z.object({
  filter: z
    .object({
      country: ISOCountryCode.optional(),
      hasFailures: z.boolean().optional(),
    })
    .optional(),
  page: z
    .object({
      offset: z.number().int().nonnegative().default(0),
      limit: z.number().int().positive().default(50),
    })
    .optional(),
})
export type ListResortsQuery = z.infer<typeof ListResortsQuery>

export const ResortSummary = z.object({
  slug: ResortSlug,
  name: LocalizedString,
  country: ISOCountryCode,
  last_updated: ISODateTimeString,
  stale_field_count: z.number().int().nonnegative(),
  failed_field_count: z.number().int().nonnegative(),
  publish_state: PublishState,
})
export type ResortSummary = z.infer<typeof ResortSummary>

export const ListResortsResponse = z.object({
  items: z.array(ResortSummary),
  page: z.object({
    offset: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    total: z.number().int().nonnegative(),
  }),
})
export type ListResortsResponse = z.infer<typeof ListResortsResponse>
