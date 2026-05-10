import { readFileSync } from 'node:fs'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  dispatch,
  resolveWorkspaceRoot,
  type DispatchDeps,
  type Route,
} from '../dispatch'

describe('dispatch (PR 4.1b §2.1, spec §10.1 + §7.6)', (): void => {
  let workspaceRoot: string

  beforeEach(async (): Promise<void> => {
    workspaceRoot = await mkdtemp(join(tmpdir(), 'dispatch-'))
  })

  afterEach(async (): Promise<void> => {
    await rm(workspaceRoot, { recursive: true, force: true })
  })

  it('routes GET /api/resorts to listResortsHandler (real handler — PR 4.3)', async (): Promise<void> => {
    const r = await dispatch(
      { method: 'GET', pathname: '/api/resorts', search: '', body: undefined },
      { workspaceRoot },
    )
    // Cold-start: empty tmpdir → handler returns the empty-list shape.
    // Per-handler behavior is exercised in listResorts.test.ts; this test
    // pins the dispatch wiring (route → handler → 200 envelope).
    expect(r?.status).toBe(200)
    expect(r?.body).toEqual({ items: [], page: { offset: 0, limit: 50, total: 0 } })
  })

  it('routes GET /api/resorts/:slug to resortDetailHandler with parsed slug', async (): Promise<void> => {
    // Cold tmpdir has no workspace file and no published doc; the handler
    // (real impl in PR 4.4a-2) throws NotFoundError → dispatch envelope 404.
    const r = await dispatch(
      { method: 'GET', pathname: '/api/resorts/kotelnica-bialczanska', search: '', body: undefined },
      { workspaceRoot },
    )
    expect(r?.status).toBe(404)
    expect(r?.body).toMatchObject({ error: { code: 'not-found' } })
  })

  it('routes PUT /api/resorts/:slug to resortUpsertHandler with parsed slug + body', async (): Promise<void> => {
    const r = await dispatch(
      {
        method: 'PUT',
        pathname: '/api/resorts/kotelnica-bialczanska',
        search: '',
        body: { editor_modes: { snow_depth_cm: 'manual' } },
      },
      { workspaceRoot },
    )
    expect(r?.status).toBe(501)
  })

  it('returns 400 invalid-request on body Zod parse fail (empty PUT body — refine requires at-least-one)', async (): Promise<void> => {
    const r = await dispatch(
      {
        method: 'PUT',
        pathname: '/api/resorts/kotelnica-bialczanska',
        search: '',
        body: {},
      },
      { workspaceRoot },
    )
    expect(r?.status).toBe(400)
    expect(r?.body).toMatchObject({ error: { code: 'invalid-request' } })
  })

  it('returns 400 invalid-request on URL-param Zod parse fail (slug regex rejects underscore)', async (): Promise<void> => {
    const r = await dispatch(
      { method: 'GET', pathname: '/api/resorts/has_underscore', search: '', body: undefined },
      { workspaceRoot },
    )
    expect(r?.status).toBe(400)
    expect(r?.body).toMatchObject({ error: { code: 'invalid-request' } })
  })

  it('routes POST /api/resorts/__all__/publish (Phase-1 sentinel union accepted)', async (): Promise<void> => {
    const r = await dispatch(
      {
        method: 'POST',
        pathname: '/api/resorts/__all__/publish',
        search: '',
        body: { confirm: true },
      },
      { workspaceRoot },
    )
    expect(r?.status).toBe(501)  // STUB; real publish handler lands in PR 4.5a
  })

  it('routes POST /api/resorts/:slug/publish for valid named slug too (forward-compat for Phase 2)', async (): Promise<void> => {
    const r = await dispatch(
      {
        method: 'POST',
        pathname: '/api/resorts/kotelnica-bialczanska/publish',
        search: '',
        body: { confirm: true },
      },
      { workspaceRoot },
    )
    expect(r?.status).toBe(501)
  })

  it('returns 400 on POST publish with body { confirm: false } (literal(true) rejects)', async (): Promise<void> => {
    const r = await dispatch(
      {
        method: 'POST',
        pathname: '/api/resorts/__all__/publish',
        search: '',
        body: { confirm: false },
      },
      { workspaceRoot },
    )
    expect(r?.status).toBe(400)
  })

  it('routes GET /api/health to healthHandler (real impl since PR 4.2)', async (): Promise<void> => {
    const r = await dispatch(
      { method: 'GET', pathname: '/api/health', search: '', body: undefined },
      { workspaceRoot },
    )
    expect(r?.status).toBe(200)
  })

  it('routes GET /api/publishes to listPublishesHandler (501 stub)', async (): Promise<void> => {
    const r = await dispatch(
      { method: 'GET', pathname: '/api/publishes', search: '', body: undefined },
      { workspaceRoot },
    )
    expect(r?.status).toBe(501)
  })

  it('passes workspaceRoot through to handler deps (verified via injected route)', async (): Promise<void> => {
    let receivedWorkspaceRoot: string | undefined
    const spyRoute: Route = {
      method: 'GET',
      pathPattern: '/api/spy',
      handler: async (_input, deps): Promise<{ ok: true }> => {
        await Promise.resolve()
        receivedWorkspaceRoot = deps.workspaceRoot
        return { ok: true }
      },
    }
    const r = await dispatch(
      { method: 'GET', pathname: '/api/spy', search: '', body: undefined },
      { workspaceRoot, routes: [spyRoute] },
    )
    expect(r?.status).toBe(200)
    expect(receivedWorkspaceRoot).toBe(workspaceRoot)
  })

  it('returns 500 internal on unhandled handler throw (non-coded Error)', async (): Promise<void> => {
    const throwRoute: Route = {
      method: 'GET',
      pathPattern: '/api/throw',
      handler: async (): Promise<never> => {
        await Promise.resolve()
        throw new Error('boom')
      },
    }
    const r = await dispatch(
      { method: 'GET', pathname: '/api/throw', search: '', body: undefined },
      { workspaceRoot, routes: [throwRoute] },
    )
    expect(r?.status).toBe(500)
    expect(r?.body).toMatchObject({ error: { code: 'internal' } })
  })

  it.each([
    ['__proto__', 500],
    ['constructor', 500],
    ['toString', 500],
  ])('treats prototype-key error code %s as 500 internal (subagent round-1 P0-2 fold)', async (code: string, expectedStatus: number): Promise<void> => {
    // Object.hasOwn guard prevents STATUS_FOR_CODE['__proto__'] from
    // resolving through Object.prototype to a non-number value.
    const route: Route = {
      method: 'GET',
      pathPattern: '/api/proto-probe',
      handler: async (): Promise<never> => {
        await Promise.resolve()
        const err = new Error(`probe ${code}`)
        ;(err as Error & { code?: string }).code = code
        throw err
      },
    }
    const r = await dispatch(
      { method: 'GET', pathname: '/api/proto-probe', search: '', body: undefined },
      { workspaceRoot, routes: [route] },
    )
    expect(r?.status).toBe(expectedStatus)
    expect(r?.body).toMatchObject({ error: { code: 'internal' } })
  })

  it('encodes Error with unknown code as 500 internal (defensive — code present but not in STATUS_FOR_CODE)', async (): Promise<void> => {
    const unknownCodeRoute: Route = {
      method: 'GET',
      pathPattern: '/api/unknown-code',
      handler: async (): Promise<never> => {
        await Promise.resolve()
        const err = new Error('upstream returned a code we do not recognize')
        ;(err as Error & { code?: string }).code = 'made-up-error-code'
        throw err
      },
    }
    const r = await dispatch(
      { method: 'GET', pathname: '/api/unknown-code', search: '', body: undefined },
      { workspaceRoot, routes: [unknownCodeRoute] },
    )
    expect(r?.status).toBe(500)
    expect(r?.body).toMatchObject({ error: { code: 'internal' } })
  })

  it.each([
    ['invalid-resort', 400],
    ['not-found', 404],
    ['workspace-corrupt', 500],
    ['publish-validation-failed', 400],
  ])('maps coded error %s to status %s', async (code: string, status: number): Promise<void> => {
    const codedRoute: Route = {
      method: 'GET',
      pathPattern: '/api/coded',
      handler: async (): Promise<never> => {
        await Promise.resolve()
        const err = new Error(`coded ${code}`)
        ;(err as Error & { code?: string }).code = code
        throw err
      },
    }
    const r = await dispatch(
      { method: 'GET', pathname: '/api/coded', search: '', body: undefined },
      { workspaceRoot, routes: [codedRoute] },
    )
    expect(r?.status).toBe(status)
    expect(r?.body).toMatchObject({ error: { code } })
  })

  it('lazy-creates data/admin-workspace/ on first invocation (§10.9)', async (): Promise<void> => {
    await dispatch(
      { method: 'GET', pathname: '/api/health', search: '', body: undefined },
      { workspaceRoot },
    )
    const s = await stat(join(workspaceRoot, 'data', 'admin-workspace'))
    expect(s.isDirectory()).toBe(true)
  })

  it('returns null when path does not match /api/* prefix (caller falls through to next())', async (): Promise<void> => {
    const r = await dispatch(
      { method: 'GET', pathname: '/index.html', search: '', body: undefined },
      { workspaceRoot },
    )
    expect(r).toBeNull()
  })

  it('returns null on /api/* with no matching route (caller falls through)', async (): Promise<void> => {
    const r = await dispatch(
      { method: 'GET', pathname: '/api/unknown-endpoint', search: '', body: undefined },
      { workspaceRoot },
    )
    expect(r).toBeNull()
  })

  describe('parseQueryString contract pinning (subagent round-1 P0-1 + P1-1/P1-2)', (): void => {
    it('a ?__proto__=<polluting-payload> query does NOT pollute Object.prototype', async (): Promise<void> => {
      // The crucial property: parseQueryString uses Object.create(null) for
      // its destination, so `result['__proto__'] = ...` sets an own property
      // (no prototype to pollute). Zod's z.object().parse(...) strips
      // unknown keys; the request flows through to the real listResorts
      // handler. The response status is incidental — the assertion is
      // that Object.prototype is unchanged.
      const before = Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted')
      try {
        await dispatch(
          {
            method: 'GET',
            pathname: '/api/resorts',
            search: '?__proto__=' + encodeURIComponent(JSON.stringify({ polluted: true })),
            body: undefined,
          },
          { workspaceRoot },
        )
        const after = Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted')
        expect(after).toBe(before)
        expect(({} as Record<string, unknown>).polluted).toBeUndefined()
      } finally {
        // Belt-and-braces: even if a regression corrupts the prototype,
        // delete the key so subsequent tests are not affected.
        delete (Object.prototype as Record<string, unknown>).polluted
      }
    })

    it('captures echo route to verify wire contract: numbers, strings, booleans round-trip', async (): Promise<void> => {
      // The wire contract: apiClient sends each value via JSON.stringify.
      // Numbers/booleans/objects round-trip cleanly. JSON-quoted strings
      // ('"foo"') decode back as strings; raw-text strings ('foo') hit
      // the fallback and stay as strings (lenient, but documented).
      let captured: unknown
      const echoSchema = z.object({
        n: z.number().optional(),
        b: z.boolean().optional(),
        s: z.string().optional(),
        o: z.object({ a: z.number() }).optional(),
      })
      const echoRoute: Route = {
        method: 'GET',
        pathPattern: '/api/echo',
        querySchema: echoSchema,
        handler: async (args): Promise<{ ok: true }> => {
          await Promise.resolve()
          captured = args.query
          return { ok: true }
        },
      }
      // Number, boolean, JSON-string ("foo"), object — all JSON-encoded.
      await dispatch(
        {
          method: 'GET',
          pathname: '/api/echo',
          search: '?n=42&b=true&s=' + encodeURIComponent('"foo"') + '&o=' + encodeURIComponent('{"a":1}'),
          body: undefined,
        },
        { workspaceRoot, routes: [echoRoute] },
      )
      expect(captured).toEqual({ n: 42, b: true, s: 'foo', o: { a: 1 } })
    })

    it('repeated query keys: last value wins (single-value contract; apiClient never produces repeats)', async (): Promise<void> => {
      // URLSearchParams.entries() yields each pair; the parser's last-write-
      // wins assignment keeps the FINAL value. apiClient.serializeQuery
      // uses params.set(...) so repeats are NOT produced; this test pins
      // the policy for any future contract bump.
      let captured: unknown
      const route: Route = {
        method: 'GET',
        pathPattern: '/api/echo-repeat',
        querySchema: z.object({ status: z.string().optional() }),
        handler: async (args): Promise<{ ok: true }> => {
          await Promise.resolve()
          captured = args.query
          return { ok: true }
        },
      }
      await dispatch(
        {
          method: 'GET',
          pathname: '/api/echo-repeat',
          search: '?status=' + encodeURIComponent('"draft"') + '&status=' + encodeURIComponent('"published"'),
          body: undefined,
        },
        { workspaceRoot, routes: [route] },
      )
      // Last value wins.
      expect(captured).toEqual({ status: 'published' })
    })
  })

  it('maps ensureWorkspaceDir failure to workspace-corrupt envelope (subagent round-1 P1-3 fold)', async (): Promise<void> => {
    // Pass a workspace path that mkdir cannot create. On most systems,
    // /dev/null/<anything> rejects with ENOTDIR. mkdir -p still fails
    // because /dev/null is not a directory.
    const r = await dispatch(
      { method: 'GET', pathname: '/api/health', search: '', body: undefined },
      { workspaceRoot: '/dev/null/cannot-create-here' },
    )
    expect(r?.status).toBe(500)
    expect(r?.body).toMatchObject({ error: { code: 'workspace-corrupt' } })
  })

  it('parseQueryString stores raw value when JSON.parse fails (defensive — non-JSON query value)', async (): Promise<void> => {
    // ?filter=not-json — JSON.parse fails, raw string is stored, then schema
    // rejects (filter is supposed to be an object); 400 invalid-request.
    const r = await dispatch(
      { method: 'GET', pathname: '/api/resorts', search: '?filter=not-json', body: undefined },
      { workspaceRoot },
    )
    expect(r?.status).toBe(400)
  })

  it('rethrows non-Zod parse errors (programmer error — dispatch does not synthesize 500 for these)', async (): Promise<void> => {
    // A schema that throws a plain Error instead of ZodError. Dispatch's
    // request-parsing catch block re-throws non-Zod errors; the caller
    // (Vite middleware) handles them via its own error path.
    const brokenSchema = {
      parse: (): never => {
        throw new Error('not a zod error')
      },
    } as unknown as z.ZodType
    const brokenRoute: Route = {
      method: 'GET',
      pathPattern: '/api/broken',
      paramSchema: brokenSchema,
      handler: async (): Promise<unknown> => {
        await Promise.resolve()
        return { ok: true }
      },
    }
    await expect(
      dispatch(
        { method: 'GET', pathname: '/api/broken', search: '', body: undefined },
        { workspaceRoot, routes: [brokenRoute] },
      ),
    ).rejects.toThrow('not a zod error')
  })

  it('encodes handler-thrown ZodError as 400 invalid-request (response validation)', async (): Promise<void> => {
    // A handler that runs runtime Zod validation and rejects — e.g., the real
    // PR 4.2/4.3 handlers will Zod-parse data they read from disk; if the
    // workspace file is shape-corrupt, ZodError surfaces as 400.
    const zodThrowRoute: Route = {
      method: 'GET',
      pathPattern: '/api/zod-throw',
      handler: async (): Promise<never> => {
        await Promise.resolve()
        z.string().parse(123)  // throws ZodError
        throw new Error('unreachable')
      },
    }
    const r = await dispatch(
      { method: 'GET', pathname: '/api/zod-throw', search: '', body: undefined },
      { workspaceRoot, routes: [zodThrowRoute] },
    )
    expect(r?.status).toBe(400)
    expect(r?.body).toMatchObject({ error: { code: 'invalid-request' } })
  })

  it('returns null on method-mismatch for an existing path (caller falls through)', async (): Promise<void> => {
    const r = await dispatch(
      // /api/resorts only accepts GET; DELETE has no matching route entry.
      { method: 'DELETE', pathname: '/api/resorts', search: '', body: undefined },
      { workspaceRoot },
    )
    expect(r).toBeNull()
  })
})

