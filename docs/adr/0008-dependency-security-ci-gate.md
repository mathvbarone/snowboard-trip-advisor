# ADR-0008: Dependency security CI gate is informational in Phase 1

- **Status:** Accepted
- **Date:** 2026-04-29
- **Deciders:** @mathvbarone
- **Related spec:** [`docs/superpowers/specs/2026-04-22-product-pivot-design.md`](../superpowers/specs/2026-04-22-product-pivot-design.md)
- **Related plan:** [`docs/superpowers/plans/2026-04-29-dependency-security-update-plan.md`](../superpowers/plans/2026-04-29-dependency-security-update-plan.md)
- **Related policy:** [`docs/ops/dependency-policy.md`](../ops/dependency-policy.md)

## Context

The dependency-security plan (link above) proposes a `dependency-security` GitHub Actions workflow that runs `npm audit --audit-level=high` on a daily schedule and on PRs touching `package.json` / `package-lock.json` files. The decision in scope here is **how strict the gate is** — specifically whether `npm audit` failures hard-block PR merge, and whether the workflow registers as a required status check in branch protection.

The repo currently has two required status checks (`quality-gate / qa` and `dco`) declared as merge blockers via branch protection (see [`CLAUDE.md`](../../CLAUDE.md#enforcement-layers)). Adding a third required check is a non-trivial change because:

1. **Single maintainer.** Phase 1 has one maintainer (`@mathvbarone`). A required check that fires asynchronously (because npm published an advisory at 03:00 UTC, or because the advisory bulk endpoint returns a transient 403) blocks every open PR from merge until the maintainer manually intervenes. With one human, "manually intervene" can be hours-to-a-day.
2. **The 403 problem is real, not hypothetical.** The plan was written under conditions where `npm audit --json` returned `403 Forbidden` from the advisories endpoint. A hard gate against that endpoint converts upstream availability into our merge availability — bad coupling for a single-maintainer project.
3. **Dependabot has not landed yet.** Once Dependabot is enabled and successfully cuts security PRs, the gate becomes mostly redundant on the happy path: vulnerabilities show up as bot-authored PRs you merge, not as red CI on unrelated PRs. Hard-gating before Dependabot is in place inverts the workflow (you find out about advisories via your own CI failing on someone else's PR).
4. **Branch protection is `enforce_admins: true`.** A required check applies to maintainer PRs too. There is no "I know what I'm doing" override.

Counter-considerations (why have a gate at all):

- An advisory landing between Dependabot's daily run and the maintainer's review window is not visible without a separate scan. The gate catches it.
- A PR that bumps a dependency to a vulnerable version (intentionally or via a transitive resolution) needs a check that fails *on that PR*, not eventually-on-schedule.
- "Informational" CI signal still works as long as the maintainer reads CI annotations on PRs. With **step-level** `continue-on-error: true` on the `npm audit` step, the failed step is visible in the job log but the job reports success on the PR check list — non-blocking, not silent. (Job-level `continue-on-error` would also unblock merge but reports the job as ✓ on the check list, which is closer to silent than informational; the workflow PR must scope `continue-on-error` to the audit step, not the whole job.)

## Decision

**The `dependency-security` workflow ships in Phase 1 as informational, not as a required check.** It runs `npm audit --audit-level=high` against the lockfile but lets the job succeed on the PR check list when the audit reports high/critical findings, so a freshly-published advisory or a transient registry 403 cannot block merge against a single-maintainer repo. A companion `outdated-report` job uploads `npm outdated` output as an artifact for visibility.

Decision principles (the workflow PR owns implementation specifics — file path, cron expression, artifact filename, flag spelling):

1. **`audit` job is informational.** It runs `npm audit --audit-level=high` (the threshold that surfaces high and critical advisories — see Alternatives §C). Non-blocking is implemented via **step-level** `continue-on-error: true` on the `npm audit` step so failures remain visible in the job log; job-level `continue-on-error` is rejected as too close to silent.
2. **`outdated-report` job is non-blocking by design.** Its only failure-prone step (the `npm outdated` invocation) swallows its non-zero exit with `|| true`. We do **not** layer `continue-on-error` on top — genuine job-level failures (checkout, setup-node, artifact upload) must remain red so the artifact pipeline doesn't decay silently.
3. **Triggers.** Daily schedule plus `pull_request` paths-filter scoped to dependency-manifest files only (`package.json`, `package-lock.json`, and per-workspace equivalents). Workflow PR specifies the exact paths and cron.
4. **Threshold = `high`.** Surfaces high and critical. Medium / low are visible in the artifact and via Dependabot, not in the gate.
5. **Branch protection.** No change in Phase 1. The check is **not** added to `required_status_checks`. (`scripts/apply-branch-protection.sh` is currently absent — see CLAUDE.md "Enforcement Layers" — and will be regenerated as a follow-up Epic 6 task; whichever script supersedes it must not list this workflow as required until Phase 2.)
6. **Future workflow PR must include** a job-summary annotation that states the gate is informational and links back to this ADR. This is a requirement on that PR, not a present-tense fact about the gate.

## Phase 2 ramp

When the project gains a second maintainer:

1. Remove the `continue-on-error: true` flag from the `npm audit` step on the `audit` job.
2. Add `dependency-security / audit` to required status checks via the branch-protection script.
3. Update the **Status** line of this ADR to `Accepted (Phase 1) → Superseded by Phase 2 hardening on YYYY-MM-DD` and link the PR that flipped the gate.
4. Open a follow-up PR that updates [`docs/ops/dependency-policy.md`](../ops/dependency-policy.md) triage table with concrete response targets and on-call ownership. Whether those targets are presented as "hard SLAs" or "best-effort with on-call" is a Phase 2 decision, not pre-decided here.

The Phase 2 flip is a separate ADR-update PR, not a sneak-through.

## Consequences

### Positive

- **CI availability does not couple to npm advisory-endpoint availability.** A 403 from the advisories API surfaces as a ⚠ annotation, not a merge block. Single-maintainer-friendly.
- **Vulnerability visibility without false-blocking.** The maintainer sees the failed step on every PR, the daily-schedule run, and the artifact — but isn't blocked from shipping unrelated work.
- **Reversible.** Phase 2 adds enforcement with a single config change. We don't need to redesign anything.
- **Honest about Phase 1 capacity.** A 24h critical-remediation SLA against one human with no on-call rotation is theatre. Informational gating + the policy doc's best-effort triage matches actual capacity.

### Negative / costs

- **Convention dissonance.** Most projects with an `npm audit` step let it block merge. A reviewer landing here from elsewhere may assume the gate is required and not check the annotation. Mitigation: the workflow PR is required to include a job-summary annotation stating the gate is informational and linking ADR-0008 (see Decision §6).
- **Non-blocking signal can be missed.** A green-job-with-failed-step is easier to ignore than a red ✗. We accept this risk in Phase 1 — there is no automated notification mechanism in scope for the Phase 1 workflow PR. The Phase 2 ramp removes this risk entirely (gate becomes hard).
- **Window of exposure.** A vulnerability published at 03:00 UTC is visible at the next daily run + the next dependency-touching PR. In a hard-gate world, no vulnerable code merges at all. We accept the window in exchange for not gating availability on upstream.

### Neutral / follow-on

- The workflow itself ships in a follow-up PR; this ADR is purely the decision document.
- The Dependabot enablement PR resolves the bot-PR DCO question first (see [`docs/ops/dependency-policy.md#bot-pr-dco-policy`](../ops/dependency-policy.md#bot-pr-dco-policy)) and is independent of this ADR.
- If we ever introduce a paid SAST product that overlaps with `npm audit`, revisit whether running both is worth the noise.

## Alternatives considered

### A. Hard-gate `npm audit --audit-level=high` as a required check from Day 1

Rejected for Phase 1. Couples our merge availability to the npm advisory-endpoint's availability and to the timing of upstream advisory publication. With a single maintainer and `enforce_admins: true`, a 03:00 UTC advisory blocks every open PR until the maintainer is awake and patches. The strongest argument for hard-gating — that a PR introducing a vulnerable dependency directly should be blocked at submission, not merely annotated — is real, and the informational signal accepted here is a weaker remedy. We accept that weakness because false-blocking against one maintainer outweighs the introducing-PR case in practice. Phase 2 reverses this trade-off when the on-call blast radius shrinks.

### B. No CI gate at all; rely on Dependabot security PRs only

Rejected. Dependabot doesn't catch the case where a PR introduces a vulnerable dependency directly (intentionally or via transitive resolution) — by the time Dependabot's next scheduled run cuts a remediation PR, the vulnerable version is already in `main`. Cheaper to surface the problem on the introducing PR via the gate annotation.

### C. Hard-gate at `--audit-level=critical` only

Rejected. Critical-only is a narrow window; high-severity advisories (RCE, auth bypass) routinely get rated `high` rather than `critical`. The threshold cost is monitoring noise, not gate value, and noise is what `continue-on-error` is for.

### D. Hard-gate `pull_request` runs, but `continue-on-error` on the daily schedule run

Rejected. This is what most projects do, and on the surface it looks reasonable: PR-event hard-gating catches the introducing-PR case (the strongest pro-gate argument from §A), while schedule-event tolerance avoids the 03:00-advisory-blocks-everything failure mode. We reject it because **PR-event hard-gating reintroduces the same single-maintainer / npm-availability coupling we rejected in §A** — a transient 403 from the advisories endpoint during a PR run still hard-blocks merge until the next CI rerun, which still requires the maintainer. Phase 2 takes us to this configuration (or directly to full hard-gate), but it is not the right Phase 1 default.

## Notes

- This ADR replaces the original PR #24 stance of landing `dependency-security.yml` as a hard gate without a recorded decision.
- The `audit` step's `continue-on-error: true` flag is the single load-bearing toggle for this ADR's Phase 1 stance. Any future PR that removes that specific flag must update this ADR's **Status** line and write a Phase 2 ADR amendment in the same PR. Other `continue-on-error` uses elsewhere in the workflow (e.g. on a flaky upload step) are out of scope for this rule.
- Subagent review on this ADR was requested per CLAUDE.md "Subagent Review Discipline" — the ADR sits under the trigger path `docs/adr/**` — and findings were folded back into this file before maintainer review.
