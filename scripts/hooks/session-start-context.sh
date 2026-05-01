#!/bin/sh
# .claude/settings.json → SessionStart hook
#
# Injects current enforcement status and branch state into the agent's
# context at session start. Non-blocking — stdout becomes additional
# context; stderr is discarded.

cat <<'EOF'
## Enforcement status (auto-loaded at session start)

This repo enforces its rules with mechanical gates, not convention:

- CI required status check `quality-gate / qa` — runs `npm run qa`
  (lint → typecheck → coverage → tokens:check → test:hooks
  → test:integration → check:agent-discipline-sync) on every PR.
- CI required status check `dco` — verifies every commit carries a
  `Signed-off-by:` trailer. Missing trailer fails the PR.
- CI status check `quality-gate / analyze` — bundle-budget warn +
  preload-hrefs error + dist-dataset error (informational; not on
  the required-status set today).
- Pre-commit hook — `npm run qa` runs before every local commit.
- Prepare-commit-msg hook — auto-appends a DCO `Signed-off-by:`
  trailer when git identity is configured.
- PreToolUse:Bash hook — blocks `--no-verify` and `git push --force`
  (or `--force-with-lease` / `-f`) to `main`/`master`.
- PostToolUse:Edit|Write hook — lints the file just edited; violations
  surface in-loop so you can self-correct.
- CODEOWNERS — advisory in Phase 1; load-bearing paths still trigger
  the Subagent Review Discipline and maintainer review requests.
- AGENTS.md — canonical checked-in rules file for all agents.
- check:agent-discipline-sync — drift gate against AGENTS.md ↔
  CLAUDE.md pointer integrity and bot/ADR pairing.

Rule violations are reverted, not retroactively blessed. Read AGENTS.md
before starting work.

The current spec is docs/superpowers/specs/2026-04-22-product-pivot-design.md.
Load-bearing decisions are recorded in docs/adr/.
EOF

# Surface a warning if either managed git hook is not installed locally.
# `git rev-parse --git-path hooks` returns the active hooks directory and
# correctly handles linked worktrees (where `.git` is a file pointer, not
# a directory) by resolving to the common-dir's hooks folder.
hooks_dir="$(git rev-parse --git-path hooks 2>/dev/null || printf '.git/hooks')"
if [ ! -x "$hooks_dir/pre-commit" ] || [ ! -x "$hooks_dir/prepare-commit-msg" ]; then
  printf '\n'
  printf '⚠ Local git hooks are not fully installed. Run: npm run setup\n'
fi

# Surface branch + dirty-state so the agent has current git context.
# Use `git rev-parse --git-dir` rather than `[ -d .git ]` so this works
# inside linked worktrees (where `.git` is a file pointer, not a directory).
if command -v git >/dev/null 2>&1 && git rev-parse --git-dir >/dev/null 2>&1; then
  branch="$(git branch --show-current 2>/dev/null || printf '?')"
  printf '\nBranch: %s\n' "$branch"
  if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    printf 'Uncommitted changes present. Run `git status` to inspect.\n'
  fi
fi

exit 0
