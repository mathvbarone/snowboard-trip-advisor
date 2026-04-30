// scripts/check-bundle-budget.cli.ts — side-effect entry point.
//
// Reads `apps/public/dist/stats.json` (emitted by `rollup-plugin-visualizer`)
// and writes a WARN line to stdout when the initial-load gzip closure exceeds
// the 100 KiB advisory budget. Always exits 0 — Phase 1 ships warn-mode per
// spec §6.7; Epic 6 follow-up flips to error mode.
//
// Run via: `npm run analyze` (which also rebuilds the public app first).

import { readFile } from 'node:fs/promises'

import {
  checkBundleBudget,
  type VisualizerStats,
} from './check-bundle-budget'

if (
  process.argv[1] === undefined ||
  !process.argv[1].endsWith('check-bundle-budget.cli.ts')
) {
  throw new Error(
    'check-bundle-budget.cli.ts is a CLI entry point; do not import it',
  )
}

const statsPath = process.argv[2]
if (statsPath === undefined) {
  process.stderr.write(
    'Usage: tsx scripts/check-bundle-budget.cli.ts <path/to/stats.json>\n',
  )
  process.exit(2)
}

const raw = await readFile(statsPath, 'utf-8')
const data = JSON.parse(raw) as VisualizerStats
const result = checkBundleBudget(data)
const kb = (result.totalBytes / 1024).toFixed(1)
if (result.warning === null) {
  process.stdout.write(
    `check-bundle-budget: initial chunk gzip = ${kb} KB / 100 KB advisory budget (within budget)\n`,
  )
} else {
  process.stdout.write(`${result.warning}\n`)
}
