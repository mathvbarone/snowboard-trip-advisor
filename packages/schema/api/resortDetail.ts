import { z } from 'zod'

import { ResortSlug } from '../src/branded'
import { ResortLiveSignal } from '../src/liveSignal'
import { METRIC_FIELDS } from '../src/metricFields'
import { Resort } from '../src/resort'
import { FieldState } from '../src/resortView'

export const ResortSlugParam = z.object({
  slug: ResortSlug,
})
export type ResortSlugParam = z.infer<typeof ResortSlugParam>

export const ResortDetailResponse = z.object({
  resort: Resort,
  live_signal: ResortLiveSignal.nullable(),
  field_states: z.partialRecord(z.enum(METRIC_FIELDS), FieldState),
})
export type ResortDetailResponse = z.infer<typeof ResortDetailResponse>
