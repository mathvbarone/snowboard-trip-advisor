# Dependency Security Update Plan (2026-04-29)

## Goals
- Apply all security patches quickly with low regression risk.
- Keep dependencies continuously up to date across all workspaces.
- Add guardrails so vulnerabilities are detected before merge and before release.

## Current State Review

### Monorepo + tooling shape
- npm workspaces at root: `apps/*`, `packages/*`.
- Node engine set to `>=20.11`.
- Centralized dev toolchain at root (`vite`, `vitest`, `eslint`, `typescript`).
- App/package-level dependency sets are relatively lean.

### Observed blockers in this environment
- `npm outdated --all` failed with `403 Forbidden` against npm registry endpoints.
- `npm audit --json` failed with `403 Forbidden` on advisory bulk endpoint.
- `npm` warns about an `http-proxy` env config that may break on future npm major versions.

Implication: dependency freshness/vulnerability data could not be pulled from npm in this environment, so update planning must include registry/proxy remediation first.

## Risk-Based Update Strategy

### Phase 0 — Unblock package intelligence (same day)
1. Verify npm registry access from CI and local dev runners:
   - `npm config get registry`
   - `npm ping`
   - `npm whoami` (if auth is required)
2. Fix or remove stale proxy configuration:
   - Check `.npmrc` (repo, user, global) and CI secret vars for `http-proxy`/`https-proxy`.
3. If using an internal registry mirror (Artifactory/Nexus/GH Packages), ensure:
   - npm advisories API passthrough is enabled.
   - scoped package rules for `@snowboard-trip-advisor/*` do not interfere with public packages.
4. Add a short runbook in repo (`docs/ops/dependency-registry-access.md`) for onboarding and incident handling.

Exit criteria:
- `npm outdated --all` returns package list instead of 403.
- `npm audit --json` returns actionable advisories.

### Phase 1 — Safe patch-first updates (same day once unblocked)
1. Generate baseline:
   - `npm ci`
   - `npm outdated --all --json > .tmp/outdated.json`
   - `npm audit --json > .tmp/audit.json`
2. Update patch + minor versions first:
   - `npm update --workspaces --include-workspace-root`
3. Run full QA gate:
   - `npm run qa`
4. If audit still reports fixable vulnerabilities:
   - `npm audit fix`
   - rerun `npm run qa`
5. Commit patch/minor upgrade set separately.

Exit criteria:
- No critical/high vulnerabilities remaining that have upstream fixes.
- QA green on lint, types, unit/integration, coverage, hooks.

### Phase 2 — Controlled major upgrades (1–3 days)
1. Prioritize majors by security impact and blast radius:
   - Tier 1: runtime deps in `apps/*` and shared `packages/*` (`react`, `react-dom`, `zod`, Radix).
   - Tier 2: build/test deps (`vite`, `vitest`, `eslint`, `typescript`, plugins).
2. Upgrade one ecosystem at a time (example order):
   1) TypeScript + typescript-eslint
   2) Vite + plugin-react
   3) Vitest + test libs
   4) ESLint + plugins
3. For each ecosystem:
   - update versions
   - run `npm ci && npm run qa`
   - document migration notes in PR description
4. Split into small PRs to simplify rollback.

Exit criteria:
- All selected major upgrades merged with passing QA and no open high-risk advisories.

## Continuous Up-to-Date Program

### Automation in CI
1. Add a dedicated dependency security workflow (daily schedule + PR trigger):
   - `npm ci`
   - `npm audit --audit-level=high`
   - fail build on high/critical vulnerabilities.
2. Add a second workflow for dependency drift visibility:
   - `npm outdated --all` (non-blocking report artifact)
   - trend report in job summary.
3. Add lockfile integrity check:
   - ensure `npm ci` is used in CI and lockfile changes are committed.

### Automated update PRs
1. Enable Dependabot or Renovate for npm workspaces:
   - Daily cadence for security updates.
   - Weekly grouped non-security updates.
   - Separate major updates per ecosystem.
2. Auto-label PRs by risk (`security`, `patch`, `minor`, `major`, `dev-tooling`).
3. Require green `qa` before auto-merge.
4. Optional: allow auto-merge for patch security updates only.

### Governance
1. Define dependency SLAs:
   - Critical: remediate < 24h
   - High: < 3 business days
   - Medium: < 14 days
2. Monthly maintenance window for majors and deferred upgrades.
3. Maintain `docs/ops/dependency-policy.md` with:
   - supported Node/npm versions
   - triage process
   - exception policy and sign-off.

## Concrete Next Actions
1. Fix registry/proxy 403 issues in CI and developer environments.
2. Run baseline outdated + audit capture and attach artifacts.
3. Ship patch/minor + audit-fix PR immediately.
4. Stand up Dependabot/Renovate with workspace-aware config.
5. Add CI security gate (`npm audit --audit-level=high`) and enforce on default branch.
