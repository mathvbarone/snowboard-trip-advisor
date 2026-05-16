import type { ResortSlug } from '@snowboard-trip-advisor/schema'
import {
  AnalystNotesGetResponse,
  type AnalystNoteUpsertBody,
  AnalystNoteUpsertResponse,
  ErrorEnvelope,
  HealthResponse,
  type ListPublishesQuery,
  ListPublishesResponse,
  type ListResortsQuery,
  ListResortsResponse,
  type PublishBody,
  PublishResponse,
  ResortDetailResponse,
  type ResortUpsertBody,
} from '@snowboard-trip-advisor/schema/api'

export class ApiClientError extends Error {
  public readonly status: number
  public readonly envelope: ErrorEnvelope

  public constructor(status: number, envelope: ErrorEnvelope) {
    super(envelope.error.message)
    this.name = 'ApiClientError'
    this.status = status
    this.envelope = envelope
  }
}

// Per Tier 5 plan Decision K1 (PR 4.6c): optional AbortSignal threaded
// through `request()` for `upsertResort` to abort an in-flight PUT when the
// SPA's `clearFieldValue` clears a path that was carried in the in-flight
// draft. Spelled as `RequestOptions | undefined` (not `{ signal?: ... }`) so
// `exactOptionalPropertyTypes: true` callers must omit the key entirely
// rather than pass `signal: undefined` (which would type-error under that
// option). The same options surface absorbs PR 4.5a's `Idempotency-Key`
// extra-header parameter (Decision J1 at line 32 below) — both are optional
// per-call concerns; keeping them in one shape avoids parameter-count drift.
interface RequestOptions {
  readonly extraHeaders?: Record<string, string>
  readonly signal?: AbortSignal
}

async function request<T>(
  method: string,
  path: string,
  body: unknown,
  parser: (raw: unknown) => T,
  // Round-12 P2 fold (Decision J1): optional `extraHeaders` lets `publish()`
  // inject an `Idempotency-Key` header per spec §4.9 invariant 5 (Phase 1
  // honors; Phase 2 enforces). Server-side header plumbing lands when the
  // Hono service swap adds `DispatchInput.headers`; until then the dev
  // server simply ignores unknown headers. Tier 5 plan Decision K1 extends
  // this options bag with `signal` for `upsertResort`'s AbortController race
  // fix — same options shape, both optional.
  options?: RequestOptions,
): Promise<T> {
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json', ...(options?.extraHeaders ?? {}) },
    ...(options?.signal !== undefined ? { signal: options.signal } : {}),
  }
  if (body !== undefined) {
    init.body = JSON.stringify(body)
  }
  // Tests run under jsdom (apps/admin/vite.config.ts) so relative URLs resolve
  // via window.location. If env moves to 'node', use an absolute base URL.
  // eslint-disable-next-line no-restricted-syntax, no-restricted-globals -- this IS the typed apiClient (the one allowed call site per spec §3.2 / §7.5)
  const res = await fetch(path, init)
  // Read the body once as text, then attempt JSON parse. A non-JSON body
  // (HTML / plain-text from a proxy/upstream returning 502, an error page,
  // etc.) must NOT throw a SyntaxError before the !res.ok branch can build
  // an ApiClientError — call sites branch on `err instanceof ApiClientError`,
  // so a SyntaxError would bypass their error-handling and leak the raw
  // upstream body into uncaught state.
  const bodyText = await res.text()
  let json: unknown
  try {
    json = JSON.parse(bodyText)
  } catch {
    json = undefined
  }
  if (!res.ok) {
    const parsed = ErrorEnvelope.safeParse(json)
    const envelope: ErrorEnvelope = parsed.success
      ? parsed.data
      : { error: { code: 'internal', message: `HTTP ${String(res.status)}: malformed error response` } }
    throw new ApiClientError(res.status, envelope)
  }
  return parser(json)
}

function serializeQuery(q: Record<string, unknown>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(q)) {
    if (value !== undefined) {
      params.set(key, JSON.stringify(value))
    }
  }
  const s = params.toString()
  return s.length > 0 ? `?${s}` : ''
}

export const apiClient = {
  listResorts: (q: ListResortsQuery): Promise<ListResortsResponse> =>
    request(
      'GET',
      `/api/resorts${serializeQuery(q as Record<string, unknown>)}`,
      undefined,
      (raw): ListResortsResponse => ListResortsResponse.parse(raw),
    ),
  getResort: (slug: ResortSlug): Promise<ResortDetailResponse> =>
    request(
      'GET',
      `/api/resorts/${slug}`,
      undefined,
      (raw): ResortDetailResponse => ResortDetailResponse.parse(raw),
    ),
  upsertResort: (
    slug: ResortSlug,
    body: ResortUpsertBody,
    // Tier 5 plan Decision K1: optional `{ signal }` lets useWorkspaceState's
    // flush() abort the PUT mid-flight when clearFieldValue fires on a path
    // that's carried in the in-flight draft (the race fix described in spec
    // §7.13 + handoff §52). Spelled as `RequestOptions | undefined` so
    // `exactOptionalPropertyTypes: true` callers omit the key when no signal
    // is needed (existing PR 4.4d / 4.5d call sites are unchanged).
    options?: RequestOptions,
  ): Promise<ResortDetailResponse> =>
    request(
      'PUT',
      `/api/resorts/${slug}`,
      body,
      (raw): ResortDetailResponse => ResortDetailResponse.parse(raw),
      options,
    ),
  publish: (): Promise<PublishResponse> =>
    request(
      'POST',
      '/api/resorts/__all__/publish',
      { confirm: true } satisfies PublishBody,
      (raw): PublishResponse => PublishResponse.parse(raw),
      // Decision J1: fresh UUID per call (crypto.randomUUID is available in
      // both the Vite dev runtime and the Vitest jsdom env). Phase 1 server
      // ignores the header (DispatchInput has no `headers` field); Phase 2's
      // Hono service swap will plumb it through for real dedupe.
      { extraHeaders: { 'Idempotency-Key': crypto.randomUUID() } },
    ),
  listPublishes: (q: ListPublishesQuery): Promise<ListPublishesResponse> =>
    request(
      'GET',
      `/api/publishes${serializeQuery(q as Record<string, unknown>)}`,
      undefined,
      (raw): ListPublishesResponse => ListPublishesResponse.parse(raw),
    ),
  getHealth: (): Promise<HealthResponse> =>
    request(
      'GET',
      '/api/health',
      undefined,
      (raw): HealthResponse => HealthResponse.parse(raw),
    ),
  getAnalystNotes: (
    slug: ResortSlug,
    options?: RequestOptions,
  ): Promise<AnalystNotesGetResponse> =>
    request(
      'GET',
      `/api/analyst-notes/${slug}`,
      undefined,
      (raw): AnalystNotesGetResponse => AnalystNotesGetResponse.parse(raw),
      options,
    ),
  upsertAnalystNote: (
    slug: ResortSlug,
    body: AnalystNoteUpsertBody,
    options?: RequestOptions,
  ): Promise<AnalystNoteUpsertResponse> =>
    request(
      'PUT',
      `/api/analyst-notes/${slug}`,
      body,
      (raw): AnalystNoteUpsertResponse => AnalystNoteUpsertResponse.parse(raw),
      options,
    ),
} as const
