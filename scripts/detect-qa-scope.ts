// scripts/detect-qa-scope.ts — pure classifier of a changed-file list into
// `'docs-only'` or `'full'` for the docs-only QA carve-out (AGENTS.md →
// Quality Gate). Used by both the local pre-commit hook and the CI
// `quality-gate / qa` job; one source of truth so the two surfaces cannot
// drift.
//
// Input-format assumption: paths are `git diff --name-only` output —
// repo-relative, LF-separated, no `./` prefix. Whitespace and CR are
// trimmed defensively (some shells emit CRLF on Windows). A leading `./`
// is stripped before classification — git itself does not emit it, but
// stripping closes the `'./scripts/foo.md'` → `'docs-only'` would-be
// bypass if any wrapper ever re-adds the prefix.
//
// Rule: a diff is `'docs-only'` iff every path is either under `docs/` or
// ends in `.md`, AND no path is under a policy-surface root (`.github/`,
// `.claude/`, `scripts/`) — even if that path happens to be markdown.
// Empty input falls back to `'full'` so a missing diff never silently
// shortcuts the gate.
//
// Side-effect entry point lives in `./detect-qa-scope.cli.ts`.

export type QaScope = 'docs-only' | 'full'

const POLICY_ROOTS = ['.github/', '.claude/', 'scripts/'] as const

function normalize(path: string): string {
  const trimmed = path.trim()
  return trimmed.startsWith('./') ? trimmed.slice(2) : trimmed
}

function isDocsPath(path: string): boolean {
  for (const root of POLICY_ROOTS) {
    if (path.startsWith(root)) {
      return false
    }
  }
  if (path.startsWith('docs/')) {
    return true
  }
  return path.endsWith('.md')
}

export function detectQaScope(paths: readonly string[]): QaScope {
  const cleaned = paths
    .map((p): string => normalize(p))
    .filter((p): boolean => p.length > 0)
  if (cleaned.length === 0) {
    return 'full'
  }
  for (const path of cleaned) {
    if (!isDocsPath(path)) {
      return 'full'
    }
  }
  return 'docs-only'
}
