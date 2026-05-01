# Mid-flight handover — Epic 4 spec folds + open PR landscape

**Date:** 2026-05-01.
**Status:** Epic 4 spec ([PR #65](https://github.com/mathvbarone/snowboard-trip-advisor/pull/65)) opened with reviewer findings authorized for folding. **Folds NOT YET executed.** Context is exhausted; this document is the handover for the next agent.

---

## TL;DR

The Epic 4 admin-app spec was drafted, reviewed by an independent spec-document-reviewer subagent, and verdict was **REQUEST CHANGES** with **9 P0** + **8 P1** findings. The maintainer authorized two structural decisions:

1. **PR count: 12** (was 10). Splits authorized: `4.4` → `4.4a/4.4b/4.4c/4.4d` (server-read / view-read / server-write / edit-interactive); `4.5` → `4.5a/4.5b` (handler / UI). `4.1c` stays bundled with explicit Epic-3-PR-3.2 precedent justification.
2. **Dockerfile guard: defer to Epic 6** (option B). Reason: existing `Dockerfile` is marked "DEFERRED — DO NOT BUILD UNTIL EPIC 6" with broken COPY paths; `docker build` will fail until rewritten. Epic 4 ships WITHOUT the mechanical guarantee that admin won't sneak into prod; the guard lands in Epic 6 alongside the Dockerfile rewrite.

**Next agent's first action:** apply all 9 P0 folds + the listed P1 folds to the Epic 4 spec on branch `docs/epic-4-admin-app-spec` (worktree: `.worktrees/epic-4-spec`); push; re-dispatch the spec-document-reviewer subagent; if APPROVED, surface to the maintainer for the user-review gate. Then move to `superpowers:writing-plans` to draft the implementation plan.

---

## Active PR landscape

> **Snapshot updated post-#66.** This section captures only the open Epic-4-relevant PRs. The agent-discipline migration that this snapshot originally covered (PRs #54, #58–#62) has since landed on `main` via the consolidation PR #66 — see [`2026-05-01-post-epic-3.md`](./2026-05-01-post-epic-3.md) for the post-merge state, including the phantom-merge incident and the lesson it produced.

| PR | Branch | Title | Status |
|---|---|---|---|
| [#63](https://github.com/mathvbarone/snowboard-trip-advisor/pull/63) | `docs/adr-0011-defer-test-sync` | ADR-0011 — defer Test/Sync to Epic 5 | OPEN |
| [#64](https://github.com/mathvbarone/snowboard-trip-advisor/pull/64) | `docs/adr-0012-defer-analyst-notes` | ADR-0012 — defer analyst notes | OPEN |
| [#65](https://github.com/mathvbarone/snowboard-trip-advisor/pull/65) | `docs/epic-4-admin-app-spec` | **Epic 4 spec** | OPEN, REQUEST CHANGES from spec-document-reviewer — folds authorized below, NOT YET executed |

**Don't merge ADR-0011 / ADR-0012 autonomously without maintainer sign-off.** Both directly affect Epic 4 PR-count and scope decisions captured below — confirm scope alignment before merging.

---

## Worktree map

The agent-discipline stack worktrees were pruned after PR #66 merged. Worktrees still relevant to Epic-4-adjacent work:

```
/Users/matheusbarone/Projects/snowboard-trip-advisor/                    main
.worktrees/
  adr-0011-defer-test-sync/      docs/adr-0011-defer-test-sync    (#63)
  adr-0012-defer-analyst-notes/  docs/adr-0012-defer-analyst-notes (#64)
  epic-4-spec/                   docs/epic-4-admin-app-spec       (#65) ← FOLD HERE
  handover-epic-4-spec/          docs/handover-epic-4-spec        (this handover document's authoring branch)
```

Other worktrees in `.worktrees/` (`chore-atomic-pr-discipline`, `chore-hook-worktree-aware`, `codex-agent-discipline`, `epic-3-pr-3.*`, `epic-3-pr-3.6c-workflow`, `pr-54-review`) are pre-PR-#66 leftovers from earlier sessions and can be pruned independently.

When applying folds, **prefix bash invocations with `cd '/Users/matheusbarone/Projects/snowboard-trip-advisor/.worktrees/epic-4-spec' &&`** so the trace is auditable. Verify pwd via `pwd` if uncertain.

---

## Epic 4 spec — folds authorized but not executed

The spec lives at `docs/superpowers/specs/2026-05-01-epic-4-admin-app-design.md` on the `docs/epic-4-admin-app-spec` branch. The spec-document-reviewer's full output is in [PR #65's review thread](https://github.com/mathvbarone/snowboard-trip-advisor/pull/65) — but the conversation that produced it is also in this session's transcript above.

### P0 folds (all 9 — must execute)

#### A1 — `FieldStateFor<T>` and `toFieldValue<T>` are NOT shipped

**Where:** §1, §2.1, §4.2 (handler logic), §6.1 ("FieldStateFor<T>" mention), §7.10 (PR 4.4a … now 4.4a / 4.4b deliverables — see A3 split below).

**Reality:** Per `packages/schema/src/resortView.ts:2` ("Note: FieldStateFor<T>… and toFieldValue<T>… are deferred to Epic 4 PR 4.4") and parent spec line 805, these types are **net-new in Epic 4**.

**Fold:** Add to **PR 4.1a deliverables** (foundation): create `FieldStateFor<T>` + `toFieldValue<T>` in `packages/schema/src/resortView.ts` with tests in `resortView.test.ts`. Update §2.1's `schema` package description to acknowledge these are net-new. Remove every "already shipped" claim for these two types — they should be marked "lands in PR 4.1a."

#### A3 — PR sizing splits (authorized: 12 PRs total)

**Where:** §7 (PR Breakdown) — restructure the PR list and the §7.4 dependency graph.

**Authorized splits:**

```
4.4a — Server read path
       Files: apps/admin/server/{resortDetail,workspace}.ts + tests + apps/admin/src/state/useResortDetail.ts + test (~6 files)
4.4b — Editor view (read-only)
       Files: apps/admin/src/views/ResortEditor/{ResortEditor,DurablePanel,LivePanel,FieldRow,ModeToggle}.tsx + tests + integration-read test (~8 files)
4.4c — Server write path + workspace atomic-write
       Files: apps/admin/server/resortUpsert.ts + test + workspace.ts atomic-write helper + test + apps/admin/src/state/useWorkspaceState.ts + test (~6 files)
4.4d — Editor edit interaction
       Files: ModeToggle interactive + FieldRow MANUAL form + apps/admin/src/state/useModeToggle.ts + test + integration-write test (~5 files)
4.5a — Publish handler
       Files: apps/admin/server/{publish,listPublishes}.ts + tests + apps/admin/src/state/{usePublish,usePublishes}.ts + tests (~6 files)
4.5b — Publish UI + Toast
       Files: PublishDialog + PublishHistory + Toast + Shell wiring + integration-publish test (~7 files)
```

**4.1c stays bundled** (5 design-system components + index modify + Shell modify ≈ 12 files). Epic 3 PR 3.2 precedent: that PR shipped 9 components / 66 files in one PR with explicit "design-system fan-out is one concern" justification — same pattern applies here. **Add a one-paragraph "PR sizing acknowledgment" to §7.7 (4.1c)** citing PR 3.2 precedent.

**Updated §7.4 dependency graph:**

```
4.1a (Foundation: schema/api + FieldStateFor) ──┐
4.1b (Vite middleware skeleton) ────────────────┼─→ 4.2 (Dashboard)
4.1c (DS additions: 5 components) ──────────────┘     │
                                                       ↓
                                                   4.3 (Resorts table) ─→ 4.4a (Server read) ─→ 4.4b (Editor view) ─→ 4.4c (Server write) ─→ 4.4d (Edit interactive) ─→ 4.5a (Publish handler) ─→ 4.5b (Publish UI) ─→ 4.6a (Polish)

Note: 4.6b (integration tests) is the LAST PR. Dockerfile guard DEFERRED to Epic 6 per maintainer decision below.
```

**Total: 12 PRs.** Renumber §7.5 through §7.14 accordingly. Update §7.2 (subagent-review trigger matrix) per-PR rows.

#### B3 — Pre-publish blocking-state UX

**Where:** Add a new §4.3.1.

**Fold (drop-in section):**

```markdown
### 4.3.1 Pre-publish blocking-state surface

PUT (endpoint 3) does NOT run full `validatePublishedDataset` — it only validates the resort schema (per-document `Resort` / `ResortLiveSignal` parse). Per-field provenance violations (missing `field_sources` entry, malformed `upstream_hash`) are caught only at publish time.

To surface blocking state to the user **before** they click Publish:

- The `<PublishDialog>` (PR 4.5b deliverables) reads from `GET /api/health` (endpoint 8) to display:
  - Number of workspace files with at least one field in `Failed` state.
  - Number of workspace files missing required `field_sources` entries.
  - Total number of would-publish resorts.
- Client-side re-validation is **explicitly NOT done** — the SPA does not import `validatePublishedDataset`. Server-side health is the single source of truth.
- Publish disabled-state: the dialog's confirm button is `disabled` when `health.resorts_with_failed_fields > 0`; tooltip explains "fix failures or switch fields to MANUAL before publishing."
```

#### C2 — Atomic-write 4-step pattern

**Where:** §10.3.

**Fold:** Replace §10.3 with the canonical 4-step pattern that matches `packages/schema/src/publishDataset.ts:163-209`:

```markdown
### 10.3 Atomic-write semantics

Both workspace files (`data/admin-workspace/<slug>.json`) and the published file (`data/published/current.v1.json`) use the **4-step atomic-write pattern** from `packages/schema/src/publishDataset.ts:163-209`:

1. Write contents to `<target>.<random-suffix>.tmp`.
2. `fsync(fd)` on the temp file's file-descriptor — flushes the file's data + metadata to disk.
3. `rename(<target>.<random-suffix>.tmp, <target>)` — POSIX-atomic at the inode level.
4. `fsync(parent_dir)` — flushes the **directory entry** (the rename's effect is otherwise NOT crash-consistent on POSIX without this). On macOS APFS, `fsync` on a directory may return `ENOTSUP`; the existing `publishDataset.ts:202-203` handles this fallback by ignoring the error (APFS guarantees the rename is durable without an explicit dir-fsync).

`publishDataset()` already implements this pattern. The admin workspace write helper (`apps/admin/server/workspace.ts`, PR 4.4c) MUST use the same pattern; subagent review on 4.4c verifies this byte-for-byte.

**Lock semantics:** Phase 1 is single-process. `strictPort: true` on the dev server (§3.1) blocks two-instance startup, so concurrent workspace writes are not a concern. If a future Phase 1 use case introduces concurrent writes, see `packages/schema/src/publishDataset.lockTimeout.test.ts` for the lock-timeout pattern reference. Phase 2 ships proper distributed locking when admin moves to a real service.
```

#### C4 — Dockerfile guard DEFERRED to Epic 6

**Where:** §10.7 (rewrite); PR 4.6b's deliverables (remove the Dockerfile-guard scope).

**Fold (replace §10.7):**

```markdown
### 10.7 Dockerfile prod-build guard — DEFERRED to Epic 6

Per parent §3.1: "`apps/admin` is **never** built into the production container image." Mechanical enforcement of this invariant is **deferred to Epic 6**.

**Why deferred:** the existing `Dockerfile` at the repo root is explicitly marked "DEFERRED — DO NOT BUILD UNTIL EPIC 6" (Dockerfile lines 3-13) with broken `COPY /app/dist` paths that pre-date the Epic 1 workspace pivot. `docker build` against the current Dockerfile fails. A guard that depends on `docker build` cannot ship until Epic 6 rewrites the Dockerfile for the post-pivot per-workspace `apps/*/dist/` layout.

**Phase 1 protection (non-mechanical):**

- The CODEOWNERS surface flags `Dockerfile` and `.github/workflows/**` as load-bearing; any PR introducing `COPY apps/admin` or equivalent triggers the Subagent Review Discipline.
- The Epic 4 post-milestone handoff calls out this gap explicitly so the next post-Epic-4 / Epic 5 / Epic 6 agent inherits awareness.
- Manual review by the maintainer at Epic 6 kickoff verifies the Dockerfile rewrite + the guard land together.

**Lift conditions:**

- Epic 6 PR rewrites `Dockerfile` for the post-pivot workspace layout.
- Same PR (or its stacked successor) ships `scripts/check-admin-not-in-prod.{ts,cli.ts,test.ts}` — either as a static grep of Dockerfile source for `apps/admin` references (no `docker build` required), or as a real multi-stage build assertion once the Dockerfile actually builds.
- Required-status adoption follows the same Epic 6 branch-protection rebuild path as `quality-gate / analyze`.
```

**Update PR 4.6b's deliverables** (now the last PR — 4.6b unchanged but Dockerfile-guard removed):

```markdown
### 7.16 PR 4.6b — Integration tests

**Goal.** Final integration suite covering full admin workflow.

**Files:**

- Create / extend `tests/integration/apps/admin/dashboard.test.tsx`, `resorts-table.test.tsx` (these may have landed in earlier PRs; this PR completes coverage).
- Create `tests/integration/apps/admin/full-flow.test.tsx` — composite: open admin → navigate to Resorts → click row → MANUAL edit → save → publish → see in history.

**Subagent review trigger:** NO (no CODEOWNERS-protected paths).

**Acceptance gate:** All integration tests green; `npm run qa` green.
```

Remove `scripts/check-admin-not-in-prod.{ts,cli.ts,test.ts}` from the deliverables. Remove the `.github/workflows/quality-gate.yml` modification. Remove the `dockerfile-guard` CI job mention.

#### D2 — Rollback policy citation

**Where:** §7.4 final paragraph.

**Fold:** Replace the line "Rollback policy mirrors Epic 3 spec §10.1: …" with:

```markdown
Rollback is `git revert <merge-sha>` directly on `main`, per parent spec §10.4 ("Phase 1 ships feature branches directly to `main`; no integration branch") and the PreToolUse hook (`scripts/hooks/deny-dangerous-git.sh`) that blocks force-push. Worktrees with downstream work (e.g., a stacked PR whose base just got reverted) rebase against post-revert `main`. DCO sign-off applies to revert commits per ADR-0009.
```

#### E1 — ADR cross-refs note

**Where:** §11 (Verification & next steps), as a new step.

**Fold (add as step 0):**

```markdown
0. **ADR cross-ref dependency.** This spec cites [ADR-0011](../../adr/0011-defer-test-sync-ux-to-epic-5.md) and [ADR-0012](../../adr/0012-defer-analyst-notes-to-post-epic-4-followup.md) extensively. Both ADRs are in flight as standalone PRs ([#63](https://github.com/mathvbarone/snowboard-trip-advisor/pull/63) and [#64](https://github.com/mathvbarone/snowboard-trip-advisor/pull/64)) at spec-write time. The cross-references resolve once both ADRs land on `main`; merge order does not matter (sibling decisions, not stacked). This spec PR is independent of the ADR PRs (all three based on `origin/main`); merging this spec first is acceptable as long as the ADR PRs land before any Epic 4 implementation PR opens.
```

#### F2 — Atomic-write reference fix

**Where:** §10.3 (covered by C2 fold) — the C2 fold above replaces the `lockTimeout.test.ts` citation with `publishDataset.ts:163-209`.

#### G1 — Draft resort behavior

**Where:** Add §4.1.1, §4.2.1, and a clarification to §4.4.

**Fold (drop-in sections):**

```markdown
### 4.1.1 Draft resort handling (endpoint 1)

A "draft resort" is a resort with a workspace file (`data/admin-workspace/<slug>.json`) but no entry in published `current.v1.json` — i.e., a new resort being staged for inclusion in the next publish.

`GET /api/resorts` includes draft resorts in the response. Drafts are tagged via `publish_state: 'draft'` in the response (per `Resort.publish_state` enum from parent §3.8). The handler:

1. Read all workspace files; collect `slug + Resort + last_modified` per file.
2. Read published `current.v1.json`; collect any slugs not represented in workspace.
3. Union the two sets. For workspace-only entries, emit `publish_state: 'draft'`. For published-and-workspace entries, the workspace state takes precedence (it's the staged change). For published-only entries, emit `publish_state: 'published'` from the published file.
4. Apply filter + page; respond.

### 4.2.1 Draft resort handling (endpoint 2)

`GET /api/resorts/:slug` returns 200 for draft slugs (workspace-only), populating `ResortDetailResponse` from the workspace file alone. `live_signal` is `null` for drafts (no live data until the resort is published and signals start flowing). 404 is returned only when neither the workspace file nor the published doc has the slug.
```

**And add to §4.4 (publish endpoint logic):**

```markdown
**Draft resort inclusion in publish:** the publish handler reads ALL workspace files (drafts + edited-published), runs `validatePublishedDataset` against the composed envelope. A draft missing required fields (per `Resort` schema or `field_sources` invariants) fails the publish with `400 publish-validation-failed`. This is the intended UX: drafts must be complete before they can publish.
```

#### Z1 — Archive directory rename

**Where:** §4.5 (endpoint 7 handler logic).

**Fold:** Replace `data/published/archive/` with `data/published/history/`. Verified via `packages/schema/src/publishDataset.ts:30` — `HISTORY_DIR_NAME = 'history'`. Same correction in any test fixture references.

### P1 folds (do these too — they're cheap and the reviewer is right)

| # | Where | Fold |
|---|---|---|
| A2 | §7.4 graph | Note that 4.4a depends on 4.1a/4.1c; 4.3-dependency is via the row-click navigation only (could land in parallel with 4.3 if route schema is shared). Keep the graph as-drawn for clarity; add a one-line note. |
| B2 | §10.2 | Pin `notes` as a top-level workspace key (collision-free with `Resort.field_sources`). Add a worked example: `{ schema_version: 1, slug, resort, live_signal, modified_at, notes?: { [metricPath]: AnalystNote } }`. |
| B4 | §4.4 | Lock the Phase 1 SPA call to `apiClient.publish()` with no slug arg; the route's `:slug` is ignored in Phase 1. Document this in the apiClient's deliverable comment in §7.5 (PR 4.1a). |
| C1 | §10.1 | Add an "Alternatives considered (and rejected)" sub-section listing: (a) separate Express/Hono process — rejected because it adds IPC + a second deployment surface in Phase 1; (b) Vite SSR-only with separate API endpoint — rejected because admin is dev-only and SSR is Phase 2 concern; (c) Worker thread — rejected because shared memory across worker boundary is awkward for the rate-limit bucket. One-line rejection rationale per. |
| C3 | §10.5 | Pick concrete metadata location: add `packages/schema/api/rateLimitClass.ts` constant table in PR 4.1a deliverables: `export const RATE_LIMIT_CLASS = { listResorts: 'read', resortDetail: 'read', resortUpsert: 'write', publish: 'write', listPublishes: 'read', health: 'read' } as const`. Schemas reference it via `.describe()` annotations referencing the constant. |
| D1 | §7.2 trigger matrix | Remove the "indirect schema-touch" justification for PR 4.4a; the `apps/admin/server/**` justification is sufficient on its own. |
| D3 | §9 | Add: "Publish-time diff preview — Phase 2 concern; per parent §3.7's eventual UX, but not in Phase 1's PublishDialog. (Phase 1's PublishDialog shows aggregate counts only; per-field diff preview is a Phase 2 admin enhancement.)" |
| F1 | §7.5 | Drop the separate `test:contract-snap` npm script. The contract snapshot test is `packages/schema/api/contract.test.ts`, picked up by `npm run coverage` automatically. Update §7.5 to remove the `test:contract-snap` wiring. The qa chain remains unchanged. |
| F3 | §6.1 | Clarify that `apps/admin/src/lib/urlState.ts` is a pure helper module (parser + serializer), not a hook — matches Epic 3's pattern. State hooks (useResortList, useResortDetail) call `parseURL` / `serializeURL` directly. |
| G2 | §10.3 (covered by C2 fold above; check the lock-semantics paragraph mentions `strictPort: true`) |
| G3 | §4.3 (handler logic) | Add: "Set `modified_at` to current ISO datetime via `new Date().toISOString()` before the atomic write. Test for this in PR 4.4c's `resortUpsert.test.ts`." |

---

## Post-fold validation

After applying the folds:

1. **`npm run qa` green** in the `epic-4-spec` worktree.
2. **All cross-refs resolve.** Verify with `grep -nE "\[.*?\]\((\.\./)+[^)]+\)" docs/superpowers/specs/2026-05-01-epic-4-admin-app-design.md` — every relative-path link should point to an existing file (note ADR-0011/0012 are in PRs #63/#64 — they don't resolve until those PRs merge; see E1 fold).
3. **Re-dispatch the spec-document-reviewer subagent** (see "How to dispatch reviewer" below).
4. **If APPROVED:** push the fold commits to `docs/epic-4-admin-app-spec`; comment on PR #65 with a summary of the folds + reviewer's APPROVE; request maintainer review.
5. **If REQUEST CHANGES again:** review findings; fold again; re-dispatch (max 3 iterations per the brainstorming skill — then surface to maintainer).

### How to dispatch the reviewer

The reviewer is a general-purpose subagent with a self-contained brief. The brief in the original session was 145 lines. Re-dispatch with a tighter brief that focuses on the **changes** since last review:

```
Subject: Verify Epic 4 spec folds against the prior P0/P1 findings.

Context: The spec at docs/superpowers/specs/2026-05-01-epic-4-admin-app-design.md was reviewed last session and returned REQUEST CHANGES with 9 P0 + 8 P1 findings. The folds have been applied per the maintainer's authorized direction:
- 12 PRs total (4.4 → 4.4a/b/c/d, 4.5 → 4.5a/b, 4.1c bundled with Epic-3-PR-3.2 precedent).
- Dockerfile guard deferred to Epic 6 per maintainer decision.
- All other P0s and most P1s folded per the prior review's "Suggested fold" lines.

Your job: verify each P0/P1 finding from the prior review is addressed in the new spec text. Cite file:line for each fold. Flag any P0 that wasn't actually folded, or where the fold introduced a new issue. Do NOT re-litigate the locked decisions (12 PRs, Dockerfile defer to Epic 6); review only execution quality.

Hard cap: 30 lines.
```

---

## After spec merges

Per the brainstorming skill workflow:

8. **User reviews the written spec** — surface PR #65 to the maintainer; wait for explicit approval.
9. **Transition to writing-plans** — invoke `superpowers:writing-plans` to create `docs/superpowers/plans/2026-05-XX-epic-4-admin-app-plan.md` (date when plan is drafted). The plan decomposes each of the 12 PRs into TDD-ordered concrete tasks.

The plan is a separate PR. Once both spec and plan are on `main`, implementation begins with PR 4.1a.

---

## Known phantom-merge concerns

GitHub's stacked-PR phantom-merge pattern bit twice in this session — once on PR #56 (which was re-applied as #57), and possibly again on #57 itself per a reviewer note in `.worktrees/agents-md-foundation/docs/agent-discipline/enforcement-matrix.md` flagging `quality-gate / analyze` as "planned (phantom-merged)".

**At handover time, verify origin/main HEAD** with:

```bash
git fetch origin main
git log --oneline origin/main -10
gh api repos/mathvbarone/snowboard-trip-advisor/commits/main --jq '.sha + " " + .commit.message'
```

If origin/main HEAD is `9e8ac47` (PR #55's squash) and PR #57 was marked MERGED on GitHub but its commit isn't in main, the analyze job is still missing from `main` and needs another re-apply. The pattern is: stacked PR's base branch gets auto-deleted on parent's squash merge → GitHub marks the stacked PR as MERGED without landing the diff. Mitigation already in AGENTS.md "PR Sizing Discipline" subsection on stacked-PR phantom-merge hazard (PR #59).

If a third phantom-merge happened on #57, **do NOT re-apply unilaterally without surfacing to the maintainer** — the recurring failure suggests something deeper (maintainer's merge tooling? auto-base-branch-delete setting?) and they should investigate.

---

## Pending decisions surfaced to user — none

The two structural decisions (PR count, Dockerfile guard) were both answered before this handover. No open user questions blocking the next agent.

---

## How to start (concrete first action)

```bash
cd /Users/matheusbarone/Projects/snowboard-trip-advisor/.worktrees/epic-4-spec
pwd  # confirm: /Users/matheusbarone/Projects/snowboard-trip-advisor/.worktrees/epic-4-spec
git status  # should be clean on docs/epic-4-admin-app-spec
git log --oneline -3  # should show the spec commit a3234f6 + the prior chore/post-epic-3-prune base

# Read the current spec:
cat docs/superpowers/specs/2026-05-01-epic-4-admin-app-design.md | head -100

# Apply the P0 folds in order (A1 → A3 → B3 → C2 → C4 → D2 → E1 → G1 → Z1).
# Then the P1 folds.

# After folds, run qa:
npm run qa  # must be green

# Verify cross-refs:
grep -nE "\[.*?\]\((\.\./)+[^)]+\)" docs/superpowers/specs/2026-05-01-epic-4-admin-app-design.md

# Commit + push:
git add docs/superpowers/specs/2026-05-01-epic-4-admin-app-design.md
git commit -s -m "docs(spec): fold spec-document-reviewer P0+P1 findings"
git push origin docs/epic-4-admin-app-spec

# Re-dispatch the reviewer (Agent tool with general-purpose subagent_type and the brief from "How to dispatch reviewer" above).

# If APPROVED, post a summary on PR #65:
gh pr comment 65 --body "spec-document-reviewer APPROVED on the post-fold spec. P0+P1 findings folded per the maintainer's authorized direction. Ready for maintainer review + spec-merge gate. Next: superpowers:writing-plans for the implementation plan."
```

---

## Memory items the next agent should preserve

Auto-memory at `~/.claude/projects/-Users-matheusbarone-Projects-snowboard-trip-advisor/memory/` already has the relevant project feedback (per-PR codex review, local-test plan execution per PR, atomic-PR sizing, section review during brainstorming, edit-tool worktree path discipline). No new memory entries needed from this session.

---

## End-of-session state summary

> **Updated post-#66.** The original session's snapshot listed PRs #57–#62 as open / awaiting merge; all of those have since landed. This summary now reflects the actual `main` state at the time this handoff became tracked. The original snapshot is preserved in [`2026-05-01-post-epic-3.md`](./2026-05-01-post-epic-3.md) and the PR #66 description for the audit trail.

- **Epic 3:** shipped on `main` (PRs #14–#55 merged).
- **PR #57** (`quality-gate / analyze` CI job): merged on `main`. The analyze job runs informationally after `qa`; not on the required-status set yet (Epic 6 deferral).
- **Agent-discipline migration:** DONE on `main` via PR #66 (single squash-merge of the consolidated content; original 4-PR stack #58→#62 phantom-merged into chained branches without reaching `main`). Subagent-review folds and Codex-review folds all integrated. See [`2026-05-01-post-epic-3.md`](./2026-05-01-post-epic-3.md) "Audit deferrals" for the phantom-merge incident write-up + reachability-check lesson.
- **ADRs 0011 + 0012:** still open (#63, #64); independent of the spec PR; merge-order doesn't matter.
- **Epic 4 spec:** still open (#65); REQUEST CHANGES from spec-document-reviewer; 9 P0 + 8 P1 folds authorized below but NOT YET applied. **This is the next agent's primary work surface.**
- **Implementation:** has not started. First implementation PR is 4.1a, after the spec merges and `superpowers:writing-plans` produces the plan.

Total open PRs at the time this handoff became tracked: **3** (#63, #64, #65) plus any Dependabot bumps.

Focus on Epic 4 spec folds + the `superpowers:writing-plans` transition. The agent-discipline stack PRs that the original snapshot warned not to touch are now closed (content landed via #66); they don't need attention.
