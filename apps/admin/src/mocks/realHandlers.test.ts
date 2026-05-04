import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { bridgeHandlers } from './realHandlers'
import { server } from './server'

// The bridge harness runs against the GLOBAL MSW server (test-setup.ts
// already started it). Each test installs the bridge handlers via
// server.use(...), which override the canned defaults from server.ts for
// /api/* routes. Per the per-PR allowlist test (PR 4.1a §1.6), this file
// is the second permitted call site for raw fetch in apps/admin/src/**;
// the apiClient + this bridge test are the only allowed exemptions.

describe('bridgeHandlers (PR 4.1b §2.6, spec §6.3 P0-3)', (): void => {
  let workspaceDir: string

  beforeAll(async (): Promise<void> => {
    workspaceDir = await mkdtemp(join(tmpdir(), 'bridge-'))
  })

  afterAll(async (): Promise<void> => {
    await rm(workspaceDir, { recursive: true, force: true })
  })

  beforeEach((): void => {
    // Override the canned /api/* handlers with the bridge for this suite.
    // The global afterEach in test-setup.ts resets to the canned defaults
    // before each test, so re-adding here keeps the bridge active.
    server.use(...bridgeHandlers(workspaceDir))
  })

  it('GET /api/health invokes the real handler (returns 200 with HealthResponse since PR 4.2)', async (): Promise<void> => {
    // eslint-disable-next-line no-restricted-syntax, no-restricted-globals -- bridge harness intentionally exercises raw fetch through MSW; allowlisted via tests/eslint/admin-restrictions.test.ts
    const res = await fetch('http://127.0.0.1/api/health')
    expect(res.status).toBe(200)
    const json: unknown = await res.json()
    // Cold-start: workspaceDir has no workspace files — all aggregates are 0.
    expect(json).toMatchObject({
      resorts_total: 0,
      resorts_with_stale_fields: 0,
      resorts_with_failed_fields: 0,
      resorts_with_missing_provenance: 0,
      resorts_with_corrupt_workspace: 0,
      pending_integration_errors: 0,
      last_published_at: null,
      archive_size_bytes: 0,
    })
  })

  it('GET /api/resorts routes through dispatch to the listResorts stub (501)', async (): Promise<void> => {
    // eslint-disable-next-line no-restricted-syntax, no-restricted-globals
    const res = await fetch('http://127.0.0.1/api/resorts')
    expect(res.status).toBe(501)
  })

  it('decodes request via Zod and returns 400 invalid-request on bad PUT body (empty)', async (): Promise<void> => {
    // eslint-disable-next-line no-restricted-syntax, no-restricted-globals
    const res = await fetch('http://127.0.0.1/api/resorts/kotelnica-bialczanska', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    expect(res.status).toBe(400)
    const json: unknown = await res.json()
    expect(json).toMatchObject({ error: { code: 'invalid-request' } })
  })

  it('threads workspaceDir to the handler — proves dispatch receives the per-test fixture root', async (): Promise<void> => {
    // The dispatch helper lazy-creates data/admin-workspace/ on first invocation
    // (per spec §10.9). After hitting any /api/* endpoint, that directory must
    // exist under the per-test workspaceDir, NOT under the repo's
    // data/admin-workspace/. This is the load-bearing contract: real handlers
    // in 4.2+ will write to deps.workspaceRoot, and this test pins that the
    // bridge correctly threads the per-test fixture root.
    // eslint-disable-next-line no-restricted-syntax, no-restricted-globals
    await fetch('http://127.0.0.1/api/health')
    const s = await stat(join(workspaceDir, 'data', 'admin-workspace'))
    expect(s.isDirectory()).toBe(true)
  })

  it('rejects underscore-bearing slug via Zod path-param validation (400)', async (): Promise<void> => {
    // eslint-disable-next-line no-restricted-syntax, no-restricted-globals
    const res = await fetch('http://127.0.0.1/api/resorts/has_underscore')
    expect(res.status).toBe(400)
  })

  it('treats an empty PUT body as undefined (passes through to schema, which rejects)', async (): Promise<void> => {
    // PUT with explicit empty string body → readJsonBody returns undefined
    // (text.length === 0 branch) → dispatch's body parser receives undefined
    // → ResortUpsertBody parse fails → 400 invalid-request.
    // eslint-disable-next-line no-restricted-syntax, no-restricted-globals
    const res = await fetch('http://127.0.0.1/api/resorts/kotelnica-bialczanska', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '',
    })
    expect(res.status).toBe(400)
  })

  it('treats malformed JSON body as undefined (catch branch in readJsonBody)', async (): Promise<void> => {
    // Body is not valid JSON → JSON.parse throws → caught → returns undefined.
    // Same downstream path as the empty-body case: schema rejects → 400.
    // eslint-disable-next-line no-restricted-syntax, no-restricted-globals
    const res = await fetch('http://127.0.0.1/api/resorts/kotelnica-bialczanska', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{not valid json',
    })
    expect(res.status).toBe(400)
  })

  it('passes through to next-handler (404 from bridge) when path does not match /api/*', async (): Promise<void> => {
    // The bridge's http.all('/api/*', ...) doesn't intercept paths outside
    // /api/. MSW falls through to onUnhandledRequest:'error'. This test
    // confirms the boundary by hitting a path INSIDE /api/* but with no
    // matching route — dispatch returns null, bridge returns 404.
    // eslint-disable-next-line no-restricted-syntax, no-restricted-globals
    const res = await fetch('http://127.0.0.1/api/no-such-endpoint')
    expect(res.status).toBe(404)
    const json: unknown = await res.json()
    expect(json).toMatchObject({ error: { code: 'not-found' } })
  })
})
