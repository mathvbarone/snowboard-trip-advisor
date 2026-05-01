# AGENTS.md

Canonical instructions for all coding agents working on the Snowboard Trip Advisor project.

This file is the authoritative rule book for any agent (Claude Code, Codex, Gemini CLI, future entrants) operating on this repository. [`CLAUDE.md`](CLAUDE.md) is a Claude-specific compatibility shim that points back here and adds Claude-runtime notes only.

## Reading Order

Read these in order before making load-bearing changes:

1. This file — full rules.
2. [`docs/agent-discipline/enforcement-matrix.md`](docs/agent-discipline/enforcement-matrix.md) — which gates are active vs. planned, mapped to their enforcement surface.
3. [`docs/superpowers/specs/2026-04-22-product-pivot-design.md`](docs/superpowers/specs/2026-04-22-product-pivot-design.md) — product spec.
4. [`docs/superpowers/handoffs/`](docs/superpowers/handoffs/) — most recent post-milestone handoff for current state on `main`.
5. [`docs/adr/`](docs/adr/) — ADRs for any subsystem you're touching.

## Setup

Run once after cloning:

```bash
npm install
npm run setup
```

`npm run setup` installs the local git hooks from tracked repo scripts (`scripts/pre-commit` into `.git/hooks/pre-commit`) and regenerates `packages/design-system/tokens.css`.

## Authority Model

- `AGENTS.md` (this file) is the canonical rule book. All code-affecting decisions cite this file or downstream artifacts (specs, ADRs, the enforcement matrix).
- [`CLAUDE.md`](CLAUDE.md) is a Claude-specific compatibility shim. It MUST point back here. It MAY add Claude-runtime notes (the `.claude/settings.json` hook registration; the SessionStart context script).
- If `CLAUDE.md` and `AGENTS.md` ever conflict on a substantive rule, treat `AGENTS.md` as authoritative and fix the drift in the same branch.
- The Claude runtime hooks committed to [`.claude/settings.json`](.claude/settings.json) implement several gates listed below (PreToolUse, PostToolUse, SessionStart). A Codex-equivalent runtime hook surface does not exist in this repo today; the enforcement matrix flags those gates as Claude-only at runtime.

## Enforcement Layers

The rules in this file are not suggestions. They are backed by mechanical gates that fire before content lands in git:

- **CI required status check `quality-gate / qa`** — runs `npm run qa` (lint → typecheck → coverage → tokens:check → test:hooks → test:integration) on every PR. PR cannot merge if red.
- **CI required status check `dco`** — verifies every commit in the PR carries a `Signed-off-by:` trailer. Missing trailer fails the PR.
- **CI status check `quality-gate / analyze`** — runs `npm run analyze` (build + bundle-budget warn + preload-hrefs error + dist-dataset error). Not yet on the required-status set; adoption deferred to Epic 6 branch-protection rebuild.
- **Pre-commit hook** — `npm run qa` runs before every local commit (`scripts/pre-commit`, installed by `npm run setup`).
- **PreToolUse:Bash hook** (Claude runtime; `scripts/hooks/deny-dangerous-git.sh`) — blocks `--no-verify` anywhere and `git push --force` (or `--force-with-lease` / `-f`) to `main`/`master`. A blocked call surfaces the reason to the agent; adjust, don't retry.
- **PostToolUse:Edit|Write hook** (Claude runtime) — runs targeted ESLint on the file just edited; violations surface while the agent is still in the loop.
- **PostToolUse:Bash hook** (Claude runtime; post-pr-create reminder) — after `gh pr create` succeeds, surfaces the per-PR workflow checklist (Codex review request, local-test plan generation, fold cycle).
- **SessionStart hook** (Claude runtime; `scripts/hooks/session-start-context.sh`) — auto-loads this enforcement summary and current branch state at session start.
- **CODEOWNERS** — `.github/CODEOWNERS` lists ownership for every load-bearing path. In Phase 1 (single-maintainer) it is **advisory** — it auto-requests review and signals which paths trigger the Subagent Review Discipline below. The hard *required-review-before-merge* gate on `main` is **deferred until a second maintainer joins** the project. To re-enable: one `gh api -X PUT repos/{owner}/{repo}/branches/main/protection ...` call setting `required_pull_request_reviews.required_approving_review_count >= 1` and `require_code_owner_reviews: true`; the original `main` protection JSON is preserved at `/tmp/main-protection-pre-relax.json` for reference.
- **Branch protection** — `main` requires passing status checks (`quality-gate / qa`, `dco`), signed/DCO-trailed commits, linear history, no force-push, no deletion, and conversation resolution; `enforce_admins: true` so admin status confers no bypass. Required-review is *off* in Phase 1 per the bullet above. (Re-applying branch protection by script is a follow-up Epic 6 task; the original `scripts/apply-branch-protection.sh` was lost in pre-Epic-1 cleanup — the file is still listed in CODEOWNERS as a placeholder, intentionally.)

