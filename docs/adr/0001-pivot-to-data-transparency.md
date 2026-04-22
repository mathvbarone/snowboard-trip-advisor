# ADR-0001: Pivot from scoring-based ranker to data-transparency comparison tool

- **Status:** Accepted
- **Date:** 2026-04-22
- **Deciders:** @mathvbarone
- **Related spec:** [`docs/superpowers/specs/2026-04-22-product-pivot-design.md`](../superpowers/specs/2026-04-22-product-pivot-design.md)
- **Related ADR:** [`ADR-0002`](./0002-durable-vs-live-split.md) (promotes the durable/live distinction to an architectural invariant)
- **Supersedes:** [`docs/superpowers/specs/ARCHIVED-2026-04-03-snowboard-trip-advisor-design.md`](../superpowers/specs/ARCHIVED-2026-04-03-snowboard-trip-advisor-design.md)

## Context

The project was originally framed as an opinionated resort **ranker** for a snowboard trip organizer: compute a score per resort from weighted signals (riding quality, resort size, snow conditions, lodging cost), sort the shortlist by that score, and expose the reasoning so the organizer could override the default ordering.

In practice, that framing created two problems:

1. **The score is the product's load-bearing claim, but it has no ground truth.** Weighted scoring requires the product to assert that riding quality at resort A is objectively better than resort B. For a trip organizer balancing group preferences that can shift (price vs. terrain vs. snow reliability vs. access), a fixed weighting is wrong by construction — and a tunable weighting is an interface the user already has in their head.
2. **Scoring hides the data.** Every layer of normalization and scoring distances the user from the source. For a decision-support tool, the user's trust in the output is anchored in being able to see **why a value is what it is** — which source, when observed, how stale. A score collapses that into one number and throws away the provenance the user actually needs.

These are not implementation problems. They are product-framing problems. No amount of scorer tuning fixes them.

## Decision

Pivot the product direction from **"rank resorts for the organizer"** to **"show the data transparently and let the organizer rank."**

Concretely:

- The product surfaces durable resort facts and live market signals **side-by-side with visible source provenance** (source, `observed_at`, `fetched_at`).
- The product sorts, filters, and shortlists — but it does **not** compute or display an overall score.
- The user does the ranking in their own head, using the inspectable data the product puts in front of them.
- The durable-vs-live architectural split (resort facts that change slowly vs. market signals that need freshness) is preserved and tightened: two document types in the schema (`Resort`, `ResortLiveSignal`) with separate freshness, validation, and publishing rules.
- Booking stays external (discovery-only). Phase 1 routes users to upstream providers with disclosed deep links.

## Consequences

### Positive

- **Trust model is honest.** The user sees the source and makes the call. There's no black-box weighting to defend.
- **Freshness is legible.** Because every value carries `observed_at`, stale data is a visible UI state, not a silent corruption of a derived score.
- **Architectural split is preserved.** Durable vs. live was already a principle in `CLAUDE.md`; this pivot strengthens it by making the schema split explicit rather than leaving the two categories blended in a single record.
- **Simpler product surface.** No scorer means no scoring thresholds, no weight-tuning UI, no "why is resort A above resort B" explanations to maintain.

### Negative / costs

- **Scoring code and config are deleted.** `config/scoring.ts`, `research/scoring/*`, and related tests are removed (§10.2 of the spec). This is a one-way door — reverting the pivot would require rebuilding scoring on top of the new schema.
- **The product is less "opinionated" by default.** A user who wanted a recommendation engine is not this product's user.
- **Dataset migration required.** The v0 published dataset must migrate to v1 (`migrate:v0-to-v1` CLI, spec §9 Epic 2 PR 2.1). After the consumer flip (PR 2.4a) the legacy reader is retained but unwired — added to the workspace's `coverage.exclude` list with a dated rationale comment that sets a one-week soak deadline. Demolition happens in PR 2.4b once the soak period closes (spec §10.4 rollback boundary).
- **README and CLAUDE.md both require updates** to match the new framing. Drift between code and documentation was already the primary documentation risk for this repo; this ADR is landing in the same PR as those updates.

### Neutral / follow-on

- The `/api/*` contract surface becomes the Phase 1 → Phase 2 portability line (spec §8.4). Scoring would have been a backend concern; removing it simplifies the contract.
- Future Phase 2 multi-operator work is easier because there's no scorer-configuration surface to multi-tenant.

## Alternatives considered

### A. Keep scoring; make weights user-tunable

Expose the weighting as UI sliders and let the user rank by their own weighting. Rejected because:

- It is still a black box for the user who doesn't care to tune — most trip organizers don't want to do weight design.
- It shifts the trust problem to the weighting UI rather than solving it.
- The underlying data transparency need is orthogonal: even with user-tunable weights, the user still can't see sources without a separate inspection surface. Better to ship the inspection surface first.

### B. Keep scoring; display score + sources alongside

Compromise: show both the ranking and the underlying data. Rejected because:

- The score inevitably dominates the UI (it's at the top of the card), which trains the user to trust it. The "sources alongside" become decoration.
- Maintaining both makes the product more complex, not simpler. The one thing a pivot is good for is reducing surface area.

### C. Defer the decision; keep building on the scoring direction

Rejected because the existing pipeline is still small enough (one Vite app, a handful of tests) that rebuilding on the new direction costs less than continuing to pour effort into the scoring path and pivoting later. The cost-to-reverse curve is steeply up-and-to-the-right.

## Notes

- This ADR lands in the same PR as the spec (`docs/superpowers/specs/2026-04-22-product-pivot-design.md`), the `README.md` rewrite, and the `CLAUDE.md` amendments. The intent is that `pivot/data-transparency` does not carry a split-brain state where the spec describes the new direction and the README still describes the old one.
- ADR-0002 (durable-vs-live split) lands in the same PR as this ADR — both are load-bearing from day one. ADRs 0003-0007 are scheduled for backfill at Epic 6 PR 6.4 per the spec §11.3. The ADR process itself (numbering, MADR-style format, review requirements) is codified in ADR-0007 (to be written).
