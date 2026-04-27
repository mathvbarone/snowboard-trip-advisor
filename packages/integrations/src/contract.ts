import type {
  ResortSlug,
  UpstreamHash,
  AdapterSourceKey,
  FieldSource,
  MetricPath,
} from '@snowboard-trip-advisor/schema'

export type AdapterContext = {
  requestId: string
  traceparent: string
  dryRun: boolean
  resort_slug: ResortSlug
}

// Adapter values are keyed by MetricPath dot-strings; the projection layer (packages/schema)
// joins these into the typed Resort / ResortLiveSignal records at parse time. We deliberately
// avoid `Partial<Resort> & Partial<ResortLiveSignal>` here — that shape is unwieldy and leaks
// admin-only fields like publish_state into the adapter surface.
export type AdapterValueMap = Partial<Record<MetricPath, unknown>>
export type FieldSourceMap = Partial<Record<MetricPath, FieldSource>>

export type AdapterError =
  | { code: 'rate_limited'; retry_after_ms: number }
  | { code: 'not_found' }
  | { code: 'upstream_5xx'; status: number }
  | { code: 'upstream_4xx'; status: number; body_sample: string }
  | {
      code: 'schema_mismatch'
      zod_issues: ReadonlyArray<{ path: ReadonlyArray<string | number>; message: string }>
      upstream_hash: UpstreamHash
    }
  | { code: 'timeout' }
  | { code: 'ssrf_blocked'; reason: string }
  | { code: 'response_too_large'; bytes: number }
  | { code: 'unknown_error'; cause: unknown; message: string }

export type AdapterResult =
  | { ok: true; values: AdapterValueMap; sources: FieldSourceMap; upstream_hash: UpstreamHash }
  | { ok: false; error: AdapterError }

export type AdapterFieldSet = ReadonlyArray<MetricPath>

export interface Adapter<Source extends AdapterSourceKey> {
  readonly source: Source
  readonly fields: AdapterFieldSet
  readonly rateLimit: { tokens_per_window: number; window_ms: number }
  readonly maxResponseBytes: number
  fetch(ctx: AdapterContext): Promise<AdapterResult>
}

export function isRecordAllowed(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): boolean {
  return env['RECORD_ALLOWED'] === 'true'
}
