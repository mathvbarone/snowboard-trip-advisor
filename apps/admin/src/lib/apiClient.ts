import type { ResortSlug } from '@snowboard-trip-advisor/schema'
import {
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

async function request<T>(
  method: string,
  path: string,
  body: unknown,
  parser: (raw: unknown) => T,
): Promise<T> {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } }
  if (body !== undefined) {
    init.body = JSON.stringify(body)
  }
  // Tests run under jsdom (apps/admin/vite.config.ts) so relative URLs resolve
  // via window.location. If env moves to 'node', use an absolute base URL.
  // eslint-disable-next-line no-restricted-syntax -- this IS the typed apiClient (the one allowed call site per spec §3.2 / §7.5)
  const res = await fetch(path, init)
  const json: unknown = await res.json()
  if (!res.ok) {
    // The server SHOULD respond with the ErrorEnvelope shape on 4xx/5xx, but a
    // malformed error body must NOT leak a Zod error to the catch site — call
    // sites branch on `err instanceof ApiClientError`, so a ZodError would
    // bypass their error-handling. Synthesize a deterministic envelope when
    // the server returns a non-contract error body.
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
  upsertResort: (slug: ResortSlug, body: ResortUpsertBody): Promise<ResortDetailResponse> =>
    request(
      'PUT',
      `/api/resorts/${slug}`,
      body,
      (raw): ResortDetailResponse => ResortDetailResponse.parse(raw),
    ),
  publish: (): Promise<PublishResponse> =>
    request(
      'POST',
      '/api/resorts/__all__/publish',
      { confirm: true } satisfies PublishBody,
      (raw): PublishResponse => PublishResponse.parse(raw),
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
} as const
