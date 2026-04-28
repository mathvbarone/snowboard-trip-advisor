# CLAUDE.md

Instructions for agents working on the Snowboard Trip Advisor project.

## Setup

Run once after cloning:

```bash
npm install
npm run setup
```

`npm run setup` installs the pre-commit hook from `scripts/pre-commit` into `.git/hooks/`. The hook runs the full quality gate on every commit. Post-pivot, `npm run setup` also runs `scripts/generate-tokens.ts` to materialize the design-system CSS.

## Enforcement Layers

The rules in this file are not suggestions. They are backed by mechanical gates that fire before content lands in git:

- **CI required status check `quality-gate / qa`** — runs `npm run qa` (lint → typecheck → coverage → test:hooks) on every PR. PR cannot merge if red.
- **CI required status check `dco`** — verifies every commit in the PR carries a `Signed-off-by:` trailer. Missing trailer fails the PR.
- **Pre-commit hook** — `npm run qa` runs before every local commit (`scripts/pre-commit`, installed by `npm run setup`).
- **Claude Code `PreToolUse:Bash` hook** — blocks `--no-verify` anywhere and `git push --force` (or `--force-with-lease` / `-f`) to `main`/`master` (`scripts/hooks/deny-dangerous-git.sh`). A blocked call surfaces the reason to the agent; adjust, don't retry.
- **Claude Code `PostToolUse:Edit|Write` hook** — runs targeted ESLint on the file just edited; violations surface while the agent is still in the loop.
- **Claude Code `SessionStart` hook** — auto-loads this enforcement summary and current branch state at the start of every session.
- **CODEOWNERS** — `.github/CODEOWNERS` lists ownership for every load-bearing path. In Phase 1 (single-maintainer) it is **advisory** — it auto-requests review and signals which paths trigger the Subagent Review Discipline below. The hard *required-review-before-merge* gate on `main` is **deferred until a second maintainer joins** the project. To re-enable: one `gh api -X PUT repos/{owner}/{repo}/branches/main/protection ...` call setting `required_pull_request_reviews.required_approving_review_count >= 1` and `require_code_owner_reviews: true`; the original `main` protection JSON is preserved at `/tmp/main-protection-pre-relax.json` for reference.
- **Branch protection** — `main` requires passing status checks (`quality-gate / qa`, `dco`), signed/DCO-trailed commits, linear history, no force-push, no deletion, and conversation resolution; `enforce_admins: true` so admin status confers no bypass. Required-review is *off* in Phase 1 per the bullet above. (Re-applying branch protection by script is a follow-up Epic 6 task; the original `scripts/apply-branch-protection.sh` was lost in pre-Epic-1 cleanup.)

**Rule violations are reverted, not retroactively approved.** The agent that broke a rule writes a follow-up PR explaining the failure mode.

**Known gap (non-blocking):** the px-literal ESLint selector (banning literal `px` values inside `style={{ }}` objects + CSS-in-JS template literals; full rule catalog in spec §6.3) is **deferred to Epic 3 PR 3.1**, when `apps/public` first uses inline styles and the rule has actual violations to validate against.

## Subagent Review Discipline

Load-bearing changes require an independent general-purpose subagent review before merge. The trigger is **mechanical** — any PR that touches one of these paths qualifies:

- `CLAUDE.md`
- `README.md`
- `docs/superpowers/specs/**`
- `docs/adr/**`
- `.github/CODEOWNERS`, `.github/workflows/**`, `.github/pull_request_template.md`, `.github/BRANCH_PROTECTION.md`
- `.claude/settings.json`
- `scripts/hooks/**`
- `scripts/apply-branch-protection.sh`
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

## Quality Gate

The quality gate is a hard requirement. A task is not done until `npm run qa` passes cleanly.

```bash
npm run qa
```

This runs in sequence and fails fast:

1. `npm run lint`
2. `npm run typecheck`
3. `npm run coverage`

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
- No literal z-index or breakpoint px values — use tokens. (The px-literal selector itself lands with Epic 3 PR 3.1 — see "Known gap" above.)

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
