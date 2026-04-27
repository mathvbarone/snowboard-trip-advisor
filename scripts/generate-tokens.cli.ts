// scripts/generate-tokens.cli.ts — side-effect entry point.
//
// Materializes `packages/design-system/tokens.css` from the pure renderer in
// `./generate-tokens.ts`. This file is intentionally a 5-liner that runs at
// import time so it can be excluded from coverage cleanly (see the root
// `vitest.config.ts` exclude list and the rationale comment alongside it).
//
// Run via: `npm run tokens:generate` (which invokes `tsx scripts/generate-tokens.cli.ts`).

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { tokens } from '../packages/design-system/src/tokens'

import { renderTokensCss } from './generate-tokens'

if (process.argv[1] === undefined || !process.argv[1].endsWith('generate-tokens.cli.ts')) {
  throw new Error('generate-tokens.cli.ts is a CLI entry point; do not import it')
}

const out = resolve(import.meta.dirname, '../packages/design-system/tokens.css')
writeFileSync(out, renderTokensCss(tokens), 'utf8')
