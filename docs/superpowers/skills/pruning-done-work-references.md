---
name: pruning-done-work-references
description: Use when an epic, milestone, or major feature PR has just merged and the project's reference documents (specs, plans, handoffs, agent-rules files like CLAUDE.md) still carry detailed PR-by-PR implementation instructions for the now-completed work. Symptoms: agent context bloated with done-work descriptions; spec sections describe how to do something the codebase already did; untracked planning scratchpads from earlier sessions linger in the working tree; handoff doc names still say "post-Epic-N" where N is the previous milestone.
---

# Pruning Done-Work References

## Overview

After a milestone (epic, major feature, multi-PR initiative) lands, reference docs accumulate detailed PR-by-PR instructions for completed work. Future agents load this content as context but it's pure history — they don't need it to do new work. This skill prunes the done-work descriptions to "DONE — see PR #N" pointers, writes a fresh tracked handoff capturing post-milestone state, and deletes stale untracked scratchpads.

**Core principle:** the codebase + merged commits + ADRs are the durable record of what shipped. The spec / agent-rules / handoffs only need to carry what future work depends on.

## When to Use

- An epic, milestone, or major feature has just merged to the integration branch (usually `main`).
- The project's spec contains a "PR 1.1 — do X; PR 1.2 — do Y" breakdown for PRs that already merged.
- The agent-rules file (CLAUDE.md / AGENTS.md / equivalent) contains "active from PR x.y" activation prose for rules that are now live.
- Untracked plan/handoff scratchpads from prior sessions exist in the working tree (`git status` shows them under `??`).
- The user explicitly asks to "clean up reference docs" or "prune the spec."

