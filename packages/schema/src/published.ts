import { z } from 'zod'

import { ISODateTimeString } from './branded'
import { ResortLiveSignal } from './liveSignal'
import { Resort } from './resort'

// Load-bearing: validatePublishedDataset matches this exact string to emit
// the typed `dataset_empty` issue code. Do not reuse this message for other
// Zod rules — the literal is reserved for the resorts.min(1) failure path.
export const EMPTY_DATASET_ZOD_MESSAGE = 'dataset_empty'

export const PublishedDataset = z.object({
  schema_version: z.literal(1),
  published_at: ISODateTimeString,
  resorts: z.array(Resort).min(1, { message: EMPTY_DATASET_ZOD_MESSAGE }),
  live_signals: z.array(ResortLiveSignal),
  manifest: z.object({
    resort_count: z.number().int(),
    generated_by: z.string(),
    validator_version: z.string()
  })
})
export type PublishedDataset = z.infer<typeof PublishedDataset>
