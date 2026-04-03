# CLAUDE.md Quality Gate Design

## Summary

Add a `CLAUDE.md` file and supporting tooling to enforce a strict, automated quality gate for the Snowboard Trip Advisor project. The gate combines a single `npm run qa` command with a version-controlled pre-commit hook. Both agents and humans are subject to the same gate — no commit can land without clean lint, typecheck, full test coverage, and 100% coverage thresholds passing.

## Goals

- Give agents clear, unambiguous instructions on quality requirements.
- Enforce 100% test coverage on `src/` and `research/` with hard Vitest thresholds.
- Apply the strictest practical ESLint ruleset for the TypeScript + React stack.
- Make the quality gate automatic via a pre-commit hook that cannot be bypassed.
- Exclude `.worktrees/` from all test discovery and coverage measurement.

## Non-Goals

- CI pipeline integration (deferred — the local gate is the priority).
- Per-file lint suppression comments (`// eslint-disable`).
- Coverage exemptions via `/* istanbul ignore */` comments.

## Files Created Or Modified

- `CLAUDE.md` — agent instructions
- `eslint.config.ts` — flat ESLint config
- `vite.config.ts` — updated with coverage and worktree exclusions
- `scripts/pre-commit` — version-controlled hook source
- `package.json` — new `lint`, `typecheck`, `coverage`, `qa`, and `setup` scripts

## New Dev Dependencies

- `eslint`
- `@eslint/js`
- `typescript-eslint`
- `eslint-plugin-react-hooks`
- `eslint-plugin-react-refresh`
- `@vitest/coverage-v8`

## Quality Gate Script

```
npm run qa
```

Runs in sequence, failing fast:

1. `eslint .` — lint all `.ts` and `.tsx` files
2. `tsc --noEmit` — typecheck with existing strict config
3. `vitest run --coverage` — run all tests with coverage enforcement

All three must exit zero for `qa` to pass.

## Pre-Commit Hook

Hook source lives at `scripts/pre-commit` and is installed into `.git/hooks/pre-commit` by running `npm run setup`. This makes the hook version-controlled and reproducible across clones and worktrees.

```sh
#!/bin/sh
npm run qa
```

Agents must not use `--no-verify` under any circumstances. The hook is a hard gate, not a suggestion.

## ESLint Configuration

Flat config format (`eslint.config.ts`, ESLint 9+).

### Scope

- Files: `**/*.{ts,tsx}` within `src/`, `research/`, `config/`
- Ignored: `dist/`, `node_modules/`, `.worktrees/`, `coverage/`

### Rule Sets

- `eslint:recommended`
- `typescript-eslint/strict` with type-aware rules enabled via `parserOptions.project`
- `eslint-plugin-react-hooks`
- `eslint-plugin-react-refresh`

### Type-Aware TypeScript Rules

- `@typescript-eslint/no-floating-promises: error`
- `@typescript-eslint/no-misused-promises: error`
- `@typescript-eslint/await-thenable: error`
- `@typescript-eslint/require-await: error`
- `@typescript-eslint/strict-boolean-expressions: error`
- `@typescript-eslint/no-unsafe-assignment: error`
- `@typescript-eslint/no-unsafe-call: error`
- `@typescript-eslint/no-unsafe-member-access: error`
- `@typescript-eslint/no-unsafe-return: error`
- `@typescript-eslint/explicit-function-return-type: error`
- `@typescript-eslint/consistent-type-imports: error`
- `@typescript-eslint/prefer-readonly: error`
- `@typescript-eslint/prefer-nullish-coalescing: error`
- `@typescript-eslint/prefer-optional-chain: error`
- `@typescript-eslint/no-shadow: error`

### Base ESLint Rules

- `no-console: error`
- `eqeqeq: error`
- `no-var: error`
- `prefer-const: error`
- `no-param-reassign: error`
- `no-implicit-coercion: error`
- `no-nested-ternary: error`
- `curly: error`
- `object-shorthand: error`
- `no-else-return: error`

### React Rules

