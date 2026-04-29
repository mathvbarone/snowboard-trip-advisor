# Dependency Registry Access Runbook

## Purpose
Use this runbook when dependency commands (`npm ci`, `npm outdated`, `npm audit`) fail with registry or advisory API errors.

## Fast checks
1. `npm config get registry`
2. `npm ping`
3. `npm whoami` (if auth is expected)
4. `npm config list`

## Common failure: `403 Forbidden`

### Symptoms
- `npm outdated --all` fails with 403.
- `npm audit --json` fails posting to advisories endpoint.

### Checks
- Verify `.npmrc` at repo, user, and global scopes.
- Verify CI secrets and env vars for `http-proxy` / `https-proxy`.
- If using an internal mirror/proxy (Artifactory/Nexus/GH Packages):
  - ensure npmjs.org package metadata is proxied;
  - ensure security advisories endpoint passthrough is enabled;
  - ensure scope rules for internal packages do not block public package resolution.

## Expected healthy behavior
- `npm ci` succeeds.
- `npm outdated --all` returns package table.
- `npm audit --json` returns advisory JSON.

## Escalation
If checks pass but 403 persists:
- attach CI logs and local command output,
- include `npm config get registry` output,
- escalate to platform/DevOps owner of registry proxy.
