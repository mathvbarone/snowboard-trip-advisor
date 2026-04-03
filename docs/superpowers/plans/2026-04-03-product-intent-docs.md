# Product Intent Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `README.md` and extend `CLAUDE.md` so the repository clearly documents the long-term product direction and requires README maintenance in product-facing PRs.

**Architecture:** Keep the implementation strictly documentation-only. Lead the README with product vision and decision criteria, preserve a truthful current-state section about the existing local-first implementation, and add project-intent plus documentation-discipline rules to `CLAUDE.md` without weakening the existing quality-gate instructions.

**Tech Stack:** Markdown documentation, existing repository conventions

---

### Task 1: Restructure `README.md` around product vision

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Rewrite the README opening and section order**

Replace the current architecture-first introduction with a vision-led introduction that states:

```md
# Snowboard Trip Advisor

Snowboard Trip Advisor is intended to become a snowboard resort marketplace and decision-support app for a trip organizer planning for a group. The product should help one person rank and shortlist resort options using transparent tradeoffs rather than a black-box recommendation.

The long-term product should balance four core criteria:

- riding quality as the primary headline signal
- resort size, including slopes, lifts, and practical mountain scale
- current snow conditions
- lodging cost in the resort region

The project combines two system layers:

- durable resort intelligence that can be researched, normalized, scored, and published on a slower cadence
- live market signals such as snow conditions and lodging prices that should eventually be refreshed close to real time
```

- [ ] **Step 2: Add user, workflow, and phased-scope sections**

Insert sections that explain:

```md
## Who The Product Is For

The primary user is a snowboard trip organizer choosing the best resort for a group. The app should help that organizer move from broad discovery to a confident shortlist.

## Product Direction

The first phase is discovery-only. Users should be able to compare resorts, understand tradeoffs, and continue to external providers for booking or accommodation decisions.

The longer-term direction is comparison plus live deal visibility. As the system evolves, it should incorporate near-real-time snow and lodging signals without losing provenance, explainability, or trust.
```

- [ ] **Step 3: Add a clear current-state correction layer**

Add a section that keeps the README honest about the implemented state:

```md
## Current State Today

The current codebase implements the foundation of the product rather than the full marketplace vision. Today it provides:

- a frontend that reads a published dataset from local JSON
- a research pipeline that normalizes resort data, scores it, validates it, and publishes versioned snapshots
- local-first CLI workflows for refresh and publish operations

The current implementation does not yet provide live snow ingestion, live lodging price aggregation, or in-app marketplace deal comparison.
```

- [ ] **Step 4: Preserve and tighten the existing technical sections**

Keep the useful architecture, data flow, CLI, and frontend usage sections, but edit wording where needed so they support the product-first framing instead of competing with it. Remove duplicated explanations if the new top sections already cover them.

- [ ] **Step 5: Review README for vision drift and overstatement**

Read `README.md` end to end and confirm:

- the long-term product is prominent
- the current state is explicit
- no section implies direct booking is already implemented
- another agent could infer future epics such as live snow ingestion, lodging-price aggregation, ranking refinement, and marketplace-style comparison

- [ ] **Step 6: Commit README changes**

```bash
git add README.md
git commit -m "docs: clarify snowboard trip advisor product vision"
```

### Task 2: Extend `CLAUDE.md` with project intent and README maintenance rules

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add a project-intent section near the top**

Insert a section after setup or near the top that states:

```md
## Project Intent

Snowboard Trip Advisor is intended to become a decision-support marketplace for a snowboard trip organizer planning for a group.

The primary product goal is to help that organizer rank and shortlist resorts. The main comparison criteria are:

- riding quality first
- resort size
- current snow conditions
- lodging cost in the resort region

The system should be semi-opinionated. It should surface rankings and recommendations, but the reasoning behind them must remain inspectable.

Phase 1 is discovery-only and should route users to external providers for booking decisions. Future phases may expand toward live deal visibility.

Agents must preserve a clear distinction between durable resort intelligence and live market signals. Those categories have different freshness, provenance, validation, and publishing requirements.
```

- [ ] **Step 2: Add a documentation-discipline section**

Insert explicit README maintenance rules:

```md
## Documentation Discipline

- `README.md` is the strategic product document for this repository and must stay aligned with the intended product direction.
- Any PR that introduces meaningful product-facing functionality must evaluate whether `README.md` needs an update.
- Any PR that changes product scope, user workflow, system boundaries, or roadmap direction must update `README.md` in the same branch.
- Treat README drift as a documentation bug, not optional cleanup.
```

- [ ] **Step 3: Review `CLAUDE.md` for duplication and instruction quality**

Confirm that:

- the existing quality-gate, TDD, and code rules remain intact
- the new sections clarify product intent without contradicting implementation constraints
- the README maintenance rule is explicit enough to guide future feature PRs

- [ ] **Step 4: Commit `CLAUDE.md` changes**

```bash
git add CLAUDE.md
git commit -m "docs: add product intent and readme maintenance rules"
```

### Task 3: Final verification and branch-safe delivery

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Inspect the doc diff only**

Run:

```bash
git diff -- README.md CLAUDE.md docs/superpowers/specs/2026-04-03-product-intent-docs-design.md docs/superpowers/plans/2026-04-03-product-intent-docs.md
```

Expected: diff is limited to the approved documentation files and does not touch unrelated in-progress work.

- [ ] **Step 2: Run the repository quality gate if practical**

Run:

```bash
npm run qa
```

Expected: PASS. If the command fails because of unrelated pre-existing work, capture that clearly before closing the task.

- [ ] **Step 3: Summarize outcomes for handoff**

Prepare a handoff summary covering:

- product-vision changes in `README.md`
- new project-intent and README-maintenance rules in `CLAUDE.md`
- verification status and any blockers caused by unrelated local changes

