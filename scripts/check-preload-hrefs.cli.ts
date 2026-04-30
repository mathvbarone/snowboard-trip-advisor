// scripts/check-preload-hrefs.cli.ts — side-effect entry point.
//
// Run via: `npm run analyze`. Exits 1 with the offending hrefs printed to
// stderr if any preload link in `<distDir>/index.html` does not resolve to
// a file under `<distDir>/`. Error-mode per spec §10.7.

import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  findMissingPreloadHrefs,
  parsePreloadHrefs,
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
const hrefs = parsePreloadHrefs(html)

const exists: FileExistsCheck = async (path: string): Promise<boolean> => {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

const missing = await findMissingPreloadHrefs(distDir, hrefs, exists)
if (missing.length > 0) {
  process.stderr.write(
    `ERROR: ${String(missing.length)} preload href(s) in ${indexPath} do not resolve under ${distDir}/:\n`,
  )
  for (const href of missing) {
    process.stderr.write(`  - ${href}\n`)
  }
  process.exit(1)
}
