import { z } from 'zod'

import { ISODateTimeString } from './branded'
import { ResortLiveSignal } from './liveSignal'
import { Resort } from './resort'

export const PublishedDataset = z.object({
  schema_version: z.literal(1),
  published_at: ISODateTimeString,
  resorts: z.array(Resort),
  live_signals: z.array(ResortLiveSignal),
  manifest: z.object({
    resort_count: z.number().int(),
    generated_by: z.string(),
    validator_version: z.string()
  })
})
export type PublishedDataset = z.infer<typeof PublishedDataset>
