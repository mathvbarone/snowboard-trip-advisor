# ADR-0011: Defer Test / Sync admin actions from Epic 4 to Epic 5

- **Status:** Accepted
- **Date:** 2026-05-01
- **Deciders:** @mathvbarone
- **Related spec:** [`docs/superpowers/specs/2026-04-22-product-pivot-design.md`](../superpowers/specs/2026-04-22-product-pivot-design.md) §3.6 (Resort editor) and §8.4.1 (`/api/*` contract inventory rows 4 + 5)
- **Related ADRs:** [ADR-0001](./0001-pivot-to-data-transparency.md), [ADR-0002](./0002-durable-vs-live-split.md), [ADR-0003](./0003-fx-conversion-at-adapter-boundary.md)

## Context

Parent spec §3.6 specifies two adapter actions on the Resort editor:

- **Test** — probes the adapter with a fixture, renders the result.
- **Sync** — triggers a real adapter fetch, writes to workspace.

Spec §8.4.1 backs these with `/api/*` endpoints 4 (`POST /api/resorts/:slug/test-adapter/:sourceKey`) and 5 (`POST /api/resorts/:slug/sync/:sourceKey`).

At Epic 4 kickoff, every adapter in `packages/integrations/` is a stub returning synthetic data:

- `packages/integrations/src/adapters/airbnb/stub.ts`
- `packages/integrations/src/adapters/booking/stub.ts`
- `packages/integrations/src/adapters/opensnow/stub.ts`
- `packages/integrations/src/adapters/resort-feed/stub.ts`
- `packages/integrations/src/adapters/snowforecast/stub.ts`

Real adapter implementations land in Epic 5 PR 5.1+ on top of `packages/integrations/http/constrainedDispatcher.ts` — neither the constrained dispatcher nor any non-stub adapter exists yet.

Wiring Test / Sync UX in Epic 4 against the stubs is technically feasible. The buttons would render, the flow would be end-to-end (UI → API handler → stub adapter → result rendered / workspace write), and the round-trip would exercise the API contract. But the result is shallow UX: a human analyst clicking "Test snow_depth_cm" gets back synthetic numbers from a stub; "Sync" writes synthetic numbers into the workspace. There is no real probing happening, and no real failure mode (rate-limit / network / parse) for the UI to handle, since stubs never fail in the ways real adapters do.

Three options were on the table:

1. **Ship Test / Sync against stubs in Epic 4.** Faithful to parent §3.6 / §8.4.1; admin app feature-complete at Epic 4 close. Cost: shallow UX in `main` for the duration of Epic 5; the eventual Epic 5 work that introduces real adapters has to also retrofit error / rate-limit handling into the Epic-4-shipped UI; the API contract for endpoints 4 + 5 ships untested against any failure mode that stubs don't surface.
2. **Defer Test / Sync to Epic 5.** Epic 4 ships the Resort editor with the durable + live panels, the AUTO ↔ MANUAL `ModeToggle`, and the StatusPill, but no Test / Sync buttons; endpoints 4 + 5 are not implemented in Epic 4. Epic 5 PR 5.1 introduces `constrainedDispatcher`; Epic 5 PR 5.2 introduces the first real adapter; the Test / Sync UX + the matching `/api/*` endpoints land alongside the first real adapter as a single end-to-end vertical.
3. **Ship a read-only "adapter status" panel in Epic 4.** No buttons; a passive view of `field_sources[*].fetched_at` + `observed_at` + StatusPill state per field. Compromise position. But the Resort editor's main usefulness in Phase 1 is **manual data entry** (the AUTO mode is not actually useful until adapters work) — the read-only adapter panel adds little until Epic 5 anyway.

## Decision

**Defer Test / Sync UX from Epic 4 to Epic 5.** Epic 4 ships the Resort editor with durable + live panels + AUTO/MANUAL `ModeToggle` + StatusPill, but no Test / Sync buttons and no implementation of `/api/*` endpoints 4 + 5. Epic 5 PR 5.x introduces both as a single vertical alongside the first real (non-stub) adapter.

Concretely:

