import { z } from 'zod'

import { ISODateTimeString } from '../src/branded'

export const ListPublishesQuery = z.object({
  page: z
    .object({
      offset: z.number().int().nonnegative().default(0),
      limit: z.number().int().positive().default(20),
    })
    .optional(),
})
export type ListPublishesQuery = z.infer<typeof ListPublishesQuery>

export const PublishMetadata = z.object({
  version_id: z.string(),
  published_at: ISODateTimeString,
  archive_path: z.string(),
  resort_count: z.number().int().nonnegative(),
  published_by: z.string(),
})
export type PublishMetadata = z.infer<typeof PublishMetadata>

export const ListPublishesResponse = z.object({
  items: z.array(PublishMetadata),
  page: z.object({
    offset: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    total: z.number().int().nonnegative(),
  }),
})
export type ListPublishesResponse = z.infer<typeof ListPublishesResponse>
