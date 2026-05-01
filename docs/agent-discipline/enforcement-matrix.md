# Enforcement Matrix

This file is the authoritative inventory of every mechanical gate that protects the Snowboard Trip Advisor rule base. If a doc claims a gate exists but this matrix says otherwise, **trust this matrix** and fix the doc.

## Status legend

- **active** — the gate fires today on real changes; bypassing it requires either explicit override (e.g. `--no-verify`, which is independently blocked) or breaking the gate's surface itself.
- **planned** — the gate is named in policy but its enforcing surface has not yet shipped.
- **claude-only-runtime** — the gate fires only when an agent runs the Claude Code runtime locally; the CI gates listed alongside cover non-Claude agents at PR time.
- **deferred** — the gate has shipped before but is intentionally relaxed in Phase 1; the lift condition is named.

## CI gates (run on every PR; cover all agents)

| Gate | Status | Surface | What it enforces |
|---|---|---|---|
| `quality-gate / qa` | active (required) | `.github/workflows/quality-gate.yml` (jobs.qa) calling `npm run qa` | Lint → typecheck → 100% coverage → tokens.css drift → hook scripts (`scripts/hooks/test-hooks.sh`) → workspace integration tests |
| `quality-gate / analyze` | active (informational) | `.github/workflows/quality-gate.yml` (jobs.analyze, `needs: qa`) calling `npm run analyze` | Build apps/public with `ANALYZE=1`; bundle-budget warn; preload-hrefs error; dist-dataset envelope error. Not yet on the required-status set; adoption deferred to Epic 6 branch-protection rebuild. |
| `dco` | active (required) | `.github/workflows/ci.yml` (jobs.dco) | Every non-merge commit in the PR carries a `Signed-off-by:` trailer. ADR-0009 exempts `dependabot[bot]` author + committer (exact email match). |
| `audit (informational)` | active (informational) | `.github/workflows/dependency-security.yml` | `npm audit --audit-level=high`. Non-blocking per ADR-0008. |
| `outdated report (non-blocking)` | active (informational) | `.github/workflows/dependency-security.yml` | Daily `npm outdated` snapshot uploaded as a CI artifact. |

## Local-commit gates (run on contributor's machine)

| Gate | Status | Surface | What it enforces |
|---|---|---|---|
| `pre-commit` | active | `scripts/pre-commit` installed by `npm run setup` into `$(git rev-parse --git-path hooks)/pre-commit` | Runs `npm run qa` before every commit. Blocks the commit if any step fails. |
| Token-drift check | active | `npm run tokens:check` (folded into `npm run qa`) | Hand edits to `packages/design-system/tokens.css` fail; the file is generated from `tokens.ts` via `scripts/generate-tokens.cli.ts`. |

## Claude Code runtime gates (claude-only-runtime)

These fire only when an agent runs against this repository through Claude Code locally. CI gates above cover the same failure classes for non-Claude agents at PR time. Registration lives in [`.claude/settings.json`](../../.claude/settings.json); script bodies under [`scripts/hooks/`](../../scripts/hooks/).

| Gate | Status | Surface | What it enforces |
|---|---|---|---|
| `PreToolUse:Bash` | active (claude-only-runtime) | `scripts/hooks/deny-dangerous-git.sh` | Blocks `--no-verify` anywhere; blocks `git push --force` / `--force-with-lease` / `-f` to `main` or `master`. The blocked call surfaces its reason to the agent for self-correction. |
| `PostToolUse:Edit\|Write` | active (claude-only-runtime) | `.claude/settings.json` ESLint runner | Runs targeted ESLint on the file just edited; violations surface in-loop so the agent self-corrects before commit. |
| `SessionStart` | active (claude-only-runtime) | `scripts/hooks/session-start-context.sh` | Auto-loads the enforcement summary + current branch state into the model's session context. Does not replace AGENTS.md; surfaces a compact pointer. |
| `PostToolUse:Bash` (post-pr-create reminder) | active (claude-only-runtime) | `.claude/settings.json` | After `gh pr create` succeeds, surfaces the per-PR workflow checklist (Codex review, local-test plan, fold cycle). |

