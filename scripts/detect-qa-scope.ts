// scripts/detect-qa-scope.ts — pure classifier of a changed-file list into
// `'docs-only'` or `'full'` for the docs-only QA carve-out (AGENTS.md →
// Quality Gate). Used by both the local pre-commit hook and the CI
// `quality-gate / qa` job; one source of truth so the two surfaces cannot
// drift.
//
// Input-format assumption: callers pipe `git diff --name-status` output
// through `parseGitNameStatus`. `--name-status` (not `--name-only`)
// matters because `--name-only` reports only the post-image path for
// renames — so a rename like `apps/public/src/main.tsx` → `README.md`
// would falsely classify as docs-only and bypass the full gate. The
// parser splits rename / copy lines (`R*` / `C*`) into both old and new
// paths so the classifier sees both. Repo-relative, LF-separated, tab
// columns. Whitespace and CR are trimmed defensively; a leading `./` is
// stripped before classification (git itself does not emit it, but
// stripping closes a would-be bypass if any wrapper ever re-adds the
// prefix).
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

// Parses `git diff --name-status` output into a flat list of paths,
// emitting BOTH preimage and postimage paths for rename (`R*`) and copy
// (`C*`) entries. The classifier requires both ends to be docs for the
// diff to be docs-only — otherwise a rename of `apps/public/src/main.tsx`
// to `README.md` would smuggle code-removal past the gate.
//
// Format reference (git docs, `--name-status`):
//   - Single-path entries: `<status>\t<path>`           (M / A / D / T / U / X)
//   - Two-path entries:    `<status><sim>\t<old>\t<new>` (R75, C100, …)
// Lines that do not match either shape are emitted as a single path
// (defensive: a future git-format change won't silently drop them and
// fail-open). Trailing CR / surrounding whitespace are tolerated.
export function parseGitNameStatus(text: string): string[] {
  const out: string[] = []
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '').trim()
    if (line.length === 0) {
      continue
    }
    const cols = line.split('\t')
    if (cols.length < 2) {
      out.push(line)
      continue
    }
    for (let i = 1; i < cols.length; i++) {
      const col = cols[i]
      if (col !== undefined && col.length > 0) {
        out.push(col)
      }
    }
  }
  return out
}
