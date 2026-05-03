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
