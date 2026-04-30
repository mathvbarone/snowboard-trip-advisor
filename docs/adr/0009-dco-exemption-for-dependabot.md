# ADR-0009: DCO check exempts Dependabot bot commits

- **Status:** Accepted
- **Date:** 2026-04-29
- **Deciders:** @mathvbarone
- **Related ADRs:** [ADR-0008](./0008-dependency-security-ci-gate.md) (sibling: dependency security CI gate)
- **Related policy:** [`docs/ops/dependency-policy.md#bot-pr-dco-policy`](../ops/dependency-policy.md#bot-pr-dco-policy)
- **Supersedes:** the "Decision deferred" stance previously recorded in `dependency-policy.md`.

## Context

The repo's required `dco` CI check (`.github/workflows/ci.yml`) rejects every commit lacking a `Signed-off-by:` trailer. Dependabot does not add DCO trailers by default, so every Dependabot PR would be permanently blocked from merging — defeating the bot's purpose and stalling automated security-patch flow indefinitely.

The dependency policy doc (`docs/ops/dependency-policy.md#bot-pr-dco-policy`) lists three options and defers the decision until the first Dependabot-enablement PR. This ADR makes that decision so the next stacked PR can land `.github/dependabot.yml`.

The three options on the table:

1. **Auto-amend workflow.** A new workflow runs on `pull_request` from `dependabot[bot]`, amends each commit with `git commit --amend -s --no-edit`, and force-pushes the bot's PR branch. Pros: bot PRs work end-to-end with the gate intact. Cons: a workflow with `contents: write` on a bot-author branch is a non-trivial security surface — the amending workflow has higher blast radius than the bot it's supporting.
2. **Maintainer rebase-and-amend.** A documented manual policy: the maintainer rebases each Dependabot PR locally and amends commits with `-s` before merging. Pros: zero new automation. Cons: every bot PR queues on maintainer time, defeating most of Dependabot's value (the whole point is small dependency updates landing without human bottleneck).
3. **Bot-author exemption.** Modify the `dco` job in `ci.yml` to skip DCO verification on commits whose author email matches a known Dependabot identity. Pros: simplest; one short shell snippet; bot PRs work end-to-end with zero new automation surface. Cons: weakens the `dco` gate by trusting the commit-author identity.

The framing question is **what DCO is actually for.** DCO is a human legal attestation — the contributor asserts they have the right to license the contribution under the project's terms. A bot is not a legal person and cannot make that statement. Auto-appending `Signed-off-by: dependabot[bot]` (option 1) is the form of compliance without the substance. Option 3 is honest about that — bot commits do not carry a DCO trailer because the bot cannot make the DCO statement, so we exempt them explicitly rather than launder a non-attestation through an automated trailer.

## Decision

**Option 3: the `dco` job in `.github/workflows/ci.yml` skips DCO verification for commits whose `author` AND `committer` email both match a known Dependabot identity.**

Concretely, the `for sha in $(git rev-list ...)` loop adds an early `continue` when **both** `git show -s --format='%ae'` (author email) and `git show -s --format='%ce'` (committer email) of a commit match one of:

- `dependabot[bot]@users.noreply.github.com`
- `49699333+dependabot[bot]@users.noreply.github.com` (the numeric `noreply` form GitHub assigns; the numeric ID is `dependabot[bot]`'s GitHub user ID, verifiable via `https://api.github.com/users/dependabot%5Bbot%5D`)

The match is **exact** (full email string). In bash, double-quoted `case` patterns disable glob/bracket expansion, so `[bot]` matches literally and substrings like `evildependabot[bot]@example.com` do not match.

The author **and** committer requirement is deliberate: checking only the author would let a hostile contributor bypass DCO via `git commit --author='dependabot[bot] <dependabot[bot]@users.noreply.github.com>'` while remaining the committer themselves. Both fields must match for the exemption to apply.

The exemption list lives only in `ci.yml` — adding a new bot (Renovate, Snyk, etc.) requires a new ADR plus an entry in both email checks.

## Consequences

### Positive

- **Bot PRs work end-to-end with zero new automation.** No `contents: write` workflow on a bot branch; no maintainer queue. The change is a 5-line shell `case` inside an existing job.
- **Honest about what DCO is for.** Auto-trailing the DCO on a bot's behalf would be theatre; this ADR replaces theatre with an explicit narrow carve-out.
- **Reversible.** A future PR can re-tighten by removing the exemption and accepting the trade-offs of options 1 or 2. The change touches one job in one file.
- **Localised.** The exemption is in one workflow file plus this ADR. No spread across the codebase, no separate registry of "bot identities" to maintain in two places.

### Negative / costs

- **Weaker DCO gate for commits matching the Dependabot author + committer pair.** A PR whose commit has both `author` and `committer` email set to `dependabot[bot]@users.noreply.github.com` skips DCO. Spoofing requires push access to a PR branch *and* setting both git fields. Branch protection prevents direct pushes to `main`, so a spoofed commit must come through a PR.
- **Phase 1 self-merge gap (load-bearing — explicit acknowledgment).** Per `CLAUDE.md` "Enforcement Layers," Phase 1 has the required-CODEOWNER-review gate **deferred** until a second maintainer joins. The maintainer can self-merge a PR they authored. In Phase 1, the only thing between a deliberately-spoofed bot-identity commit and `main` is the maintainer's own discipline — branch protection blocks the direct-push path, but does *not* block "maintainer opens a PR with a spoofed commit and self-merges." This is acceptable in Phase 1 because the threat model assumes the maintainer is not adversarial against their own project. **In Phase 2, when CODEOWNER-review is re-enabled on `main`, this gap closes mechanically** — a spoofed commit would still need a second maintainer's approval. The Phase 2 re-enable PR should reference this ADR's mitigation status.
- **No verified-signature check (see Alternative E).** Real Dependabot commits are signed by GitHub's GPG key. The exemption does not verify the signature; it trusts only the author/committer email. A future tightening could require `git verify-commit` to pass; this ADR rejects that step as adding shell complexity without proportional gain (see §E), but the option remains open.
- **Dependabot identity drift risk.** If GitHub changes Dependabot's noreply email format, the exemption silently stops applying and bot PRs start failing the `dco` check. The failure mode is "bot PRs blocked" (visible, recoverable), not "spoofed commits accepted" (silent compromise) — we accept the visible failure as the safer error direction. Operationally, the maintainer notices because Dependabot PRs accumulate without merging; the recovery is a one-line additional `case` entry. Auto-detection (e.g. a scheduled job that asserts at least one Dependabot PR has merged in the last N days) is out of scope for this ADR but worth considering if drift bites.
- **Doesn't generalise to other bots.** Renovate, Snyk, etc. each need their own ADR + `ci.yml` entry. Acceptable — we don't enable other bots today, and the per-bot ADR forces an explicit decision rather than a creeping trust list. To make this mechanical, this PR adds `.github/dependabot.yml` to the Subagent Review Discipline trigger-path list in `CLAUDE.md`, so the addition of any bot config forces independent review.

### Neutral / follow-on

- The Dependabot enablement PR (the next stacked PR) ships `.github/dependabot.yml` on top of this change. PR-B is meaningless without PR-A, and PR-A is harmless without PR-B (the new shell branch is dead code until a Dependabot commit shows up).
- [`docs/ops/dependency-policy.md`](../ops/dependency-policy.md#bot-pr-dco-policy) is updated in this same PR to record this decision in place of "Decision deferred."

## Alternatives considered

### A. Option 1 — auto-amend workflow

Rejected for Phase 1 single-maintainer; not categorically. Many OSS projects do run auto-amend workflows on Dependabot PRs without incident, and the surface can be scoped tightly (no `pull_request_target`, no secrets exposed to bot-cut PRs, `contents: write` only). The concrete attack vector that pushes us against it is: an amend step running with the elevated workflow token re-pushes a force-pushed bot branch, and a bug or compromised dependency in the amend tooling could rewrite history with arbitrary content under the maintainer's apparent authority. For a single-maintainer Phase 1 repo, the marginal value (gate intact) does not justify the marginal surface (a new write-permissioned workflow that runs on every Dependabot event). Option 3 achieves the same end-to-end Dependabot-PR flow with strictly less new automation.

### B. Option 2 — maintainer rebase-and-amend

Rejected. The primary argument: Option 2 weakens the DCO gate the same amount Option 3 does for legitimate bot PRs — in Option 2 the maintainer signs off on a bot's behalf, which carries no more attestation weight than an explicit exemption. Both options accept that the bot's commits are not human-attested; Option 3 is just honest about it. The secondary argument (queue time): every bot PR through the maintainer rebase queue is ~30 seconds of mechanical work; at ~5 PRs/month it's modest, not catastrophic, but for zero improvement in gate strength it's pure overhead.

### C. Status quo — leave Dependabot disabled

Rejected. Catching dependency advisories *only* via the informational CI gate from [ADR-0008](./0008-dependency-security-ci-gate.md) misses transitive vulnerabilities Dependabot would have cut a remediation PR for, and leaves all upgrade work to manual maintainer dependency-sweep PRs. Both layers (informational gate + Dependabot) are needed.

### D. Skip DCO entirely

Rejected. DCO is a load-bearing legal-attestation gate for human contributions and stays in place for everyone except the explicitly-listed bot identities. The exemption is narrow, not a license to disable.

### E. Also require verified GPG signature on exempted commits

Rejected as a Phase 1 addition; left as a future tightening option. Real Dependabot commits are signed by GitHub's GPG key and surface as **Verified** in the GitHub UI. We could require `git verify-commit "$sha"` (or check `git show -s --format='%G?' "$sha"` for `G`) before honouring the exemption, which would make spoofing require both a matching author/committer pair *and* a valid GitHub-signed commit (effectively impossible without compromising GitHub itself). The cost: GPG keyring setup on the runner (or `actions/setup-go`-style verification helper), a more complex shell branch, and a new failure mode if GitHub's signing key rotates and the runner cache is stale. For Phase 1, the existing author+committer match plus branch-protection threat model is sufficient. If a future Dependabot-spoofing incident or audit requires hardening, **adding `git verify-commit` is a one-PR change** (this ADR is amended in the same PR to record the upgrade).

## Notes

- Subagent review on this ADR was requested per CLAUDE.md "Subagent Review Discipline" — `docs/adr/**` is a trigger path, and the `ci.yml` edit is also under `.github/workflows/**`. Both files reviewed together; findings folded into this PR before maintainer review.
- The exemption list is intentionally an inline `case` rather than a separate config file: it's two lines of data, it changes only when adding a bot (which requires an ADR anyway), and a config-file abstraction would just spread the trust decision across two reviewable surfaces.