- `react-hooks/rules-of-hooks: error`
- `react-hooks/exhaustive-deps: error`
- `react-refresh/only-export-components: error`

### Overrides

- `no-console: off` for `research/cli.ts` and `research/cli.test.ts` only — the CLI's correct output mechanism is `console`.

## Vitest Coverage Configuration

Added to `vite.config.ts`:

### Test Discovery

```ts
test: {
  exclude: ['node_modules', '.worktrees/**'],
}
```

Prevents `.worktrees/` test files from being discovered, eliminating double-counted tests and inflated coverage.

### Coverage Block

```ts
coverage: {
  provider: 'v8',
  include: ['src/**', 'research/**'],
  exclude: [
    'src/main.tsx',
    'src/test/**',
    'research/sources/fetchText.ts',
    'config/scoring.ts',
    '**/*.test.{ts,tsx}',
    '**/__fixtures__/**',
    '**/*.d.ts',
  ],
  thresholds: {
    lines: 100,
    branches: 100,
    functions: 100,
    statements: 100,
  },
  reporter: ['text', 'lcov'],
}
```

### Coverage Exclusion Rationale

- `src/main.tsx` — React DOM entry point, not unit-testable
- `research/sources/fetchText.ts` — pure network I/O, covered by integration context
- `config/scoring.ts` — pure config constants, exercised fully by scorer tests
- Test files, fixtures, and type declarations — not application code

Coverage exclusions are declared in the Vitest config, not inline in source files. No `/* istanbul ignore */` comments are permitted.

## CLAUDE.md Content Design

### 1. Quality Gate

The most prominent section. Requirements:

- Run `npm run setup` once after cloning to install the pre-commit hook.
- Run `npm run qa` and confirm clean output before claiming any task complete.
- Run `npm run qa` before every commit. The pre-commit hook enforces this automatically.
- Never use `git commit --no-verify`. This is prohibited without exception.
- A passing `npm run qa` is the definition of "done". No exceptions for partial coverage or lint warnings.

### 2. TDD Workflow

Every code change follows this order:

1. Write a failing test that describes the intended behavior.
2. Run the specific test file and confirm it fails for the right reason.
3. Write the minimal implementation to make the test pass.
4. Run the specific test file and confirm it passes.
5. Run `npm run qa` and confirm the full gate is clean.

No implementation code is written without a failing test first.

### 3. Code Rules

Agents must understand why the linter rejects code, not just that it does:

- All functions require explicit return types — inferred return types are not allowed on exported functions.
- Use `import type` for any import used only as a type.
- No `any` type under any circumstances. Use `unknown` and narrow it.
- No non-null assertions (`!`). Handle the null case explicitly.
- No unhandled promises. Every `async` call must be awaited or explicitly handled.
- Use `const` unless reassignment is required.
- No `console` outside `research/cli.ts`.
- No nested ternaries.
- Always use braces on conditionals.

### 4. Research Pipeline Rules

- Schema changes go first. If a field is added to the data model, update `research/schema.ts` before changing any normalizer, scorer, or publisher.
- The published dataset must pass `validatePublishedDataset` before `publishDataset` is called. Never bypass validation.
- Thresholds and weights live in `config/scoring.ts`. They must not be hardcoded in normalizers or scorers.

### 5. Coverage Rules

- 100% coverage on lines, branches, functions, and statements is a hard gate enforced by Vitest thresholds.
- If a line of code cannot be tested, the design is wrong — restructure rather than suppress.
- Coverage exclusions are declared in `vite.config.ts`. Inline suppression comments are not permitted.
- New files added to `src/` or `research/` are automatically in scope. Exclusions require an explicit addition to the config with a written rationale.

## Implementation Readiness

This design is ready for an implementation plan. The plan should cover:

1. Install new dev dependencies.
2. Write `eslint.config.ts`.
3. Update `vite.config.ts` with coverage and exclusions.
4. Add scripts to `package.json`.
5. Write `scripts/pre-commit` and `npm run setup`.
6. Fix any lint or coverage violations revealed by the new gate.
7. Write `CLAUDE.md`.
8. Run `npm run qa` clean and commit.
