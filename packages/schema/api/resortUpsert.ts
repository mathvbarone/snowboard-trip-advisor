import { z } from 'zod'

import { ResortLiveSignal } from '../src/liveSignal'
import { METRIC_FIELDS } from '../src/metricFields'
import { Resort } from '../src/resort'

export { ResortDetailResponse, ResortSlugParam } from './resortDetail'

export const ResortUpsertBody = z
  .object({
    resort: Resort.partial().optional(),
    live_signal: ResortLiveSignal.partial().nullable().optional(),
    editor_modes: z.partialRecord(z.enum(METRIC_FIELDS), z.enum(['manual', 'auto'])).optional(),
  })
  .refine(
    (body): boolean =>
      body.resort !== undefined || body.live_signal !== undefined || body.editor_modes !== undefined,
    { message: 'at least one of resort, live_signal, editor_modes must be present' },
  )
export type ResortUpsertBody = z.infer<typeof ResortUpsertBody>
