// scripts/detect-qa-scope.cli.ts — side-effect entry point.
//
// Reads `git diff --name-status` output from stdin (status-prefixed,
// tab-separated, with rename / copy lines carrying both old and new
// paths) and writes either `docs-only` or `full` to stdout, followed by
// a trailing newline. Always exits 0; the caller chooses which `npm run`
// command to dispatch based on the scope token.
//
// Used by `scripts/pre-commit` and `.github/workflows/quality-gate.yml`.

import { detectQaScope, parseGitNameStatus } from './detect-qa-scope'

if (
  process.argv[1] === undefined ||
  !process.argv[1].endsWith('detect-qa-scope.cli.ts')
) {
  throw new Error(
    'detect-qa-scope.cli.ts is a CLI entry point; do not import it',
  )
}

let buf = ''
process.stdin.setEncoding('utf-8')
for await (const chunk of process.stdin) {
  buf += String(chunk)
}
process.stdout.write(`${detectQaScope(parseGitNameStatus(buf))}\n`)
