// scripts/check-dist-dataset.cli.ts — side-effect entry point.
//
// Run via: `npm run analyze`. Asserts `<distDir>/data/current.v1.json` exists
// and parses with the published-dataset envelope shape. Exits 1 on missing
// file, JSON parse error, or envelope-shape failure (spec §10.2 — nginx
// contract verification, deploy-breakage gate).

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { validateDatasetEnvelope } from './check-dist-dataset'

if (
  process.argv[1] === undefined ||
  !process.argv[1].endsWith('check-dist-dataset.cli.ts')
) {
  throw new Error(
    'check-dist-dataset.cli.ts is a CLI entry point; do not import it',
  )
}

const distDir = process.argv[2]
if (distDir === undefined) {
  process.stderr.write(
    'Usage: tsx scripts/check-dist-dataset.cli.ts <path/to/dist>\n',
  )
  process.exit(2)
}

const datasetPath = join(distDir, 'data', 'current.v1.json')

let raw: string
try {
  raw = await readFile(datasetPath, 'utf-8')
} catch (err) {
  const reason = err instanceof Error ? err.message : String(err)
  process.stderr.write(`ERROR: dataset not found at ${datasetPath}: ${reason}\n`)
  process.exit(1)
}

let parsed: unknown
try {
  parsed = JSON.parse(raw)
} catch (err) {
  const reason = err instanceof Error ? err.message : String(err)
  process.stderr.write(
    `ERROR: dataset at ${datasetPath} is not valid JSON: ${reason}\n`,
  )
  process.exit(1)
}

const result = validateDatasetEnvelope(parsed)
if (!result.ok) {
  process.stderr.write(
    `ERROR: dataset at ${datasetPath} envelope check failed: ${result.reason}\n`,
  )
  process.exit(1)
}
