import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import {
  HealthQuery,
  ListPublishesQuery,
  ListResortsQuery,
  PublishBody,
  PublishSlugParam,
  ResortSlugParam,
  ResortUpsertBody,
} from '@snowboard-trip-advisor/schema/api'
import { z } from 'zod'

import { healthHandler } from './health'
import { listPublishesHandler } from './listPublishes'
import { listResortsHandler, type HandlerDeps } from './listResorts'
import { publishHandler } from './publish'
import { resortDetailHandler } from './resortDetail'
import { resortUpsertHandler } from './resortUpsert'
import { ensureWorkspaceDir } from './workspace'

// ------------------------------------------------------------------
// Types: route table + dispatch input/output
// ------------------------------------------------------------------

export interface DispatchInput {
  readonly method: string
  readonly pathname: string
  readonly search: string
  readonly body: unknown
}

export interface DispatchResult {
  readonly status: number
  readonly body: unknown
}

export interface HandlerArgs {
  readonly params?: unknown
  readonly query?: unknown
  readonly body?: unknown
}

export type RouteHandler = (args: HandlerArgs, deps: HandlerDeps) => Promise<unknown>

export interface Route {
  readonly method: 'GET' | 'PUT' | 'POST'
  readonly pathPattern: string
  readonly paramSchema?: z.ZodType
  readonly querySchema?: z.ZodType
  readonly bodySchema?: z.ZodType
  readonly handler: RouteHandler
}

export interface DispatchDeps {
  readonly workspaceRoot: string
  /** Test-only injection point. Production callers omit; defaults to module-level ROUTES. */
  readonly routes?: ReadonlyArray<Route>
}

// ------------------------------------------------------------------
// Route table — module-level const, no factory, no mutable cache
// (per ai-clean-code-adherence §2 + §5).
// ------------------------------------------------------------------

const ROUTES: ReadonlyArray<Route> = [
  {
    method: 'GET',
    pathPattern: '/api/resorts',
    querySchema: ListResortsQuery,
    handler: async (args, deps): Promise<unknown> =>
      listResortsHandler({ query: args.query as never }, deps),
  },
  {
    method: 'GET',
    pathPattern: '/api/resorts/:slug',
    paramSchema: ResortSlugParam,
    handler: async (args, deps): Promise<unknown> =>
      resortDetailHandler({ params: args.params as never }, deps),
  },
  {
    method: 'PUT',
    pathPattern: '/api/resorts/:slug',
    paramSchema: ResortSlugParam,
    bodySchema: ResortUpsertBody,
    handler: async (args, deps): Promise<unknown> =>
      resortUpsertHandler({ params: args.params as never, body: args.body as never }, deps),
  },
  {
    method: 'POST',
    pathPattern: '/api/resorts/:slug/publish',
    paramSchema: PublishSlugParam,
    bodySchema: PublishBody,
    handler: async (args, deps): Promise<unknown> =>
      publishHandler({ params: args.params as never, body: args.body as never }, deps),
  },
  {
    method: 'GET',
    pathPattern: '/api/publishes',
    querySchema: ListPublishesQuery,
    handler: async (args, deps): Promise<unknown> =>
      listPublishesHandler({ query: args.query as never }, deps),
  },
  {
    method: 'GET',
    pathPattern: '/api/health',
    querySchema: HealthQuery,
    handler: async (args, deps): Promise<unknown> =>
      healthHandler({ query: args.query as never }, deps),
  },
]

// ------------------------------------------------------------------
// Path-pattern matcher: replaces :param with [^/]+ regex group.
// ------------------------------------------------------------------

interface MatchedRoute {
  readonly route: Route
  readonly params: Record<string, string>
}

