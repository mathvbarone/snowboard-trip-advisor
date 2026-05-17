// Test-time MSW handlers returning CANNED data. Used by SPA unit tests
// (apiClient.test.ts, view tests) and read-only integration tests where no
// filesystem side effects are exercised. NOT runtime — runtime is the
// vite-plugin-admin-api dispatching to apps/admin/server/*. For
// integration tests that need real handler invocation against a per-test
// workspace tmpdir, see mocks/realHandlers.ts (PR 4.1b §2.6).
//
// Each `Schema.parse(...)` at module load doubles as a self-test: if a
// canned fixture drifts from the schema shape, the test process fails on
// import — the gap surfaces immediately, not silently masked.
//
// Inline literals (no fixtureResort builder); the `./fixtures` subpath
// export was deferred during Epic 4 PR 4.0 plumbing — extracting now would
// be premature DRY since each test only needs one or two canned shapes.

import {
  AnalystNotesGetResponse,
  HealthResponse,
  ListPublishesResponse,
  ListResortsResponse,
  PublishResponse,
  ResortDetailResponse,
} from '@snowboard-trip-advisor/schema/api'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

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

const cannedResortDetail = ResortDetailResponse.parse({
  resort: cannedResort,
  // null start; per-suite tests override via server.use(http.get('/api/resorts/:slug', ...)).
  live_signal: null,
  // Empty per-field state; per-suite tests override.
  field_states: {},
})

const cannedListResorts = ListResortsResponse.parse({
  items: [],
  page: { offset: 0, limit: 50, total: 0 },
})

const cannedPublishResponse = PublishResponse.parse({
  version_id: 'v_canned_2026-05-02T10-00-00Z',
  archive_path: 'data/published/history/v_canned_2026-05-02T10-00-00Z.json',
  published_at: OBS_AT,
  resort_count: 1,
})

const cannedListPublishes = ListPublishesResponse.parse({
  items: [],
  page: { offset: 0, limit: 20, total: 0 },
})

const cannedHealth = HealthResponse.parse({
  resorts_total: 0,
  resorts_with_stale_fields: 0,
  resorts_with_failed_fields: 0,
  resorts_with_missing_provenance: 0,
  resorts_with_corrupt_workspace: 0,
  pending_integration_errors: 0,
  last_published_at: null,
  archive_size_bytes: 0,
})

export const cannedHandlers = [
  http.get('/api/resorts', (): Response => HttpResponse.json(cannedListResorts)),
  http.get('/api/resorts/:slug', (): Response => HttpResponse.json(cannedResortDetail)),
  http.put('/api/resorts/:slug', (): Response => HttpResponse.json(cannedResortDetail)),
  http.post('/api/resorts/:slug/publish', (): Response => HttpResponse.json(cannedPublishResponse)),
  http.get('/api/publishes', (): Response => HttpResponse.json(cannedListPublishes)),
  http.get('/api/health', (): Response => HttpResponse.json(cannedHealth)),
  // PR N.c1: analyst-notes GET. Per-test overrides via server.use().
  http.get('/api/analyst-notes/:slug', ({ params }): Response => {
    const slug = params.slug as string
    return HttpResponse.json(AnalystNotesGetResponse.parse({ slug, notes: {} }))
  }),
]

// Singleton server instance — apps/admin/src/test-setup.ts wires its
// listen/resetHandlers/close lifecycle into vitest's beforeAll/afterEach/
// afterAll hooks so every admin test file inherits it without per-file
// boilerplate. Per-test overrides via `server.use(http.get(...))`.
export const server = setupServer(...cannedHandlers)
