// scripts/check-preload-hrefs.cli.ts — side-effect entry point.
//
// Run via: `npm run analyze`. Walks two URL sources — `<distDir>/index.html`
// for any Vite-emitted `<link rel="preload">` tags AND every `.js` file
// under `<distDir>/assets/` for runtime-injected `/assets/*.woff2?` string
// literals (per `apps/public/src/lib/injectFontPreloads.ts` + `main.tsx`).
// Exits 1 with the offending hrefs printed to stderr if any do not resolve
// to a file under `<distDir>/`. Error-mode per spec §10.7.

import { access, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

import {
  findMissingPreloadHrefs,
  parsePreloadHrefs,
  parseRuntimeAssetHrefs,
  type FileExistsCheck,
} from './check-preload-hrefs'

if (
  process.argv[1] === undefined ||
  !process.argv[1].endsWith('check-preload-hrefs.cli.ts')
) {
  throw new Error(
    'check-preload-hrefs.cli.ts is a CLI entry point; do not import it',
  )
}

const distDir = process.argv[2]
if (distDir === undefined) {
  process.stderr.write(
    'Usage: tsx scripts/check-preload-hrefs.cli.ts <path/to/dist>\n',
  )
  process.exit(2)
}

const indexPath = join(distDir, 'index.html')
const html = await readFile(indexPath, 'utf-8')

const assetsDir = join(distDir, 'assets')
let assetEntries: string[] = []
try {
  assetEntries = await readdir(assetsDir)
} catch {
  // dist/assets/ missing means no runtime-asset URLs to scan; HTML-only
  // check still runs below.
}
const jsFiles = assetEntries.filter((entry): boolean => entry.endsWith('.js'))
const runtimeHrefs = new Set<string>()
for (const file of jsFiles) {
  const source = await readFile(join(assetsDir, file), 'utf-8')
  for (const url of parseRuntimeAssetHrefs(source)) {
    runtimeHrefs.add(url)
  }
}

const allHrefs = [...new Set([...parsePreloadHrefs(html), ...runtimeHrefs])]

const exists: FileExistsCheck = async (path: string): Promise<boolean> => {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

const missing = await findMissingPreloadHrefs(distDir, allHrefs, exists)
if (missing.length > 0) {
  process.stderr.write(
    `ERROR: ${String(missing.length)} preload href(s) for ${distDir}/ do not resolve to a file:\n`,
  )
  for (const href of missing) {
    process.stderr.write(`  - ${href}\n`)
  }
  process.exit(1)
}
process.stdout.write(
  `check-preload-hrefs: verified ${String(allHrefs.length)} href(s) under ${distDir}/\n`,
)
