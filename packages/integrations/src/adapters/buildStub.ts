import type {
  AdapterSourceKey,
  MetricPath,
  FieldSource,
} from '@snowboard-trip-advisor/schema'
import { ISODateTimeString, UpstreamHash } from '@snowboard-trip-advisor/schema'

import type { Adapter, AdapterResult, FieldSourceMap } from '../contract'

const STUB_OBSERVED_AT = ISODateTimeString.parse('2026-04-01T00:00:00Z')
const STUB_FETCHED_AT = ISODateTimeString.parse('2026-04-01T00:00:00Z')
const STUB_HASH = UpstreamHash.parse('0'.repeat(64))

export function buildStub<S extends AdapterSourceKey>(input: {
  source: S
  fields: ReadonlyArray<MetricPath>
  attribution_block_en: string
}): Adapter<S> {
  // Shallow freeze: the outer map and each FieldSource are frozen, but the nested
  // attribution_block is not. Phase 1 consumers stay within-package, so deep-freeze is
  // not yet load-bearing. Revisit if external consumers can mutate result shapes.
  //
  // FieldSource.source carries the adapter's actual identity (input.source), NOT a
  // literal 'manual' — losing adapter identity here would silently break any consumer
  // keying off field_sources[*].source for provenance, attribution, or per-source
  // freshness logic. Spec §7.8 says "sources[*].status = 'manual'" — that 'manual' lives
  // on the admin-side `FieldStateFor<T>.status` (§5.1.1), not on the published
  // FieldSource.source. Stub-ness is signalled by the empty values:{}, the
  // STUB_HASH (all zeros), and the synthetic source_url + attribution_block.
  const sources: FieldSourceMap = Object.freeze(
    Object.fromEntries(
      input.fields.map((path): [MetricPath, FieldSource] => [
        path,
        Object.freeze({
          source: input.source,
          source_url: 'https://example.invalid/stub',
          observed_at: STUB_OBSERVED_AT,
          fetched_at: STUB_FETCHED_AT,
          upstream_hash: STUB_HASH,
          attribution_block: { en: input.attribution_block_en },
        }),
      ]),
    ),
  )

  const frozenFields = Object.freeze([...input.fields])

  return {
    source: input.source,
    fields: frozenFields,
    rateLimit: { tokens_per_window: 1, window_ms: 60_000 },
    maxResponseBytes: 1_048_576,
    // Stub adapters ignore the AdapterContext — they return frozen data and never make network calls.
    // The real adapters in Epic 5 will read requestId/traceparent/dryRun/resort_slug from ctx.
    fetch: (): Promise<AdapterResult> =>
      Promise.resolve({
        ok: true,
        values: {},
        sources,
        upstream_hash: STUB_HASH,
      }),
  }
}