function matchRoute(
  routes: ReadonlyArray<Route>,
  method: string,
  pathname: string,
): MatchedRoute | null {
  for (const route of routes) {
    if (route.method !== method) {
      continue
    }
    const paramNames: string[] = []
    const regexStr = route.pathPattern.replace(/:(\w+)/g, (_, name: string): string => {
      paramNames.push(name)
      return '([^/]+)'
    })
    const regex = new RegExp(`^${regexStr}$`)
    const match = regex.exec(pathname)
    if (match === null) {
      continue
    }
    const params: Record<string, string> = {}
    paramNames.forEach((name, i): void => {
      // The regex uses `([^/]+)` so captured groups are always non-empty
      // strings on a match; the `?? ''` fallback satisfies
      // noUncheckedIndexedAccess but is structurally unreachable.
      /* v8 ignore next */
      params[name] = match[i + 1] ?? ''
    })
    return { route, params }
  }
  return null
}

// ------------------------------------------------------------------
// Query-string parser: inverse of apiClient's serializeQuery.
// Each top-level URLSearchParam value is JSON-encoded; JSON.parse it
// back. Values that don't parse are kept as raw strings (defensive).
//
// Wire contract (pinned by dispatch.test.ts):
//   - apiClient sends each value via JSON.stringify(...). Primitives
//     ROUND-TRIP cleanly through JSON (numbers, booleans, nested
//     objects). Strings sent as JSON-quoted ('"foo"') decode back as
//     strings; raw-text strings ('foo') hit the fallback and stay
//     as strings.
//   - Repeated keys (`?status=a&status=b`) are NOT supported in the
//     contract. URLSearchParams.entries() yields both; the loop's
//     last-write-wins assignment keeps the FINAL value. apiClient
//     uses params.set(...) and never produces repeats. Documented +
//     pinned by a test so a Phase-2 contract bump doesn't drift.
//
// Prototype-key safety (subagent round-1 P0-1 fold): the destination
// object is constructed via Object.create(null) so a query like
// ?__proto__=...&constructor=... cannot pollute Object.prototype
// through a user-controlled key. Belt-and-braces against a future
// schema that doesn't strict-reject unknown top-level keys.
function parseQueryString(search: string): Record<string, unknown> {
  const params = new URLSearchParams(search)
  const result = Object.create(null) as Record<string, unknown>
  for (const [key, value] of params.entries()) {
    try {
      result[key] = JSON.parse(value) as unknown
    } catch {
      result[key] = value
    }
  }
  return result
}

// ------------------------------------------------------------------
// Error code → HTTP status map (per spec §4.10).
//
// Map (not Record): a string-keyed Map cannot be probed via prototype-
// chain keys ('__proto__', 'constructor', 'toString'). Map.get(key)
// returns undefined for any key not explicitly inserted, regardless of
// Object.prototype contents. Subagent round-1 P0-2 fold.
// ------------------------------------------------------------------

const STATUS_FOR_CODE: ReadonlyMap<string, number> = new Map([
  ['invalid-request', 400],
  ['invalid-resort', 400],
  ['not-found', 404],
  ['not-implemented', 501],
  ['publish-validation-failed', 400],
  ['workspace-corrupt', 500],
  ['internal', 500],
])

function errorEnvelope(code: string, message: string, details?: unknown): { error: { code: string; message: string; details?: unknown } } {
  if (details === undefined) {
    return { error: { code, message } }
  }
  return { error: { code, message, details } }
}

// ------------------------------------------------------------------
// dispatch — the unit-tested core. Connect adapter + MSW bridge are
// thin wrappers over this. Returns DispatchResult or null (caller
// falls through to next() / passes through to Vite's static handler).
// ------------------------------------------------------------------

