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
  (lint → typecheck → coverage → test:hooks) on every PR.
- CI required status check `dco` — verifies every commit carries a
  `Signed-off-by:` trailer. Missing trailer fails the PR.
- Pre-commit hook — `npm run qa` runs before every local commit.
- PreToolUse:Bash hook — blocks `--no-verify` and `git push --force`
  (or `--force-with-lease` / `-f`) to `main`/`master`.
- PostToolUse:Edit|Write hook — lints the file just edited; violations
  surface in-loop so you can self-correct.
- CODEOWNERS — load-bearing paths require maintainer review.
- Branch protection — applied via `scripts/apply-branch-protection.sh`;
  `enforce_admins: true`.

Rule violations are reverted, not retroactively blessed. Read CLAUDE.md
before starting work.

The current spec is docs/superpowers/specs/2026-04-22-product-pivot-design.md.
Load-bearing decisions are recorded in docs/adr/.
EOF

# Surface a warning if the pre-commit hook is not installed locally.
if [ ! -x .git/hooks/pre-commit ]; then
  printf '\n'
  printf '⚠ Pre-commit hook is not installed locally. Run: npm run setup\n'
fi

# Surface branch + dirty-state so the agent has current git context.
if command -v git >/dev/null 2>&1 && [ -d .git ]; then
  branch="$(git branch --show-current 2>/dev/null || printf '?')"
  printf '\nBranch: %s\n' "$branch"
  if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    printf 'Uncommitted changes present. Run `git status` to inspect.\n'
  fi
fi

exit 0
