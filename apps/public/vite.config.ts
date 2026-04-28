import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import type { InlineConfig } from 'vitest/node'

import { createCspDevMiddleware } from './src/lib/csp'
import {
  copyDataset,
  serveDatasetMiddleware,
} from './src/lib/datasetPlugin'

declare module 'vite' {
  interface UserConfig {
    test?: InlineConfig
  }
}

// Resolve once at config load. import.meta.dirname is Node ≥ 20.11
// (engines pin from PR 3.1a covers this).
const APP_ROOT = import.meta.dirname
const REPO_ROOT = resolve(APP_ROOT, '../..')
const DATASET_SRC = resolve(REPO_ROOT, 'data/published/current.v1.json')
const DATASET_DEST_RELATIVE = 'data/current.v1.json'
const INDEX_HTML = resolve(APP_ROOT, 'index.html')

// In dev, serve the published dataset from disk. In build, copy it into
// the output bundle alongside the hashed asset chunks. The middleware
// emits the same JSON / no-cache headers the prod nginx edge will
// emit (spec §10.2). The thin lifecycle adapter is coverage-excluded
// below; the helpers it calls are unit-tested in src/lib/datasetPlugin.test.ts.
function datasetPlugin(): Plugin {
  return {
    name: 'sta-dataset',
    configureServer(server): void {
      server.middlewares.use(
        `/${DATASET_DEST_RELATIVE}`,
        serveDatasetMiddleware(DATASET_SRC),
      )
    },
    async writeBundle(opts): Promise<void> {
      if (opts.dir === undefined) {
        throw new Error('writeBundle: opts.dir missing')
      }
      await copyDataset(DATASET_SRC, resolve(opts.dir, DATASET_DEST_RELATIVE))
    },
  }
}

// In dev, generate a fresh nonce per HTML request, transform the
// index.html through Vite's pipeline, mirror the nonce onto every
// HMR-injected inline script, and emit the matching CSP header.
// `transformIndexHtml` is NOT a viable hook here — its context does
// not expose `req`, so per-request state cannot be threaded in. We
// own the HTML response via a `configureServer` middleware instead.
//
// The middleware is registered **synchronously** (pre-internal) rather
// than via the deferred-return ("post-internal") form. Vite's internal
// HTML middleware serves `/` and `/index.html` and ends the response
// before post-internal middlewares run, which would silently skip
// nonce injection + the CSP header on normal page loads. Registering
// pre-internal lets us own the HTML response; we still call
// `server.transformIndexHtml(...)` inside the middleware so Vite's
// own HMR / module-preload tags are folded into the served HTML.
// Non-HTML requests fall through to Vite's internals via `next()` —
// the URL guard in `createCspDevMiddleware` only handles `/` and
// `*.html` paths.
//
// The lifecycle adapter is coverage-excluded; the middleware factory
// it calls is unit-tested in src/lib/csp.test.ts and the smoke test
// in src/__tests__/cspDevPlugin.test.ts.
function cspDevPlugin(): Plugin {
  return {
    name: 'sta-csp-dev',
    apply: 'serve',
    configureServer(server): void {
      const middleware = createCspDevMiddleware({
        readIndexHtml: (): Promise<string> => readFile(INDEX_HTML, 'utf-8'),
        transformIndexHtml: (url, html, originalUrl): Promise<string> =>
          server.transformIndexHtml(url, html, originalUrl),
      })
      server.middlewares.use((req, res, next): void => {
        void middleware(req, res, next)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), datasetPlugin(), cspDevPlugin()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      // src/state/useDataset.hmr.ts — HMR-only safety net. `import.meta.hot`
      // is undefined in vitest (the entire module body is dead code), so
      // coverage measurement against it is structurally impossible. The
      // whole-file glob exclusion is the project's standard pattern (matches
      // src/main.tsx, src/test-setup.ts, src/mocks/**). CLAUDE.md
      // "Coverage Rules" bans inline coverage-suppression comments; the
      // HMR block was extracted into its own file specifically so the
      // exclusion can be expressed as a glob here. See useDataset.ts header
      // for the cache-discipline rationale that the HMR handler exists to
      // support.
      exclude: [
        'src/main.tsx',
        'src/test-setup.ts',
        'src/mocks/**',
        'src/state/useDataset.hmr.ts',
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
      ],
      reporter: ['text', 'lcov'],
    },
  },
})

// Coverage exclusion rationale: the `datasetPlugin` and `cspDevPlugin`
// functions in this file are 5-line Vite lifecycle adapters
// (`configureServer` + `writeBundle`) that wire the pure helpers in
// src/lib/{datasetPlugin,csp}.ts into a running Vite server. They are
// not exercisable in jsdom unit tests; spinning up Vite from tests
// would defeat the unit-test isolation. The pure helpers carry the
// behavior and are unit-tested directly. Exclusion is implicit
// because vite.config.ts is not under coverage.include ('src/**').