1. **Epic 4 omits endpoints 4 + 5** from the `packages/schema/api/*.ts` Zod surface and from `apps/admin/server/*.ts` handler registration. The corresponding rows in §8.4.1 are documented as Epic 5 in the Epic 4 spec.
2. **Epic 4 ships the AUTO ↔ MANUAL `ModeToggle`** — the toggle is the Phase-1-useful affordance for manual data entry, and it works regardless of whether adapters are real or stubs. AUTO mode in Epic 4 displays the most recent value with a `SourceBadge` (read-only); MANUAL mode exposes the value as an editable input/select. The toggle's wire shape is locked in Epic 4; Epic 5 only widens its behaviour by adding the Test / Sync action buttons that AUTO mode reveals.
3. **Epic 5 PR 5.x adds the Test / Sync UX** in the same PR (or stack) that introduces its first real adapter. That PR carries the failure-mode UI work — rate-limit visualisation, fetch error display, `upstream_hash` change visibility — that didn't make sense to design against stubs.
4. **The admin's API client (`apps/admin/src/lib/apiClient.ts` — see Epic 4 spec)** is generated from the Zod surface and naturally lacks `testAdapter` / `sync` calls in Epic 4. Epic 5 grows the client when the schemas grow, with no admin-UI churn at the boundary.

## Consequences

**Positive:**

- Epic 4 ships **without shallow UX** in `main`. No buttons that exist solely to talk to stubs.
- The Test / Sync vertical is **designed against real adapter failure modes** in Epic 5, not retrofit on top of an Epic-4 UI shape that didn't account for them.
- One fewer PR in Epic 4's breakdown — the Resort editor PR(s) are tighter (durable + live panels + ModeToggle + StatusPill, no adapter round-trip).
- The `/api/*` contract for endpoints 4 + 5 ships once, in Epic 5, with the real adapter shape — no Phase-1-shallow → Phase-1-real evolution within a single Phase 1.

**Negative:**

- Admin app is **not feature-complete** at Epic 4 close; the gap is documented in the Epic 4 post-milestone handoff.
- Future agents reading parent §3.6 / §8.4.1 in isolation could expect Test / Sync to exist in `apps/admin` after Epic 4. Mitigated by:
  - This ADR's existence (lands with this PR on `main`).
  - The Epic 4 spec ([PR #65](https://github.com/mathvbarone/snowboard-trip-advisor/pull/65), still open at this ADR's draft time) cross-references this ADR and adds an `Out of Scope` entry explicitly listing Test / Sync + endpoints 4-5 as Epic 5. **Both this ADR and PR #65 must land on `main` for the mitigation to be complete** — until #65 merges, the parent spec §3.6 / §8.4.1 carries an unaccompanied Test / Sync mention without the explicit deferral note. Maintainer should land them in the same review window.
  - The drift checker (`scripts/check-agent-discipline-sync.ts`, landed on `main` via [PR #66](https://github.com/mathvbarone/snowboard-trip-advisor/pull/66)) does NOT mechanise this specific deferral — its `agents-section-coverage` check enforces AGENTS.md structural integrity, not Epic 4 scope decisions. The deferral remains documented-but-not-gated.
- The `ModeToggle` in Epic 4 has only a single useful mode (`MANUAL`) since `AUTO` mode displays last-known stub data with no refresh action. The toggle's UI exists; its `AUTO` half is read-only-with-stale-data until Epic 5 lands. This is acceptable for Phase 1 (loopback admin, single analyst, the usefulness is in MANUAL mode anyway); it would not be acceptable for a multi-user production admin.

**Lift conditions:**

- Epic 5 PR 5.1 introduces `packages/integrations/http/constrainedDispatcher.ts`.
- Epic 5 PR 5.2 introduces the first real (non-stub) adapter on top of `constrainedDispatcher`.
- The PR or stack that lands real-adapter PR 5.2 also lands the Test / Sync UX + endpoints 4-5 + the matching `apps/admin/server/*.ts` handlers + the schema additions to `packages/schema/api/*.ts`.

## Negative space

- **Not deferred:** the AUTO ↔ MANUAL `ModeToggle`, the StatusPill (`Live` / `Stale` / `Failed` / `Manual`), the durable + live panels, the all-or-nothing publish workflow (endpoint 6), analyst notes (endpoints 9 + 10). All are in Epic 4 scope.
- **Not specified here:** the exact shape of the Epic 5 Test / Sync UI (button placement, modal vs inline result, error surface). Designed in Epic 5's spec.
