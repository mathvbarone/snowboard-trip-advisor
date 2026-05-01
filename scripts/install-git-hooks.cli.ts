// scripts/install-git-hooks.cli.ts — side-effect entry point.
//
// Resolves the repo's hooks directory via `git rev-parse --git-path hooks`
// (which correctly handles worktrees, where `.git` is a file pointing at the
// linked-worktree's git dir, not a regular directory). Reads tracked hook
// bodies from `scripts/<hook>` and installs them as executable files into the
// resolved hooks dir.
//
// Run via: `npm run setup`. Idempotent — re-running emits `unchanged` for
// any hook whose installed copy already matches the tracked source byte-for-byte.

import { execFileSync } from 'node:child_process'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ensureExecutable,
  installHooks,
  type HookInstallSpec,
  type ReadFileFn,
  type WriteFileFn,
} from './install-git-hooks'

if (
  process.argv[1] === undefined ||
  !process.argv[1].endsWith('install-git-hooks.cli.ts')
) {
  throw new Error(
    'install-git-hooks.cli.ts is a CLI entry point; do not import it',
  )
}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '..')

// `git rev-parse --git-path hooks` resolves to the common-dir's hooks directory
// (git's design is one shared hooks dir across linked worktrees), so the
// returned path is correct whether `npm run setup` runs from the main checkout
// or from a linked worktree. Do NOT assume a literal `.git/hooks` path — in a
// linked worktree, `.git` is a file, and the hooks dir lives in the common
// `.git/` of the main checkout.
let HOOKS_DIR: string
try {
  HOOKS_DIR = resolve(
    REPO_ROOT,
    execFileSync('git', ['rev-parse', '--git-path', 'hooks'], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
    }).trim(),
  )
} catch (err) {
  const reason = err instanceof Error ? err.message : String(err)
  process.stderr.write(
    `install-git-hooks: failed to resolve hooks directory via 'git rev-parse'.\n` +
      `  Reason: ${reason}\n` +
      `  Run 'npm run setup' from a git checkout (not a tarball or non-git directory).\n`,
  )
  process.exit(1)
}

await mkdir(HOOKS_DIR, { recursive: true })

const specs: readonly HookInstallSpec[] = [
  {
    name: 'pre-commit',
    sourcePath: resolve(SCRIPT_DIR, 'pre-commit'),
    targetPath: resolve(HOOKS_DIR, 'pre-commit'),
  },
  {
    name: 'prepare-commit-msg',
    sourcePath: resolve(SCRIPT_DIR, 'prepare-commit-msg'),
    targetPath: resolve(HOOKS_DIR, 'prepare-commit-msg'),
  },
]

const read: ReadFileFn = (path: string): Promise<string> =>
  readFile(path, 'utf-8')
const write: WriteFileFn = async (
  path: string,
  content: string,
): Promise<void> => {
  await writeFile(path, content, 'utf-8')
  await chmod(path, 0o755)
}

const results = await installHooks(specs, read, write)

await ensureExecutable(specs, results, chmod)

let failureCount = 0
for (const result of results) {
  if (result.status === 'installed') {
    process.stdout.write(`install-git-hooks: ${result.hook} installed\n`)
  } else if (result.status === 'unchanged') {
    process.stdout.write(`install-git-hooks: ${result.hook} unchanged\n`)
  } else {
    failureCount += 1
    process.stderr.write(
      `install-git-hooks: ${result.hook} ${result.status}: ${result.reason ?? '(no reason)'}\n`,
    )
  }
}

if (failureCount > 0) {
  process.stderr.write(
    `install-git-hooks: ${String(failureCount)} hook(s) failed to install\n`,
  )
  process.exit(1)
}
