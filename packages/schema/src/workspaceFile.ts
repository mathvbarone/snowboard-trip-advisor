import { z } from 'zod'

import { ISODateTimeString, ResortSlug } from './branded'
import { ResortLiveSignal } from './liveSignal'
import { METRIC_FIELDS } from './metricFields'
import { Resort } from './resort'

export const WorkspaceFile = z.object({
  schema_version: z.literal(1),
  slug: ResortSlug,
  resort: Resort,
  live_signal: ResortLiveSignal.nullable(),
  modified_at: ISODateTimeString,
  editor_modes: z
    .partialRecord(z.enum(METRIC_FIELDS), z.enum(['manual', 'auto']))
    .default({}),
}).loose().superRefine((wf, ctx): void => {
  const ghosts = Object.keys(wf.editor_modes).filter(
    (path): boolean => !(path.length > 0 && path in wf.resort.field_sources),
  )
  if (ghosts.length > 0) {
    ctx.addIssue({
      code: 'custom',
      message: `editor_modes contains paths not in resort.field_sources: ${ghosts.join(', ')}`,
      path: ['editor_modes'],
    })
  }
})

export type WorkspaceFile = z.infer<typeof WorkspaceFile>
