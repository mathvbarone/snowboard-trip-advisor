import { http, HttpResponse, type HttpHandler } from 'msw'

// Note: no `no-restricted-globals` disable — the bridge does NOT
// reference global fetch/XMLHttpRequest. If a future change adds raw
// `fetch(...)` here (uncommon, since dispatch already does the work),
// the lint rule will fire and the disable list (and the per-file
// allowlist rules in tests/eslint/admin-restrictions.test.ts) MUST be
// updated together (subagent round-1 P1-6 fold acknowledgement).
// eslint-disable-next-line no-restricted-syntax -- bridge harness intentionally imports the real dispatch helper to invoke server handlers from SPA-side integration tests; allowlisted at tests/eslint/admin-restrictions.test.ts.
import { dispatch } from '../../server/dispatch'

// Test-time MSW bridge handlers that decode the request via Zod, invoke the
// real apps/admin/server/* handler with a per-test workspace fixture dir,
// and encode the response. Used by side-effect-bearing integration tests
// (4.4d edit roundtrip, 4.5b publish, 4.6b full-flow). NOT runtime — the
// runtime path is the Vite middleware in vite-plugin-admin-api.ts. For
// canned-data SPA unit tests, see mocks/server.ts.
//
// Per ai-clean-code-adherence §1: the route table + schema-decode logic
// lives in ONE place (server/dispatch.ts); both the Vite-middleware adapter
// and this MSW bridge wrap the same dispatch. The bridge is ~15 lines of
// glue because dispatch takes a parsed input shape, not Connect req/res.

async function readJsonBody(request: Request): Promise<unknown> {
  if (request.method === 'GET' || request.method === 'HEAD') {
    return undefined
  }
  const text = await request.text()
  if (text.length === 0) {
    return undefined
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

// Regex pattern matches a URL whose path is /api/<anything> (any depth).
// MSW v2 tests RegExp patterns against the FULL URL (with protocol), so
// the regex spans the host segment. The glob-style `/api/*` only matches
// one segment after /api/; this regex covers /api/resorts/:slug and
// /api/resorts/:slug/publish too.
const API_PREFIX = /:\/\/[^/]+\/api\//

export function bridgeHandlers(workspaceDir: string): ReadonlyArray<HttpHandler> {
  return [
    http.all(API_PREFIX, async ({ request }): Promise<Response> => {
      const url = new URL(request.url)
      const body = await readJsonBody(request)
      const result = await dispatch(
        {
          method: request.method,
          pathname: url.pathname,
          search: url.search,
          body,
        },
        { workspaceRoot: workspaceDir },
      )
      if (result === null) {
        // Wire-contract parity invariant: this 404 envelope MUST match
        // apps/admin/vite-plugin-admin-api.ts's null-result branch
        // byte-for-byte (code, message, status). The bridge is the
        // canonical assertion of this contract — realHandlers.test.ts
        // pins it; the runtime middleware is /* v8 ignore */-marked
        // because it requires booting Vite. If you change one envelope,
        // change the other in the same commit (Codex round-2 P1 fold).
        return HttpResponse.json(
          { error: { code: 'not-found', message: 'no route' } },
          { status: 404 },
        )
      }
      // result.body is typed `unknown` (dispatch returns whatever the handler
      // produced); MSW's HttpResponse.json wants JsonBodyType. The body has
      // already been built into a JSON-serializable shape by dispatch (either
      // an envelope or a parser-narrowed response).
      return HttpResponse.json(result.body as Parameters<typeof HttpResponse.json>[0], { status: result.status })
    }),
  ]
}
