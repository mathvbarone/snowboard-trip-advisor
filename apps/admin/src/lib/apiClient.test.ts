import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { server } from '../mocks/server'

import { apiClient, ApiClientError } from './apiClient'

// MSW lifecycle is wired globally in src/test-setup.ts (PR 4.1b §2.5).
// Per-test handler overrides via server.use(...) inside individual tests.

const HASH_64 = 'a'.repeat(64)
const OBS_AT = '2026-04-26T08:00:00Z'

const cannedResort = {
  schema_version: 1,
  slug: 'kotelnica-bialczanska',
  name: { en: 'Kotelnica' },
  country: 'PL',
  region: { en: 'Lesser Poland' },
  altitude_m: { min: 800, max: 1000 },
  slopes_km: 10,
  lift_count: 5,
  skiable_terrain_ha: 50,
  season: { start_month: 12, end_month: 4 },
  publish_state: 'published',
  field_sources: {
    snow_depth_cm: {
      source: 'manual',
      source_url: 'https://example.com/x',
      observed_at: OBS_AT,
      fetched_at: OBS_AT,
      upstream_hash: HASH_64,
      attribution_block: { en: 'manual' },
    },
  },
}

describe('apiClient (PR 4.1a, spec §3.2 + §7.5)', (): void => {
  it('listResorts() returns parsed ListResortsResponse', async (): Promise<void> => {
    server.use(
      http.get('/api/resorts', () =>
        HttpResponse.json({ items: [], page: { offset: 0, limit: 50, total: 0 } }),
      ),
    )
    const r = await apiClient.listResorts({})
    expect(r.items).toEqual([])
    expect(r.page.total).toBe(0)
  })

  it('getResort(slug) returns parsed ResortDetailResponse with field_states', async (): Promise<void> => {
    server.use(
      http.get('/api/resorts/kotelnica-bialczanska', () =>
        HttpResponse.json({
          resort: cannedResort,
          live_signal: null,
          field_states: {
            snow_depth_cm: { state: 'live', value: 42, source: 'opensnow', observed_at: OBS_AT },
          },
        }),
      ),
    )
    const r = await apiClient.getResort('kotelnica-bialczanska' as never)
    expect(r.resort.slug).toBe('kotelnica-bialczanska')
    expect(r.live_signal).toBeNull()
    expect(r.field_states.snow_depth_cm?.state).toBe('live')
  })

  it('upsertResort(slug, body) PUTs editor_modes-only sparse update and returns parsed response', async (): Promise<void> => {
    let receivedMethod = ''
    let receivedBody: unknown = null
    server.use(
      http.put('/api/resorts/kotelnica-bialczanska', async ({ request }) => {
        receivedMethod = request.method
        receivedBody = await request.json()
        return HttpResponse.json({
          resort: cannedResort,
          live_signal: null,
          field_states: {},
        })
      }),
    )
    await apiClient.upsertResort('kotelnica-bialczanska' as never, {
      editor_modes: { snow_depth_cm: 'manual' },
    })
    expect(receivedMethod).toBe('PUT')
    expect(receivedBody).toEqual({ editor_modes: { snow_depth_cm: 'manual' } })
  })

  it('publish() POSTs to /api/resorts/__all__/publish (no slug arg per Phase-1 convention)', async (): Promise<void> => {
    let calledUrl = ''
    let receivedBody: unknown = null
    server.use(
      http.post('/api/resorts/__all__/publish', async ({ request }) => {
        calledUrl = request.url
        receivedBody = await request.json()
        return HttpResponse.json({
          version_id: 'v1',
          archive_path: 'data/published/history/v1.json',
          published_at: OBS_AT,
          resort_count: 1,
        })
      }),
    )
    const r = await apiClient.publish()
    expect(calledUrl).toContain('/api/resorts/__all__/publish')
    expect(receivedBody).toEqual({ confirm: true })
    expect(r.resort_count).toBe(1)
  })

  it('listPublishes() returns parsed list', async (): Promise<void> => {
    server.use(
      http.get('/api/publishes', () =>
        HttpResponse.json({
          items: [],
          page: { offset: 0, limit: 20, total: 0 },
        }),
      ),
    )
    const r = await apiClient.listPublishes({})
    expect(r.items).toEqual([])
  })

  it('getHealth() returns parsed HealthResponse including resorts_with_corrupt_workspace', async (): Promise<void> => {
    server.use(
      http.get('/api/health', () =>
        HttpResponse.json({
          resorts_total: 0,
          resorts_with_stale_fields: 0,
          resorts_with_failed_fields: 0,
          resorts_with_missing_provenance: 0,
          resorts_with_corrupt_workspace: 0,
          pending_integration_errors: 0,
          last_published_at: null,
          archive_size_bytes: 0,
        }),
      ),
    )
    const r = await apiClient.getHealth()
    expect(r.resorts_with_corrupt_workspace).toBe(0)
    expect(r.last_published_at).toBeNull()
  })

  it('throws ApiClientError carrying the error envelope on 4xx', async (): Promise<void> => {
    server.use(
      http.get('/api/resorts', () =>
        HttpResponse.json(
          { error: { code: 'invalid-request', message: 'bad query' } },
          { status: 400 },
        ),
      ),
    )
    try {
      await apiClient.listResorts({})
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiClientError)
      if (err instanceof ApiClientError) {
        expect(err.status).toBe(400)
        expect(err.envelope.error.code).toBe('invalid-request')
        expect(err.message).toBe('bad query')
      }
    }
  })

  it('throws on response Zod parse failure (server returned wrong shape)', async (): Promise<void> => {
    server.use(http.get('/api/resorts', () => HttpResponse.json({ items: 'not-an-array' })))
    await expect(apiClient.listResorts({})).rejects.toThrow()
  })

  it('throws ApiClientError (not ZodError) when 5xx body is non-contract — synthesizes internal envelope', async (): Promise<void> => {
    server.use(
      http.get('/api/resorts', () =>
        HttpResponse.json({ unexpected: 'malformed' }, { status: 500 }),
      ),
    )
    try {
      await apiClient.listResorts({})
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiClientError)
      if (err instanceof ApiClientError) {
        expect(err.status).toBe(500)
        expect(err.envelope.error.code).toBe('internal')
        expect(err.envelope.error.message).toContain('500')
      }
    }
  })

  it('throws ApiClientError (not SyntaxError) when 5xx body is non-JSON (HTML proxy, plain-text 502, etc.)', async (): Promise<void> => {
    server.use(
      http.get('/api/resorts', () =>
        new HttpResponse('<html><body>502 Bad Gateway</body></html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    )
    try {
      await apiClient.listResorts({})
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ApiClientError)
      if (err instanceof ApiClientError) {
        expect(err.status).toBe(502)
        expect(err.envelope.error.code).toBe('internal')
        expect(err.envelope.error.message).toContain('502')
      }
    }
  })

  it('serializeQuery flattens nested filter + page via JSON-encoded URLSearchParams entries', async (): Promise<void> => {
    let capturedURL = ''
    server.use(
      http.get('/api/resorts', ({ request }) => {
        capturedURL = request.url
        return HttpResponse.json({ items: [], page: { offset: 0, limit: 50, total: 0 } })
      }),
    )
    await apiClient.listResorts({ filter: { country: 'AT' as never }, page: { offset: 10, limit: 5 } })
    const url = new URL(capturedURL)
    expect(url.searchParams.get('filter')).toBe(JSON.stringify({ country: 'AT' }))
    expect(url.searchParams.get('page')).toBe(JSON.stringify({ offset: 10, limit: 5 }))
  })

  it('serializeQuery omits undefined fields (empty query produces no search string)', async (): Promise<void> => {
    let capturedURL = ''
    server.use(
      http.get('/api/resorts', ({ request }) => {
        capturedURL = request.url
        return HttpResponse.json({ items: [], page: { offset: 0, limit: 50, total: 0 } })
      }),
    )
    await apiClient.listResorts({})
    expect(new URL(capturedURL).search).toBe('')
  })

  it('serializeQuery skips entries whose value is explicitly undefined (covers the false branch)', async (): Promise<void> => {
    let capturedURL = ''
    server.use(
      http.get('/api/resorts', ({ request }) => {
        capturedURL = request.url
        return HttpResponse.json({ items: [], page: { offset: 0, limit: 50, total: 0 } })
      }),
    )
    // Pass explicit-undefined keys to exercise the for-loop's false branch
    // (Object.entries surfaces the keys; the if-guard skips them).
    await apiClient.listResorts({ filter: undefined, page: undefined })
    expect(new URL(capturedURL).search).toBe('')
  })
})
