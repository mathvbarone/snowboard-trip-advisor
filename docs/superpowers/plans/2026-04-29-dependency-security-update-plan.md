# Dependency Security Update Plan (2026-04-29)

> **Scope of this PR.** This plan + the supporting runbook + dependency policy + ADR-0008 land together as a docs-only change. The implementation steps below ship as **separate stacked PRs** (one per concern), per the PR Sizing Discipline in `CLAUDE.md`. Nothing in this plan modifies CI, runtime code, or dependencies on its own.

## Goals

- Apply security patches quickly with low regression risk.
- Keep dependencies continuously up to date across all workspaces.
- Add guardrails so vulnerabilities are detected before merge and before release — without painting CI red on transient registry / advisory-API failures.

## Current State Review

### Monorepo + tooling shape

- npm workspaces at root: `apps/*`, `packages/*`.
- Node engine pinned at `>=20.11` (`package.json#engines.node`).
- Centralized dev toolchain at root (`vite`, `vitest`, `eslint`, `typescript`).
- App/package-level dependency sets are relatively lean.

### Observed blockers in this environment (codex sandbox, 2026-04-29)

- `npm outdated --all` failed with `403 Forbidden` against npm registry endpoints.
- `npm audit --json` failed with `403 Forbidden` on the advisory bulk endpoint.
- `npm` warned about a stale `http-proxy` env config.

**Implication:** dependency freshness / vulnerability data could not be pulled in this environment, so update planning must include registry / proxy remediation first. The runbook at [`docs/ops/dependency-registry-access.md`](../../ops/dependency-registry-access.md) captures the diagnostic checks.

## Risk-Based Update Strategy

### Phase 0 — Unblock package intelligence (same day)

1. Verify npm registry access from CI and local dev runners:
   - `npm config get registry`
   - `npm ping`
   - `npm whoami` (only if auth is required)
2. Fix or remove stale proxy configuration:
   - Check `.npmrc` (repo, user, global) and CI secret vars for `http-proxy` / `https-proxy`.
3. If using an internal registry mirror (Artifactory / Nexus / GH Packages), ensure:
   - npm advisories API passthrough is enabled.
   - scoped package rules for `@snowboard-trip-advisor/*` (when introduced) do not interfere with public packages.
4. Onboarding / incident handling: see [`docs/ops/dependency-registry-access.md`](../../ops/dependency-registry-access.md).

**Exit criteria:**

- `npm outdated --all` returns a package list instead of 403.
- `npm audit --json` returns actionable advisories.

### Phase 1 — Safe patch-first updates (same day once unblocked)

1. Generate baseline:
   - `npm ci`
   - `npm outdated --all --json > .tmp/outdated.json`
   - `npm audit --json > .tmp/audit.json`
2. Update patch + minor versions first:
   - `npm update --workspaces --include-workspace-root`
   - **Caveat:** this can churn the lockfile in non-obvious ways across hoisted vs nested deps. Review the lockfile diff in tier-by-tier chunks (runtime → tooling) before committing.
3. Run the full QA gate:
   - `npm run qa`
4. If audit still reports fixable vulnerabilities:
   - `npm audit fix` — **only when the resulting lockfile diff has been reviewed and the implicated packages' changelogs read.** Never run `npm audit fix --force` without a separate PR documenting the breaking changes.
   - rerun `npm run qa`
5. Commit the patch / minor upgrade set as a separate PR.

**Exit criteria:**

- No critical / high vulnerabilities remaining that have upstream fixes.
- QA green on lint, types, unit/integration, coverage, hooks.

### Phase 2 — Controlled major upgrades (1–3 days)

1. Prioritise majors by security impact and blast radius:
   - Tier 1: runtime deps in `apps/*` and shared `packages/*` (`react`, `react-dom`, `zod`, Radix).
   - Tier 2: build / test deps (`vite`, `vitest`, `eslint`, `typescript`, plugins).
2. Upgrade one ecosystem at a time (suggested order):
   1. TypeScript + typescript-eslint
   2. Vite + plugin-react
   3. Vitest + test libs
   4. ESLint + plugins
3. For each ecosystem:
   - update versions
   - run `npm ci && npm run qa`
   - document migration notes in PR description
4. Split into small PRs to simplify rollback.

**Exit criteria:**

- Selected major upgrades merged with passing QA and no open high-risk advisories.

## Continuous Up-to-Date Program

### CI gate (informational in Phase 1, enforced in Phase 2)

Decision recorded in [ADR-0008](../../adr/0008-dependency-security-ci-gate.md): a `dependency-security` workflow runs `npm audit --audit-level=high` daily and on dependency-touching PRs, but **runs `continue-on-error` in Phase 1** so a 403 from the advisory endpoint or a freshly-published advisory mid-PR doesn't block all merges against a single-maintainer repo. Phase 2 (multi-maintainer) flips it to a hard gate. The workflow itself ships in a follow-up PR after this docs-only set merges.

### Dependency drift visibility

Same workflow uploads an `npm outdated` artifact (non-blocking) so the maintainer has a snapshot of stale deps without grinding CI to a halt.

### Lockfile integrity

Already ensured: every workflow uses `npm ci` (not `npm install`), and `package-lock.json` is committed. No additional gate required — if the lockfile is out of sync, `npm ci` fails loudly.

### Automated update PRs

Dependabot will land in a follow-up PR. Two prerequisites:

1. **DCO trailer policy for bot commits.** The repo's required `dco` CI check rejects every commit lacking `Signed-off-by:`. Dependabot does not add DCO trailers by default. Resolve the policy before enabling Dependabot — see [`docs/ops/dependency-policy.md`](../../ops/dependency-policy.md#bot-pr-dco-policy) for the options.
2. **Workspace-aware grouping config.** Group security patches separately from non-security version bumps; allow group-level auto-merge only for patch security updates and only after `qa` passes.

### Governance

See [`docs/ops/dependency-policy.md`](../../ops/dependency-policy.md) for supported Node / npm versions, triage process, exception policy, and the bot-PR DCO policy. SLAs are deliberately phrased as best-effort rather than hard deadlines while the project is single-maintainer (Phase 1).

## Concrete Next Actions (each = a separate PR)

1. **PR (this one) — docs.** Plan + runbook + policy + ADR-0008 land together; no CI changes.
2. **PR — `npm audit` informational workflow.** Implements ADR-0008; only after Phase 0 verifies registry access from GitHub Actions runners.
3. **PR — Dependabot config.** Only after `docs/ops/dependency-policy.md#bot-pr-dco-policy` is resolved (workflow auto-amend, exemption, or maintainer-rebase policy).
4. **PR — baseline patch / minor upgrade set.** Run Phases 1 and (selectively) 2; one PR per ecosystem cluster.
5. **(Phase 2)** Flip the `dependency-security` workflow from `continue-on-error: true` to a hard gate once a second maintainer joins. Update ADR-0008's Status section to record the change.
