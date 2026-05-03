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
  // Slug consistency: the top-level slug, resort.slug, and (when present)
  // live_signal.resort_slug must agree. Workspace files are stored at
  // data/admin-workspace/<slug>.json keyed by the top-level slug; an
  // embedded resort with a different slug would silently disagree with
  // the storage path on read, producing wrong-resort projections.
  if (wf.slug !== wf.resort.slug) {
    ctx.addIssue({
      code: 'custom',
      message: `workspace slug "${wf.slug}" does not match resort.slug "${wf.resort.slug}"`,
      path: ['resort', 'slug'],
    })
  }
  if (wf.live_signal !== null && wf.live_signal.resort_slug !== wf.slug) {
    ctx.addIssue({
      code: 'custom',
      message: `workspace slug "${wf.slug}" does not match live_signal.resort_slug "${wf.live_signal.resort_slug}"`,
      path: ['live_signal', 'resort_slug'],
    })
  }
})

export type WorkspaceFile = z.infer<typeof WorkspaceFile>
