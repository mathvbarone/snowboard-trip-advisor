import type { IncomingMessage, ServerResponse } from 'node:http'

import type { Plugin, ViteDevServer } from 'vite'

import type { dispatch as DispatchFn, resolveWorkspaceRoot as ResolveFn } from './server/dispatch'

// ------------------------------------------------------------------
// Vite Plugin lifecycle adapter. This file is imported by
// apps/admin/vite.config.ts at config-load time; it must NOT statically
// import the schema package (whose internal cross-references are
// extension-less and break Node's ESM resolver during config bundling).
//
// The dispatch helper + route table live in ./server/dispatch.ts. We
// lazy-load that module via server.ssrLoadModule(...) at first request,
// by which time the Vite dev server is up and TS resolution is handled
// by Vite's SSR pipeline (not Node's bare ESM resolver). Tests import
// dispatch directly from ./server/dispatch (vitest also handles TS).
//
// The whole adapter body is /* v8 ignore */-marked because it can only
// be exercised by booting Vite; coverage of dispatch + resolveWorkspaceRoot
// is on the unit-tested core.
// ------------------------------------------------------------------

/* v8 ignore start -- Vite Plugin lifecycle runs only at Vite boot. */
async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return undefined
  }
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(chunk as Buffer)
  }
  if (chunks.length === 0) {
    return undefined
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.length === 0) {
    return undefined
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

interface DispatchModule {
  readonly dispatch: typeof DispatchFn
  readonly resolveWorkspaceRoot: typeof ResolveFn
}

export function adminApiPlugin(): Plugin {
  return {
    name: 'admin-api',
    configureServer(server: ViteDevServer): void {
      // Register without a path prefix so req.url is unstripped. Connect's
      // `use(prefix, handler)` strips the prefix from req.url; the dispatch
      // helper matches against the full pathname including /api/.
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void): void => {
        if (req.url === undefined || !req.url.startsWith('/api/')) {
          next()
          return
        }
        void (async (): Promise<void> => {
          // ssrLoadModule uses Vite's TS-aware resolver; the module + its
          // schema imports load correctly even though the schema package's
          // internal imports are extension-less.
          const mod = await server.ssrLoadModule('/server/dispatch.ts') as unknown as DispatchModule
          const body = await readJsonBody(req)
          const url = new URL(req.url ?? '/', 'http://127.0.0.1')
          const result = await mod.dispatch(
            {
              method: req.method ?? 'GET',
              pathname: url.pathname,
              search: url.search,
              body,
            },
            { workspaceRoot: mod.resolveWorkspaceRoot() },
          )
          if (result === null) {
            next()
            return
          }
          res.statusCode = result.status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(result.body))
        })()
      })
    },
  }
}
/* v8 ignore stop */