**Rule violations are reverted, not retroactively approved.** The agent that broke a rule writes a follow-up PR explaining the failure mode.

## Subagent Review Discipline

Load-bearing changes require an independent general-purpose subagent review before merge. The trigger is **mechanical** — any PR that touches one of these paths qualifies:

- `AGENTS.md`, `CLAUDE.md`, `README.md`
- `docs/agent-discipline/**`
- `docs/superpowers/specs/**`
- `docs/adr/**`
- `.github/CODEOWNERS`, `.github/workflows/**`, `.github/pull_request_template.md`, `.github/BRANCH_PROTECTION.md`, `.github/dependabot.yml` (and any future bot-config file under `.github/` — adding a new bot also requires its own ADR per [ADR-0009](docs/adr/0009-dco-exemption-for-dependabot.md))
- `.claude/settings.json`
- `scripts/hooks/**`
- `scripts/pre-commit`, `scripts/prepare-commit-msg`
- `scripts/install-git-hooks.{ts,mjs}` (when introduced)
- `scripts/check-agent-discipline-sync.{ts,mjs}` (when introduced)
- `scripts/apply-branch-protection.sh` (when restored)
- `eslint.config.js`
- `packages/schema/**`
- `packages/schema/api/**` contract schemas (once they exist)

The review brief must include: context, the load-bearing invariants to verify, specific things to grep for, and an explicit instruction to be critical (not validating). Fold findings into a follow-up commit on the same PR branch before requesting maintainer review.

If a trigger path is touched but no subagent review was run, document why in the PR description. (In Phase 2 — once the required-CODEOWNER-review gate is re-enabled on `main` — this becomes a hard merge block; today it is a discipline note for the maintainer.)

## Project Intent

Snowboard Trip Advisor is a **data-transparency comparison tool** for European ski resorts, built for a snowboard trip organizer choosing resorts for a group.

Core principles:

- **No scoring, no ranking.** The product surfaces durable resort facts and live market signals side-by-side with visible source provenance (`source`, `observed_at`, `fetched_at`). The user ranks the shortlist themselves.
- **Durable vs live is architecturally separate.** Durable resort intelligence (terrain, size, structural attributes) and live market signals (snow conditions, lift-pass pricing, lodging samples) have different freshness, validation, and publishing rules. Keep them split in schema, storage, and documentation.
- **Provenance is not optional.** Every metric field carries a matching `field_sources` entry with source, URL, `observed_at`, `fetched_at`, `upstream_hash`, and attribution block. `validatePublishedDataset` enforces this at publish time.
- **Phase 1 is discovery-only.** Route users to external providers for booking; no checkout, no affiliate transactions.
- **Phase 2 extends, does not replace.** The `/api/*` contract defined by the admin app is the stable portability line across Phase 1 → Phase 2.

Full product spec: [`docs/superpowers/specs/2026-04-22-product-pivot-design.md`](docs/superpowers/specs/2026-04-22-product-pivot-design.md). Pivot rationale: [`docs/adr/0001-pivot-to-data-transparency.md`](docs/adr/0001-pivot-to-data-transparency.md).

## Documentation Discipline

- `README.md` is the strategic product document and must stay aligned with the current product direction.
- Any PR that changes product scope, user workflow, system boundaries, or roadmap direction must update `README.md` in the same branch.
- Any PR that introduces meaningful product-facing functionality must evaluate whether `README.md` needs an update.
- Treat README drift as a documentation bug, not optional cleanup.
- Decisions with architectural consequence get an ADR in `docs/adr/` (MADR-style, numbered).
- **After an epic / milestone PR merges to `main`**, run the post-epic doc-prune playbook at [`docs/superpowers/skills/pruning-done-work-references.md`](docs/superpowers/skills/pruning-done-work-references.md) before starting the next epic. The playbook trims done-work descriptions in the spec / agent-rules, deletes stale untracked plan/handoff scratchpads, and writes a fresh tracked post-milestone handoff. Don't let detailed PR-by-PR instructions for completed work accumulate in agent context.

## PR Sizing Discipline

PRs land **one atomic, reviewable concern at a time**. A "concern" is one new component, one hook, one bug fix, one doc update — not a multi-step plan task bundled into a single branch.

**Concrete rules:**

