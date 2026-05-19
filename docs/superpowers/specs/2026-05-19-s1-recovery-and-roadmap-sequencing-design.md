# S1 Recovery & Roadmap Sequencing — Design

- **Status:** Approved (brainstorm complete; pending spec-review loop + user review)
- **Date:** 2026-05-19
- **Author:** @mathvbarone (request) + agent
- **Purpose:** Remediate the partially-landed S1 design-system CSS pass, then
  perform doc/branch housekeeping, then tee up the next visual-fidelity slice.
- **Related:** `docs/superpowers/specs/2026-05-17-visual-fidelity-audit-and-decomposition.md`
  (roadmap); S1 spec `2026-05-17-s1-design-system-component-css-design.md`; S1
  plan `2026-05-17-s1-design-system-component-css.md`; ADR-0004/0005/0006.

---

## 0. Problem statement (verified facts)

The S1 stack (S1.0 + S1a + S1b + S1c-1 + S1c-2 + S1d, originally PRs
#122–#127, stacked) is **only ~35% landed on `main`**.

- `origin/main` past S0 (`fa10214`) is exactly one commit: `0952701`
  ("S1.0 … (#122)"), a **squash** of #122's branch, which contained
  **S1.0 + S1a + two post-merge folds**: `2142cd0` (gallery `ToastProvider`
  scoped to the route) and `66261aa` (Textarea explicit `box-sizing`).
- #123 (S1a) merged into #122's branch (reached `main` via the squash).
- #124–#127 each merged into their **stacked base branch, not `main`**
  (#124→`claude/s1a-form-controls`, #125→`claude/s1b-surfaces`,
  #126→`claude/s1c1-feedback-a`, #127→`claude/s1c2-feedback-b`). GitHub did
  not retarget after #122 squashed, so each PR merged the *higher* slice
  *down into the lower branch*. Net: S1b/S1c-1/S1c-2/S1d are
  **merged-but-stranded**, disconnected from `main`.
- Result: `main` has `Button.css` (S1a) but **not** `Card.css` (S1b) or
  `Modal.css` (S1d). 17 components + their gallery families + the
  `css-comment-termination` regression guard + the Modal scrim fix are
  absent from `main`.
- PR #130 (`claude/s1a-form-controls` → `main`) was **not** a valid
  consolidation: it carried only S1a+S1b, missing 11 components, and would
  have reverted the `66261aa` box-sizing fold (its `Textarea.css` has no
  `box-sizing`) and conflicted on `Gallery.tsx`/`gallery-smoke.md`
  (merge-base with `main` is S0). **Closed 2026-05-19** with explanation.

The stranded content's superset lives at `origin/claude/s1d-overlays` /
`origin/claude/s1c2-feedback-b` (chain tips, contain all of S1b–S1d), but
those branches predate `main`'s squash and **lack both folds**, so recovery
is a **replay-and-reconcile onto current `main`**, not a merge.

## 1. Recovery — 4 strictly-sequential clean PRs (Section A)

Recreate S1b → S1c-1 → S1c-2 → S1d as 4 fresh PRs, **strictly sequential —
NOT a simultaneously-open stack.** Every recovery PR has base = `main` and
is branched, opened, reviewed, and **merged to `main` before the next slice
is branched**. At no point is two recovery PRs open against each other.
This is deliberate: it makes branch deletion safe and structurally cannot
recreate the phantom-merge failure mode (a child whose base branch is
deleted/merged-away while it is still open) — the exact bug this recovery
exists to fix. AGENTS.md's phantom-merge procedure names "manual deletion
of a stacked parent before the child merges" as a trigger; strict
sequencing eliminates that trigger entirely (there is never an open child
based on a recovery branch).

New recovery branch names (distinct from the 6 stale `claude/s1*` branches
listed in §2.2): `claude/s1b-recovery`, `claude/s1c1-recovery`,
`claude/s1c2-recovery`, `claude/s1d-recovery`.

Per-slice procedure:

1. Branch off the **current `main`** (which already includes every
   previously-merged recovery slice). Never branch off a sibling recovery
   branch. `claude/s1b-recovery` off post-#122 `main`; `claude/s1c1-recovery`
   off `main` after S1b merged; and so on.
2. Bring that slice's design-system files **verbatim** from the merged
   source (`origin/claude/s1d-overlays`, the full-content tip): each
   component's `<Component>.css` + `<Component>.css.test.ts` + the one-line
   `import './<Component>.css'` in `<Component>.tsx`, for that slice's
   components only. These are byte-for-byte the already-reviewed /
   Codex-clean / smoke-verified files — **no re-derivation**.
3. **Reconcile `Gallery.tsx` / `Gallery.test.tsx`** against `main`'s current
   structure: `main` already has the scoped `ToastProvider`
   (`ScopedToastExemplar`) + `FormControlsFamily` (S1a). The slice adds its
   own `SurfacesFamily` / `FeedbackStatusFamily` / `OverlaysFamily` and
   appends/maintains the empty-family-placeholder assertion (it must reach
   zero empty families after S1d). This reconciliation is the one genuinely
   new code surface per PR and receives focused review.
4. **Preserve both `main` folds:** do not reintroduce the pre-fold
   `Textarea.css` (keep `main`'s `box-sizing: border-box` + its test); keep
   `main`'s scoped Toast. S1d additionally brings the
   `css-comment-termination` guard, the `.sta-modal__overlay` scrim fix, and
   `gallery-smoke.md`'s S1d interaction rules (Modal/Tooltip opened by
   interaction).
5. **Per-PR gates (non-negotiable):** `npm run qa` green (100%×4); a
   self-run gallery smoke from a `main` checkout for that slice's components
   (portalled components per the `gallery-smoke.md` styled-node rule);
   `@codex review` + babysit (double-pass window) + fold any in-scope
   findings + reply with fix SHA (babysit = re-trigger if no 👀 reaction
   in ~12 min; after a verdict watch the ~8 min "double-pass window" for a
   late inline finding before considering the PR clean); two-stage subagent
   review **scaled to
   recovery** — reconciliation-focused (verify replay fidelity vs. the
   merged source + the Gallery.tsx/Textarea reconciliation), not a full
   re-derivation, since the component CSS already passed full review.
6. Merge this PR onto `main`. Only **after** it is merged: delete its
   recovery branch (safe — no open child is ever based on it under strict
   sequencing), then branch the next slice off the now-updated `main`.
   Never delete or retarget a branch that an open PR depends on; never
   open the next recovery PR before this one has merged.

Rationale for re-stack over single consolidation: honors the atomic-PR
rule, keeps each slice independently re-smoked and revertable, and the
reconciliation risk (Gallery.tsx/Textarea) stays small and isolated per PR.

## 2. Housekeeping (Section B) — after recovery merges

1. **Prune done-work references.** The visual-fidelity audit doc's §0/§2/§3
   ("`tokens.css` never imported", "only 3 components carry CSS", "no global
   reset") are stale falsehoods post-S0/S1. Update its reference→screen
   "Exists today?" column, the decomposition table, and the executive
   summary to mark **S0 ✅ / S1 ✅**. Trim the S1 plan/spec PR-by-PR detail
   to a short "shipped — see #121/#122 + recovery PRs" pointer. ADRs are
   decisions, not done-work — leave untouched.
2. **Branch/worktree cleanup.** Delete the 6 stale `origin/claude/s1*`
   branches + their local worktrees (`s1-ds-component-css`,
   `s1a-form-controls`, `s1b-surfaces`, `s1c1-feedback-a`,
   `s1c2-feedback-b`, `s1d-overlays`) **only after** recovery PRs supersede
   them. Sweep merged-but-orphaned S0/analyst-notes worktrees too.
3. **Scratch sweep.** Remove/supersede S1-era `.claude/handovers/` and
   working-tree scratch docs that no longer match reality.

## 3. Sequencing & open decision (Section C)

Order: (1) S1 recovery → (2) housekeeping → (3) next fidelity slice.

The **next fidelity slice is an explicit open decision**, deliberately NOT
chosen now; made once S1 is verifiably green on `main`. Roadmap rationale
captured so the future brainstorm starts fast:

- **S4 — Admin editor fidelity** (ref `05`): lower risk; functionality
  already exists and was verified end-to-end during analyst-notes; pure
  fidelity, no net-new markup.
- **S2 — Public listing fidelity** (ref `01`): higher visible payoff;
  adds net-new `ResortCard` photo `<img>` markup, so fidelity + a small
  feature increment.

(S3 detail-drawer, S5 dashboard remaining fidelity; S6 attributes panel /
S7 lodging are features needing their own product brainstorms — out of
scope here.)

## 4. Success criteria

- `main` contains all 26 S1 components' co-located CSS (26 total = 9 already
  on `main` from S1.0/S1a + 17 recovered by the 4 PRs) + their gallery
  families + the `css-comment-termination` guard + the `.sta-modal__overlay`
  scrim fix.
- Both `main` folds intact: gallery `ToastProvider` route-scoped; Textarea
  `box-sizing: border-box` + its test present.
- `npm run qa` green on `main`; gallery smoke green from a `main` checkout
  (all 26 across variants/states; `?route=gallery` still unlinked).
- 6 stale S1 branches + worktrees deleted; orphaned worktrees swept.
- Roadmap/spec/plan docs reflect S0 ✅ / S1 ✅ with no stale falsehoods.
- Next-slice decision (S4 vs S2) recorded as the single open item.

## 5. Out of scope

- Choosing/implementing the next fidelity slice (S2/S4) — separate brainstorm.
- Any S3/S5/S6/S7 work. Any ADR changes. Any token additions.
- Re-deriving S1 component CSS — recovery is a verbatim replay of
  already-reviewed files; only Gallery.tsx/Textarea reconciliation is new.

## 6. Risks

- **Gallery.tsx reconciliation drift.** Mitigation: per-PR focused review of
  the reconciliation surface + self-run gallery smoke proving every prior
  family still renders and the new one resolves token styles.
- **Silently reverting a `main` fold.** Mitigation: explicit gate — each
  recovery PR diff must show `main`'s Textarea `box-sizing` and scoped
  Toast untouched; a test asserts both.
- **Branch deletion before content verified.** Mitigation: delete stale
  branches only after the superseding recovery PR is merged and smoked.
- **Recreating the phantom-merge bug via stacked-parent deletion**
  (Codex P1, #131). The original failure was a child PR whose base branch
  was deleted/merged-away while still open. Mitigation: §1 mandates *strict
  sequencing* — base = `main` for every recovery PR, each merged before the
  next is branched, so no open child ever depends on a recovery branch and
  the AGENTS.md phantom-merge trigger ("manual deletion of a stacked parent
  before the child merges") cannot occur.
