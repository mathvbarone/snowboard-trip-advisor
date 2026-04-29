# Dependency Registry Access Runbook

## Purpose

Use this runbook when dependency commands (`npm ci`, `npm outdated`, `npm audit`) fail with registry or advisory API errors.

## Fast checks

1. `npm config get registry`
2. `npm ping`
3. `npm whoami` (only if auth is expected)
4. `npm config list`

## Common failure: `403 Forbidden`

### Symptoms

- `npm outdated --all` fails with 403.
- `npm audit --json` fails posting to the advisories endpoint.

### Checks

- Verify `.npmrc` at repo, user, and global scopes.
- Verify CI secrets and env vars for `http-proxy` / `https-proxy`.
- If using an internal mirror / proxy (Artifactory, Nexus, GH Packages):
  - ensure npmjs.org package metadata is proxied;
  - ensure the security-advisories endpoint passthrough is enabled;
  - ensure scope rules for internal packages do not block public-package resolution.

## Expected healthy behaviour

- `npm ci` succeeds.
- `npm outdated --all` returns the package table.
- `npm audit --json` returns advisory JSON.

## Escalation

If the fast checks pass but the 403 persists:

1. Open an issue with the `infra` label.
2. Attach:
   - the failing CI log (or local command output, with timestamps);
   - `npm config get registry` output;
   - `npm ping` output;
   - the proxy / `.npmrc` configuration in scope (with secrets redacted).
3. Tag `@mathvbarone` (single-maintainer Phase 1 — no separate platform / DevOps owner exists yet; revisit when the project gains a second maintainer).

If the failure blocks a security-patch PR specifically, mark the issue `priority:high` and reference the affected advisory IDs.
