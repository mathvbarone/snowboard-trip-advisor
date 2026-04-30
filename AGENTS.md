# AGENTS.md

Instructions for all coding agents working on Snowboard Trip Advisor.

## Reading Order

Read these in order before making load-bearing changes:

1. This file
2. [docs/agent-discipline/enforcement-matrix.md](docs/agent-discipline/enforcement-matrix.md)
3. [docs/superpowers/specs/2026-04-22-product-pivot-design.md](docs/superpowers/specs/2026-04-22-product-pivot-design.md)
4. [docs/adr/0001-pivot-to-data-transparency.md](docs/adr/0001-pivot-to-data-transparency.md) and related ADRs for any touched subsystem

## Setup

Run once after cloning:

```bash
npm install
npm run setup
```

`npm run setup` installs the local git hooks from tracked repo scripts:

- [scripts/pre-commit](scripts/pre-commit)
- [scripts/prepare-commit-msg](scripts/prepare-commit-msg)

It also regenerates `packages/design-system/tokens.css`.

## Authority Model

- `AGENTS.md` is the canonical checked-in rules file for agent behavior in this repository.
- [CLAUDE.md](CLAUDE.md) is a compatibility shim for Claude-specific entrypoints and must point back here.
- Codex consumes `AGENTS.md` natively from the repository.
- The active committed runtime hook registration is still [`.claude/settings.json`](.claude/settings.json). Do not claim a repo-local Codex hook transport unless it actually exists in the repo.
- [docs/agent-discipline/enforcement-matrix.md](docs/agent-discipline/enforcement-matrix.md) is the current source of truth for which enforcement surfaces are active, planned, or local-only.

## Hard Rules

- Never use `git commit --no-verify`.
- Never force-push `main` or `master`.
- Run `npm run qa` before claiming work is complete and before every commit.
- Follow TDD: write a failing test, watch it fail, write the minimal fix, watch it pass.
- 100% line / branch / function / statement coverage is a hard gate.
- Every commit must carry a DCO trailer. The local `prepare-commit-msg` hook auto-appends one when git identity is configured; `git commit -s` is still acceptable.
- Rule violations are reverted, not retroactively approved.

## Mechanical Gates

These are active and load-bearing:

- CI `quality-gate / qa`
- CI `dco`
- local `pre-commit`
- local `prepare-commit-msg`
- Claude runtime hooks in [`.claude/settings.json`](.claude/settings.json)
- CODEOWNERS on enforcement surfaces
- drift check via `npm run check:agent-discipline-sync`

If a doc claims a gate exists but the enforcement matrix says otherwise, trust the enforcement matrix and fix the doc.

## PR Discipline

- One concern per PR.
- Prefer stacked PRs over bundled PRs when concerns depend on each other.
- Target reviewable diffs: roughly `<=300` added lines, `<=5` commits, `<=8` files changed unless dependency order makes that impossible.
- If a single reviewer cannot understand the diff in one sitting, split it.
- README updates ride with the feature PR that changes product behavior.

## Subagent Review Discipline

An independent critical subagent review is required before merge when a PR touches load-bearing paths such as:

- `AGENTS.md`, `CLAUDE.md`, `README.md`
- `docs/agent-discipline/**`
- `docs/superpowers/specs/**`
- `docs/adr/**`
- `.github/CODEOWNERS`, `.github/workflows/**`, `.github/pull_request_template.md`, `.github/BRANCH_PROTECTION.md`, `.github/dependabot.yml`
- `.claude/settings.json`
- `scripts/hooks/**`
- `scripts/pre-commit`
- `scripts/prepare-commit-msg`
- `scripts/install-git-hooks.mjs`
- `scripts/check-agent-discipline-sync.mjs`
- `package.json`
- `eslint.config.js`
- `packages/schema/**`

The review brief must include context, invariants to verify, grep targets, and an explicit instruction to be critical rather than validating.

CODEOWNERS is advisory in Phase 1. The required CODEOWNER review gate on `main` is deferred until a second maintainer joins, but load-bearing PRs still require the subagent review discipline above.

## Product Intent

Snowboard Trip Advisor is a data-transparency comparison tool for European ski resorts.

- No scoring, no ranking.
- Durable resort facts and live signals stay architecturally separate.
- Provenance is mandatory for every metric.
- Phase 1 is discovery-only; booking stays external.
- The `/api/*` contract is the Phase 1 to Phase 2 portability line.

## Code Rules

TypeScript:

- Explicit return types on functions.
- `import type` for type-only imports.
- No `any`.
- No non-null assertions.
- No unhandled promises.

Style:

- No `console` outside approved script/research paths.
- No nested ternaries.
- Braces on conditionals.
- Use `===`.
- No `var`.

React:

- Components return `JSX.Element` or `JSX.Element | null`.
- Import `JSX` type from `react`.
- Hook rule violations are errors.

## Data / Architecture Rules

- Schema first: update `packages/schema/` before adapters, selectors, or publishers when the model changes.
- Never bypass `validatePublishedDataset`.
- Every metric field must have a matching provenance entry in `field_sources`.
- UI code must use the design-system package and tokens rather than raw CSS values or deep imports.

## Coverage Rules

- 100% coverage on lines, branches, functions, and statements is a hard gate.
- If a line cannot be tested, restructure the design instead of suppressing coverage.
- Coverage exclusions belong in the owning workspace `vite.config.ts` with a written rationale.
- Do not use inline `/* istanbul ignore */` or equivalent suppression comments.

## Admin App Rules

- `apps/admin` is loopback-only and must bind `127.0.0.1:5174` with `strictPort: true`.
- Never build `apps/admin` into a production container image.
- Below the `md` breakpoint, admin edit controls are removed from the tab order rather than merely disabled.

## Integration Adapter Rules

- The adapter contract lives in `packages/integrations/contract.ts`; adapters return `AdapterResult` and do not throw.
- `upstream_hash` is computed from raw response bytes before parse.
- `RECORD_ALLOWED=true` gates fixture recording both at process boot and at the adapter boundary.
- Fixture PII redaction is mandatory and tested alongside each adapter.
- External HTTP must go through `packages/integrations/http/constrainedDispatcher.ts` once the integration layer uses live HTTP.

## Visual-Diff Workflow

- PRs touching `apps/public/**` or `packages/design-system/tokens.ts` require a `visual:approve` label from a CODEOWNER before merge.
- Agents attach screenshots and request the label; they do not self-approve.

## Migration / Hotfix Branch Rules

- Schema-version bumps land on a `schema/vN-to-vN+1` branch with migration CLI plus golden-fixture conversion and maintainer review.
- Security hotfixes branch from the latest release tag and land on `main` via PR.
- Never rebase `main`; branch protection requires non-fast-forward merges.
- Do not open a hotfix PR against `main` without explicit user authorization for the incident.

## Documentation Discipline

- `README.md` is the strategic product document and must stay aligned with product behavior.
- Architectural decisions get ADRs in `docs/adr/`.
- Treat documentation drift as a bug, not optional cleanup.

## Verification

Required commands before completion:

```bash
npm run qa
```

If you touch enforcement files, also run the targeted checks you changed and inspect the resulting diff for stale authority references.
