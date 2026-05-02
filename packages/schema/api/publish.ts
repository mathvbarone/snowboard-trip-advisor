import { z } from 'zod'

import { ISODateTimeString, ResortSlug } from '../src/branded'

export const PublishSlugParam = z.object({
  slug: z.union([ResortSlug, z.literal('__all__')]),
})
export type PublishSlugParam = z.infer<typeof PublishSlugParam>

export const PublishBody = z.object({
  confirm: z.literal(true),
})
export type PublishBody = z.infer<typeof PublishBody>

export const PublishResponse = z.object({
  version_id: z.string(),
  archive_path: z.string(),
  published_at: ISODateTimeString,
  resort_count: z.number().int().nonnegative(),
})
export type PublishResponse = z.infer<typeof PublishResponse>
