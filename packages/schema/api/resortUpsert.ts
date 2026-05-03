import { z } from 'zod'

import { ResortLiveSignal } from '../src/liveSignal'
import { METRIC_FIELDS } from '../src/metricFields'
import { FieldSource } from '../src/primitives'
import { Resort } from '../src/resort'

export { ResortDetailResponse, ResortSlugParam } from './resortDetail'

// Identity + status + provenance fields are stripped or constrained on the
// upsert body shapes:
//
//   - resort.slug / live_signal.resort_slug: identity. The path :slug is the
//     authoritative identifier; accepting a body slug creates an ambiguous
//     source of truth (PUT /api/resorts/foo with body.resort.slug='bar'
//     would silently disagree).
//   - resort.schema_version / live_signal.schema_version: writer-set by the
//     workspace contract, never by the client. Allowing clients to pin a
//     schema_version through upsert would defeat the writer-side migration
//     guarantee on future schema bumps.
//   - resort.publish_state: status managed by the dedicated publish flow
//     (POST /api/resorts/:slug/publish). Allowing clients to PUT
//     publish_state='published' directly would bypass the publish
//     pre-validation gate (validatePublishedDataset) — corruption risk.
//   - resort.field_sources / live_signal.field_sources: provenance. The
//     adapter pipeline writes field_sources entries for auto-fetched
//     values (sources: opensnow, resort-feed, booking, airbnb,
//     snowforecast). The SPA writes field_sources entries ONLY for
//     manually-typed values (source: 'manual'). Allowing the SPA to set
//     non-manual source values would let it forge provenance — e.g.,
//     stamping a typed-in number with source: 'opensnow' + a fabricated
//     upstream_hash. Constrained shape (ManualOnlyFieldSource) rejects
//     any source other than 'manual'; the adapter pipeline writes
//     field_sources via a different code path, not through this PUT API.
//
// .strict() rejects unknown keys (Zod default is "strip silently"). Without
// strictness the .omit() removes the keys from the schema's known shape but
// extras would be accepted-then-stripped, defeating the rejection intent.

const ManualOnlyFieldSource = FieldSource.extend({
  source: z.literal('manual'),
})
const ManualOnlyFieldSources = z.record(z.string(), ManualOnlyFieldSource)

const ResortPartialMutable = Resort.partial().omit({
  slug: true,
  schema_version: true,
  publish_state: true,
  field_sources: true,
}).extend({
  field_sources: ManualOnlyFieldSources.optional(),
}).strict()

const ResortLiveSignalPartialMutable = ResortLiveSignal.partial().omit({
  resort_slug: true,
  schema_version: true,
  field_sources: true,
}).extend({
  field_sources: ManualOnlyFieldSources.optional(),
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