export async function dispatch(
  input: DispatchInput,
  deps: DispatchDeps,
): Promise<DispatchResult | null> {
  if (!input.pathname.startsWith('/api/')) {
    return null
  }
  const routes = deps.routes ?? ROUTES
  const matched = matchRoute(routes, input.method, input.pathname)
  if (matched === null) {
    return null
  }

  // mkdir -p on the workspace dir is idempotent + cheap; per
  // ai-clean-code-adherence §5 a one-shot promise would be hidden
  // module-level state. Unconditional call is the cleaner choice in
  // Phase 1's loopback / single-analyst topology.
  //
  // ensureWorkspaceDir failure (read-only fs, EACCES, etc.) is mapped
  // to the workspace-corrupt envelope (subagent round-1 P1-3 fold) —
  // otherwise the rejection would propagate as an unhandled promise
  // in the plugin's IIFE and the response would never be written.
  try {
    await ensureWorkspaceDir(deps.workspaceRoot)
  } catch (err: unknown) {
    return {
      status: 500,
      body: errorEnvelope(
        'workspace-corrupt',
        `failed to ensure workspace dir: ${(err as Error).message}`,
      ),
    }
  }

  const { route, params: rawParams } = matched

  let parsedParams: unknown
  let parsedQuery: unknown
  let parsedBody: unknown

  try {
    parsedParams = route.paramSchema === undefined ? rawParams : route.paramSchema.parse(rawParams)
    parsedQuery = route.querySchema === undefined
      ? undefined
      : route.querySchema.parse(parseQueryString(input.search))
    parsedBody = route.bodySchema === undefined
      ? undefined
      : route.bodySchema.parse(input.body)
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return {
        status: 400,
        body: errorEnvelope('invalid-request', 'request validation failed', err.issues),
      }
    }
    throw err
  }

  try {
    const result = await route.handler(
      { params: parsedParams, query: parsedQuery, body: parsedBody },
      { workspaceRoot: deps.workspaceRoot },
    )
    return { status: 200, body: result }
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return {
        status: 400,
        body: errorEnvelope('invalid-request', 'response validation failed', err.issues),
      }
    }
    const errCoded = err as Error & { code?: string; details?: unknown }
    const code = errCoded.code
    if (code !== undefined) {
      // Map.get returns undefined for any non-inserted key — including
      // prototype-chain probes like '__proto__' / 'constructor'. Subagent
      // round-1 P0-2 fold (Map replaces Record for prototype safety).
      const status = STATUS_FOR_CODE.get(code)
      if (status !== undefined) {
        // Codex round-4 P2 fold (originally Decision D8 / scoped to PR
        // 4.4c — brought forward to PR 4.4a-2 so the workspace-corrupt
        // envelope is spec-compliant from this PR onward). Per spec
        // §4.10, error envelopes MAY carry `.details` for actionable
        // recovery payloads. WorkspaceCorruptError carries the failing
        // slug + Zod issues; passing them through lets PR 4.4d's editor
        // tell the analyst what to repair.
        return {
          status,
          body: errorEnvelope(code, errCoded.message, errCoded.details),
        }
      }
      // Unknown error code → fall through to 500 internal envelope below.
    }
    return {
      status: 500,
      body: errorEnvelope('internal', (err as Error).message),
    }
  }
}

// ------------------------------------------------------------------
// resolveWorkspaceRoot — P0 #7 from second review. process.cwd() is
// wrong if the analyst runs `cd apps/admin && npm run dev`; the
// workspace dir would land under apps/admin/data/admin-workspace/.
// Walk upward looking for the workspace-declaring package.json.
// ADMIN_WORKSPACE_ROOT env override allows test rigs to pin a tmpdir.
// ------------------------------------------------------------------

export function resolveWorkspaceRoot(): string {
  const override = process.env.ADMIN_WORKSPACE_ROOT
  if (override !== undefined) {
    return override
  }
  let dir = process.cwd()
  for (let i = 0; i < 10; i++) {  // bounded depth; loopback-only Phase 1
    const pkgPath = join(dir, 'package.json')
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { workspaces?: unknown }
      if (Array.isArray(pkg.workspaces)) {
        return dir
      }
    }
    const parent = dirname(dir)
    if (parent === dir) {
      break
    }
    dir = parent
  }
  throw new Error('Could not resolve repo root from process.cwd()')
}

// The Vite Plugin lifecycle adapter (configureServer) lives in
// apps/admin/vite-plugin-admin-api.ts so this file can be loaded by Vite's
// config-loader without traversing schema-package TS files. The plugin
// adapter lazy-loads dispatch + resolveWorkspaceRoot via Vite's SSR
// pipeline at first request, by which time the dev server is up and TS
// resolution works.