- **One concern per PR.** A multi-step plan task that adds N components / hooks / dialogs ships as N separate PRs, not as one PR with N commits. Each gets its own branch, its own PR, its own review cycle, its own merge.
- **Hard ceilings:** target ≤300 lines added (excluding generated files / lockfiles), ≤5 commits, ≤8 files changed. If a PR exceeds any of these, split before opening unless every commit demonstrably depends on the previous one (and even then, prefer stacked PRs over a single bundle).
- **Stacked PRs over bundled PRs.** When concerns have a hard dependency order (e.g. design-system primitive → consumer view), open the foundation PR first, then open the dependent PR with `--base <foundation-branch>` so reviewers see only the dependent's diff. When the foundation merges, the dependent's diff against `main` becomes correct automatically.
- **Plan tasks are NOT PR units.** Spec/plan documents may describe a task with N substeps; the substeps map to N PRs, not one. The plan's "Task 5 — Steps 5.1 through 5.10" shape is a delivery plan, not a PR boundary.
- **README + memory updates ride with the feature PR.** Don't separate them. The feature and its docs land together so reviewers see the product-facing change in context.
- **Reviewability test:** if a single reviewer can't read the entire diff in one sitting and form a confident "approve / changes" verdict, the PR is too big.

**Why:** large bundled PRs are hard to review, hard to revert, and hard to stage. Atomic PRs catch issues earlier (smaller surface = denser review attention), keep CI feedback loops fast, and let the maintainer cherry-pick what merges and when. Code is frequently agent-generated on this project; agents have no organic instinct against bundling, so the rule is mechanical.

**How to apply:** when planning work, decompose by concern before opening any branch. The `superpowers:writing-plans` and `superpowers:subagent-driven-development` skills produce plans whose tasks are *coordination units*, not PR units — split each task into atomic PRs at execution time.

**Stacked-PR phantom-merge hazard:** when stacking via `gh pr create --base <other-branch>`, confirm via `gh pr view <stacked-PR> --json baseRefName,mergeCommit` after the parent PR merges. If `baseRefName` points to a now-deleted branch and the stacked PR's `mergeCommit.oid` is not reachable from `main`, the diff was lost — re-apply with `git cherry-pick` onto a fresh branch off main. GitHub's "MERGED" badge on a stacked PR after its base is deleted is a false positive in this scenario. See Epic 3 spec §10.8 for the worked example.

## Quality Gate

The quality gate is a hard requirement. A task is not done until `npm run qa` passes cleanly.

```bash
npm run qa
```

This runs in sequence and fails fast:

1. `npm run lint`
2. `npm run typecheck`
3. `npm run coverage`
4. `npm run tokens:check` (drift check on the generated `packages/design-system/tokens.css`)
5. `npm run test:hooks` (`scripts/hooks/test-hooks.sh` — both `node --test` unit tests and bash integration tests for the hook scripts)
6. `npm run test:integration` (workspace-scoped integration tests)

Rules:

- Run `npm run qa` before claiming any task complete.
- Run `npm run qa` before every commit. The pre-commit hook enforces this automatically.
- Never use `git commit --no-verify`.
- A passing `npm run qa` is the definition of done.

## TDD Workflow

Every code change follows this order:

1. Write a failing test that describes the intended behavior.
2. Run the specific test file and confirm it fails for the right reason.
3. Write the minimal implementation to make the test pass.
4. Run the specific test file and confirm it passes.
5. Run `npm run qa` and confirm the full gate is clean.

No implementation code is written without a failing test first.

## Code Rules

Several of these rules are enforced by ESLint. **All ESLint rules ship at `severity: 'error'` from Day 1.** No `warn`-level rules, no "add when it becomes a problem" stance. Strict lint is a load-bearing discipline for this project because code is frequently agent-generated; a rule that isn't enforced is a rule that will drift silently. Full rule catalog and rationale in spec §6.3.

TypeScript:

- All functions require explicit return types.
- Use `import type` for type-only imports.
- Do not use `any`.
- Do not use non-null assertions.
- Do not leave promises unhandled. Await them or mark them with `void`.
- Use `const` unless reassignment is required.
- Prefer `??` over `||` for nullish coalescing.
- Prefer optional chaining over chained `&&` guards.

Style:

- No `console` outside `research/cli.ts`, `research/migrate/*.ts`, and scripts under `scripts/`.
- No nested ternaries.
- Always use braces on conditionals.
- Use object shorthand.
- No `else` after a `return`.
- Always use `===`.
- Do not use `var`.

React:

- Components must have explicit `JSX.Element` or `JSX.Element | null` return types.
- Import the JSX type with `import type { JSX } from 'react'`.
- Hook rule violations are errors.

## Research Pipeline Rules