## Branch-protection gates (apply to `main`)

| Gate | Status | Surface | What it enforces |
|---|---|---|---|
| Required `quality-gate / qa` | active | GitHub branch protection on `main` (`enforce_admins: true`) | PR cannot merge if `qa` is red; admins do not bypass. |
| Required `dco` | active | GitHub branch protection on `main` | PR cannot merge if `dco` is red. |
| Linear history | active | GitHub branch protection on `main` | No merge commits; squash- or rebase-merge only. |
| No force-push | active | GitHub branch protection on `main` | Both PreToolUse hook (local) and branch protection (server) block force-push. |
| No deletion | active | GitHub branch protection on `main` | `main` cannot be deleted by anyone, including admins. |
| Conversation resolution required | active | GitHub branch protection on `main` | All PR review threads must be resolved before merge. |
| Required CODEOWNER review | deferred (Phase 1) | Currently OFF on `main`; CODEOWNERS auto-requests reviewers but the gate doesn't block | Re-enables when a second maintainer joins. Re-apply via `gh api -X PUT repos/{owner}/{repo}/branches/main/protection ...` setting `required_pull_request_reviews.required_approving_review_count >= 1` and `require_code_owner_reviews: true`. Original protection JSON preserved at `/tmp/main-protection-pre-relax.json` for reference. |
| Required `quality-gate / analyze` | planned | Not on the required-status set today; analyze runs informationally | Adoption deferred to Epic 6's branch-protection script rebuild — same Phase-1 cadence as `qa`. |

## Discipline gates (humans-and-agents — not mechanically enforced today, but documented)

| Gate | Status | Surface | What it enforces |
|---|---|---|---|
| Subagent Review Discipline | active (discipline) | AGENTS.md "Subagent Review Discipline" section enumerates the trigger paths | Load-bearing changes get an independent critical subagent review; findings folded before maintainer review. Not mechanically enforced in Phase 1; Phase 2 (CODEOWNER review re-enabled) hardens this. |
| Atomic-PR sizing ceilings | active (discipline) | AGENTS.md "PR Sizing Discipline" section | ≤300 LOC / ≤5 commits / ≤8 files per PR. Reviewer enforces; no mechanical gate. |
| `--no-verify` ban | active (mechanical, multi-surface) | PreToolUse hook (local) + pre-commit hook itself runs qa unconditionally | The flag is mechanically blocked at the local-runtime level for Claude; for non-Claude agents the contributor cannot skip qa locally and `dco` catches it at PR time. |
| ADR-required-on-new-bot rule | active (discipline) | AGENTS.md Subagent Review Discipline + ADR-0009 precedent | Adding a new bot author (Renovate / Snyk / etc.) to `.github/dependabot.yml` requires its own ADR matching the ADR-0009 pattern. Drift checker (`scripts/check-agent-discipline-sync.{ts,mjs}` — planned) will mechanize this. |

## Drift-checker (planned)

`scripts/check-agent-discipline-sync.{ts,mjs}` and the `npm run check:agent-discipline-sync` script land in a separate stacked PR. Once shipped, the checker is wired into `npm run qa` and verifies:

- Symmetric authority claim: `AGENTS.md` asserts canonical AND `CLAUDE.md` points back to AGENTS.md.
- CI required-status-set vs `quality-gate.yml` jobs do not drift.
- Every bot author in `.github/dependabot.yml` has a matching ADR file.
- This enforcement matrix (the file you're reading) lists every CI job, hook, and branch-protection rule that actually exists.

Until the drift checker ships, the matrix is maintained by hand; the maintainer reads it as part of any subagent-review-triggered PR.
