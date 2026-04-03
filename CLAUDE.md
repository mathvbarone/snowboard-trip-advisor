# CLAUDE.md

Instructions for agents working on the Snowboard Trip Advisor project.

## Setup

Run once after cloning:

```bash
npm install
npm run setup
```

`npm run setup` installs the pre-commit hook from `scripts/pre-commit` into `.git/hooks/`. The hook runs the full quality gate on every commit.

## Project Intent

Snowboard Trip Advisor is intended to become a decision-support marketplace for a snowboard trip organizer planning for a group.

The primary product goal is to help that organizer rank and shortlist resorts. The main comparison criteria are:

- riding quality first
- resort size
- current snow conditions
- lodging cost in the resort region

The system should be semi-opinionated. It should surface rankings and recommendations, but the reasoning behind them must remain inspectable.

Phase 1 is discovery-only and should route users to external providers for booking decisions. Future phases may expand toward live deal visibility.

Durable resort intelligence and live market signals must remain distinct in both architecture and documentation. They have different freshness, provenance, validation, and publishing requirements.

## Documentation Discipline

- `README.md` is the strategic product document for this repository and must stay aligned with the intended product direction.
- Any PR that introduces meaningful product-facing functionality must evaluate whether `README.md` needs an update.
- Any PR that changes product scope, user workflow, system boundaries, or roadmap direction must update `README.md` in the same branch.
- Treat README drift as a documentation bug, not optional cleanup.
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

- No `console` outside `research/cli.ts`.
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

- Schema first: update `research/schema.ts` before any normalizer, scorer, or publisher when the data model changes.
- Never bypass validation: published data must pass `validatePublishedDataset` before `publishDataset`.
- Config, not code: scoring thresholds and weights belong in `config/scoring.ts`.
- Provenance always: every published metric field must have a matching `field_sources` entry.

## Coverage Rules

- 100% coverage on lines, branches, functions, and statements is a hard gate.
- If a line cannot be tested, restructure the design instead of suppressing coverage.
- Coverage exclusions belong in `vite.config.ts` with a written rationale.
- Do not use `/* istanbul ignore */` comments.

## Excluded From Coverage

- Treat `vite.config.ts` as the source of truth for coverage exclusions; do not mirror the exact exclusion list here.
- If coverage exclusions change, update the config and keep this note aligned at a high level only.
