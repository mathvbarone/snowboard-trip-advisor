// scripts/check-preload-hrefs.ts — verifies every `<link rel="preload">` href
// in `dist/index.html` resolves to a real file under `dist/`.
//
// Catches the silent-404 mode where Vite renames the woff2 asset but the
// import URL doesn't update (spec §10.7). Error-mode in CI (exit 1 on
// missing) — this is a deploy-breakage check, not a budget drift.
//
// Side-effect entry point lives in `./check-preload-hrefs.cli.ts`.
//
// HTML parsing is regex-based intentionally: the input is Vite's emitted
// `dist/index.html` (well-formed, machine-generated, single-line link tags),
// not arbitrary user HTML. Regex avoids dragging `jsdom` (or its missing
// types) into a script-only path. If Vite's emitted HTML shape ever changes
// such that the regex misses a tag, the verifier silently passes — that's
// caught by the `npm run analyze` end-to-end run against a real build.

import { resolve } from 'node:path'

const PRELOAD_TAG_PATTERN = /<link\s[^>]*\brel=(?:"preload"|'preload')[^>]*>/gi
const HREF_ATTR_PATTERN = /\bhref=(?:"([^"]*)"|'([^']*)')/

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

export type FileExistsCheck = (absolutePath: string) => Promise<boolean>

export async function findMissingPreloadHrefs(
  distDir: string,
  hrefs: readonly string[],
  exists: FileExistsCheck,
): Promise<string[]> {
  const missing: string[] = []
  for (const href of hrefs) {
    const trimmed = href.startsWith('/') ? href.slice(1) : href
    const absolutePath = resolve(distDir, trimmed)
    if (!(await exists(absolutePath))) {
      missing.push(href)
    }
  }
  return missing
}