**Don't use:**
- Mid-milestone (some PRs still pending). Wait until the milestone fully lands.
- For ADRs — they're decision records, not implementation instructions. They stay.
- For project-specific narrative docs the user has explicitly chosen to keep verbatim.
- For trivial changes (single bugfix PRs don't need a doc-prune cycle).

## Process

### 1. AUDIT (no changes)

Inventory every reference doc that an agent might load. Categorize each:

- **Load-bearing forward** — needed for upcoming work. KEEP.
- **Done-work history** — describes a milestone that already shipped. TRIM or DELETE.
- **Stale** — bootstrapped a session that's now over (e.g., post-Epic-1 handoff after Epic 2 merged). DELETE.
- **Architectural** — ADRs, license boundary, durable principles. KEEP.

Typical inventory locations:
- `docs/superpowers/specs/**` (or wherever specs live)
- `docs/superpowers/plans/**` (often untracked scratchpads)
- `docs/superpowers/handoffs/**` (often untracked scratchpads)
- `docs/adr/**` (ADRs — KEEP)
- `CLAUDE.md` / `AGENTS.md` (agent-rules)
- `README.md`

Show the inventory + line counts to the user as a table. Compute total agent-context lines before-vs-projected-after.

### 2. PROPOSE — get user confirmation BEFORE deleting

Show specific actions per file (KEEP / TRIM / SUMMARIZE / DELETE / ARCHIVE) and ask:

1. Aggressive vs conservative trim? (Aggressive: drop done-work tables/sections wholesale. Conservative: keep historical record, just collapse to summaries.)
2. Should the new milestone-completion handoff be **tracked** (committed) or untracked? (Recommend TRACKED — it's a durable onboarding artifact.)
3. Where do deleted plans go? (a) Delete entirely (rely on git history); (b) Move to `archive/`; (c) Compress to 1-page summary.

Wait for explicit answers. Don't assume.

### 3. EXECUTE in a feature-branch worktree

- Cut a feature branch off `main` (use the project's worktree convention if any — e.g., `superpowers:using-git-worktrees`).
- Delete untracked plan/handoff scratchpads from BOTH the main checkout and any worktree (untracked files don't appear in `git diff` but they DO appear in agent context if the agent has them on disk).
- For the spec: replace done-work PR breakdowns with concise "Status: DONE — merged in PR #N (commit `<sha>`). Delivered: [one-line summary]. Deviations: [load-bearing-only]." paragraphs. Keep forward epics' PR breakdowns INTACT. If the actual PR landed multiple sub-PRs as a single squash-merge (common pattern: spec planned PR 3.1–3.6 but execution collapsed to one PR #15), call that out in the "Delivered" sentence so future agents reading the spec understand why granular sub-PR numbers don't appear in `git log`.
- For the agent-rules file: first inventory the activation qualifiers — `grep -nE "active from PR|Active from PR" CLAUDE.md AGENTS.md 2>/dev/null` — to see exactly which blocks describe landed-PR activation conditions vs forward-PR ones. Drop only the landed ones; keep activation qualifiers for forward PRs untouched.
- Write a fresh **tracked** post-milestone handoff at `docs/superpowers/handoffs/<YYYY-MM-DD>-post-<milestone>.md` capturing: TL;DR; what exists on `main`; spec deviations to remember; audit deferrals; next milestone outline; how-to-start verification commands.

### 4. SUBAGENT REVIEW — REQUIRED for CODEOWNERS-protected paths

This PR almost always touches `docs/superpowers/specs/**`, the agent-rules file, and `docs/superpowers/handoffs/**`. All are typically CODEOWNERS-protected per the project's Subagent Review Discipline.

Dispatch an independent reviewer with explicit instructions to verify:
- Forward-looking content (e.g., spec §9 Epics 3+ PR breakdowns) is intact, not accidentally truncated.
- Cross-references to deleted sections are updated everywhere (e.g., if §11.2 was removed, no other section still says "see §11.2"). Run `grep -nE "§11\.[1-6]|§13|§14"` (adjust ranges to match what you removed).
- ADRs are unchanged.
- The agent-rules file still covers all original load-bearing rules (compare against `git show main:CLAUDE.md`).
- The new handoff's tree listing matches actual repo state; the deviations are real (not fabricated).

**Be critical, not validating.** Tell the reviewer to find issues, not approve.

### 5. APPLY review corrections

Fold all must-fix issues into the same branch (one or more follow-up commits). Re-verify QA + CI.

### 6. OPEN PR + MONITOR CI

- Detailed PR body: what was kept vs trimmed, why; net impact (before/after line counts); subagent review summary.
- Required checks: project's `quality-gate / qa` (no-op for doc-only) + DCO. Merge gate must be CLEAN.
- Don't merge without explicit user confirmation if the project requires it.

## Key Invariants (do NOT break)

| Invariant | Why |
|---|---|
| Forward-looking PR breakdowns survive intact | Future agents need them to plan upcoming work |
| ADRs are never trimmed | They're decisions, not implementation instructions |
| Cross-references updated wherever they appear | Stale `see §X` pointers confuse future readers |
| Subagent review runs before merge for CODEOWNERS paths | Project discipline; doc-only PRs don't bypass it |
| New handoff is tracked (committed) | Untracked scratchpads lose info across sessions |
| User confirms aggressive-vs-conservative scope before deletion | Destructive operations require explicit consent |

## Common Mistakes

| Mistake | Fix |
|---|---|
| Treating ADRs as done-work and trimming them | ADRs are decisions; never trim them |
| Trimming forward-looking content (e.g., Epic 3+ PR breakdown) | Re-read what you trimmed; if it describes future work, restore it |
| Deleting `§11.2` from the spec but leaving "see §11.2" elsewhere | Run a grep for the deleted section number across all docs; update every match |
| Deleting plans without a tracked replacement handoff | Always write the handoff in the same PR; don't ship a deletion-only PR |
| Skipping subagent review because "it's only docs" | Subagent Review Discipline is mechanical (path-triggered), not semantic |
| Aggressively pruning without proposing the scope first | User must confirm aggressive-vs-conservative; destructive ops require consent |
| Forgetting that untracked files still affect agent context | Delete from main checkout's working tree, not just from the new branch |
| Reframing pivot/integration-branch strategy without consulting | If the project's branch strategy stopped matching reality, surface it as a question, not a unilateral edit |

## Quick Reference

| Source file type | Default action |
|---|---|
| Spec § for done epic | Replace PR-by-PR with "DONE — see PR #N" paragraph |
| Spec § for upcoming epic | KEEP intact |
| Spec § "disposition table" of done file ops | DROP (the repo tree is now canonical) |
| Spec § "reviewer lineage" / historical PR ship notes | DELETE |
| Agent-rules file: "active from PR x.y" prose for landed PR | DROP the activation qualifier; keep the rule |
| Agent-rules file: rule itself | KEEP |
| ADRs (any number) | KEEP unchanged |
| Untracked plan files (executed) | DELETE from working tree |
| Untracked handoff (stale milestone) | DELETE; replace with tracked new-milestone handoff |
| README.md (when shipped epic was infrastructure-only) | Light review; rarely edit (strategic doc) |
| README.md (when shipped epic delivered user-facing functionality — public app, admin app, real adapters) | Required surface-level update: add "what's now live" to the strategic framing; refresh "what exists today" / "Status & roadmap" sections to reflect post-milestone reality. Same-PR update per project's Documentation Discipline. |

## Real-World Impact

Applied to Snowboard Trip Advisor post-Epic-2 (PR #11):
- Tracked agent-context: 1985 → 1327 lines (−33%)
- Untracked scratchpads: 5069 → 0 lines (−100%)
- **Effective agent-loaded reference: ~7054 → 1327 lines (−81%)**
- Subagent review surfaced 4 must-fix issues (stale `§11.2` cross-references in two files; missing pivot-branch context in agent-rules; security-critical attributes dropped from handoff PR 3.5 description) — all caught before merge.

## Red Flags — STOP and reconsider

- "I'll just delete this section, no one looks at it" → Did you grep for cross-references first?
- "The user said aggressive trim, so I'll cut §10 entirely" → Did you preserve `§10.4` git workflow / `§10.5` invariants? Those are forward-looking.
- "ADRs describe what we did, so they're done-work" → No. ADRs are decisions. Keep them.
- "I'll skip the subagent review for a doc PR" → CODEOWNERS-protected paths trigger review mechanically. Don't skip.
- "The plans were untracked anyway, so I don't need to write anything to replace them" → Wrong; the new tracked handoff is the durable replacement. Don't ship a deletion-only PR.
