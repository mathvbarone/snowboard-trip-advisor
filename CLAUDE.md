# CLAUDE.md

Instructions for agents working on the Snowboard Trip Advisor project.

## Setup

Run once after cloning:

```bash
npm install
npm run setup
```

`npm run setup` installs the pre-commit hook from `scripts/pre-commit` into `.git/hooks/`. The hook runs the full quality gate on every commit. Post-pivot, `npm run setup` also runs `scripts/generate-tokens.ts` to materialize the design-system CSS.

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

Several of these rules are enforced by ESLint.

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

- **Schema first:** update `packages/schema/` before any adapter, selector, or publisher when the data model changes. Every metric field must be listed in `METRIC_FIELDS`. (Pre-pivot: the same rule applies to `research/schema.ts` until `packages/schema/` exists.)
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

## Post-Pivot Rules (activate per-PR on `pivot/data-transparency`)

Each sub-rule below names the PR that activates it. Until that PR lands, the rule does not apply. On `main` (pre-pivot), none of these rules apply. PR numbers reference spec §9.

### Workspace Rules (active from PR 1.1)

- Package dependency graph: `schema` (leaf) ← `selectors` ← `design-system` ← `integrations`; `apps/*` consume all packages.
- `packages/design-system` never imports from `packages/selectors`.
- Cross-layer imports are blocked by ESLint `no-restricted-imports` configured in `eslint.config.js`.
- `tokens.css` is generated from `tokens.ts` (PR 1.4); hand edits fail the pre-commit hook.

### UI Code Rules (active from PR 1.4 for tokens; from PR 3.1 for `apps/public` paths)

- UI code imports styling only from `packages/design-system`.
- No raw CSS color values in `.tsx` files — use tokens.
- No inline style values that should be tokens.
- No raw HTML element imports where a design-system component exists.
- No deep imports into design-system internals — import only from the package root.
- No literal z-index or breakpoint px values — use tokens.

### Admin App Rules (active from PR 5.1)

- `apps/admin` is loopback-only; binds `127.0.0.1:5174` with `strictPort: true`.
- Never build `apps/admin` into a production container image.
- Admin UI is read-only below the `md` breakpoint; edit controls are removed from the tab order, not merely disabled.

### Integration Adapter Rules (active from PR 1.3 for the contract; from PR 6.1 for the dispatcher)

- All external HTTP goes through `packages/integrations/http/constrainedDispatcher.ts` (PR 6.1).
- Adapters never throw; they return `AdapterResult` (tagged union) — contract active from PR 1.3.
- `upstream_hash` is computed from raw bytes **before** parse.
- `RECORD_ALLOWED=true` gates fixture recording at process boot AND at the adapter level; mocks in `*.test.ts` are unconditionally allowed.
- Fixture PII redaction is a hard test requirement; redaction rules live alongside each adapter.

### Visual-Diff Workflow (active from PR 4.5 when visual regression wires up)

- PRs touching `apps/public/**` or `packages/design-system/tokens.ts` require a `visual:approve` label applied by a CODEOWNER before merge.
- Agents attach screenshots and request the label; do not self-approve.

### Migration / Hotfix Branch Rules (active from the merge of this spec into `pivot/data-transparency`)

- Schema-version bumps land on a `schema/vN-to-vN+1` branch with migration CLI + golden-fixture conversion; maintainer review required.
- Security hotfixes branch from the latest release tag, land on `main`, and propagate into `pivot/data-transparency` via the weekly `git merge main` (never rebase — branch protection requires non-fast-forward merges).
- Do not open a hotfix PR against `main` without explicit user authorization for the specific incident. Hotfixes bypass the `pivot/data-transparency` queue and have a wider blast radius than normal PRs.