- **Schema first:** update `packages/schema/` before any adapter, selector, or publisher when the data model changes. Every metric field must be listed in `METRIC_FIELDS`.
- **Never bypass validation:** published data must pass `validatePublishedDataset` before `publishDataset`.
- **Provenance always:** every `METRIC_FIELDS` entry must have a matching `field_sources` entry with `source`, `observed_at`, `fetched_at`, `upstream_hash`, and `attribution_block`. `validatePublishedDataset` enforces coverage.

## DCO / Commit Sign-Off

- Every commit must be signed off: `git commit -s` (adds the `Signed-off-by:` trailer).
- Configure `user.email` before first commit on a new worktree.
- `--no-verify` is forbidden — it bypasses both DCO sign-off and the quality gate.

## Coverage Rules

- 100% coverage on lines, branches, functions, and statements is a hard gate.
- If a line cannot be tested, restructure the design instead of suppressing coverage.
- Coverage exclusions belong in the workspace's `vite.config.ts` with a written rationale. Post-pivot, each `packages/*/vite.config.ts` and `apps/*/vite.config.ts` owns its own exclusion list.
- Do not use `/* istanbul ignore */` comments.
- When deleting a file, remove its entry from the owning workspace's coverage exclusion list in the same PR.

## Excluded From Coverage

- Treat the workspace's `vite.config.ts` as the source of truth for coverage exclusions; do not mirror the exact exclusion list here.
- If coverage exclusions change, update the config and keep this note aligned at a high level only.

## Workspace & Architecture Rules

- Package dependency graph: `schema` (leaf; carries `loadResortDataset` + `ResortView` projection) ← `design-system`; `schema` ← `integrations`; `apps/*` consume all packages.
- Cross-layer imports are blocked by standard ESLint `no-restricted-imports` in `eslint.config.js`.
- `packages/design-system/tokens.css` is generated from `tokens.ts`; hand edits fail the pre-commit hook (drift check via `npm run tokens:check`).

## UI Code Rules

- UI code imports styling only from `packages/design-system`.
- No raw CSS color values in `.tsx` files — use tokens.
- No inline style values that should be tokens.
- No raw HTML element imports where a design-system component exists.
- No deep imports into design-system internals — import only from the package root.
- No literal z-index or breakpoint px values — use tokens.

**Known gap (non-blocking):** the px-literal ESLint selector (banning literal `px` values inside `style={{ }}` objects + CSS-in-JS template literals; full rule catalog in spec §6.3) is **deferred to Epic 3 PR 3.1**, when `apps/public` first uses inline styles and the rule has actual violations to validate against. Until then the rule above is enforced by reviewer discipline only.

## Admin App Rules (lands with Epic 4)

- `apps/admin` is loopback-only; binds `127.0.0.1:5174` with `strictPort: true`.
- Never build `apps/admin` into a production container image.
- Admin UI is read-only below the `md` breakpoint; edit controls are removed from the tab order, not merely disabled.

## Integration Adapter Rules

- The adapter contract (`Adapter<S>`, `AdapterResult`) lives in `packages/integrations/contract.ts`. Adapters never throw; they return `AdapterResult` (tagged union).
- `upstream_hash` is computed from raw response bytes **before** parse.
- `RECORD_ALLOWED=true` gates fixture recording at process boot AND at the adapter level; mocks in `*.test.ts` are unconditionally allowed.
- Fixture PII redaction is a hard test requirement; redaction rules live alongside each adapter.
- All external HTTP must go through `packages/integrations/http/constrainedDispatcher.ts` once it lands (Epic 5 PR 5.1 baseline; PR 5.2 adds DNS pin / canonicalization / redirect re-check alongside the first real HTTP-issuing adapter).

## Visual-Diff Workflow (lands with Epic 6 PR 6.3)

- PRs touching `apps/public/**` or `packages/design-system/tokens.ts` require a `visual:approve` label applied by a CODEOWNER before merge.
- Agents attach screenshots and request the label; do not self-approve.

## Migration / Hotfix Branch Rules

- Schema-version bumps land on a `schema/vN-to-vN+1` branch with migration CLI + golden-fixture conversion; maintainer review required.
- Security hotfixes branch from the latest release tag and land on `main` via PR. Never rebase `main`; branch protection requires non-fast-forward merges.
- Do not open a hotfix PR against `main` without explicit user authorization for the specific incident — hotfixes bypass the normal review cadence and have a wider blast radius than feature PRs.
- (Spec §10.4 originally described a long-lived `pivot/data-transparency` integration branch with weekly `git merge main` propagation. That strategy was never enacted; Phase 1 ships feature branches directly to `main`. If a future epic reintroduces a long-lived branch, update both this section and §10.4 in the same PR.)
