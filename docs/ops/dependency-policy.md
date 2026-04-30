# Dependency Policy

Operational policy for keeping the monorepo's npm dependencies current and secure. Companion to [`docs/superpowers/plans/2026-04-29-dependency-security-update-plan.md`](../superpowers/plans/2026-04-29-dependency-security-update-plan.md) and [ADR-0008](../adr/0008-dependency-security-ci-gate.md).

## Supported Node / npm versions

- **Node:** `>=20.11`, pinned in `package.json#engines.node` and `.nvmrc`. Move forward with active LTS; drop minor floor only on a deliberate ADR.
- **npm:** whatever ships with the pinned Node minor; never set a separate `npm` engine floor without an ADR.

When a dependency upgrade requires a newer Node minor, that goes in its own PR with the `engines.node` bump and `.nvmrc` change in the same commit.

## Triage process (Phase 1, single-maintainer)

Phase 1 is best-effort, not SLA-bound. Targets are guidance; the maintainer applies judgement.

| Severity   | Target response                                                                |
| ---------- | ------------------------------------------------------------------------------ |
| Critical   | Patch in the next maintenance window; same-day if the advisory is exploitable on our surface. |
| High       | Patch in the next dependency-update PR.                                        |
| Medium     | Bundle into the monthly dependency sweep.                                      |
| Low / info | Defer to the next major-upgrade pass.                                          |

A Phase 2 follow-up PR (multi-maintainer) replaces this table with concrete response targets and on-call ownership. Whether those targets ship as hard SLAs or as best-effort-with-on-call is a Phase 2 decision; not pre-decided here. See [ADR-0008 Phase 2 ramp](../adr/0008-dependency-security-ci-gate.md#phase-2-ramp).

## Exception policy

If a vulnerability cannot be patched (no upstream fix yet, or upstream fix carries a breaking migration we can't ship in the SLA window):

1. File an exception in `docs/ops/exceptions/<advisory-id>.md` with:
   - advisory ID + summary,
   - exposure analysis (does our usage trigger the vulnerable code path?),
   - mitigations applied (input validation, sandboxing, network egress restriction, etc.),
   - revisit date.
2. Tag `@mathvbarone` for sign-off in the PR adding the exception.
3. The CI security gate can be told to ignore the advisory ID via `package.json#overrides` only if the override actually neutralises the risk — never as a way to silence the gate.

## Bot-PR DCO policy

The repo's required `dco` CI check (`.github/workflows/ci.yml`) rejects every commit that lacks a `Signed-off-by:` trailer. Bot accounts (Dependabot, Renovate, etc.) do not add DCO trailers by default, so bot PRs would be permanently blocked from merge.

Three options. Pick one before enabling any bot config:

1. **Auto-amend workflow.** Add a workflow that runs on `pull_request` from `dependabot[bot]` (or equivalent) and amends each commit with `git commit --amend -s --no-edit`, then force-pushes the bot's PR branch. Pros: bot PRs work end-to-end without maintainer intervention. Cons: a workflow with `contents: write` on a bot-author branch is a non-trivial security surface.
2. **Maintainer rebase-and-amend.** Document that the maintainer rebases bot PRs locally and amends each commit with `-s` before merging. Pros: zero new automation. Cons: every bot PR requires maintainer time; defeats most of the bot's value.
3. **Bot-author exemption in the `dco` check.** Modify `.github/workflows/ci.yml` to skip DCO verification on commits whose author and committer email both match a known Dependabot identity. Pros: simplest. Cons: weakens the gate; spoofing requires push access to a PR branch and setting both git fields. In Phase 2 (CODEOWNER-review re-enabled on `main`) the gap closes mechanically; in Phase 1 the maintainer-self-merge path is the residual risk and is treated as out-of-threat-model (see ADR-0009 §Negative).

**Decision: Option 3 (bot-author exemption)** per [ADR-0009](../adr/0009-dco-exemption-for-dependabot.md). The `dco` job in `.github/workflows/ci.yml` skips DCO verification for commits whose **author AND committer** email both match a known Dependabot identity (exact-match, not substring). Requiring both fields blocks `git commit --author='dependabot[bot] <…>'` spoofing where a hostile contributor sets only the author. Adding a new bot (Renovate, Snyk, etc.) requires its own ADR plus an entry in both checks — the trust decision is not generalised silently.

## Where this fits

- **Plan** (one-shot rollout): [`2026-04-29-dependency-security-update-plan.md`](../superpowers/plans/2026-04-29-dependency-security-update-plan.md)
- **ADR** (CI-gate decision): [`0008-dependency-security-ci-gate.md`](../adr/0008-dependency-security-ci-gate.md)
- **Runbook** (registry / advisory failures): [`dependency-registry-access.md`](./dependency-registry-access.md)
- **Policy** (this file): supported versions, triage, exceptions, bot DCO.
