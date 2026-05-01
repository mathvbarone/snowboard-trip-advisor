// scripts/check-agent-discipline-sync.cli.ts — side-effect entry point.
//
// Run via: `npm run check:agent-discipline-sync` (also wired into `npm run qa`
// as the second step, after `lint`). Reads AGENTS.md, CLAUDE.md,
// .github/dependabot.yml (if present), and the docs/adr/ basenames, runs all
// drift checks, and exits with:
//   0 — clean (no drift detected)
//   1 — drift detected (one or more checks failed)
//   2 — internal checker error (FS error other than ENOENT, or unhandled
//       exception in the checker itself)
//
// CI consumers can distinguish "rules drifted, fix the docs" (1) from
// "checker is broken, fix the script" (2).

import { readdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  runAllChecks,
  type DriftCheckInputs,
} from './check-agent-discipline-sync'

if (
  process.argv[1] === undefined ||
  !process.argv[1].endsWith('check-agent-discipline-sync.cli.ts')
) {
  throw new Error(
    'check-agent-discipline-sync.cli.ts is a CLI entry point; do not import it',
  )
}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '..')

function isENoEnt(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    err.code === 'ENOENT'
  )
}

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8')
  } catch (err) {
    if (isENoEnt(err)) {
      return null
    }
    throw err
  }
}

async function readDirOrEmpty(path: string): Promise<readonly string[]> {
  try {
    return await readdir(path)
  } catch (err) {
    if (isENoEnt(err)) {
      return []
    }
    throw err
  }
}

function summarizeInputs(i: DriftCheckInputs): string {
  return [
    i.agents === null ? 'agents:missing' : 'agents:present',
    i.claude === null ? 'claude:missing' : 'claude:present',
    i.dependabot === null ? 'dependabot:absent' : 'dependabot:present',
    `adrs:${String(i.adrBasenames.length)}`,
  ].join(' / ')
}

try {
  const inputs: DriftCheckInputs = {
    agents: await readOptional(resolve(REPO_ROOT, 'AGENTS.md')),
    claude: await readOptional(resolve(REPO_ROOT, 'CLAUDE.md')),
    dependabot: await readOptional(
      resolve(REPO_ROOT, '.github', 'dependabot.yml'),
    ),
    adrBasenames: await readDirOrEmpty(resolve(REPO_ROOT, 'docs', 'adr')),
  }

  const issues = runAllChecks(inputs)
  if (issues.length === 0) {
    process.stdout.write(
      `check-agent-discipline-sync: ${summarizeInputs(inputs)} ✓\n`,
    )
    process.exit(0)
  }

  for (const issue of issues) {
    process.stderr.write(
      `check-agent-discipline-sync [${issue.check}]: ${issue.message}\n`,
    )
  }
  process.stderr.write(
    `check-agent-discipline-sync: ${String(issues.length)} drift issue(s) — fix above and re-run.\n`,
  )
  process.exit(1)
} catch (err) {
  const reason = err instanceof Error ? err.message : String(err)
  process.stderr.write(
    `check-agent-discipline-sync: internal checker error — ${reason}\n` +
      `  Exit code 2 (distinct from drift; investigate the checker itself).\n`,
  )
  process.exit(2)
}
