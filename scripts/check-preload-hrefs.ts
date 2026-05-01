// scripts/check-preload-hrefs.ts — verifies every preload-targeted asset
// URL the prod bundle will reference resolves to a real file under `dist/`.
// Catches the silent-404 mode where Vite renames the woff2 asset but the
// import URL doesn't update (spec §10.7). Error-mode CLI (exit 1 on
// missing) — deploy-breakage check, not budget drift.
//
// Side-effect entry point lives in `./check-preload-hrefs.cli.ts`.
//
// Two URL sources, because preloads are emitted from two places in this
// project's architecture:
//
//   1. `dist/index.html` `<link rel="preload">` tags — reserved for any
//      Vite-emitted preloads. Today the build's only preloads come from
//      route 2 below; Vite emits `<link rel="modulepreload">` for chunk
//      hints, which `parsePreloadHrefs` deliberately does NOT match
//      (different rel value, different failure surface).
//   2. JS string literals in `dist/assets/*.js` matching the
//      `/assets/<name>.<woff2|woff>` shape — runtime-injected preloads
//      created by `apps/public/src/lib/injectFontPreloads.ts` from the
//      `@fontsource/.../*.woff2?url` imports in `apps/public/src/main.tsx`.
//      Vite resolves each `?url` import to a hashed string at build time;
//      the literal lands in the emitted JS chunk and the helper appends
//      a `<link rel="preload" as="font" crossorigin>` at module-eval.
//
// Regex parsers chosen over `jsdom` (no shipped types) and over an AST
// pass on the JS bundle (drags an entire JS parser into a script-only
// path). The inputs are machine-emitted by Vite — well-formed and
// predictable. The end-to-end `npm run analyze` run against the real
// dist/ is the integration check that the regexes still match.

import { relative, resolve } from 'node:path'

const PRELOAD_TAG_PATTERN = /<link\s[^>]*\brel=(?:"preload"|'preload')[^>]*>/gi
const HREF_ATTR_PATTERN = /\bhref=(?:"([^"]*)"|'([^']*)')/
// Vite emits asset URL imports as JS string literals. Modern minifiers
// (esbuild via Vite) freely interconvert single quotes / double quotes /
// backticks across builds, so accept all three quote forms. The end-to-end
// `npm run analyze` pass against a real build is the integration check
// that the chosen quote shape is still covered.
const RUNTIME_ASSET_URL_PATTERN =
  /["'`](\/assets\/[A-Za-z0-9._-]+\.(?:woff2|woff))["'`]/g

export function parsePreloadHrefs(html: string): string[] {
  const hrefs: string[] = []
  for (const tagMatch of html.matchAll(PRELOAD_TAG_PATTERN)) {
    const tag = tagMatch[0]
    const hrefMatch = HREF_ATTR_PATTERN.exec(tag)
    if (hrefMatch === null) {
      continue
    }
    const value = hrefMatch[1] ?? hrefMatch[2]
    if (value !== undefined && value !== '') {
      hrefs.push(value)
    }
  }
  return hrefs
}

export function parseRuntimeAssetHrefs(jsBundle: string): string[] {
  const seen = new Set<string>()
  for (const match of jsBundle.matchAll(RUNTIME_ASSET_URL_PATTERN)) {
    // Capture group 1 is required by the pattern (`+` quantifier on the
    // character class) and the regex is global so partial matches don't
    // populate it as undefined — `url` is always a non-empty string here.
    const url = match[1] as string
    seen.add(url)
  }
  return [...seen]
}

export type FileExistsCheck = (absolutePath: string) => Promise<boolean>

export async function findMissingPreloadHrefs(
  distDir: string,
  hrefs: readonly string[],
  exists: FileExistsCheck,
): Promise<string[]> {
  const distRoot = resolve(distDir)
  const missing: string[] = []
  for (const href of hrefs) {
    const trimmed = href.startsWith('/') ? href.slice(1) : href
    const absolutePath = resolve(distRoot, trimmed)
    // Reject hrefs whose resolved path escapes distDir; the gate verifies
    // assets under the build output only, not arbitrary files on disk.
    if (relative(distRoot, absolutePath).startsWith('..')) {
      missing.push(href)
      continue
    }
    if (!(await exists(absolutePath))) {
      missing.push(href)
    }
  }
  return missing
}