describe('resolveWorkspaceRoot (PR 4.1b §2.1, P0 #7 from second review)', (): void => {
  let originalCwd: string
  let originalEnv: string | undefined

  beforeEach((): void => {
    originalCwd = process.cwd()
    originalEnv = process.env.ADMIN_WORKSPACE_ROOT
  })

  afterEach((): void => {
    process.chdir(originalCwd)
    if (originalEnv === undefined) {
      delete process.env.ADMIN_WORKSPACE_ROOT
    } else {
      process.env.ADMIN_WORKSPACE_ROOT = originalEnv
    }
  })

  it('finds a path whose package.json declares a workspaces array', (): void => {
    // The result is the worktree/repo root. Verify it actually has the
    // sentinel (package.json with "workspaces"). Cwd-agnostic — works whether
    // vitest runs us from apps/admin/ (workspace test) or from the repo root
    // (npm run qa with --coverage merging projects).
    const root = resolveWorkspaceRoot()
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { workspaces?: unknown }
    expect(Array.isArray(pkg.workspaces)).toBe(true)
  })

  it('returns the same root deterministically across calls', (): void => {
    expect(resolveWorkspaceRoot()).toBe(resolveWorkspaceRoot())
  })

  it('still resolves the repo root from a deeper cwd (P0 #7: cd <subdir> && npm run dev should not break)', (): void => {
    // Chdir into apps/admin under the resolved repo root, then re-resolve.
    // The result must match — proves walking up works regardless of starting depth.
    const repoRoot = resolveWorkspaceRoot()
    process.chdir(join(repoRoot, 'apps', 'admin'))
    expect(resolveWorkspaceRoot()).toBe(repoRoot)
  })

  it('honors ADMIN_WORKSPACE_ROOT env override (test-rig escape hatch)', async (): Promise<void> => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'env-override-'))
    try {
      process.env.ADMIN_WORKSPACE_ROOT = tmpRoot
      expect(resolveWorkspaceRoot()).toBe(tmpRoot)
    } finally {
      await rm(tmpRoot, { recursive: true, force: true })
    }
  })

  it('throws when no workspace-declaring package.json is found above cwd', async (): Promise<void> => {
    // Use a tmp dir far away from any package.json with "workspaces".
    const orphan = await mkdtemp(join(tmpdir(), 'orphan-'))
    try {
      process.chdir(orphan)
      delete process.env.ADMIN_WORKSPACE_ROOT
      expect((): string => resolveWorkspaceRoot()).toThrow(/repo root/i)
    } finally {
      await rm(orphan, { recursive: true, force: true })
    }
  })
})

describe('dispatch deps shape (compile-time pin)', (): void => {
  it('DispatchDeps requires workspaceRoot and accepts optional routes', (): void => {
    const deps: DispatchDeps = { workspaceRoot: '/x' }
    expect(deps.workspaceRoot).toBe('/x')
  })
})

// File-level note: per-handler workspace-fixture exercise lives in each
// handler's own __tests__ file (health.test.ts, listResorts.test.ts, ...).
// These dispatch tests cover wiring (route matching, query parsing,
// envelope shapes, prototype-pollution defense) — not handler semantics.
void writeFile
