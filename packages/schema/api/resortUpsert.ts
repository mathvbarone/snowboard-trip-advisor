import { z } from 'zod'

import { ResortLiveSignal } from '../src/liveSignal'
import { METRIC_FIELDS } from '../src/metricFields'
import { Resort } from '../src/resort'

export { ResortDetailResponse, ResortSlugParam } from './resortDetail'

// Identity + status fields are stripped from the upsert body shapes:
//
//   - resort.slug / resort.schema_version: identity. The path :slug is the
//     authoritative identifier; accepting a body slug creates an ambiguous
//     source of truth (PUT /api/resorts/foo with body.resort.slug='bar'
//     would silently disagree). schema_version is set by the writer based
//     on the workspace contract, never by the client.
//   - resort.publish_state: status managed by the dedicated publish flow
//     (POST /api/resorts/:slug/publish). Allowing clients to PUT
//     publish_state='published' directly would bypass the publish
//     pre-validation gate (validatePublishedDataset) — corruption risk.
//   - live_signal.resort_slug: same identity reasoning as resort.slug.
// .strict() rejects unknown keys (Zod default is "strip silently"). Without
// strictness the .omit() above only removes the keys from the schema's known
// shape — extra forbidden keys would still be accepted-then-stripped, defeating
// the rejection intent.
const ResortPartialMutable = Resort.partial().omit({
  slug: true,
  schema_version: true,
  publish_state: true,
}).strict()
const ResortLiveSignalPartialMutable = ResortLiveSignal.partial().omit({
  resort_slug: true,
}).strict()

export const ResortUpsertBody = z
  .object({
    resort: ResortPartialMutable.optional(),
    live_signal: ResortLiveSignalPartialMutable.nullable().optional(),
    editor_modes: z.partialRecord(z.enum(METRIC_FIELDS), z.enum(['manual', 'auto'])).optional(),
  })
  .refine(
    (body): boolean =>
      body.resort !== undefined || body.live_signal !== undefined || body.editor_modes !== undefined,
    { message: 'at least one of resort, live_signal, editor_modes must be present' },
  )
export type ResortUpsertBody = z.infer<typeof ResortUpsertBody>
