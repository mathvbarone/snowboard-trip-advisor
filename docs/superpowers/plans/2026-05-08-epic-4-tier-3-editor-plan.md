# Epic 4 Tier 3 — Admin Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan PR-by-PR. Steps use checkbox (`- [ ]`) syntax for tracking. Each PR is its own atomic concern; do **not** bundle. Read the **Reviewer-fold log** at the bottom before starting Task 1 of any PR.

**Goal:** Ship the Snowboard Trip Advisor admin app's resort editor — read path, editor view, write path, edit interaction — across 5 atomic PRs that close the Tier 3 → Tier 4 gate (`docs/superpowers/specs/2026-05-01-epic-4-admin-app-design.md` §7.4).

**Architecture:** The editor reads through `useResortDetail()` (React-19 `use()` + Suspense, per-slug `Map` cache, rejected-promise pinning per [ADR-0010](../../adr/0010-usedataset-rejected-promise-pinning.md)) and writes through `useWorkspaceState()` (debounced PUT with in-flight token + concurrent-PUT queue). The server side adds `resortDetail` (read), `resortUpsert` (write), and an atomic-write helper. Field-state projection (`projectFieldStates: (resort, live, modes, now) → Record<MetricPath, FieldStateFor<unknown>>`) lives in `packages/schema/src/resortView.ts` so Phase 2 can reuse it without an admin-package dependency.

**Tech Stack:** TypeScript strict, React 19, Zod v4, Vite middleware (loopback `127.0.0.1:5174`), MSW tiered (canned + bridge), Vitest + jest-axe, atomic-write via `fsync(fd) → rename → fsync(parent_dir)` with macOS APFS `EBADF` tolerance.

---

## Tier 3 → Tier 4 gate (what we are proving)

Per spec §7.4 this plan must close, on `main`, after PR 4.4d merges:

1. Editor opens for both seed slugs (`kotelnica-bialczanska`, `spindleruv-mlyn`).
2. MANUAL edit on a numeric field round-trips through PUT; page reload preserves workspace state via `editor_modes`.
3. Bridge integration test (`resort-editor-write.test.tsx`) green; per-test workspace tmpdir verified to receive the atomic-written file.
4. `editor_modes` cross-key invariant rejects malformed PUTs with `400 invalid-resort` carrying the refinement message.

---

## Decisions log

| ID | Decision | Why |
|---|---|---|
| **A1** | `projectFieldStates(resort, live, modes, now): Record<MetricPath, FieldStateFor<unknown>>` lives in `packages/schema/src/resortView.ts`. Modes parameter typed as `Partial<Record<MetricPath, 'manual' \| 'auto'>>` directly (NOT `WorkspaceFile['editor_modes']`) to avoid circular dep. `FRESHNESS_TTL_DAYS` is imported from the existing `./loadResortDatasetFromObject` module (NOT a non-existent `./freshness`). | Phase-2 reusable; co-located with `FieldStateFor` type and `toFieldValue`. |
| **A1.5** | `failed.reason` on `FieldStateFor<T>` is a free-form string. The admin code uses the sentinel string `'never_fetched'` for the `ageDays > max_stale` branch (NOT a separate state). The public-app side has a separate `FieldValue<T>` type with a real `'never_fetched'` state; admin-side projection compresses both into `'failed'`. | Documented in plan to disambiguate the two types reviewer-flagged. |
| **A1.6** (durable vs live TTL — Codex round-2 P2-3 fold) | `projectFieldStates` MUST apply clock-aging TTL semantics to **live paths only**. Durable resort attributes (`altitude_m.{min,max}`, `slopes_km`, `lift_count`, `skiable_terrain_ha`, `season.{start_month,end_month}`) are NEVER `stale` or `failed (never_fetched)` based on `observed_at` age — they project as `live` whenever a `field_sources` entry exists, and `failed (no field_sources entry)` only when missing. Mirrors the canonical semantics in `loadResortDatasetFromObject.ts:83-99` ("durable resort attributes return state: 'fresh' unconditionally") and the existing `health.ts` / `listResorts.ts` staleness checks (gated on `populatedLivePaths`). | Without this gate, an old `slopes_km.observed_at` would render `stale` or `failed` in the editor while the dashboard + resorts list (canonical projections) report it `fresh` — visible inconsistency between admin views over a Phase-1 normal data shape. |
| **B1** | Export `atomicWriteText` from `@snowboard-trip-advisor/schema/node` by adding the `export` keyword to `publishDataset.ts`'s existing `async function atomicWriteText`. The schema package's `node.ts` already does `export * from './publishDataset'`, so no `node.ts` modification is needed. | Eliminates byte-for-byte drift risk; minimum-touch addition; tested via `packages/schema/src/exports-map.test.ts`. |
| **C1+** | PR 4.4a-2 adds canonical read-helper signatures in `apps/admin/server/workspace.ts` (using `health.ts`'s separate-guard `ENOENT` / `SyntaxError` semantics, NOT `listResorts.ts`'s collapsed predicate). Only `resortDetail.ts` consumes them. `health.ts` and `listResorts.ts` keep their existing duplicates. A separate post-Tier-3 refactor PR ports the duplicates onto the canonical shape. | Pins canonical signature now; defers the consolidation to keep PR review surfaces atomic. |
| **D1** | `<EditorErrorBoundary>` co-located inside `ResortEditor.tsx` (NOT a separate file). Per-error-code copy: 404 → "Resort not found." + "Back to resorts" link; 500 `workspace-corrupt` → literal `data/admin-workspace/${slug}.json` recovery copy + "Back to resorts" + "Retry" button. Retry-key is component state (NOT URL state). On 404: `invalidateResortDetail(slug); setRoute({ route: 'resorts' })`. Cache-clear MUST be inside `startTransition` with the `retryKey` bump. | Mirrors Epic 3's `ShellErrorBoundary` retry discipline; loop-safe per ADR-0010. |
| **E1+** | Pessimistic save with **module-scoped per-slug singleton store** + **in-flight token** + **draft-revision counter** + **concurrent-PUT queue**. **The store lives at module scope, keyed by `ResortSlug`** (`storesBySlug: Map<ResortSlug, SlugStore>`); every `useWorkspaceState()` consumer in the same editor subscribes via `useSyncExternalStore` to the SAME `SlugStore` for the active slug. Per-slug fields: `draft`, `status`, `rev`, `inFlightToken`, `queued`, `timer`, `subscribers`. 500ms debounce; every `setFieldValue`/`setMode` increments `store.rev`. On PUT-fire, snapshot `store.rev` as `inFlightRev` and set `store.inFlightToken = Symbol()`. On response, mark `saved` (and adopt canonical state) ONLY IF `store.inFlightToken === token AND store.rev === inFlightRev`. **Never fire a second PUT while one is in-flight** — queue the next debounced flush via `store.queued`. Per-FieldRow indicator: 4 states (`dirty` \| `saving` \| `saved` \| `save-failed`). Save-failed retry is automatic. Drafts NEVER write to `useResortDetail`'s cache. `__resetForTests()` clears `storesBySlug`. | **Codex round-2 P1-1 fold:** v2 used `useState`/`useRef` inside the hook, which means each `useWorkspaceState()` call site (one per FieldRow × 12 rows) creates an INDEPENDENT state instance — 12 independent draft maps, 12 independent in-flight queues. The concurrent-PUT race that E1+ is supposed to prevent reappears across rows. Hoisting state to a module-scoped per-slug singleton (mirroring `useResortDetail`'s cache pattern) gives all consumers in the same editor ONE canonical store, ONE queue, ONE rev counter. The revision counter still catches the keystroke-clobber race within a single row (Codex round-1 P2-2 fold). |
| **F1** | MANUAL edit input scope: `<input type="number">` for the **7 durable numeric metric paths** (`altitude_m.min`, `altitude_m.max`, `slopes_km`, `lift_count`, `skiable_terrain_ha`, `season.start_month`, `season.end_month`). The 5 live paths (`snow_depth_cm`, `lifts_open.count`, `lifts_open.total`, `lift_pass_day`, `lodging_sample.median_eur`) — including the 3 numeric and 2 money — render explanatory copy in MANUAL: "MANUAL editing for `${path}` lands in PR 4.6a." (NOT a disabled input.) Months use numeric `<input type="number" min={1} max={12}>`; display formatter still renders English month names (asymmetry documented). Gate test uses `slopes_km` (durable, numeric). | Tier 3 → 4 gate only requires MANUAL round-trip on one numeric path. **The cross-key invariant in `WorkspaceFile` (per spec §10.2) restricts `editor_modes` keys to `Object.keys(resort.field_sources)` — i.e., durable paths only. Trying to PUT `editor_modes: { snow_depth_cm: 'manual' }` would fail the refinement and 400 as `invalid-resort`.** Codex round-1 P2-1 fold corrected the v1 plan's "10 numeric paths" claim. Phase-2 widens the schema if live paths need MANUAL. |
| **D2** (formatters) | `formatMetricValue(path, value)` exhaustive switch on `MetricPath`. Months → English month names via `Date.toLocaleString('en', { month: 'long' })`; out-of-range → `"—"`. Money → `Intl.NumberFormat(undefined, { style: 'currency', currency: m.currency })` (NOT hard-coded EUR). Lifts → `${count} / ${total}`; missing parts → `"—"`. Plain integer + units otherwise. | Type-aware formatting; no i18n in Phase 1. |
| **D3** (cache shape — Codex round-9 P2-13 fold for the dual-cache addition) | `useResortDetail` uses **TWO module-scoped Maps**: `cachedPromises: Map<ResortSlug, Promise<ResortDetailResponse>>` for first-mount Suspense reads, and `cachedFulfilled: Map<ResortSlug, ResortDetailResponse>` for synchronous returns on subsequent renders. The hook checks `cachedFulfilled` first — if a fulfilled entry exists, returns it synchronously (no `use()`, no Suspense). Otherwise calls `use(loadOnce(slug))` which suspends until the promise resolves; on resolve, the `.then` callback populates `cachedFulfilled` so subsequent renders take the sync path. Rejected promises stay pinned in `cachedPromises` per ADR-0010 (the `.then` callback never fires on rejection, so `cachedFulfilled` stays empty for the slug — `use()` throws on retry). `invalidateResortDetail(slug)` and `__resetForTests()` clear BOTH maps. **`prepopulateResortDetail(slug, response)`** sets BOTH maps — the synchronous fulfilled entry guarantees no Suspense flicker on the next render (per **D13**). HMR reset in sibling `useResortDetail.hmr.ts` (coverage-excluded by glob via `apps/admin/vite.config.ts`). | Per-slug cache prevents re-fetch on slug-switch. The dual-cache shape is a Codex round-9 P2-13 fold response: React 19's `use(Promise.resolve(value))` does NOT return synchronously — the `.then(resolve)` contract enqueues resolution as a microtask, so the first render after a fresh-Promise replacement always renders the Suspense fallback for at least one tick. With a separate synchronous map, post-PUT renders skip `use()` entirely and never flicker. |
| **D4** (Suspense placement) | Per-route `<Suspense>` inside `<EditorErrorBoundary>`, NOT at `<Shell>` level. Fallback: inline `<div role="status" aria-live="polite">Loading…</div>`. | Editor suspending must NOT blank sidebar/dashboard. |
| **D5** (concurrent tabs) | Phase-1 documented as last-writer-wins between two browser tabs on the same loopback. PUT is `If-Match`-less in Phase 1. Phase 2 ships ETag/If-Match. PR 4.4c includes a defensive test asserting the handler ignores any `If-Match` header (so a Phase-2 leak doesn't break Phase 1). | Single-analyst topology makes concurrent tabs rare. |
| **D6** (test isolation) | Hook tests own their own `__resetForTests()` calls in local `afterEach` blocks. NO global `apps/admin/src/test-setup.ts` modification in PR 4.4a-2 (file-budget pressure; matches the existing `useResortList` pattern). The unwired `useResortList.__resetForTests` is pre-existing technical debt and explicitly out-of-scope for Tier 3. | Vitest gives each test file its own module instance; cross-file leakage is impossible. Local `afterEach` is sufficient and matches existing codebase pattern. |
| **D7** (slug derivation in 4.4d) | `useWorkspaceState()` and `useModeToggle()` derive the `slug` internally by reading `useURLState()`. FieldRow calls the hooks WITHOUT passing slug (`useWorkspaceState()` is no-arg from the consumer's point of view). This avoids prop-drilling through `MetricPanel.tsx` and `ResortEditor.tsx` modifications in PR 4.4d. The hooks assert the route is `'editor'`; calling them outside the editor route is a programming error caught at the assertion. | Keeps PR 4.4d at 8 files. The URL-state coupling is a tradeoff — Phase-2 can refactor to context if FieldRow becomes reusable elsewhere. |
| **D8** (dispatch.ts details pass-through) | PR 4.4c modifies `apps/admin/server/dispatch.ts` to read `(err as Error & { code, details }).details` and pass it to the error envelope. Currently dispatch only carries `code` + `message`. The `editor_modes` cross-key reject test in 4.4c requires the refinement message to surface in `details`. | Spec §4.10 envelope shape `{ error: { code, message, details? } }` requires details pass-through for the cross-key reject case. |
| **D9** (seed fixtures location) | The `tests/fixtures/admin-workspace/{kotelnica-bialczanska,spindleruv-mlyn}.json` files MISSING from `main` (declared as PR 4.1a §10.8 deliverable but not actually shipped). Recovered as part of PR 4.4a-1 (already a small schema PR; fixtures + projection function are conceptually adjacent). PR 4.4a-1 file count: 5 files (still ≤8). | Without the fixtures, every server-side and bridge-tier test in Tier 3 has nothing to load. |
| **D10** (nested-path draft hydration — Codex round-4 P2-6 fold) | `DraftShape.resort` mirrors the **`Partial<Resort>`** shape (NOT a flat `Partial<Record<MetricPath, unknown>>`). When the user edits a nested path like `altitude_m.min`, `setFieldValue` decomposes the path into segments (`['altitude_m', 'min']`), and on first edit of a nested parent, **hydrates the parent from `useResortDetail(slug).resort.<parent>`** before patching the leaf — this preserves the sibling (`altitude_m.max`) so the server's shallow-merge of `Resort.altitude_m` doesn't drop it. The `SlugStore` carries a `canonical: ResortDetailResponse \| null` field synced by `useWorkspaceState` on every render; module-level `setFieldValue` reads `store.canonical` to do the hydration. `buildBodyFromDraft` then trivially emits `{ resort: draft.resort, live_signal: draft.live_signal, editor_modes: draft.editor_modes }` — the nested shape is already correct. | Flat-keyed `field_values` with reconstruction-at-PUT-time loses sibling values when shallow-merged on the server. Hydration-on-edit is the simpler invariant. PR 4.4d Task 2 adds a "nested-path edit preserves sibling" test (e.g., editing `altitude_m.min` from canonical 1500/2000 → draft has `altitude_m: { min: 1600, max: 2000 }`); PR 4.4d Task 7 bridge integration test asserts the nested-path round-trip on disk. |
| **D11** (responsive read-only gate baseline — Codex round-4 P2-7 + round-7 P2-9 folds) | PR 4.4d ships a **minimal** responsive gate: below the `md` breakpoint, the new MANUAL `<input>` is not rendered AND the new interactive `<ModeToggle>` button degrades to the render-only `<span aria-disabled="true">` form (re-using the v4.4b inline render-only ModeToggle structure). Implementation: a co-located `useIsAboveMd()` hook in `FieldRow.tsx` reads `window.matchMedia(\`(min-width: ${tokens.breakpoint.md}px)\`)` — **the project breakpoint is `tokens.breakpoint.md === 900` per `packages/design-system/src/tokens.ts:21`, NOT 768**. The hook imports the token directly and constructs the query string at render time, so the breakpoint value stays consistent if the token is ever updated. Hook returns a boolean reactive to changes via `useSyncExternalStore`. PR 4.6a polishes this (proper UX, ARIA messaging, simulated-viewport regression test per spec §7.16). | AGENTS.md "Admin App Rules" says edit controls MUST be removed from the tab order below `md` — this is a baseline rule, not polish. The Codex round-7 P2-9 fold corrected the v7 plan's hardcoded 768px (which would leave 768–899px tablet widths interactive in violation of AGENTS.md). 4.4d Task 6 covers both viewports; ModeToggle.test.tsx is dropped from 4.4d (file budget) and FieldRow's responsive branch is tested via FieldRow.test.tsx mods. |
| **D12** (manual provenance on value edit — Codex round-5 P1-1 fold) | `setFieldValue(path, value)` MUST patch `draft.resort.field_sources[path]` alongside the value, with a fresh **manual** `FieldSource` entry: `{ source: 'manual', source_url: 'https://admin.local/manual', observed_at: <now ISO>, fetched_at: <now ISO>, upstream_hash: <64-char hex from crypto.getRandomValues>, attribution_block: { en: 'Manual entry by analyst.' } }`. A co-located helper `manualFieldSource(path, value): FieldSource` constructs the entry. **Per Codex round-6 P1-1 fold:** `patchFieldSource` does NOT hydrate from canonical — only the edited path's entry goes into `draft.resort.field_sources`. Server's deep-merge (spec §4.3) preserves other entries. `setMode(path, mode)` does NOT touch `field_sources` — only `editor_modes`. PR 4.4d Task 2 adds a "manual edit writes manual FieldSource" test + a "field_sources is sparse" test. PR 4.4d Task 7 bridge integration test asserts the on-disk `resort.field_sources.slopes_km.source === 'manual'`. | Provenance is non-negotiable per the project's Core Principles ("Every metric field carries a matching `field_sources` entry... `validatePublishedDataset` enforces this at publish time"). Without writing the manual FieldSource on value edit, the merged WorkspaceFile keeps the OLD upstream provenance for the new manual value — published data attributes a manual override to the old upstream source. The mode-flag-only flow (toggle without edit) preserves the old upstream provenance because there's no override yet — that's the intended semantics; only an actual value change triggers the source switch. |
| **D13** (draft reset on PUT success + prepopulate canonical — Codex round-7 P1-1 fold) | On successful PUT (rev unchanged during round-trip), the impl: (1) clears the draft to `{ editor_modes: {} }` — the data sent IS now persisted server-side, holding it in the draft causes subsequent PUTs to re-send already-saved fields; (2) marks all dirty/saving statuses as `saved`; (3) calls `prepopulateResortDetail(slug, response)` to replace the canonical cache with the post-PUT response. The prepopulate avoids a Suspense flicker — without it, `invalidateResortDetail(slug)` would force the next render to re-fetch and suspend, blanking the editor mid-session. With prepopulate, the canonical cache reflects the freshly-persisted state and the FieldRow value display reads from canonical (which now matches what was saved) instead of an empty draft. PR 4.4d Task 2 adds a "save → later edit clears prior draft" test. | Without the reset, two scenarios break: (a) the next edit's PUT body re-sends the prior fields' manual provenance — risking last-writer-wins clobber against any concurrent server-side adapter update to those fields between the two PUTs; (b) the FieldRow value display reads from `draft.resort.<path>` (overlaying canonical) — without a reset and without prepopulate, the user sees the just-edited value disappear (because canonical is still stale by one PUT). Reset + prepopulate keeps the value visible AND prevents stale re-sends. |

---

## File structure

### PR 4.4a-1 — Schema: `projectFieldStates` + seed fixtures

**Subagent review trigger: YES** (`packages/schema/**`).

| Order | File | Action |
|---|---|---|
| 1 | `tests/fixtures/admin-workspace/kotelnica-bialczanska.json` | NEW — seed fixture (PL Tatra resort; matches `WorkspaceFile` Zod parse) |
| 2 | `tests/fixtures/admin-workspace/spindleruv-mlyn.json` | NEW — seed fixture (CZ Krkonoše resort) |
| 3 | `packages/schema/src/resortView.test.ts` | MODIFY — add `projectFieldStates` tests + seed-fixture parity + close coverage gap on existing `toFieldValue` (4 states) |
| 4 | `packages/schema/src/resortView.ts` | MODIFY — add `projectFieldStates` function |
| 5 | `packages/schema/vite.config.ts` | MODIFY — remove `'src/resortView.ts'` from coverage `exclude` (per Codex round-2 P2-4 fold) |

**Files: 5.** ≤300 LOC. The `vite.config.ts` change drops the v1 "types-only" exclusion that would otherwise hide the new executable projection logic from the 100% gate.

### PR 4.4a-2 — Server read + `useResortDetail` hook

**Subagent review trigger: YES** (`apps/admin/server/**`).

**Depends on:** PR 4.4a-1 merged.

| Order | File | Action |
|---|---|---|
| 1 | `apps/admin/server/__tests__/workspace.test.ts` | NEW — read-helper tests |
| 2 | `apps/admin/server/__tests__/resortDetail.test.ts` | NEW — handler unit tests (handler-in-isolation; no bridge invocation here) |
| 3 | `apps/admin/src/state/useResortDetail.test.ts` | NEW — hook tests with local `afterEach(__resetForTests)` per **D6** |
| 4 | `apps/admin/server/workspace.ts` | MODIFY — add `readWorkspaceFileForSlug`, `readPublishedDocOrNull`, `WorkspaceCorruptError` |
| 5 | `apps/admin/server/resortDetail.ts` | MODIFY — replace 501 stub; inline `NotFoundError` (with `.code = 'not-found'`) |
| 6 | `apps/admin/src/state/useResortDetail.ts` | NEW — Suspense hook (per **D3**) |
| 7 | `apps/admin/src/state/useResortDetail.hmr.ts` | NEW — HMR cache reset |
| 8 | `apps/admin/vite.config.ts` | MODIFY — add `'src/state/*.hmr.ts'` to coverage `exclude` |

**Files: 8.** Note: `apps/admin/server/dispatch.ts` is NOT modified here — the existing `STATUS_FOR_CODE` map already routes `'workspace-corrupt'` → 500 and `'not-found'` → 404 by reading `err.code`. New error classes just set `.code` and dispatch picks them up automatically. Bridge-harness verification deferred to PR 4.4c.

### PR 4.4b — Editor view (read-only)

**Subagent review trigger: NO** (UI components only).

**Depends on:** PR 4.4a-2 merged. **Strictly serial** — `ResortEditor.tsx` statically imports `useResortDetail` from PR 4.4a-2; the import would fail to compile against a `main` that hasn't merged 4.4a-2. (Reviewer fold: spec §7.4's parallelism claim assumed unsplit 4.4a; the split breaks parallelism. Acknowledged deviation, documented in closeout.)

| Order | File | Action |
|---|---|---|
| 1 | `apps/admin/src/views/ResortEditor.test.tsx` | NEW — composition + boundary + Suspense tests; covers MetricPanel via mounting |
| 2 | `apps/admin/src/views/ResortEditor/FieldRow.test.tsx` | NEW — render-only + inline render-only ModeToggle |
| 3 | `tests/integration/apps/admin/resort-editor-read.test.tsx` | NEW — canned MSW integration |
| 4 | `apps/admin/src/views/ResortEditor/MetricPanel.tsx` | NEW — `<MetricPanel kind="durable" \| "live" />`. Coverage achieved through `ResortEditor.test.tsx`; no separate `MetricPanel.test.tsx` (reviewer fold). |
| 5 | `apps/admin/src/views/ResortEditor/FieldRow.tsx` | NEW — render-only + `formatMetricValue` switch + inline render-only `<span role="switch">` ModeToggle (spec deviation flagged below) |
| 6 | `apps/admin/src/views/ResortEditor.tsx` | NEW — composition + co-located `EditorErrorBoundary` (per **D1**) + per-route `<Suspense>` (per **D4**) |
| 7 | `apps/admin/src/App.tsx` | MODIFY — `route.route === 'editor'` → `<ResortEditor slug={route.slug} />` |
| 8 | `apps/admin/src/App.test.tsx` | MODIFY — update the editor-route test (currently asserts ResortsTable mount; flip to assert ResortEditor mount) |

**Files: 8.** `urlState.ts` is NOT modified — the editor route already exists (verified at `apps/admin/src/lib/urlState.ts:30-95`).

**Spec deviations (flag in PR description):**

- Spec §7.11 lists separate `DurablePanel.tsx` + `LivePanel.tsx`; plan collapses to parametrized `<MetricPanel kind="durable" \| "live" />`. Coverage equivalent.
- Spec §7.11 lists separate `ModeToggle.tsx` (render-only); plan inlines `<span role="switch" aria-disabled="true">` inside `FieldRow.tsx` to keep file budget. PR 4.4d will REPLACE the inline span with a `<button>`-based extracted `<ModeToggle>` — this is a real DOM-shape change; the 4.4b FieldRow tests asserting `role="switch"` on a span are throwaway-and-replaced in 4.4d (acknowledged).
- Spec §7.11 lists `urlState.ts` MODIFY; plan omits because the route already exists.

### PR 4.4c — Server write + atomic-write

**Subagent review trigger: YES** (`apps/admin/server/**` + `packages/schema/**`).

**Depends on:** PR 4.4b merged.

| Order | File | Action |
|---|---|---|
| 1 | `packages/schema/src/exports-map.test.ts` | MODIFY — add re-export test for `atomicWriteText` (RED for Task 2's add-export step) |
| 2 | `apps/admin/server/__tests__/workspace.test.ts` | MODIFY — extend with atomic-write helper tests + JSON serialization round-trip parity test |
| 3 | `apps/admin/server/__tests__/resortUpsert.test.ts` | NEW — handler unit tests including cross-key reject + `If-Match` defensive test + corrupt-target reject + `modified_at` brand-parse |
| 4 | `apps/admin/server/__tests__/dispatch.test.ts` | MODIFY — assert `details` pass-through from errors carrying `.details` (RED for Task 6's dispatch modify) + assert bridge-routed `GET /api/resorts/<seed>` returns 200 with projected `field_states` (deferred-bridge-verification fold) |
| 5 | `packages/schema/src/publishDataset.ts` | MODIFY — add `export` keyword to `atomicWriteText` (1-line change) |
| 6 | `apps/admin/server/workspace.ts` | MODIFY — add `atomicWriteWorkspaceFile` (thin wrapper around imported `atomicWriteText`) |
| 7 | `apps/admin/server/resortUpsert.ts` | MODIFY — replace 501 stub; inline `InvalidRequestError` (with `.code = 'invalid-request'`, `.details`), `InvalidResortError` (with `.code = 'invalid-resort'`, `.details`) |
| 8 | `apps/admin/server/dispatch.ts` | MODIFY — extract `.details` from thrown errors and pass to envelope per **D8** |

**Files: 8.** `node.ts` is NOT modified — `export * from './publishDataset'` already re-exports the new public function.

### PR 4.4d — Editor edit interaction

**Subagent review trigger: NO** (UI interaction; schema + server already shipped under review).

**Depends on:** PR 4.4c merged.

| Order | File | Action |
|---|---|---|
| 1 | `apps/admin/src/state/useModeToggle.test.ts` | NEW — `validPaths` guard + silent-no-op + canonical-mode reload preservation per **D7** + Codex round-3 P1-1 |
| 2 | `apps/admin/src/state/useWorkspaceState.test.ts` | NEW — debounce + singleton store + in-flight token + draft-revision counter + nested-path hydration per **D10** |
| 3 | `apps/admin/src/views/ResortEditor/FieldRow.test.tsx` | MODIFY — extend with MANUAL input + `<ModeToggle>` button + responsive-gate branches per **D11**. (Inline render-only ModeToggle tests from 4.4b stay; add new branches alongside them.) |
| 4 | `tests/integration/apps/admin/resort-editor-write.test.tsx` | NEW — bridge tier; on-disk file assertion; reload via `__resetForTests()` between unmount/remount; nested-path round-trip (e.g., `season.start_month`) per **D10** |
| 5 | `apps/admin/src/state/useModeToggle.ts` | NEW — derives `slug` from `useURLState()` per **D7**; canonical-mode fallback per Codex round-3 P1-1 |
| 6 | `apps/admin/src/state/useWorkspaceState.ts` | NEW — module-scoped per-slug singleton store per **E1+**; nested-path hydration per **D10** |
| 7 | `apps/admin/src/views/ResortEditor/ModeToggle.tsx` | NEW — interactive `<button role="switch">` (above md); ModeToggle's responsive degradation handled in FieldRow per **D11** |
| 8 | `apps/admin/src/views/ResortEditor/FieldRow.tsx` | MODIFY — add MANUAL `<input>` for the 7 durable numeric paths per **F1**; explanatory copy for live paths; responsive gate per **D11** |

**Files: 8.** `ResortEditor.tsx` is NOT modified — slug is derived inside the hooks via `useURLState`, eliminating prop-drilling. **`ModeToggle.test.tsx` is NOT in this PR's file list** (per **D11** file-budget constraint) — ModeToggle's behavior is covered through `FieldRow.test.tsx` (which mounts FieldRow with the `<ModeToggle>` child and exercises clicks/keyboard/aria) AND through `resort-editor-write.test.tsx` (full integration).

---

## Per-PR workflow (every PR; from saved memories)

After implementation completes on a PR's branch:

1. **`npm run qa` green locally** before pushing.
2. `git push -u origin <branch>`; `gh pr create` with full PR body (links spec section + decisions log IDs touched + file budget + verification commands).
3. **Post `@codex review` as a PR comment.** Wait 2–5 minutes.
4. **Fold all P0/P1/P2 findings on the same branch**:
   - Re-run `npm run qa` after each fold.
   - Reply to each thread with the fix commit SHA AND **resolve the thread** via the `resolveReviewThread` GraphQL mutation:
     ```bash
     gh api graphql -f query='mutation { resolveReviewThread(input: { threadId: "<thread-id>" }) { thread { isResolved } } }'
     ```
5. **Re-request `@codex review`** after each fold round; iterate until Codex reacts 👍 or surfaces nothing new.
6. **Generate AND execute a tailored local-test plan** before surfacing to the maintainer:
   - `npm run qa` (lint → drift → typecheck → coverage 100% × 4 → tokens → hooks → integration)
   - `npm run dev:admin` boots; smoke-test the relevant route in the browser (Playwright MCP / Claude in Chrome MCP for headless verification).
   - For each PR, the "Acceptance gate" subsection enumerates the smoke checks.
7. Report findings to the maintainer; the maintainer merges (NOT the agent).
8. After merge, on the next PR's branch: `git fetch origin main && git rebase origin/main`.

---

## PR 4.4a-1 — Schema: `projectFieldStates` + seed fixtures

**Goal.** Land the field-state projection function so PR 4.4a-2's resortDetail handler can build `Record<MetricPath, FieldStateFor<unknown>>`. Also recover PR 4.1a §10.8's missed seed-fixture deliverable.

**Acceptance gate.** `npm run qa` green; `packages/schema/src/resortView.test.ts` covers all 12 metric paths × all 4 `FieldStateFor` states; both seed fixtures parse cleanly through `WorkspaceFile.parse()`; the projection function applied to each fixture produces deterministic field_states.

### Task 1 — Author seed fixtures

**Files:**
- Create: `tests/fixtures/admin-workspace/kotelnica-bialczanska.json`
- Create: `tests/fixtures/admin-workspace/spindleruv-mlyn.json`

- [ ] **Step 1: Write `kotelnica-bialczanska.json`.** Hand-author a `WorkspaceFile` JSON document for the PL Tatra resort. Required shape per `packages/schema/src/workspaceFile.ts`:
  - `schema_version: 1`
  - `slug: 'kotelnica-bialczanska'`
  - `resort: Resort` — name (LocalizedString), country `'PL'`, region (LocalizedString), `altitude_m`, `slopes_km`, `lift_count`, `skiable_terrain_ha`, `season`, full `field_sources` map for all 7 durable METRIC_FIELDS.
  - `live_signal: ResortLiveSignal | null` — non-null with `snow_depth_cm`, `lifts_open: { count, total }`, **`lift_pass_day: { amount: <EUR-converted>, currency: 'EUR' }`** (per Codex round-3 P2 fold: `Money` is **EUR-only** in `packages/schema/src/primitives.ts:5-9`; non-EUR source amounts are encoded via `field_sources.lift_pass_day.fx: { source: 'ecb-reference-rate', observed_at, rate, native_amount, native_currency: 'PLN' }` per ADR-0003), and **`lodging_sample: { median_eur: { amount, currency: 'EUR' }, sample_size: <int> }`** per Codex round-12 P2-16 fold — `sample_size` is a SIBLING of `median_eur` (NOT nested inside Money), per the actual `ResortLiveSignal` schema at `packages/schema/src/liveSignal.ts:15` (`z.object({ median_eur: Money, sample_size: z.number().int() }).optional()`). Plus matching `field_sources` entries for each populated live path.
  - `modified_at` — recent ISO datetime.
  - `editor_modes: {}` (sparse default).

- [ ] **Step 2: Write `spindleruv-mlyn.json`** — analogous CZ Krkonoše resort with `country: 'CZ'`. **`lift_pass_day` is `{ amount: <EUR-converted>, currency: 'EUR' }`** with `field_sources.lift_pass_day.fx.native_currency: 'CZK'` (NOT `currency: 'CZK'` on the `Money` shape — that would fail `Money.parse()`). Same overall shape.

- [ ] **Step 3: Verify both fixtures parse.** Run an inline node REPL or the validator from `packages/schema/src/__tests__/...`:

```bash
node -e "
const { WorkspaceFile } = require('./packages/schema/src/workspaceFile.ts');
const f = require('./tests/fixtures/admin-workspace/kotelnica-bialczanska.json');
console.log(WorkspaceFile.safeParse(f).success);
"
```

(Or write a temporary validator script.) Both must print `true` before proceeding.

### Task 2 — Failing test: `projectFieldStates` 12-path × `live` baseline

**Files:** Modify `packages/schema/src/resortView.test.ts`.

- [ ] **Step 1: Add the failing test.**

```ts
import { FRESHNESS_TTL_DAYS } from './loadResortDatasetFromObject'  // existing module per reviewer fold §2
import { METRIC_FIELDS, type MetricPath } from './metricFields'
import { projectFieldStates } from './resortView'  // not yet exported — compile error is the failure

describe('projectFieldStates', () => {
  test('all 12 metric paths project to live state from a fully-populated resort + live_signal', () => {
    const now = new Date('2026-05-01T00:00:00Z')
    // observed_at recent → ageDays < FRESHNESS_TTL_DAYS.default (14)
    const recentObservedAt = '2026-04-29T00:00:00Z' as ISODateTimeString
    const resort: Resort = makeFullyPopulatedResort({ observedAt: recentObservedAt })
    const live: ResortLiveSignal = makeFullyPopulatedLiveSignal({ observedAt: recentObservedAt })
    const states = projectFieldStates(resort, live, {}, now)
    expect(Object.keys(states).sort()).toEqual([...METRIC_FIELDS].sort())
    for (const path of METRIC_FIELDS) {
      expect(states[path].state).toBe('live')
    }
  })
})
```

(Inline `makeFullyPopulatedResort` and `makeFullyPopulatedLiveSignal` factories at the bottom of the test file; these are private to the module.)

- [ ] **Step 2: Run.** `npm run --workspace=packages/schema test -- resortView.test.ts`. Expected: FAIL with `projectFieldStates is not exported`.

### Task 3 — Implement `projectFieldStates` minimal-live baseline

**Files:** Modify `packages/schema/src/resortView.ts`.

- [ ] **Step 1: Implement.**

```ts
import { FRESHNESS_TTL_DAYS } from './loadResortDatasetFromObject'  // canonical TTL constant
import { METRIC_FIELDS, type MetricPath } from './metricFields'
import type { Resort } from './resort'
import type { ResortLiveSignal } from './liveSignal'

export function projectFieldStates(
  resort: Resort,
  live: ResortLiveSignal | null,
  modes: Partial<Record<MetricPath, 'manual' | 'auto'>>,
  now: Date,
): Record<MetricPath, FieldStateFor<unknown>> {
  // Per Codex round-14 P2-18 fold: select the source map per path's
  // durable-vs-live class — DO NOT merge resort.field_sources with
  // live_signal.field_sources. The merged-map approach lets a same-named
  // resort.field_sources entry (which Resort schema allows since
  // field_sources accepts arbitrary string keys) MASK a missing
  // live_signal.field_sources entry, projecting the live field as
  // 'live'/'stale' (from the durable entry's provenance) instead of the
  // correct 'failed (no field_sources entry)'. The editor must surface
  // missing live provenance, not paper over it.
  const out = {} as Record<MetricPath, FieldStateFor<unknown>>
  for (const path of METRIC_FIELDS) {
    const isDurable = DURABLE_PATHS.has(path)
    const fs = isDurable
      ? resort.field_sources[path]
      : live?.field_sources?.[path]
    out[path] = projectOne(path, fs, resolveValue(path, resort, live), modes[path], now)
  }
  return out
}

// Per A1.6 / Codex round-2 P2-3 fold: clock-aging applies to LIVE paths only.
// Durable resort attributes (altitude_m.{min,max}, slopes_km, lift_count,
// skiable_terrain_ha, season.{start_month,end_month}) are 'live' whenever a
// field_sources entry exists; their observed_at age never makes them 'stale'
// or 'failed (never_fetched)'. Mirrors loadResortDatasetFromObject.ts:83-99
// and the existing health.ts/listResorts.ts staleness gating.
const DURABLE_PATHS: ReadonlySet<MetricPath> = new Set([
  'altitude_m.min', 'altitude_m.max', 'slopes_km', 'lift_count',
  'skiable_terrain_ha', 'season.start_month', 'season.end_month',
])

function projectOne(
  path: MetricPath,
  fs: FieldSource | undefined,
  value: unknown,
  mode: 'manual' | 'auto' | undefined,
  now: Date,
): FieldStateFor<unknown> {
  if (mode === 'manual' && fs !== undefined && value !== undefined) {
    return { state: 'manual', value, observed_at: fs.observed_at }
  }
  if (fs === undefined || value === undefined) {
    // Sentinel reason 'no field_sources entry' (free-form string per A1.5).
    return { state: 'failed', reason: 'no field_sources entry', observed_at: ISODateTimeString.parse(now.toISOString()) }
  }
  // Durable paths: never age out — editorial review is the Phase-2 stale signal.
  if (DURABLE_PATHS.has(path)) {
    return { state: 'live', value, source: fs.source, observed_at: fs.observed_at }
  }
  // Live paths: clock-aging applies.
  const ageDays = (now.getTime() - new Date(fs.observed_at).getTime()) / (24 * 60 * 60 * 1000)
  if (ageDays > FRESHNESS_TTL_DAYS.max_stale) {
    // Sentinel reason 'never_fetched' (free-form string per A1.5).
    return { state: 'failed', reason: 'never_fetched', observed_at: fs.observed_at }
  }
  if (ageDays > FRESHNESS_TTL_DAYS.default) {
    return { state: 'stale', value, source: fs.source, observed_at: fs.observed_at, age_days: ageDays }
  }
  return { state: 'live', value, source: fs.source, observed_at: fs.observed_at }
}

function resolveValue(path: MetricPath, resort: Resort, live: ResortLiveSignal | null): unknown {
  switch (path) {
    case 'altitude_m.min': return resort.altitude_m.min
    case 'altitude_m.max': return resort.altitude_m.max
    case 'slopes_km': return resort.slopes_km
    case 'lift_count': return resort.lift_count
    case 'skiable_terrain_ha': return resort.skiable_terrain_ha
    case 'season.start_month': return resort.season.start_month
    case 'season.end_month': return resort.season.end_month
    case 'snow_depth_cm': return live?.snow_depth_cm
    case 'lifts_open.count': return live?.lifts_open?.count
    case 'lifts_open.total': return live?.lifts_open?.total
    case 'lift_pass_day': return live?.lift_pass_day
    case 'lodging_sample.median_eur': return live?.lodging_sample?.median_eur
  }
}
```

- [ ] **Step 2: Run.** Same command. PASS.

### Task 4 — `stale`, `failed`, `manual`, durable-vs-live coverage tests

- [ ] **Step 1: Add tests** (one per branch). **Per A1.6 / Codex round-2 P2-3 fold:** stale/never_fetched only fire on **live paths**; durable paths stay `live` regardless of `observed_at` age.
  - **stale (live path)**: `snow_depth_cm` with `observed_at` 21 days ago (between default=14 and max_stale=30) → `{ state: 'stale', age_days: ~21 }`.
  - **failed (never_fetched, live path)**: `snow_depth_cm` with `observed_at` 60 days ago (> max_stale) → `{ state: 'failed', reason: 'never_fetched' }`.
  - **durable path with old `observed_at` is still `live`** (regression-pinning the A1.6 separation): `slopes_km` with `observed_at` 60 days ago AND `editor_modes` empty → `{ state: 'live' }`. Without the `DURABLE_PATHS` guard, this would falsely return `failed (never_fetched)` and disagree with the dashboard / resorts-list projections.
  - **failed (no field_sources entry)** — both branches:
    - durable path with missing `resort.field_sources[path]` → `{ state: 'failed', reason: 'no field_sources entry' }`.
    - live path with missing `live_signal.field_sources[path]` (and value undefined) → same.
  - **manual (durable)**: `editor_modes: { slopes_km: 'manual' }` with valid value → `{ state: 'manual', value, observed_at }`.
  - **manual without value**: `editor_modes: { slopes_km: 'manual' }` but `value === undefined` → falls back to `failed`.
  - **mode 'auto' (durable)**: `editor_modes: { slopes_km: 'auto' }` → same as missing entry → `live` (durable path).
  - **mode 'auto' (live, stale window)**: `editor_modes: { snow_depth_cm: 'auto' }` with `observed_at` 21 days ago → `stale` (the auto reset doesn't suppress live-path TTL aging).
  - **Per-path source selection (live paths read ONLY from live_signal.field_sources)** per Codex round-14 P2-18 fold: fixture has `resort.field_sources.snow_depth_cm: <durable-style entry>` (allowed by Resort schema since `field_sources` accepts arbitrary string keys) AND `live_signal.field_sources.snow_depth_cm` is **MISSING**. The projection MUST return `{ state: 'failed', reason: 'no field_sources entry' }` for `snow_depth_cm` — NOT pick up the durable-side entry as a fallback. Without per-path selection, missing live provenance would be silently masked. Conversely: durable paths read ONLY from `resort.field_sources` — a same-named entry in `live_signal.field_sources` is ignored for them.
  - **null live_signal**: durable paths still project as `live`; live paths all `failed (no field_sources entry)`.
- [ ] **Step 2: Run.** PASS on all branches.

### Task 4.5 — `toFieldValue` coverage closure

The existing `toFieldValue<T>(state)` function was previously coverage-excluded with the `src/resortView.ts` whole-file glob. Removing the exclusion (file-list item 5) means BOTH `projectFieldStates` AND `toFieldValue` need 100% coverage in PR 4.4a-1.

- [ ] **Step 1: Add tests** for `toFieldValue` covering all 4 input states (`live` | `stale` | `failed` | `manual`):
  - `toFieldValue({ state: 'live', value: 42, source, observed_at })` → `{ state: 'fresh', value: 42, source, observed_at }`.
  - `toFieldValue({ state: 'stale', value: 42, source, observed_at, age_days: 21 })` → `{ state: 'stale', value: 42, source, observed_at, age_days: 21 }`.
  - `toFieldValue({ state: 'failed', reason: 'never_fetched', observed_at })` → `{ state: 'never_fetched' }`.
  - `toFieldValue({ state: 'manual', value: 42, observed_at })` → `{ state: 'fresh', value: 42, source: 'manual', observed_at }`.
- [ ] **Step 2: Run.** PASS. `npm run --workspace=packages/schema coverage` should now show `resortView.ts` at 100% lines/branches/functions/statements.

### Task 5 — Seed fixture parity test

- [ ] **Step 1: Add a test** that loads both fixture JSON files via `readFileSync`, parses them through `WorkspaceFile.parse()`, and asserts:
  - Parse succeeds (no thrown errors).
  - `slug` matches the filename basename.
  - `projectFieldStates(parsed.resort, parsed.live_signal, parsed.editor_modes, new Date('2026-05-08'))` returns a 12-key record with no `failed` (no missing field_sources) given the fixtures' `observed_at` dates.

This pins the fixture-shape contract and proves both will work for downstream PR 4.4a-2 / 4.4d tests.

- [ ] **Step 2: Run.** PASS.

### Task 6 — Coverage + commit

- [ ] **Step 1:** `npm run --workspace=packages/schema coverage`. Expected 100% × 4 on `resortView.ts`.
- [ ] **Step 2:** `npm run qa` from repo root. Green.
- [ ] **Step 3: Commit.**

```bash
git add tests/fixtures/admin-workspace/ packages/schema/src/resortView.{ts,test.ts} packages/schema/vite.config.ts
git commit -s -m "feat(schema): add projectFieldStates + seed admin-workspace fixtures (PR 4.4a-1)"
```

### Task 7 — PR + Codex cycle

- [ ] **Step 1:** Push + `gh pr create --title "Epic 4 PR 4.4a-1 — Schema projectFieldStates + seed fixtures"`. Body links spec §7.10 + decisions log A1, A1.5, D9.
- [ ] **Step 2:** `@codex review`; fold; resolve threads; iterate.
- [ ] **Step 3:** Surface to maintainer.

---

## PR 4.4a-2 — Server read + `useResortDetail`

**Goal.** Wire `GET /api/resorts/:slug` end-to-end. SPA `useResortDetail` hook with React-19 `use()` + Suspense + per-slug Map cache + rejected-promise pinning per ADR-0010.

**Acceptance gate.** `npm run qa` green; `apps/admin/server/__tests__/resortDetail.test.ts` covers happy path + draft slug + missing-published + corrupt-workspace + 404; both seed slugs respond correctly **when invoked through the handler directly** (bridge-harness invocation deferred to PR 4.4c per file budget); `useResortDetail` test contract covers Suspense + cache hit + per-slug isolation + rejected-promise pinning + `__resetForTests`.

### Task 1 — Workspace helpers failing tests

**Files:** New `apps/admin/server/__tests__/workspace.test.ts`.

- [ ] **Step 1: Write tests** for `readWorkspaceFileForSlug(workspaceDir, slug)`:
  - Workspace file exists + valid → returns parsed `WorkspaceFile`.
  - Workspace file missing (ENOENT) → returns `null`.
  - Workspace file corrupt (Zod parse fails) → throws `WorkspaceCorruptError`.
  - Workspace file malformed JSON (SyntaxError) → throws `WorkspaceCorruptError`.

  And for `readPublishedDocOrNull(publishedPath)`:
  - File exists + valid → returns parsed `PublishedDataset`.
  - File missing → returns `null`.
  - File malformed JSON → returns `null` (graceful per §10.9).
  - File fails Zod parse → returns `null` (graceful).

  Use a per-test workspace tmpdir (`mkdtemp`) and `fs.writeFile` to seed; `afterEach` removes the tmpdir. Load fixtures via `readFileSync('tests/fixtures/admin-workspace/kotelnica-bialczanska.json', ...)` to pin against PR 4.4a-1's seed data.
- [ ] **Step 2: Run.** FAIL.

### Task 2 — Implement workspace read helpers

**Files:** Modify `apps/admin/server/workspace.ts`.

- [ ] **Step 1: Implement** `readWorkspaceFileForSlug` and `readPublishedDocOrNull` per **C1+**'s separate-guard semantics. Define + export `WorkspaceCorruptError` class with `.code = 'workspace-corrupt'`, `.slug`, `.issues`, and `.details` getters (the `details` getter returns `{ slug, issues }` so `dispatch.ts` can pass it through after PR 4.4c's modification).
- [ ] **Step 2: Run.** PASS.

### Task 3 — `resortDetailHandler` failing tests

**Files:** New `apps/admin/server/__tests__/resortDetail.test.ts`.

- [ ] **Step 1: Write tests** covering every spec §4.2 / §4.2.1 / §10.3.1 / §10.9 case:
  - **Happy path** — workspace file exists; response carries `wf.resort`, `wf.live_signal`, and `field_states` from `projectFieldStates(wf.resort, wf.live_signal, wf.editor_modes, now)`.
  - **Published-only slug** — no workspace file; published doc carries the slug → response carries projected `Resort` + `live_signal_by_slug.get(slug) ?? null` + `field_states` with `editor_modes: {}`.
  - **Draft slug** (per §4.2.1) — workspace file exists, no published entry → 200; `live_signal: null` if not in workspace.
  - **Missing published doc** (per §10.9) — no `current.v1.json` AND no workspace file for slug → throws `NotFoundError`.
  - **Workspace-only after missing-published** — no `current.v1.json`, workspace file exists → 200.
  - **Corrupt workspace** (per §10.3.1) — workspace file fails parse → throws `WorkspaceCorruptError`.
  - **Slug not found anywhere** → throws `NotFoundError`.
- [ ] **Step 2: Run.** FAIL.

### Task 4 — Implement `resortDetailHandler`

**Files:** Modify `apps/admin/server/resortDetail.ts`.

- [ ] **Step 1: Implement.** Replace 501 stub. Define `class NotFoundError extends Error { readonly code = 'not-found' as const }` (existing `STATUS_FOR_CODE` Map in `dispatch.ts` already maps this code → 404). The handler:
  1. Try `readWorkspaceFileForSlug(workspaceDir, slug)`. If non-null, build response from workspace.
  2. Else read `readPublishedDocOrNull(publishedPath)`. If doc + slug present, project synthetic state (resort, live_signal, `editor_modes: {}`).
  3. Else throw `NotFoundError`.
  4. Build `field_states` via `projectFieldStates(resort, liveSignal, editorModes, new Date())`.
  5. Return `{ resort, live_signal, field_states }` matching `ResortDetailResponse`.
  
  `WorkspaceCorruptError` propagates (already has `.code`); dispatch maps to 500.
- [ ] **Step 2: Run.** PASS on all unit tests.

### Task 5 — `useResortDetail` failing tests

**Files:** New `apps/admin/src/state/useResortDetail.test.ts`.

- [ ] **Step 1: Write tests** with local `afterEach(__resetForTests)` per **D6**:
  - **Happy path**: `<Suspense fallback>` renders during pending; child renders the response shape after settled (use `renderHook` + `<Suspense>` wrapper).
  - **Cache hit**: same slug requested twice → ONE `apiClient.getResort` call (via vi.spyOn).
  - **Per-slug isolation**: `slug-a` then `slug-b` → TWO calls.
  - **Rejected promise pinning** per ADR-0010: a fetch that rejects → next render of `useResortDetail(sameSlug)` re-throws the SAME rejection (no auto-clear, no fresh fetch).
  - **`invalidateResortDetail(slug)`** clears the slug's entry; subsequent render re-fetches.
  - **`invalidateResortDetail()`** (no args) clears the entire Map.
  - **`__resetForTests()`** clears the Map.
  - **`prepopulateResortDetail(slug, response)`** per Codex round-7 P1-1 + round-9 P2-13 folds: populates BOTH `cachedFulfilled` and `cachedPromises` (the latter for any concurrent Suspense reader, the former for the load-bearing synchronous read). Subsequent `useResortDetail(slug)` renders return `response` synchronously WITHOUT calling `use()`. Verify via `vi.spyOn(apiClient, 'getResort')` (call count stays 0 across the prepopulate + render cycle) AND via `getRenderCount(<Suspense fallback="loading"/>)` (the fallback NEVER renders on the post-prepopulate render — this catches the round-9 React-19-`use(Promise.resolve())` flicker bug if ever re-introduced).
  - **Synchronous fast path** per Codex round-9 P2-13 fold: after the first fetch resolves, subsequent `useResortDetail(slug)` calls return synchronously from `cachedFulfilled` (skipping `use()` entirely). Test: render once (suspends + resolves); unmount; re-mount → assert NO Suspense fallback rendered (synchronous path) AND `apiClient.getResort` call count stays at 1.
  - **Rejected-promise path skips synchronous cache**: if `apiClient.getResort` rejects, `cachedFulfilled` stays empty for that slug (the `.then` callback that populates it never fires). Subsequent `useResortDetail(slug)` calls re-throw the rejection via `use(loadOnce(slug))` (pinned promise per ADR-0010). Verify the dual-cache shape doesn't accidentally swallow the rejection.
- [ ] **Step 2: Run.** FAIL.

### Task 6 — Implement `useResortDetail` + HMR

**Files:** New `apps/admin/src/state/useResortDetail.ts` + `useResortDetail.hmr.ts`.

- [ ] **Step 1: Implement.** Per **D3**:

```ts
import type { ResortSlug } from '@snowboard-trip-advisor/schema'
import type { ResortDetailResponse } from '@snowboard-trip-advisor/schema/api'
import { use } from 'react'

import { apiClient } from '../lib/apiClient'
import './useResortDetail.hmr'

// Dual-cache per **D3** + Codex round-9 P2-13 fold:
//   - cachedPromises: for first-mount Suspense reads via use().
//   - cachedFulfilled: synchronous map populated on Promise resolution
//     (and on prepopulate). When present, useResortDetail returns
//     synchronously WITHOUT calling use() — avoids the one-tick Suspense
//     flicker that React 19's use(Promise.resolve(value)) causes (the
//     thenable .then(resolve) contract enqueues resolution as a microtask,
//     so use() suspends for at least one render cycle even when the value
//     is already known).
const cachedPromises = new Map<ResortSlug, Promise<ResortDetailResponse>>()
const cachedFulfilled = new Map<ResortSlug, ResortDetailResponse>()

function loadOnce(slug: ResortSlug): Promise<ResortDetailResponse> {
  const existing = cachedPromises.get(slug)
  if (existing !== undefined) { return existing }
  // Chain via .then so the synchronous cache populates as soon as the
  // network completes; the next render takes the sync path.
  const next = apiClient.getResort(slug).then((response): ResortDetailResponse => {
    cachedFulfilled.set(slug, response)
    return response
  })
  cachedPromises.set(slug, next)
  // Empty terminal .catch suppresses unhandled-rejection signal; rejected
  // promises stay PINNED in cachedPromises per ADR-0010 (the .then callback
  // never fires on rejection, so cachedFulfilled stays empty — next render
  // takes the use() path which re-throws the pinned rejection).
  next.catch((): void => { /* swallow */ })
  return next
}

export function useResortDetail(slug: ResortSlug): ResortDetailResponse {
  // Synchronous fast path — avoids the React-19 use()-Promise.resolve flicker
  // (Codex round-9 P2-13). use() is allowed in conditionals per React 19 docs.
  const fulfilled = cachedFulfilled.get(slug)
  if (fulfilled !== undefined) { return fulfilled }
  return use(loadOnce(slug))
}

export function invalidateResortDetail(slug?: ResortSlug): void {
  if (slug === undefined) {
    cachedPromises.clear()
    cachedFulfilled.clear()
  } else {
    cachedPromises.delete(slug)
    cachedFulfilled.delete(slug)
  }
}

// Per **D13** + Codex round-7 P1-1 + round-9 P2-13 folds: PR 4.4d's
// useWorkspaceState calls this on successful PUT to publish the post-PUT
// response into both caches. The synchronous cachedFulfilled entry is the
// load-bearing piece — the next useResortDetail(slug) call returns
// synchronously, avoiding the React-19 use(Promise.resolve()) flicker.
// cachedPromises is also updated so any concurrent Suspense reader (rare,
// but possible if a sibling component is mid-suspend) sees the same
// resolved data.
export function prepopulateResortDetail(slug: ResortSlug, response: ResortDetailResponse): void {
  cachedFulfilled.set(slug, response)
  cachedPromises.set(slug, Promise.resolve(response))
}

export function __resetForTests(): void {
  cachedPromises.clear()
  cachedFulfilled.clear()
}
```

`useResortDetail.hmr.ts` (mirrors `apps/public/src/state/useDataset.hmr.ts:14-25` — string-literal accept target avoids the cycle that would form if we imported `__resetForTests` back from `./useResortDetail`):

```ts
// HMR-only safety net: in dev, when `useResortDetail.ts` hot-reloads, accept
// the update so Vite cleanly swaps the module. The new module body
// re-initializes its own `cached` (a fresh empty Map) — no callback work
// needed. Excluded from coverage in apps/admin/vite.config.ts because
// import.meta.hot is undefined under vitest (the entire module body is
// dead code in the test environment).
//
// Per Codex round-8 P2-12 fold: importing `__resetForTests` from
// `./useResortDetail` would form a cycle (useResortDetail.ts side-effect-
// imports this file). The accept target is expressed as a string literal
// instead — Vite accepts the dependency by name without us having to import
// it back into the module under reload. Mirrors the existing public
// `useDataset.hmr.ts` pattern.

if (import.meta.hot) {
  import.meta.hot.accept('./useResortDetail', (): void => {
    /* no-op — module replacement re-initializes cached to a fresh Map naturally */
  })
}
```

- [ ] **Step 2: Run.** PASS on all hook tests.

### Task 7 — HMR coverage exclusion

- [ ] **Step 1: Modify `apps/admin/vite.config.ts`** — add `'src/state/*.hmr.ts'` to the coverage `exclude` array (mirror `apps/public/vite.config.ts:143`).

### Task 8 — Coverage + qa + PR + Codex cycle

- [ ] **Step 1:** `npm run qa`. 100% × 4 on the new files (HMR file excluded).
- [ ] **Step 2:** Open PR; `@codex review`; fold; iterate.
- [ ] **Step 3:** Local-test plan: `npm run dev:admin`; `curl http://127.0.0.1:5174/api/resorts/kotelnica-bialczanska` returns the projected JSON; `curl /api/resorts/spindleruv-mlyn` returns same shape; `curl /api/resorts/nonexistent` returns 404.
- [ ] **Step 4:** Surface to maintainer.

---

## PR 4.4b — Editor view (read-only)

**Goal.** Editor route renders durable + live panels with per-field StatusPill, source attribution, value display via `formatMetricValue`, and a render-only ModeToggle (visible-but-inert until 4.4d). Wraps in `<Suspense>` + `<EditorErrorBoundary>`.

**Acceptance gate.** `npm run qa` green; `resort-editor-read.test.tsx` (canned MSW) renders both seed slugs end-to-end; durable + live panels show all 12 fields with correct StatusPill states; render-only ModeToggle has `aria-disabled="true"`; error boundary surfaces 404 + 500 `workspace-corrupt` per **D1**; jest-axe passes.

### Task 1 — `formatMetricValue` failing tests

**Files:** New `apps/admin/src/views/ResortEditor/FieldRow.test.tsx`. (Formatter tests co-located with FieldRow.)

- [ ] **Step 1:** Write tests asserting format for every `MetricPath` × valid value + edge cases:
  - `slopes_km: 142` → `"142 km"`.
  - `lift_count: 24` → `"24"`.
  - `season.start_month: 12` → `"December"`; `season.start_month: 0` → `"—"`.
  - `lift_pass_day: { amount: 4250, currency: 'EUR' }` → `Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(4250)` (locale-dependent string; assert via the same construction). Per Codex round-8 P2-11 fold: `Money.currency` is `z.literal('EUR')` (`packages/schema/src/primitives.ts:5-8`) — non-EUR upstream prices live on `field_sources.<path>.fx.native_currency` per ADR-0003, NOT on `Money.currency`. Testing the formatter with `currency: 'PLN'` would either be unreachable (the schema rejects it before the formatter sees it) OR force fixtures that fail `ResortDetailResponse.parse()`.
  - `lifts_open: { count: 12, total: 24 }` → `"12 / 24"`; missing `total` → `"12 / —"`.
  - `snow_depth_cm: 145` → `"145 cm"`.
- [ ] **Step 2:** Run. FAIL.

### Task 2 — Implement `formatMetricValue`

**Files:** `apps/admin/src/views/ResortEditor/FieldRow.tsx`.

- [ ] **Step 1:** Implement exhaustive switch on `MetricPath`. Out-of-range / missing → `"—"`. Never throw. Co-locate `labelForPath(path: MetricPath): string` (e.g. `'altitude_m.min'` → `'Altitude (min, m)'`) — used by `FieldRow` aria-label and `ModeToggle` aria-label in PR 4.4d.
- [ ] **Step 2:** PASS.

### Task 3 — `FieldRow` render-only failing tests

- [ ] **Step 1:** Test:
  - StatusPill variant matches `FieldStateFor` state.
  - Formatted value rendered.
  - Source attribution shown.
  - Inline render-only ModeToggle: `<span role="switch" aria-checked={state==='manual'} aria-disabled="true">`.
  - jest-axe passes.
- [ ] **Step 2:** Run. FAIL.

### Task 4 — Implement `FieldRow`

- [ ] **Step 1:** Implement render-only component (no input element yet — that ships in 4.4d).
- [ ] **Step 2:** Run. PASS.

### Task 5 — `MetricPanel` impl

**Files:** New `apps/admin/src/views/ResortEditor/MetricPanel.tsx`.

- [ ] **Step 1:** Implement parametrized `<MetricPanel kind="durable" | "live" field_states>`. Iterate the appropriate subset of `MetricPath`; render `<FieldRow>` per path. (Tests for MetricPanel's parametrization come via `ResortEditor.test.tsx` mounting both kinds — no separate `MetricPanel.test.tsx` per file budget.)

### Task 6 — `<EditorErrorBoundary>` + `<ResortEditor>` failing tests

**Files:** New `apps/admin/src/views/ResortEditor.test.tsx`.

- [ ] **Step 1:** Test:
  - **Loading**: `<Suspense>` fallback `<div role="status" aria-live="polite">Loading…</div>` (per **D4**).
  - **Loaded**: response renders `<Tabs>` (Durable / Live) with `<MetricPanel>`s; both panels render with the canned MSW response from `mocks/server.ts`.
  - **MetricPanel coverage**: assert all 7 durable paths render in DurablePanel; all 5 live paths render in LivePanel.
  - **404**: MSW for `/api/resorts/foo` returns 404 → boundary surfaces "Resort not found." + "Back to resorts" link. Click "Back" → `setRoute({ route: 'resorts' })` AND `cached.delete(foo)` happens.
  - **500 workspace-corrupt**: MSW returns 500 with `code: workspace-corrupt`, `details: { slug }` → boundary copy contains literal `data/admin-workspace/${slug}.json`. "Retry" button calls `invalidateResortDetail(slug)` inside `startTransition` then bumps `retryKey`.
  - **Retry recovery**: after retry, MSW returns 200 → field rows render.
  - jest-axe on each state.
- [ ] **Step 2:** Run. FAIL.

### Task 7 — Implement `<ResortEditor>` + `<EditorErrorBoundary>`

- [ ] **Step 1:** Implement (boundary co-located inside `ResortEditor.tsx`):

```tsx
import type { JSX, ReactNode } from 'react'
import { Component, Suspense, startTransition, useState } from 'react'

import type { ResortSlug } from '@snowboard-trip-advisor/schema'

import { Button, Tabs } from '@snowboard-trip-advisor/design-system'

import { ApiClientError } from '../lib/apiClient'
import { invalidateResortDetail, useResortDetail } from '../state/useResortDetail'
import { setRoute } from '../state/useURLState'
import { MetricPanel } from './ResortEditor/MetricPanel'

interface ResortEditorProps { readonly slug: ResortSlug }

export function ResortEditor({ slug }: ResortEditorProps): JSX.Element {
  const [retryKey, setRetryKey] = useState(0)
  return (
    <EditorErrorBoundary
      slug={slug}
      onRetry={(): void => {
        startTransition((): void => {
          invalidateResortDetail(slug)
          setRetryKey((k): number => k + 1)
        })
      }}
      onBack={(): void => {
        invalidateResortDetail(slug)
        setRoute({ route: 'resorts' })
      }}
    >
      <Suspense fallback={<div role="status" aria-live="polite">Loading…</div>}>
        <ResortEditorBody slug={slug} key={retryKey} />
      </Suspense>
    </EditorErrorBoundary>
  )
}

function ResortEditorBody({ slug }: { readonly slug: ResortSlug }): JSX.Element {
  const { field_states } = useResortDetail(slug)
  return (
    <Tabs items={[
      { id: 'durable', label: 'Durable', content: <MetricPanel kind="durable" field_states={field_states} /> },
      { id: 'live', label: 'Live', content: <MetricPanel kind="live" field_states={field_states} /> },
    ]} />
  )
}

interface BoundaryProps {
  readonly slug: ResortSlug
  readonly onRetry: () => void
  readonly onBack: () => void
  readonly children: ReactNode
}
interface BoundaryState { readonly error: ApiClientError | null }

class EditorErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  public state: BoundaryState = { error: null }

  public static getDerivedStateFromError(err: unknown): BoundaryState {
    return { error: err instanceof ApiClientError ? err : new ApiClientError(500, { error: { code: 'internal', message: String(err) } }) }
  }

  public componentDidUpdate(prevProps: BoundaryProps): void {
    // Reset error when retry/back fires (the parent's startTransition path
    // bumps retryKey which remounts children — clear the error so the new
    // subtree renders the success path).
    if (prevProps !== this.props && this.state.error !== null) {
      this.setState({ error: null })
    }
  }

  public render(): ReactNode {
    if (this.state.error === null) { return this.props.children }
    const { error } = this.state
    // Per Codex round-16 P2-21 fold: use DS Button (raw <button> JSX is
    // banned in apps/admin/src/** by eslint.config.js:255 / RAW_HTML_ELS).
    if (error.envelope.error.code === 'not-found') {
      return (
        <div role="alert">
          <p>Resort not found.</p>
          <Button variant="ghost" onClick={this.props.onBack}>Back to resorts</Button>
        </div>
      )
    }
    if (error.envelope.error.code === 'workspace-corrupt') {
      return (
        <div role="alert">
          <p>Workspace file <code>data/admin-workspace/{this.props.slug}.json</code> is corrupt. Inspect the file and either repair or <code>rm</code> it before retrying. See server logs for details.</p>
          <Button variant="ghost" onClick={this.props.onBack}>Back to resorts</Button>
          <Button variant="primary" onClick={this.props.onRetry}>Retry</Button>
        </div>
      )
    }
    // Generic fallback for unexpected error codes.
    return (
      <div role="alert">
        <p>Error loading resort: {error.envelope.error.message}</p>
        <Button variant="primary" onClick={this.props.onRetry}>Retry</Button>
      </div>
    )
  }
}
```

- [ ] **Step 2:** Run. PASS.

### Task 8 — `App.tsx` editor branch

- [ ] **Step 1: Modify `apps/admin/src/App.tsx`.** Replace the `inResortsContext` shape:

```tsx
const route = useURLState()
return (
  <Shell>
    {route.route === 'dashboard' ? <Dashboard /> : null}
    {route.route === 'resorts' ? <ResortsTable /> : null}
    {route.route === 'editor' ? <ResortEditor slug={route.slug} /> : null}
  </Shell>
)
```

### Task 9 — `App.test.tsx` modify

- [ ] **Step 1: Modify** the existing editor-route test (`apps/admin/src/App.test.tsx:58-70`). Replace the assertion block:
  - OLD: `expect(screen.queryByLabelText(/loading dashboard/i)).toBeNull()` + Dashboard absence assertion.
  - NEW: assert `<ResortEditor>` mounts (e.g., `screen.queryByRole('tablist')` — the `<Tabs>` primitive renders `tablist`; or assert `aria-label="Loading…"` is briefly present from the Suspense fallback before MSW resolves).
  - Update test description from "keeps ResortsTable mounted on editor route until PR 4.4b" → "renders ResortEditor on editor route".

### Task 10 — Integration test: `resort-editor-read.test.tsx`

**Files:** New `tests/integration/apps/admin/resort-editor-read.test.tsx`.

- [ ] **Step 1: Write** — uses canned MSW; mounts `<App />` with `?route=editor&slug=kotelnica-bialczanska`; asserts both panels render with seed-fixture's field states; verifies render-only ModeToggle has `aria-disabled`; jest-axe passes; loading state appears briefly.
- [ ] **Step 2: Run + commit.**

### Task 11 — qa + PR + Codex + smoke

- [ ] **Step 1:** `npm run qa`. 100% × 4.
- [ ] **Step 2:** Open PR; `@codex review`; fold; iterate.
- [ ] **Step 3:** Local-test plan: `npm run dev:admin`; visit `http://127.0.0.1:5174/?route=editor&slug=kotelnica-bialczanska` and `?slug=spindleruv-mlyn`. Take Playwright MCP screenshots.
- [ ] **Step 4:** Surface to maintainer.

---

## PR 4.4c — Server write + atomic-write

**Goal.** Wire `PUT /api/resorts/:slug` end-to-end + the atomic-write helper. Schema package adds the `atomicWriteText` re-export. Dispatch passes `.details` from thrown errors.

**Acceptance gate.** `npm run qa` green; PUT round-trip verified including all spec §7.12 reject cases; atomic-write semantics verified (tmp cleanup, parent-dir EBADF on macOS); `editor_modes` cross-key reject produces `400 invalid-resort` envelope with refinement message in `details`; bridge-routed `GET /api/resorts/<seed>` returns 200 (deferred-bridge-verification fold).

### Task 1 — Failing test: schema re-export

**Files:** Modify `packages/schema/src/exports-map.test.ts`.

- [ ] **Step 1: Add a test:**

```ts
import * as nodeExports from '@snowboard-trip-advisor/schema/node'

test('atomicWriteText is re-exported from /node entry', () => {
  expect(typeof nodeExports.atomicWriteText).toBe('function')
})
```

- [ ] **Step 2: Run.** FAIL.

### Task 2 — Implement: `export` keyword on `atomicWriteText`

**Files:** Modify `packages/schema/src/publishDataset.ts`.

- [ ] **Step 1:** Change `async function atomicWriteText` to `export async function atomicWriteText`. (1-line diff.) Verify `node.ts` already does `export * from './publishDataset'` — no `node.ts` edit needed.
- [ ] **Step 2:** Run schema test from Task 1. PASS.

### Task 3 — Atomic-write workspace helper failing tests

**Files:** Modify `apps/admin/server/__tests__/workspace.test.ts`.

- [ ] **Step 1: Add tests** for `atomicWriteWorkspaceFile(targetPath, body)`:
  - Happy path: writes to a tmpdir; assert content matches body; assert no `.tmp` files remain.
  - Existing target overwrite: target had old content → after call, content is new.
  - Trailing newline: final byte is `'\n'` per `atomicWriteText`'s contract.
  - **JSON serialization round-trip parity** (per fold §8): write a fixture-shaped object via `atomicWriteWorkspaceFile(path, JSON.stringify(parsed, null, 2))`; read back; parse; assert structural equality with input. (This pins the canonical 2-space format so the FIRST PUT against a freshly-loaded fixture doesn't unexpectedly mutate the on-disk byte sequence.)
- [ ] **Step 2: Run.** FAIL.

### Task 4 — Implement `atomicWriteWorkspaceFile`

**Files:** Modify `apps/admin/server/workspace.ts`.

- [ ] **Step 1:** Implement as a thin wrapper:

```ts
import { atomicWriteText } from '@snowboard-trip-advisor/schema/node'

export async function atomicWriteWorkspaceFile(targetPath: string, body: string): Promise<void> {
  await atomicWriteText(targetPath, body)
}
```

- [ ] **Step 2:** Run. PASS.

### Task 5 — Dispatch `.details` pass-through failing test

**Files:** Modify `apps/admin/server/__tests__/dispatch.test.ts`.

- [ ] **Step 1: Add tests:**
  - Stub a route handler that throws `{ code: 'invalid-resort', message: 'cross-key fail', details: [{ message: '...', path: ['editor_modes'] }] }`. Dispatch returns `{ status: 400, body: { error: { code: 'invalid-resort', message: 'cross-key fail', details: [...] } } }`.
  - Stub a handler that throws `WorkspaceCorruptError` with `.slug` and `.issues`. Dispatch returns 500 with `details: { slug, issues }`.
  - **Bridge-harness verification** (deferred from PR 4.4a-2): use `bridgeHandlers(workspaceDir)` from `apps/admin/src/mocks/realHandlers.ts` to invoke `GET /api/resorts/kotelnica-bialczanska` against a tmpdir seeded with the seed fixture. Assert 200 + `field_states` present + correct shape.
- [ ] **Step 2: Run.** FAIL.

### Task 6 — Implement dispatch `.details` pass-through

**Files:** Modify `apps/admin/server/dispatch.ts`.

- [ ] **Step 1:** In the `catch (err: unknown)` block, after extracting `code`, also extract `details`:

```ts
const code = (err as Error & { code?: string }).code
const details = (err as Error & { details?: unknown }).details
if (code !== undefined) {
  const status = STATUS_FOR_CODE.get(code)
  if (status !== undefined) {
    return {
      status,
      body: errorEnvelope(code, (err as Error).message, details),
    }
  }
}
```

`errorEnvelope` already handles the `details === undefined` case correctly (1-arg / 2-arg form).

- [ ] **Step 2:** Run dispatch tests. PASS.

### Task 7 — `resortUpsertHandler` failing tests

**Files:** New `apps/admin/server/__tests__/resortUpsert.test.ts`.

- [ ] **Step 1: Write tests** (every spec §7.12 case + the **D5** `If-Match` defensive case):
  - Empty body reject → `InvalidRequestError` (`code: 'invalid-request'`).
  - Happy path + idempotency (re-running same PUT produces same response).
  - `modified_at` brand-parse: `ISODateTimeString.parse(new Date().toISOString())`.
  - `editor_modes` shallow-merge happy: existing `{a: 'manual', b: 'manual'}` + PUT `{a: 'auto', c: 'manual'}` → `{a: 'auto', b: 'manual', c: 'manual'}`.
  - `editor_modes` reset-to-AUTO: PUT `{a: 'auto'}` semantics per spec §10.2.
  - **`editor_modes` cross-key reject (request-pipeline-aware)** per Codex round-10 P2-14 fold: `ResortUpsertBody`'s schema (`packages/schema/api/resortUpsert.ts`) uses `z.partialRecord(z.enum(METRIC_FIELDS), ...)` — sending `editor_modes: { ghost: 'manual' }` (a non-`MetricPath` key) fails Zod parse at the request layer and returns `400 invalid-request` (NOT `invalid-resort`); the handler never runs and the refinement is never invoked. To exercise the **handler-level cross-key refinement** that produces `invalid-resort`, use a **valid MetricPath that is NOT in `resort.field_sources`** for the test fixture. The fixture's `resort.field_sources` covers only the 7 durable paths; sending `editor_modes: { snow_depth_cm: 'manual' }` parses cleanly through `ResortUpsertBody` (snow_depth_cm IS in METRIC_FIELDS) but fails the `WorkspaceFile.parse()` cross-key refinement post-merge (snow_depth_cm is in `live_signal.field_sources` but NOT in `resort.field_sources`, which is what the invariant checks). Handler throws `InvalidResortError`; dispatch maps to `400 invalid-resort` with the refinement message in `details`.
  - **Drop "field-source-removal reject"** per Codex round-10 P2-14 fold: the PUT body cannot REPRESENT a field_sources removal because (a) `ResortUpsertBody.resort` is `Partial<Resort>`, (b) spec §4.3 specifies field_sources is deep-merged on the server. The client can ADD/UPDATE entries but not DELETE them via PUT. The cross-key refinement at `WorkspaceFile.parse()` still protects against this state, but it can only arise from direct workspace-file editing (covered by `workspaceFile.test.ts`'s schema tests in PR 4.1a), not via the PUT API. This test case is removed from the PR 4.4c handler tests.
  - Resort schema reject (e.g., malformed `country`).
  - Corrupt-workspace target → `WorkspaceCorruptError` and refuses to overwrite (assert file on disk is byte-equal to its corrupt state).
  - Cold-start (workspace doesn't exist, slug NOT in published) → `NotFoundError`.
  - Cold-start (workspace doesn't exist, slug IS in published) → 200 first edit; workspace file written.
  - **`If-Match` defensive** (per **D5**): PUT request carrying an `If-Match: "..."` header → handler ignores it; PUT succeeds. (Asserts the absence of Phase-2 ETag enforcement.)
- [ ] **Step 2: Run.** FAIL.

### Task 8 — Implement `resortUpsertHandler`

**Files:** Modify `apps/admin/server/resortUpsert.ts`.

- [ ] **Step 1:** Replace 501 stub. Define + export:
  - `class InvalidRequestError extends Error { readonly code = 'invalid-request' as const }`
  - `class InvalidResortError extends Error { readonly code = 'invalid-resort' as const; constructor(public readonly issues: ReadonlyArray<{message: string; path: ReadonlyArray<string|number>}>) { super('resort validation failed') } get details(): unknown { return this.issues } }`

  Handler steps:
  1. Reject empty body (none of resort/live_signal/editor_modes present) → `InvalidRequestError`.
  2. Read existing workspace OR project from published OR throw `NotFoundError`.
  3. Merge per §4.3 (deep `field_sources`, shallow top-level `Resort`, shallow `live_signal`, shallow `editor_modes`).
  4. Set `modified_at = ISODateTimeString.parse(new Date().toISOString())`.
  5. Run `WorkspaceFile.safeParse()` on merged document. On failure → `InvalidResortError(issues)`.
  6. `atomicWriteWorkspaceFile(join(workspaceDir, slug + '.json'), JSON.stringify(parsed.data, null, 2))`.
  7. Return `{ resort, live_signal, field_states }` via `projectFieldStates`.
  
  Helper bodies (`mergeResort`, `mergeLive`, `readExistingOrProject`, `buildResortDetailResponse`) are filled in by the executor at coding time per the spec semantics; the test surface (Task 7) drives correctness.
- [ ] **Step 2:** Run. PASS.

### Task 9 — Coverage + qa + PR + Codex cycle

- [ ] **Step 1:** `npm run qa`. 100% × 4.
- [ ] **Step 2:** Open PR. PR description points out: "imports `atomicWriteText` rather than copying — same canonical impl, no drift" (per **B1**) + "dispatch.ts now passes `.details` from thrown errors" (per **D8**).
- [ ] **Step 3:** `@codex review`; fold; iterate.
- [ ] **Step 4:** Local-test plan: spin `npm run dev:admin`; manually `curl -X PUT http://127.0.0.1:5174/api/resorts/kotelnica-bialczanska -H 'Content-Type: application/json' -d '{"editor_modes":{"slopes_km":"manual"}}'` and confirm the workspace file is written. **Two distinct reject paths to verify** (per Codex round-10 P2-14 fold): (a) request-layer reject — `curl ... -d '{"editor_modes":{"ghost":"manual"}}'` (non-MetricPath key) → `400 invalid-request` (Zod parse fail at `ResortUpsertBody.parse()`); (b) handler-layer reject — `curl ... -d '{"editor_modes":{"snow_depth_cm":"manual"}}'` (valid MetricPath but NOT in `kotelnica`'s `resort.field_sources`) → `400 invalid-resort` with the refinement message in `details` (cross-key invariant fires post-merge at `WorkspaceFile.parse()`).
- [ ] **Step 5:** Surface to maintainer.

---

## PR 4.4d — Editor edit interaction

**Goal.** Editor becomes edit-interactive. `useWorkspaceState` carries the in-flight draft + debounced PUT (with in-flight token + draft-revision counter + concurrent-PUT queue per **E1+**); `useModeToggle` flips AUTO ↔ MANUAL and persists via PUT; MANUAL mode exposes the edit input for the **7 durable numeric paths** (per **F1**); the bridge integration test proves the workspace file is actually written and survives reload.

**Acceptance gate.** `npm run qa` green; bridge integration test green with on-disk filesystem assertion (NOT just MSW request log); page reload preserves workspace state through the bridge (with explicit `__resetForTests()` between unmount/remount per fold §5); `validPaths` guard prevents invalid PUTs (silent no-op); Tier 3 → Tier 4 gate passes via manual `npm run dev:admin` editor MANUAL flip + numeric edit + reload sequence.

### Task 1 — `useModeToggle` failing tests

**Files:** New `apps/admin/src/state/useModeToggle.test.ts`.

- [ ] **Step 1: Write tests** (slug derived from `useURLState` per **D7** — tests set `window.history.replaceState({}, '', '/?route=editor&slug=kotelnica-bialczanska')` before render). **Reminder per F1 fold:** `validPaths` MUST be `Object.keys(resort.field_sources)` — i.e. the **durable** subset only — NOT `Object.keys(field_states)`. The `WorkspaceFile` cross-key invariant rejects `editor_modes` entries for paths not in `resort.field_sources`, so silently no-op'ing on live-only paths is the correct guard:
  - `toggleMode('slopes_km')` (durable) → emits PUT `{ editor_modes: { slopes_km: 'manual' } }`.
  - Subsequent `toggleMode('slopes_km')` → emits `{ editor_modes: { slopes_km: 'auto' } }`.
  - **`validPaths` guard (silent no-op) — ghost path**: `toggleMode('ghost')` when `'ghost' ∉ field_sources` → NO PUT, NO `console.warn`, NO thrown error. Assert `apiClient.upsertResort` was NOT called.
  - **`validPaths` guard (silent no-op) — live-only path** per Codex round-1 P2-1 fold: `toggleMode('snow_depth_cm')` (live path; in `live_signal.field_sources` but NOT in `resort.field_sources`) → NO PUT, silent no-op. (If 4.4d ever derives `validPaths` from `field_states` keys instead of `resort.field_sources` keys, this test catches it — the live-path PUT would otherwise 400 as `invalid-resort` from the cross-key refinement.)
  - Default reading (no draft, no canonical): missing `editor_modes` entry AND `field_states[path].state !== 'manual'` → `'auto'`.
  - **Canonical-mode reload preservation (gate-blocking)** per Codex round-3 P1-1 fold: MSW serves a `ResortDetailResponse` where `field_states.slopes_km.state === 'manual'` (server has persisted MANUAL); draft is empty (fresh mount, no edits yet) → `modeFor('slopes_km')` returns `'manual'` (NOT `'auto'`). Without the canonical fallback, reload-after-save flips every toggle back to AUTO and the Tier 3 → 4 gate fails. The first `toggleMode('slopes_km')` after this mount inverts to `'auto'` (because `current` reads canonical 'manual' first).
  - **Draft override wins over canonical**: server projection says `'manual'`, but user has just toggled to `'auto'` (draft `editor_modes.slopes_km === 'auto'`) → `modeFor` returns `'auto'`. Override semantics correct.
  - Local `afterEach(() => { useWorkspaceState.__resetForTests(); useResortDetail.__resetForTests() })`.
- [ ] **Step 2:** Run. FAIL.

### Task 2 — `useWorkspaceState` failing tests

**Files:** New `apps/admin/src/state/useWorkspaceState.test.ts`.

- [ ] **Step 1: Write tests** for **E1+** (the module-scoped per-slug singleton store from the updated decisions log):
  - **Debounce 500ms** with vitest fake timers: 5 rapid `setFieldValue('slopes_km', n)` within 500ms → 1 PUT carrying final `n`.
  - **Shared store across `useWorkspaceState()` consumers** per Codex round-2 P1-1 fold: render a test component that calls `useWorkspaceState()` TWICE (mimicking two FieldRows in the same editor); use one consumer to `setFieldValue('slopes_km', 5)` and the OTHER consumer to `setFieldValue('lift_count', 7)` within the same debounce window → only ONE PUT fires (call count = 1) carrying BOTH `slopes_km: 5` and `lift_count: 7`. Without the singleton, two independent debouncers fire two PUTs and the second clobbers the first. The test asserts singleton-per-slug semantics directly.
  - **Per-slug isolation**: render `useWorkspaceState()` for slug `kotelnica-bialczanska`, `setFieldValue('slopes_km', 5)`. Then unmount, change URL to `slug=spindleruv-mlyn`, re-mount. Assert the new mount sees a FRESH draft (not the prior slug's `slopes_km: 5`). Mirrors `useResortDetail`'s per-slug cache pattern.
  - **In-flight token (concurrent-PUT guard)**: while a PUT is in-flight, a second debounce flush is QUEUED, not fired. Use `vi.spyOn(apiClient, 'upsertResort')` and assert call count is 1 until the in-flight PUT resolves; then 2.
  - **Draft-revision counter (keystroke-clobber guard)** per Codex round-1 P2-2 fold: PUT for `slopes_km: 50` is in-flight → `setFieldValue('slopes_km', 500)` BEFORE response → response (canonical `50`) arrives → assert: (a) draft state IS STILL `500`; (b) FieldRow indicator for `slopes_km` STILL `dirty` (NOT `saved`); (c) next debounce flush fires a fresh PUT with `500`. Without the revision counter, the in-flight token check alone would falsely mark `saved`.
  - **4-state indicator**: setFieldValue → `dirty`; flush → `saving`; success (rev unchanged) → `saved`; failure (rev unchanged) → `save-failed`. If rev moves during flush → indicator stays `dirty`.
  - **Save-failed retry-by-edit**: PUT rejects → indicator `save-failed` → next `setFieldValue` triggers fresh debounced flush → success → `saved`.
  - **Cache isolation (observable spy)** per pre-Codex fold §5: assert `apiClient.getResort` is NOT called during `useWorkspaceState` flush. Use `vi.spyOn(apiClient, 'getResort')`.
  - **`__resetForTests()` clears `storesBySlug`**: setFieldValue → reset → next mount sees fresh draft.
  - **Nested-path edit preserves sibling** per **D10** + Codex round-4 P2-6 fold: canonical state has `resort.altitude_m: { min: 1500, max: 2000 }`. `setFieldValue('altitude_m.min', 1600)` → assert `draft.resort.altitude_m === { min: 1600, max: 2000 }` (NOT `{ min: 1600 }`). The hydration-on-first-edit reads the sibling from `store.canonical`. Without this, the PUT body's shallow `Resort.altitude_m` merge on the server replaces the whole object with `{ min: 1600 }` and silently drops `max`. Same test for `season.start_month` (sibling = `season.end_month`) and `lifts_open.count` (sibling = `lifts_open.total`, on the live_signal side).
  - **Canonical sync on render**: when `useResortDetail(slug)` re-projects (e.g., post-PUT response), the `store.canonical` reference updates so subsequent `setFieldValue` calls hydrate from the freshest canonical state.
  - **Manual provenance written on value edit** per **D12** + Codex round-5 P1-1 fold: `setFieldValue('slopes_km', 150)` against canonical with `field_sources.slopes_km.source === 'opensnow'` → assert: (a) `draft.resort.slopes_km === 150`; (b) `draft.resort.field_sources.slopes_km.source === 'manual'`; (c) `draft.resort.field_sources.slopes_km.source_url === 'https://admin.local/manual'`; (d) `upstream_hash` matches `/^[a-f0-9]{64}$/`; (e) `observed_at` ≈ now. **And `field_sources` is sparse** per Codex round-6 P1-1 + round-7 P2-10 folds: assert `Object.keys(draft.resort.field_sources)` is **exactly `['slopes_km']`** (no canonical siblings copied). Server's deep-merge for `field_sources` (spec §4.3) preserves other entries automatically; including them in the PUT would risk overwriting concurrent server-side adapter updates.
  - **Save → later edit clears prior draft** per **D13** + Codex round-7 P1-1 fold: setFieldValue('slopes_km', 150) → debounce → PUT succeeds (rev unchanged path) → assert draft is reset to `{ editor_modes: {} }` and `lastSentDraft` is null. Then setFieldValue('lift_count', 7) → debounce → next PUT body contains ONLY `{ resort: { lift_count: 7, field_sources: { lift_count: <manual> } } }` (NOT `slopes_km` again). Without the reset, the second PUT would re-send `slopes_km: 150` plus its now-stale manual-source entry, risking last-writer-wins clobber against any concurrent server-side update to `slopes_km`.
  - **Edit during round-trip → queued flush diffs against lastSentDraft** per Codex round-16 P2-22 fold: setFieldValue('slopes_km', 150) → debounce flush fires PUT for slopes_km (in-flight). BEFORE response, setFieldValue('lift_count', 7) — rev advances; draft now has both. PUT response arrives → rev-moved path: draft NOT reset, `lastSentDraft = { resort: { slopes_km: 150, field_sources: { slopes_km: <manual> } } }`, prepopulate cache. Queued flush fires → body = diff(currentDraft, lastSentDraft) = ONLY `{ resort: { lift_count: 7, field_sources: { lift_count: <manual> } } }`. **Assert: the second PUT body does NOT include `slopes_km` re-send.** Without the diff, the queued flush would re-send slopes_km's already-persisted state, risking concurrent-server-update clobber.
  - **Empty-diff queued flush short-circuits** per Codex round-18 P2-25 fold: setFieldValue('slopes_km', 150) → debounce flush fires PUT (in-flight). BEFORE response, setFieldValue('slopes_km', 200) → rev advances. Response arrives → rev-moved path: lastSentDraft = { slopes_km: 150 }; queued flush scheduled. BEFORE the queued flush fires, setFieldValue('slopes_km', 150) — reverts to the already-sent value. Queued flush body = diff(currentDraft={slopes_km:150}, lastSent={slopes_km:150}) = `{}`. **Assert: `apiClient.upsertResort` is NOT called for the empty diff** (call count stays at 1 from the first flush). **Assert: dirty/saving statuses become `saved`** (server already has slopes_km=150). Without this guard, an empty body would 400 from the server and the field would erroneously show `save-failed` despite the workspace already matching.
  - **`setMode` does NOT touch field_sources** per **D12**: `setMode('slopes_km', 'manual')` against canonical → assert `draft.resort?.field_sources` is undefined (or unchanged). Mode-flip-without-edit preserves old upstream provenance — only an actual value change triggers the source switch.
- [ ] **Step 2:** Run. FAIL.

### Task 3 — Implement `useWorkspaceState`

**Files:** New `apps/admin/src/state/useWorkspaceState.ts`.

- [ ] **Step 1:** Implement the module-scoped per-slug singleton store with `useSyncExternalStore` subscription (per **E1+** + Codex round-2 P1-1 fold + Codex round-1 P2-2 fold + Codex round-4 P2-6 fold). Pseudo-shape:

```ts
import { useCallback } from 'react'
import { useSyncExternalStore } from 'react'

import { ISODateTimeString, UpstreamHash } from '@snowboard-trip-advisor/schema'
import type { FieldSource, MetricPath, Resort, ResortLiveSignal, ResortSlug } from '@snowboard-trip-advisor/schema'
import type { ResortDetailResponse, ResortUpsertBody } from '@snowboard-trip-advisor/schema/api'

import { apiClient } from '../lib/apiClient'
import { prepopulateResortDetail, useResortDetail } from './useResortDetail'
import { useURLState } from './useURLState'

const DEBOUNCE_MS = 500
type Status = 'saved' | 'dirty' | 'saving' | 'save-failed'

// Per **D10** + Codex round-4 P2-6 fold: DraftShape mirrors the WorkspaceFile
// payload shape directly. Nested edits write to the nested location after
// hydrating the parent from canonical state. buildBodyFromDraft is then
// trivial — it just emits the shape verbatim (server merges shallow per §4.3).
type DraftShape = {
  resort?: Partial<Resort>
  live_signal?: Partial<ResortLiveSignal>
  editor_modes: Partial<Record<MetricPath, 'manual' | 'auto'>>
}

interface StoreState {
  readonly draft: DraftShape
  readonly status: Record<MetricPath, Status>
  readonly rev: number
}

interface SlugStore {
  state: StoreState
  // Latest canonical state from useResortDetail(slug) — synced by the hook
  // on every render. Module-level setFieldValue reads this to hydrate
  // sibling values when the user first edits a nested-path leaf
  // (e.g., editing altitude_m.min reads canonical.resort.altitude_m to
  // preserve .max in the draft). Per **D10**.
  canonical: ResortDetailResponse | null
  // Per Codex round-16 P2-22 fold: the draft snapshot from the last
  // successful PUT. The next flush builds the PUT body as the diff between
  // the current draft and lastSentDraft — ensuring fields already persisted
  // by an earlier flush aren't re-sent (which would risk overwriting
  // concurrent server-side updates with stale data). Reset to null when
  // the draft is cleared (rev-unchanged success path), or set to the
  // sent draft on rev-moved success so the queued flush diffs correctly.
  lastSentDraft: DraftShape | null
  inFlightToken: symbol | null
  queued: boolean
  timer: ReturnType<typeof setTimeout> | null
  subscribers: Set<() => void>
}

// Module-scoped per-slug singleton store. Every useWorkspaceState() consumer
// for the same slug subscribes to the SAME SlugStore — so two FieldRows in
// the same editor share one draft, one in-flight token, one queue.
// Codex round-2 P1-1 fold: the v2 useState/useRef-per-hook design created
// 12 independent stores (one per FieldRow), reintroducing the concurrent-PUT
// race that E1+ is supposed to prevent.
const storesBySlug = new Map<ResortSlug, SlugStore>()

function emptyState(): StoreState {
  return { draft: { editor_modes: {} }, status: {} as Record<MetricPath, Status>, rev: 0 }
}

function getOrCreateStore(slug: ResortSlug): SlugStore {
  let store = storesBySlug.get(slug)
  if (store === undefined) {
    store = {
      state: emptyState(),
      canonical: null,
      lastSentDraft: null,
      inFlightToken: null,
      queued: false,
      timer: null,
      subscribers: new Set(),
    }
    storesBySlug.set(slug, store)
  }
  return store
}

// Per **D10**: walk the dotted MetricPath into draft.resort/draft.live_signal,
// hydrating nested parents from canonical on first edit.
type Side = 'resort' | 'live_signal'

const LIVE_PATH_PREFIXES = new Set(['snow_depth_cm', 'lifts_open', 'lift_pass_day', 'lodging_sample'])

function sideFor(path: MetricPath): Side {
  const top = path.split('.')[0] ?? path
  return LIVE_PATH_PREFIXES.has(top) ? 'live_signal' : 'resort'
}

function patchDraftLeaf(
  draft: DraftShape,
  side: Side,
  path: MetricPath,
  value: unknown,
  canonical: ResortDetailResponse | null,
): DraftShape {
  const segments = path.split('.')
  const sideRoot = side === 'resort'
    ? (draft.resort ?? {}) as Record<string, unknown>
    : (draft.live_signal ?? {}) as Record<string, unknown>
  const nextSideRoot: Record<string, unknown> = { ...sideRoot }

  if (segments.length === 1) {
    nextSideRoot[segments[0]] = value
  } else {
    // Nested path — hydrate the parent from canonical on first edit.
    const [parent, leaf] = segments
    const existingParent = nextSideRoot[parent]
    let parentObj: Record<string, unknown>
    if (existingParent !== undefined && existingParent !== null && typeof existingParent === 'object') {
      parentObj = { ...(existingParent as Record<string, unknown>) }
    } else {
      // Hydrate from canonical to preserve siblings.
      const canonicalSide = canonical === null ? null : (side === 'resort' ? canonical.resort : canonical.live_signal)
      const canonicalParent = canonicalSide === null || canonicalSide === undefined
        ? {}
        : ((canonicalSide as Record<string, unknown>)[parent] as Record<string, unknown> | undefined) ?? {}
      parentObj = { ...canonicalParent }
    }
    parentObj[leaf] = value
    nextSideRoot[parent] = parentObj
  }

  if (side === 'resort') {
    return { ...draft, resort: nextSideRoot as Partial<Resort> }
  }
  return { ...draft, live_signal: nextSideRoot as Partial<ResortLiveSignal> }
}

function emit(store: SlugStore): void {
  for (const cb of store.subscribers) { cb() }
}

function patchState(store: SlugStore, fn: (s: StoreState) => StoreState): void {
  store.state = fn(store.state)
  emit(store)
}

function setStatusForDirty(store: SlugStore, target: Status): void {
  patchState(store, (s) => {
    const next = { ...s.status }
    for (const [path, status] of Object.entries(s.status)) {
      if (status === 'dirty' || status === 'saving') {
        next[path as MetricPath] = target
      }
    }
    return { ...s, status: next }
  })
}

function scheduleFlush(slug: ResortSlug): void {
  const store = getOrCreateStore(slug)
  if (store.timer !== null) { clearTimeout(store.timer) }
  store.timer = setTimeout((): void => { void flush(slug) }, DEBOUNCE_MS)
}

async function flush(slug: ResortSlug): Promise<void> {
  const store = getOrCreateStore(slug)
  if (store.inFlightToken !== null) {
    store.queued = true
    return
  }
  const token = Symbol('flush')
  const inFlightRev = store.state.rev
  const inFlightDraft = store.state.draft
  store.inFlightToken = token
  setStatusForDirty(store, 'saving')
  try {
    // Per Codex round-16 P2-22 fold: PUT body is the diff between the
    // current draft and what was last successfully sent (`store.lastSentDraft`).
    // First flush has lastSent = null → body is the entire draft. Subsequent
    // flushes (after a previous success) only send PATHS that changed since.
    const body = buildBodyFromDraft(inFlightDraft, store.lastSentDraft)
    // Per Codex round-18 P2-25 fold: an empty-diff body would be rejected
    // by the server as `400 invalid-request` (ResortUpsertBody requires at
    // least one of resort/live_signal/editor_modes). Empty diff means the
    // user edited during a round-trip then reverted to the already-sent
    // value — the workspace already matches; no PUT needed. Mark dirty/saving
    // paths as saved and short-circuit. (Note: this is reachable in the
    // rev-moved path; the rev-unchanged path with empty diff is a no-op
    // double-flush we also guard via the same branch.)
    if (Object.keys(body).length === 0) {
      patchState(store, (s) => {
        const nextStatus = { ...s.status }
        for (const [path, status] of Object.entries(s.status)) {
          if (status === 'dirty' || status === 'saving') {
            nextStatus[path as MetricPath] = 'saved'
          }
        }
        return { rev: s.rev, status: nextStatus, draft: s.draft }
      })
      // No PUT fired; lastSentDraft stays as-is (the diff baseline is still
      // accurate for the next flush). Skip the response-handling branches.
      return
    }
    const response = await apiClient.upsertResort(slug, body)
    if (store.inFlightToken === token && store.state.rev === inFlightRev) {
      // Rev unchanged — clean success. Reset draft, mark statuses saved,
      // prepopulate canonical, clear lastSentDraft (since the fresh draft
      // has nothing pending).
      patchState(store, (s) => {
        const nextStatus = { ...s.status }
        for (const [path, status] of Object.entries(s.status)) {
          if (status === 'dirty' || status === 'saving') {
            nextStatus[path as MetricPath] = 'saved'
          }
        }
        return {
          rev: s.rev,
          status: nextStatus,
          draft: { editor_modes: {} },
        }
      })
      store.lastSentDraft = null  // draft is empty; next edit starts fresh
      prepopulateResortDetail(slug, response)
    } else if (store.inFlightToken === token) {
      // Rev moved — user edited during round-trip. KEEP the draft (newer
      // edits live there) but record what was successfully sent so the
      // queued flush diffs against this baseline and ONLY sends the new
      // edits. Without this, the queued flush re-sends inFlightDraft's
      // already-persisted fields — risking last-writer-wins clobber against
      // concurrent server-side updates (Codex round-16 P2-22 fold).
      store.lastSentDraft = inFlightDraft
      // Also prepopulate the canonical cache with the response — the
      // FieldRow value display reads from canonical for fields not in the
      // draft, so post-success reads of just-sent paths reflect the
      // server-persisted state.
      prepopulateResortDetail(slug, response)
    }
  } catch {
    if (store.inFlightToken === token && store.state.rev === inFlightRev) {
      setStatusForDirty(store, 'save-failed')
    }
  } finally {
    store.inFlightToken = null
    if (store.queued || store.state.rev !== inFlightRev) {
      store.queued = false
      scheduleFlush(slug)
    }
  }
}

// Per **D10** + Codex round-16 P2-22 fold: PUT body is the diff between
// the current draft and `lastSent` (what was successfully sent in the
// previous flush). When `lastSent` is null (first flush), the body is the
// entire draft. Otherwise, only paths whose values differ from `lastSent`
// are included — fields already persisted by an earlier flush are skipped,
// preventing stale-data re-sends that would risk overwriting concurrent
// server-side updates.
//
// Comparison strategy: shallow-compare each top-level key under
// `draft.resort` / `draft.live_signal`. For nested objects (altitude_m,
// season, lifts_open, etc.), compare via JSON.stringify (small objects;
// runtime cost negligible). field_sources entries are compared by
// upstream_hash (each manual edit writes a fresh random hash, so the hash
// uniquely identifies the edit). editor_modes entries compare directly
// (string === string).
function buildBodyFromDraft(draft: DraftShape, lastSent: DraftShape | null): ResortUpsertBody {
  if (lastSent === null) {
    // First flush — emit the entire draft.
    const body: ResortUpsertBody = {}
    if (draft.resort !== undefined && Object.keys(draft.resort).length > 0) { body.resort = draft.resort }
    if (draft.live_signal !== undefined && Object.keys(draft.live_signal).length > 0) { body.live_signal = draft.live_signal }
    if (Object.keys(draft.editor_modes).length > 0) { body.editor_modes = draft.editor_modes }
    return body
  }
  // Diff against lastSent. Each top-level key (resort.<key> /
  // live_signal.<key> / editor_modes.<path>) is compared.
  const diffedResort = diffSide(draft.resort, lastSent.resort)
  const diffedLive = diffSide(draft.live_signal, lastSent.live_signal)
  const diffedModes: Partial<Record<MetricPath, 'manual' | 'auto'>> = {}
  for (const [path, mode] of Object.entries(draft.editor_modes)) {
    if (lastSent.editor_modes[path as MetricPath] !== mode) {
      diffedModes[path as MetricPath] = mode
    }
  }
  const body: ResortUpsertBody = {}
  if (diffedResort !== null) { body.resort = diffedResort }
  if (diffedLive !== null) { body.live_signal = diffedLive }
  if (Object.keys(diffedModes).length > 0) { body.editor_modes = diffedModes }
  return body
}

// Diff a side (resort or live_signal). Returns null when no fields differ
// (so the caller can omit the side from the body). field_sources is
// compared per-path by upstream_hash.
function diffSide<T extends object>(current: Partial<T> | undefined, sent: Partial<T> | undefined): Partial<T> | null {
  if (current === undefined) { return null }
  const out: Partial<T> = {}
  let hasChanges = false
  for (const [key, currentValue] of Object.entries(current)) {
    if (key === 'field_sources') {
      const currentFs = currentValue as Record<string, FieldSource>
      const sentFs = ((sent as Record<string, unknown> | undefined)?.field_sources ?? {}) as Record<string, FieldSource>
      const diffedFs: Record<string, FieldSource> = {}
      let fsChanged = false
      for (const [path, fs] of Object.entries(currentFs)) {
        if (sentFs[path]?.upstream_hash !== fs.upstream_hash) {
          diffedFs[path] = fs
          fsChanged = true
        }
      }
      if (fsChanged) {
        ;(out as Record<string, unknown>).field_sources = diffedFs
        hasChanges = true
      }
    } else {
      const sentValue = (sent as Record<string, unknown> | undefined)?.[key]
      if (JSON.stringify(sentValue) !== JSON.stringify(currentValue)) {
        ;(out as Record<string, unknown>)[key] = currentValue
        hasChanges = true
      }
    }
  }
  return hasChanges ? out : null
}

// Per **D12** + Codex round-5 P1-1 fold: manual edits MUST write a manual
// FieldSource entry alongside the value so provenance reflects the override.
// `upstream_hash` is a 64-char hex string (UpstreamHash brand from
// packages/schema/src/branded.ts:6 — regex `^[a-f0-9]{64}$`); we use 32 bytes
// of crypto.getRandomValues (synchronous, available in both browser and node)
// so each manual edit gets a unique provenance hash. Deterministic per edit
// is unnecessary — uniqueness is what matters for provenance distinctness.
function manualFieldSource(_path: MetricPath, _value: unknown): FieldSource {
  const observed_at = new Date().toISOString()
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const upstream_hash = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
  return {
    source: 'manual',
    source_url: 'https://admin.local/manual',  // sentinel; satisfies /^https:/ regex
    observed_at: ISODateTimeString.parse(observed_at),
    fetched_at: ISODateTimeString.parse(observed_at),
    upstream_hash: UpstreamHash.parse(upstream_hash),
    attribution_block: { en: 'Manual entry by analyst.' },
  }
}

export function setFieldValue(slug: ResortSlug, path: MetricPath, value: unknown): void {
  const store = getOrCreateStore(slug)
  const side = sideFor(path)
  // Compute manual provenance synchronously so the field_sources entry and
  // the value land in the same draft revision.
  const fs = manualFieldSource(path, value)
  patchState(store, (s) => {
    // Patch the value (with sibling hydration per **D10**)
    const draftWithValue = patchDraftLeaf(s.draft, side, path, value, store.canonical)
    // Patch field_sources[path] with the new manual source per **D12**.
    // Per Codex round-6 P1-1 fold: NO canonical hydration — field_sources is
    // deep-merged server-side, so a sparse PUT entry is correct.
    const draftWithFs = patchFieldSource(draftWithValue, side, path, fs)
    return {
      rev: s.rev + 1,
      draft: draftWithFs,
      status: { ...s.status, [path]: 'dirty' },
    }
  })
  scheduleFlush(slug)
}

// Per Codex round-6 P1-1 fold: do NOT hydrate field_sources from canonical.
// Spec §4.3 specifies field_sources is **deep-merged** on the server (unlike
// the shallow-merged top-level Resort fields), so the PUT body should send
// ONLY the edited path's entry. Hydrating from canonical would copy every
// upstream provenance entry into the PUT body, which is both wasteful AND
// risks overwriting server-side updates that landed between our GET and PUT
// (e.g., an adapter run that refreshed upstream provenance for a different
// path).
function patchFieldSource(draft: DraftShape, side: Side, path: MetricPath, fs: FieldSource): DraftShape {
  if (side === 'resort') {
    const existing = draft.resort?.field_sources ?? {}
    return { ...draft, resort: { ...(draft.resort ?? {}), field_sources: { ...existing, [path]: fs } } }
  }
  const existing = draft.live_signal?.field_sources ?? {}
  return { ...draft, live_signal: { ...(draft.live_signal ?? {}), field_sources: { ...existing, [path]: fs } } }
}

export function setMode(slug: ResortSlug, path: MetricPath, mode: 'manual' | 'auto'): void {
  const store = getOrCreateStore(slug)
  patchState(store, (s) => ({
    rev: s.rev + 1,
    draft: { ...s.draft, editor_modes: { ...s.draft.editor_modes, [path]: mode } },
    status: { ...s.status, [path]: 'dirty' },
  }))
  scheduleFlush(slug)
}

// Per Codex round-20 P2-28 fold: when an in-progress edit becomes
// transient (cleared / invalid intermediate / out-of-range), remove the
// previously-written draft entry for `path` (both the value AND the
// field_sources manual provenance) so a pending debounced flush doesn't
// PUT the stale valid value. The next flush will see the cleared draft
// and either skip the PUT (empty diff) or send a smaller body.
//
// editor_modes[path] is INTENTIONALLY preserved — clearing the input
// value doesn't revert the analyst's MANUAL flag; they still intend
// MANUAL mode, just haven't typed a valid replacement yet.
export function clearFieldValue(slug: ResortSlug, path: MetricPath): void {
  const store = getOrCreateStore(slug)
  const side = sideFor(path)
  patchState(store, (s) => {
    const draft = clearDraftLeaf(s.draft, side, path)
    const status = { ...s.status }
    if (status[path] === 'dirty' || status[path] === 'saving') {
      delete status[path]  // back to "no local edit pending"
    }
    return { rev: s.rev + 1, draft, status }
  })
  scheduleFlush(slug)
}

// Companion to patchDraftLeaf — removes the path's value AND its
// field_sources entry from the draft. If clearing leaves the side empty,
// the side itself is dropped from the draft so buildBodyFromDraft's diff
// emits a sparse body.
function clearDraftLeaf(draft: DraftShape, side: Side, path: MetricPath): DraftShape {
  const sideRoot = side === 'resort' ? draft.resort : draft.live_signal
  if (sideRoot === undefined) { return draft }
  const next: Record<string, unknown> = { ...sideRoot }
  const segments = path.split('.')
  if (segments.length === 1) {
    delete next[segments[0]]
  } else {
    const [parent, leaf] = segments
    const parentObj = next[parent]
    if (parentObj !== undefined && typeof parentObj === 'object' && parentObj !== null) {
      const nextParent = { ...(parentObj as Record<string, unknown>) }
      delete nextParent[leaf]
      // Preserve other siblings; only drop the parent if it became empty.
      if (Object.keys(nextParent).length === 0) {
        delete next[parent]
      } else {
        next[parent] = nextParent
      }
    }
  }
  // Also drop the field_sources entry for this path.
  const fs = next.field_sources as Record<string, unknown> | undefined
  if (fs !== undefined && path in fs) {
    const nextFs = { ...fs }
    delete nextFs[path]
    if (Object.keys(nextFs).length === 0) {
      delete next.field_sources
    } else {
      next.field_sources = nextFs
    }
  }
  if (Object.keys(next).length === 0) {
    // The whole side is empty — drop it from draft so buildBodyFromDraft
    // doesn't emit `resort: {}` / `live_signal: {}` (which would be empty
    // objects in the diff comparison).
    if (side === 'resort') {
      const { resort: _resort, ...rest } = draft
      return rest
    }
    const { live_signal: _live, ...rest } = draft
    return rest
  }
  if (side === 'resort') { return { ...draft, resort: next as Partial<Resort> } }
  return { ...draft, live_signal: next as Partial<ResortLiveSignal> }
}

export function useWorkspaceState() {
  const route = useURLState()
  if (route.route !== 'editor') {
    throw new Error('useWorkspaceState called outside the editor route')
  }
  const slug = route.slug
  const store = getOrCreateStore(slug)

  // Per **D10**: sync the store's `canonical` reference on every render so
  // setFieldValue can hydrate nested-path parents from the freshest server
  // state. useResortDetail returns a stable cached promise per-slug; the
  // returned object reference only changes when invalidateResortDetail()
  // fires + the cache re-fetches. Reference-equality assignment here is
  // cheap; no useEffect needed.
  const detail = useResortDetail(slug)
  store.canonical = detail

  const subscribe = useCallback((cb: () => void): (() => void) => {
    store.subscribers.add(cb)
    return (): void => { store.subscribers.delete(cb) }
  }, [store])

  const getSnapshot = useCallback((): StoreState => store.state, [store])

  const state = useSyncExternalStore(subscribe, getSnapshot)

  return {
    draft: state.draft,
    status: state.status,
    setFieldValue: (path: MetricPath, value: unknown): void => setFieldValue(slug, path, value),
    setMode: (path: MetricPath, mode: 'manual' | 'auto'): void => setMode(slug, path, mode),
    // Per Codex round-20 P2-28 fold: consumers call this when an
    // in-progress edit becomes transient (cleared / invalid) to drop
    // any prior valid value from the draft so a pending debounce
    // doesn't PUT stale data.
    clearFieldValue: (path: MetricPath): void => clearFieldValue(slug, path),
  }
}

export function __resetForTests(): void {
  for (const store of storesBySlug.values()) {
    if (store.timer !== null) { clearTimeout(store.timer) }
  }
  storesBySlug.clear()
}
```

**Note:** the consumer-facing `setFieldValue` / `setMode` returned from `useWorkspaceState()` are slug-bound closures over the module-level functions. The module-level functions are also exported for direct programmatic use (e.g., from `useModeToggle` if it ever needs to short-circuit the React-rendered path) — but in practice all writes go through the hook's returned methods. `__resetForTests` clears all per-slug stores AND any pending debounce timers.

`buildBodyFromDraft` is filled in by the executor at coding time per spec §4.3's merge semantics.

- [ ] **Step 2:** Run. PASS on all branches including the singleton-shared-store test.

### Task 4 — Implement `useModeToggle`

**Files:** New `apps/admin/src/state/useModeToggle.ts`.

- [ ] **Step 1:** Implement as a thin wrapper over `useWorkspaceState`. **Per Codex round-1 P2-1 fold:** `validPaths` is derived INTERNALLY from `useResortDetail(slug).resort.field_sources` — NOT taken as an arg. **Per Codex round-3 P1-1 fold:** `modeFor` falls back to the canonical projection's `state === 'manual'` when no draft override exists — otherwise reload-after-save would render every field as AUTO even though the server persisted MANUAL (gate-blocking).

```ts
import type { MetricPath } from '@snowboard-trip-advisor/schema'

import { useURLState } from './useURLState'
import { useResortDetail } from './useResortDetail'
import { useWorkspaceState } from './useWorkspaceState'

export function useModeToggle() {
  const route = useURLState()
  if (route.route !== 'editor') {
    throw new Error('useModeToggle called outside the editor route')
  }
  // useResortDetail returns a cached (settled) response under Suspense —
  // FieldRow renders inside the editor's <Suspense> boundary so the read
  // never re-suspends here. The per-slug Map cache means this is the same
  // ResortDetailResponse object the parent <ResortEditorBody> already read.
  const detail = useResortDetail(route.slug)
  const validPaths = Object.keys(detail.resort.field_sources) as ReadonlyArray<MetricPath>

  const { draft, setMode } = useWorkspaceState()

  // Canonical-mode derivation per Codex round-3 P1-1 fold: when no draft
  // override exists, derive mode from the canonical projection. The
  // projectFieldStates contract guarantees field_states[path].state ===
  // 'manual' iff editor_modes[path] === 'manual' AND the value is present.
  // This is the load-bearing piece for the gate-required "reload preserves
  // MANUAL" round-trip — without it, any reopen of a previously-saved
  // editor renders every toggle as AUTO and the gate fails.
  // (Edge case: if the analyst saved MANUAL with a missing value, the
  // projection compresses to 'failed' and modeFor would return 'auto'
  // post-reload. Phase-1 acceptable: re-flip MANUAL after providing a
  // value. Documented in the Decisions log.)
  function canonicalModeFor(path: MetricPath): 'manual' | 'auto' {
    return detail.field_states[path].state === 'manual' ? 'manual' : 'auto'
  }

  function modeFor(path: MetricPath): 'manual' | 'auto' {
    const override = draft.editor_modes[path]
    return override ?? canonicalModeFor(path)
  }

  function toggleMode(path: MetricPath): void {
    if (!validPaths.includes(path)) { return /* silent no-op per §6.1 + F1 fold */ }
    const current = modeFor(path)  // uses canonical fallback so first toggle inverts the persisted state correctly
    setMode(path, current === 'manual' ? 'auto' : 'manual')
  }
  return { toggleMode, modeFor }
}
```

- [ ] **Step 2:** Run. PASS on all branches including the new "reload preserves MANUAL" test (Task 1).

### Task 5 — Extract `<ModeToggle>` (button-based, impl only)

**Files:** New `apps/admin/src/views/ResortEditor/ModeToggle.tsx`. **No separate test file** per **D11** (file-budget). ModeToggle behavior is covered through FieldRow.test.tsx mods (Task 6) and the integration test (Task 7).

- [ ] **Step 1: Implement.** Per Codex round-15 P2-19 fold: use the design-system `Button` (`variant="ghost"`) — raw `<button>` JSX is banned by `eslint.config.js` `no-restricted-syntax` for `apps/admin/src/**` (selector `JSXOpeningElement[name.name=/^(button|input|a|dialog|select|textarea)$/]` per `eslint.config.js:19,255`). The DS `Button` already exposes `aria-pressed` for toggle-style usage (`packages/design-system/src/components/Button.tsx:15-19,34`); semantics are "toggle button" rather than "switch" but functionally equivalent for the editor surface.

```tsx
import type { JSX } from 'react'
import type { MetricPath } from '@snowboard-trip-advisor/schema'

import { Button } from '@snowboard-trip-advisor/design-system'

import { labelForPath } from './FieldRow'  // re-export from FieldRow's co-location

interface ModeToggleProps {
  readonly path: MetricPath
  readonly mode: 'manual' | 'auto'
  readonly onToggle: () => void
}

export function ModeToggle({ path, mode, onToggle }: ModeToggleProps): JSX.Element {
  return (
    <Button
      variant="ghost"
      aria-label={`Mode for ${labelForPath(path)}`}
      aria-pressed={mode === 'manual'}
      onClick={onToggle}
    >
      {mode === 'manual' ? 'MANUAL' : 'AUTO'}
    </Button>
  )
}
```

- [ ] **Step 2:** Verify the file typechecks via `npm run --workspace=apps/admin typecheck`. (Behavior tests fire in Task 6.)

### Task 6 — Modify `FieldRow.{tsx,test.tsx}` for MANUAL input + ModeToggle wiring + responsive gate

**Files:** Modify `apps/admin/src/views/ResortEditor/FieldRow.tsx` AND `apps/admin/src/views/ResortEditor/FieldRow.test.tsx`.

- [ ] **Step 1: Add a `matchMedia` stub** at the top of `FieldRow.test.tsx` (per Codex round-6 P2-8 fold — jsdom does NOT implement `window.matchMedia`; without the stub, `useIsAboveMd()` throws `TypeError: window.matchMedia is not a function`):

```ts
function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches, media: query, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })))
}
afterEach(() => { vi.unstubAllGlobals() })
```

- [ ] **Step 2: Add failing tests** to `FieldRow.test.tsx`. Three new branches (each test calls `stubMatchMedia(true)` or `stubMatchMedia(false)` per its viewport intent):
  - **Above md** (`stubMatchMedia(true)`): MANUAL on `slopes_km` renders the DS `<Input type="text">` (per Codex round-15 P2-20: raw `<input>` JSX is banned in apps/admin) AND a `<ModeToggle>` (DS `<Button variant="ghost" aria-pressed>` per Codex round-15 P2-19: raw `<button>` JSX is banned). Use `getByRole('textbox', { name: labelForPath('slopes_km') })` and `getByRole('button', { name: /Mode for/ })` for the queries. Clicking the button calls toggleMode. Typing in the textbox calls setFieldValue (when the parsed value is valid).
  - **Above md, money/live path**: MANUAL on `lift_pass_day` renders the explanatory `<span>` (NOT an input).
  - **Below md** (`stubMatchMedia(false)`): MANUAL on `slopes_km` renders NEITHER the DS Input NOR the interactive DS Button ModeToggle — instead, the v4.4b inline render-only `<span role="switch" aria-disabled="true">` ModeToggle is shown. The Input is absent from the DOM (assert via `queryByRole('textbox')` returning null). (Per **D11** + AGENTS.md "Admin App Rules".)
  - **Tab order assertion**: above md, the ModeToggle button has the default tab order (no `tabindex`). Below md, the render-only span has no `tabindex` (spans are not focusable by default), so the editor element is absent from the tab order.
  - **Empty/whitespace-only input does NOT persist** per Codex round-11 P2-15 + round-17 P2-23 + round-17 P2-24 folds: above-md MANUAL on `slopes_km` with canonical (NOT draft) holding 150 from `field_states`. Simulate user clearing the input (`fireEvent.change(input, { target: { value: '' } })`); fast-forward debounce; assert (a) `apiClient.upsertResort` was NOT called, (b) the input element displays the empty string (local state updated), (c) **`draft.resort?.slopes_km` is still `undefined`** (the draft is sparse — no setFieldValue fired, so no entry was ever written). The canonical state is unchanged at 150. Repeat with whitespace-only input (`'   '`) — same assertions (Codex round-17 P2-23: trim BEFORE checking empty, since `Number(' ') === 0`). Then simulate typing `'7'`; fast-forward; assert PUT fires with `slopes_km: 7`. Without these guards, `Number('')` or `Number(' ')` would coerce to 0 and PUT would persist 0 with manual provenance — workspace data corruption.
  - **Invalid intermediate input does NOT persist** per same fold: simulate `value: '-'` (negative-sign-in-progress), `'1e'` (scientific notation in progress), `'.'` (decimal-only) — `Number(...)` is NaN for each → no PUT fires; local string updates so the user sees what they typed.
  - **Fractional `lift_count` does NOT persist** per Codex round-19 P2-26 fold: above-md MANUAL on `lift_count`. Type `'7.5'` → `Number('7.5') === 7.5` (NOT NaN) — but `Resort.lift_count` is `z.number().int()` (`packages/schema/src/resort.ts:14`). Without the integer guard, the PUT would fire and the server would reject as `400 invalid-resort`, leaving the field in `save-failed` despite valid local intent. Assertion: `apiClient.upsertResort` is NOT called for `'7.5'`; local string updates to `'7.5'`. Then type `'7'` → PUT fires with `lift_count: 7`. (`slopes_km`, `altitude_m.*`, `skiable_terrain_ha` are NOT `.int()` — fractional values pass through. Test only `lift_count` for the integer guard.)
  - **Edit-then-clear cancels the pending PUT** per Codex round-20 P2-28 fold: above-md MANUAL on `lift_count`. Type `'7'` (valid) → setFieldValue fires; draft.resort.lift_count = 7 + draft.resort.field_sources.lift_count = manual; debounce timer set. BEFORE 500ms elapses, type `''` (clear) — `clearFieldValue('lift_count')` fires; draft.resort.lift_count is removed; draft.resort.field_sources.lift_count is removed; status reverts to no-edit-pending. Fast-forward debounce. **Assert: `apiClient.upsertResort` is NOT called** (the previously-pending value 7 was cleared; the next flush sees a sparse draft with no `lift_count`). Same flow for invalid intermediates (`'7'` → `'7e'` → cleared). Without `clearFieldValue`, the stale pending value would PUT despite the input being currently empty/invalid.
  - **Edit-then-clear preserves editor_modes** per Codex round-20 P2-28 fold: same flow as above, but assert that `draft.editor_modes['lift_count']` (or whatever was set via prior toggleMode) is **NOT** removed by `clearFieldValue`. Only the value + manual field_sources entry are dropped; the analyst's MANUAL flag persists.
- [ ] **Step 4:** The pre-existing 4.4b inline-span tests must each call `stubMatchMedia(false)` (or default to false in their `beforeEach`) so they exercise the below-md branch unambiguously after the responsive gate ships.
- [ ] **Step 5:** Run failing.
- [ ] **Step 6: Implement.** Replace the FieldRow body:

```tsx
import { useRef, useState, useSyncExternalStore } from 'react'

import { Input, tokens } from '@snowboard-trip-advisor/design-system'

// 7 durable paths that can be MANUAL-edited via numeric inputs (per F1 fold).
const MANUAL_EDITABLE_PATHS: ReadonlySet<MetricPath> = new Set([
  'altitude_m.min', 'altitude_m.max', 'slopes_km', 'lift_count',
  'skiable_terrain_ha', 'season.start_month', 'season.end_month',
])

// Per Codex round-7 P2-9 fold: breakpoint is 900 (`tokens.breakpoint.md`),
// NOT 768. Drive the query from the design-system token so the hook stays
// aligned if the token is ever updated. `tokens` re-exports the breakpoint
// object as `Object.freeze({ xs: 360, sm: 600, md: 900, lg: 1280 })` per
// `packages/design-system/src/tokens.ts:21`. (The `tokens` import already
// happens at the top of this file alongside `Input`.)
const MD_QUERY = `(min-width: ${tokens.breakpoint.md}px)`  // = '(min-width: 900px)'

// Subscribes to viewport changes. matchMedia is reactive — `addEventListener('change', cb)` fires
// when the viewport crosses the threshold. useSyncExternalStore handles the React side.
function useIsAboveMd(): boolean {
  const subscribe = (cb: () => void): (() => void) => {
    const mql = window.matchMedia(MD_QUERY)
    mql.addEventListener('change', cb)
    return (): void => mql.removeEventListener('change', cb)
  }
  const getSnapshot = (): boolean => window.matchMedia(MD_QUERY).matches
  // Server snapshot — for SSR. Phase 1 is loopback dev-only; jsdom is "client".
  const getServerSnapshot = (): boolean => true
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

function FieldRow({ path, state }: FieldRowProps): JSX.Element {
  const { draft, setFieldValue, clearFieldValue } = useWorkspaceState()
  const { toggleMode, modeFor } = useModeToggle()
  const isAboveMd = useIsAboveMd()

  // Resolve the displayed/edited value. For nested paths the draft.resort
  // shape mirrors Resort, so we walk segments to read the leaf.
  const persistedValue = readDraftLeaf(draft.resort, path) ?? valueFor(state)
  const isManual = modeFor(path) === 'manual'
  const isMonth = path === 'season.start_month' || path === 'season.end_month'

  // Per Codex round-11 P2-15 fold: maintain a LOCAL string state for the
  // numeric input so empty/transient/invalid input strings don't get
  // coerced to 0 and persisted with manual provenance. Without this, an
  // analyst clearing the field before retyping would race the 500ms
  // autosave: `Number('') === 0` would write a valid-looking 0 to the
  // workspace before the new value arrives.
  //
  // The local string syncs from `persistedValue` on every render where
  // the persisted value changes (post-PUT canonical update, navigation,
  // remount). During typing, the local string is the source of truth for
  // the input element; the persistedValue is updated only when the input
  // parses cleanly.
  const [localString, setLocalString] = useState((): string => String(persistedValue ?? ''))
  const lastPersistedRef = useRef<unknown>(persistedValue)
  if (lastPersistedRef.current !== persistedValue) {
    // Persisted value changed externally (e.g., post-PUT canonical or
    // navigation reload) — sync the local input string so the user sees
    // the fresh canonical state. This must run during render to be
    // useState-safe; using useEffect would cause one render of stale
    // local string before the sync.
    lastPersistedRef.current = persistedValue
    setLocalString(String(persistedValue ?? ''))
  }

  // ModeToggle: above md → interactive <button>; below md → render-only <span>
  // per **D11** + AGENTS.md "Admin App Rules".
  const modeToggleEl = isAboveMd
    ? <ModeToggle path={path} mode={modeFor(path)} onToggle={(): void => toggleMode(path)} />
    : (
      <span role="switch" aria-checked={modeFor(path) === 'manual'} aria-disabled="true" aria-label={`Mode for ${labelForPath(path)}`}>
        {modeFor(path) === 'manual' ? 'MANUAL' : 'AUTO'}
      </span>
    )

  // Per Codex round-11 P2-15 + round-15 P2-20 folds: empty / NaN / out-of-
  // range strings are local-only transient state — do NOT call setFieldValue
  // (which would persist 0 / NaN / invalid month with manual provenance under
  // the 500ms debounce). The local string still updates so the Input element
  // reflects what the user typed; only valid + in-range numbers propagate to
  // the persisted draft. The DS Input is `type="text"` (Phase 1 — DS doesn't
  // ship `type="number"`); JS-side validation enforces both numeric-ness AND
  // the 1–12 range for month paths (which type="number" min/max would have
  // covered natively if available).
  // Per Codex round-20 P2-28 fold: each transient/invalid branch calls
  // clearFieldValue so a previously-typed valid value doesn't get PUT by a
  // pending debounce after the user clears or types an invalid intermediate.
  // The clear preserves editor_modes[path] (the user's MANUAL flag); only
  // the value + manual field_sources entry are dropped.
  const onLocalChange = (raw: string): void => {
    setLocalString(raw)
    // Per Codex round-17 P2-23 fold: whitespace-only strings ('   ') would
    // pass through Number() as 0 (Number(' ') === 0). Trim before checking
    // empty so spaces don't trigger spurious 0-persists.
    if (raw.trim() === '') { clearFieldValue(path); return }
    const parsed = Number(raw)
    if (Number.isNaN(parsed)) { clearFieldValue(path); return }
    if (isMonth && (parsed < 1 || parsed > 12 || !Number.isInteger(parsed))) {
      clearFieldValue(path); return
    }
    // Per Codex round-19 P2-26 fold: lift_count is z.number().int() per
    // packages/schema/src/resort.ts:14. Fractional values would be sent and
    // rejected by the server. (slopes_km / altitude_m.* / skiable_terrain_ha
    // are NOT .int() — fractional is OK there.)
    if (path === 'lift_count' && !Number.isInteger(parsed)) {
      clearFieldValue(path); return
    }
    setFieldValue(path, parsed)
  }

  // Input: above md AND MANUAL AND a durable numeric path → DS <Input type="text">
  // (per Codex round-15 P2-20: raw <input> JSX banned in apps/admin/src/**);
  // above md AND MANUAL AND non-durable → render explanatory copy;
  // below md → absent from DOM (per **D11**).
  const inputElement = (!isAboveMd || !isManual) ? null
    : MANUAL_EDITABLE_PATHS.has(path)
      ? (
        <Input
          label={labelForPath(path)}
          type="text"
          value={localString}
          onChange={onLocalChange}
        />
      )
      : <span>MANUAL editing for {path} lands in PR 4.6a.</span>

  return (
    <div role="group" aria-label={labelForPath(path)}>
      <StatusPill variant={pillVariantFor(state)} />
      <span>{formatMetricValue(path, isManual ? persistedValue : valueFor(state))}</span>
      <span>{sourceFor(state)}</span>
      {modeToggleEl}
      {inputElement}
    </div>
  )
}

// Walk a dotted path into draft.resort to read the leaf. Returns undefined
// when the path's nested parent hasn't been hydrated yet.
function readDraftLeaf(draftResort: Partial<Resort> | undefined, path: MetricPath): unknown {
  if (draftResort === undefined) { return undefined }
  const segments = path.split('.')
  let cursor: unknown = draftResort
  for (const seg of segments) {
    if (cursor === null || typeof cursor !== 'object') { return undefined }
    cursor = (cursor as Record<string, unknown>)[seg]
    if (cursor === undefined) { return undefined }
  }
  return cursor
}
```

(Executor fills in test-fixture imports + `mockMatchMedia` helper for the below-md test branch. The `useIsAboveMd` hook lives co-located in FieldRow.tsx for now; if a future PR needs it elsewhere, it extracts to `apps/admin/src/lib/`.)

- [ ] **Step 7:** Run all FieldRow tests. PASS on all viewport branches.

### Task 7 — Bridge integration test

**Files:** New `tests/integration/apps/admin/resort-editor-write.test.tsx`.

- [ ] **Step 1: Setup.** `beforeEach` creates per-test workspace tmpdir (`mkdtemp`); seeds with the `kotelnica-bialczanska.json` fixture (`fs.copyFile` from `tests/fixtures/admin-workspace/`); calls `server.use(...bridgeHandlers(tmpdir))`. **Add a `matchMedia` stub** (per Codex round-6 P2-8 fold — jsdom does NOT implement `window.matchMedia`; without the stub, `<App />` mounting → `<FieldRow>` → `useIsAboveMd()` throws). Stub `matchMedia` via `vi.stubGlobal` in a `beforeEach` (default `matches: true` so the test exercises the above-md interactive path; below-md flows are covered by FieldRow.test.tsx). `afterEach` removes tmpdir AND calls `useResortDetail.__resetForTests()` + `useWorkspaceState.__resetForTests()` AND `vi.unstubAllGlobals()`.
- [ ] **Step 2: Write test (top-level numeric path: `slopes_km`):**
  - Mount `<App />` with `?route=editor&slug=kotelnica-bialczanska`.
  - Wait for editor render (await `findByRole('tablist')` or similar).
  - Click `<ModeToggle>` for `slopes_km` → MANUAL.
  - Type `150` into the MANUAL DS Input (query: `getByRole('textbox', { name: labelForPath('slopes_km') })` per Codex round-19 P3-27 fold — NOT `<input type="number">`/`spinbutton`, since DS Input renders `type="text"` per Codex round-15 P2-20).
  - Fast-forward debounce (500ms via `vi.advanceTimersByTime` or `vi.useFakeTimers`).
  - Wait for PUT response.
  - **Filesystem assertion**: `await readFile(join(tmpdir, 'data/admin-workspace/kotelnica-bialczanska.json'), 'utf-8')` → parses to `WorkspaceFile`; `editor_modes.slopes_km === 'manual'`; `resort.slopes_km === 150`; **`resort.field_sources.slopes_km.source === 'manual'` per **D12**** (provenance reflects the override, NOT the prior upstream `'opensnow'`/etc.); other `field_sources` entries unchanged.
  - **Reload simulation** (per fold §5): unmount; **call `useResortDetail.__resetForTests()` AND `useWorkspaceState.__resetForTests()`** to clear module-level caches; spy on `apiClient.getResort` to verify the next mount triggers a fresh fetch (cache miss); re-mount `<App />`; assert editor renders with `slopes_km` MANUAL + value `150` (read from the server's freshly-loaded canonical state, not from a stale cached promise).

- [ ] **Step 3: Write test (nested-path: `season.start_month` — sibling preservation per D10 + Codex round-4 P2-6 fold):**
  - Fresh per-test setup (new tmpdir; fixture restored to canonical: `season: { start_month: 12, end_month: 4 }`).
  - Mount `<App />` with `?route=editor&slug=kotelnica-bialczanska`.
  - Click `<ModeToggle>` for `season.start_month` → MANUAL.
  - Type `11` into the MANUAL input.
  - Fast-forward debounce; wait for PUT response.
  - **Filesystem assertion (sibling preserved)**: `await readFile(...)` → parses; assert `resort.season === { start_month: 11, end_month: 4 }` — `end_month` survived the shallow-merge because the draft hydrated the parent on first edit. Without the **D10** hydration, `resort.season` would be `{ start_month: 11 }` and the schema parse would fail (or silently drop end_month).
  - **`editor_modes['season.start_month'] === 'manual'`** persisted (per Codex round-13 P2-17 fold: `editor_modes` is a sparse `Partial<Record<MetricPath, 'manual'|'auto'>>` keyed by the LITERAL DOTTED STRING `'season.start_month'` — NOT a nested `{ season: { start_month: ... } }` structure. The latter would fail `WorkspaceFile.parse()` because `season` is not a `MetricPath` enum value).
- [ ] **Step 4:** Run. PASS on both round-trip variants.

### Task 8 — Coverage + qa + PR + Codex cycle

- [ ] **Step 1:** `npm run qa`. 100% × 4. Bridge test runs via `npm run test:integration`.
- [ ] **Step 2:** Open PR; `@codex review`; fold; iterate.
- [ ] **Step 3: Local-test plan (gate-closing):**
  - `npm run dev:admin`.
  - Browser: `http://127.0.0.1:5174/?route=editor&slug=kotelnica-bialczanska`.
  - Click ModeToggle for `slopes_km` → MANUAL.
  - Edit value to `150`. Wait > 500ms.
  - Reload (Cmd+R / Ctrl+R).
  - Confirm editor renders with `slopes_km` MANUAL showing `150`.
  - Confirm `data/admin-workspace/kotelnica-bialczanska.json` on disk has `editor_modes.slopes_km === 'manual'`.
  - Repeat for `spindleruv-mlyn`.
  - Submit malformed PUTs via `curl` to verify both reject paths (per Codex round-10 P2-14 fold):
    - **Request-layer reject** (non-MetricPath key fails Zod parse): `curl ... -d '{"editor_modes":{"ghost":"manual"}}'` → `400 invalid-request`.
    - **Handler-layer reject** (cross-key refinement fires post-merge): `curl ... -d '{"editor_modes":{"snow_depth_cm":"manual"}}'` against `kotelnica-bialczanska` (whose `resort.field_sources` does NOT include `snow_depth_cm`) → `400 invalid-resort` with refinement message in `details`.
- [ ] **Step 4:** Surface to maintainer.

---

## Tier 3 → Tier 4 gate closeout (after PR 4.4d merges)

Per spec §7.4, on `main`:

1. **Editor opens for both seed slugs** — verified by gate-closing local-test plan.
2. **MANUAL edit round-trips through PUT; reload preserves state** — verified by gate-closing plan.
3. **Bridge integration test green** — verified by `npm run test:integration`.
4. **`editor_modes` cross-key invariant rejects malformed PUTs** — verified by `apps/admin/server/__tests__/resortUpsert.test.ts` (handler-layer reject with a valid MetricPath outside `resort.field_sources`, e.g., `snow_depth_cm` against `kotelnica`'s durable-only field_sources, per Codex round-10 P2-14 fold) + manual `curl`.

**Spec deviations to flag in handoff:**

- Tier 3 split from 4 PRs to 5 (4.4a → 4.4a-1 + 4.4a-2) to keep schema and server work atomic.
- PR 4.4b strictly serial after PR 4.4a-2 (drops the spec §7.4 4.4a‖4.4b parallelism — the split's static `useResortDetail` import dependency forces serial).
- PR 4.4b collapses spec §7.11's separate `DurablePanel.tsx` + `LivePanel.tsx` into parametrized `<MetricPanel kind=…>`.
- PR 4.4b inlines a render-only `<span role="switch">` ModeToggle inside FieldRow; PR 4.4d replaces it with a button-based `<ModeToggle>` (DOM-shape change; 4.4b tests adjusted in 4.4d).
- PR 4.4b omits `urlState.ts` MODIFY (the editor route already shipped in PR 4.3).
- PR 4.4d derives `slug` inside `useWorkspaceState`/`useModeToggle` via `useURLState` (avoids prop-drilling through `MetricPanel` and `ResortEditor`).
- PR 4.4a-1 ships seed fixtures originally declared as PR 4.1a §10.8 deliverable but missed.
- PR 4.4c modifies `dispatch.ts` to pass `.details` from thrown errors (spec §4.10's envelope shape required this).
- `EditorErrorBoundary` co-located inside `ResortEditor.tsx` instead of a separate file (file budget).
- HMR reset for `useResortDetail` ships in PR 4.4a-2 with the `apps/admin/vite.config.ts` coverage glob update.
- `useResortList.__resetForTests` not wired into `apps/admin/src/test-setup.ts`; pre-existing technical debt; remains out-of-scope for Tier 3 per **D6**.

After all four gate criteria pass:

- Run the doc-prune playbook ([`docs/superpowers/skills/pruning-done-work-references.md`](../../skills/pruning-done-work-references.md)). Trim done-work sections from spec; delete this plan; write `docs/superpowers/handoffs/2026-05-XX-post-epic-4-tier-3.md` documenting the merged PRs (lineage), the spec deviations above, and Tier 4 entry conditions.

---

## Risks pinned for the executor

1. **Schema circular-dep on A1.** `projectFieldStates`'s `modes` parameter MUST be typed as `Partial<Record<MetricPath, 'manual' | 'auto'>>` directly, NOT `WorkspaceFile['editor_modes']`. Importing `WorkspaceFile` into `resortView.ts` creates a cycle.
2. **`FRESHNESS_TTL_DAYS` import.** Lives in `packages/schema/src/loadResortDatasetFromObject.ts:7`. NOT a `freshness.ts`. Use `import { FRESHNESS_TTL_DAYS } from './loadResortDatasetFromObject'`.
3. **HMR coverage exclusion.** `apps/admin/vite.config.ts`'s coverage `exclude` does NOT currently include `'src/state/*.hmr.ts'`. PR 4.4a-2 MUST add this. Mirror `apps/public/vite.config.ts:143`.
4. **Concurrent-PUT race in `useWorkspaceState`.** Without the in-flight token + queue, two debounced flushes fire concurrent PUTs against the merge step → silent data loss. **E1+** is load-bearing.
5. **Editor boundary cache-clear inside `startTransition`.** Failing to wrap `invalidateResortDetail(slug)` inside `startTransition` re-introduces the ADR-0010 infinite re-render loop.
6. **`atomicWriteText` export — verify ESLint allow.** `eslint.config.js`'s `no-restricted-imports` block bans `apps/public/**` from importing `atomicWriteText`. Verify before PR 4.4c that the rule does NOT also bar `apps/admin/**` (admin-server runs on Node and is allowed).
7. **PR 4.4a-2 file budget tight.** 8 files at limit. If implementation discovers a needed extra file, DO NOT bundle — split.
8. **PR 4.4d bridge test reload simulation requires explicit cache reset.** Without `useResortDetail.__resetForTests()` between unmount and remount, the second render reads the cached pre-PUT promise (the cached promise survives unmount because the cache is module-scoped). The test would pass spuriously without proving the canonical state is loaded from disk.
9. **Seed fixtures are PR 4.4a-1's responsibility.** Don't assume `tests/fixtures/admin-workspace/` exists when starting PR 4.4a-2 work — it doesn't on `main`.
10. **`labelForPath` definition.** Co-located in `FieldRow.tsx` and exported (used by `ModeToggle.tsx` in 4.4d). Define it as an exhaustive switch on `MetricPath` returning a human-readable label (e.g., `'altitude_m.min'` → `'Altitude (min, m)'`).

---

## Per-PR memory checklist

For every PR follow these saved memories:

- **Atomic PRs** — one concern; ≤300 LOC / ≤5 commits / ≤8 files; split when at limit.
- **Codex review per PR** — `@codex review`; fold reply with fix SHA; resolve thread via GraphQL.
- **Local test per PR** — generate AND execute a tailored local-test plan before surfacing.
- **Section review workflow** — for any user-facing design call, dispatch a domain-specialist subagent reviewer BEFORE asking the user for approval. (Applied during Tier 3 brainstorm + this plan; reapply per PR if executor faces a load-bearing call.)
- **TDD in plans + specs** — file lists order tests before implementation. (Verified for every PR above.)
- **Edit tool in worktrees** — when in a worktree, prefix paths with the worktree dir or you'll silently edit the main checkout. Verify with `git status` IN the worktree.

---

## Reviewer-fold log (what changed from the v1 plan and why)

This plan was reviewed by an independent subagent. The fold:

- **§2 file-budget arithmetic.** v1 PR 4.4a-1 missed the seed-fixture deliverable; PR 4.4a-2 undercounted by 2 (dispatch wiring); PR 4.4b missed the App.test modify; PR 4.4d undercounted by 1 (ResortEditor wiring). All corrected. Some constraint-driven choices: PR 4.4b drops `MetricPanel.test.tsx` (coverage via mounting tests); PR 4.4d uses `useURLState` slug-derivation to avoid `ResortEditor.tsx` modify.
- **§4 parallelism wrong.** v1 claimed PR 4.4b could start before 4.4a-2 merges. Reviewer caught: 4.4b imports `useResortDetail` from 4.4a-2; static import would fail. **Fold:** PR 4.4b is strictly serial after 4.4a-2.
- **§5 bridge-test reload simulation.** v1 unmounted + remounted but didn't clear the module-scoped cache; second render would read the pre-PUT cached promise (test passes spuriously). **Fold:** explicit `__resetForTests()` between unmount and remount; spy on `apiClient.getResort` to verify cache miss.
- **§5 cache-isolation test brittle.** v1 asserted `cached.get(slug)` directly. **Fold:** rewrite as observable spy on `apiClient.getResort` (cleaner test boundary).
- **§5 `If-Match` defensive test missing.** **Fold:** added to PR 4.4c's resortUpsert.test.ts.
- **§5 bridge harness invocation gap.** v1 PR 4.4a-2 acceptance gate claimed bridge verification but no task delivered it. **Fold:** moved to PR 4.4c's dispatch.test.ts task (one bridge-verification step inside the dispatch tests).
- **§3 TDD ordering for PR 4.4c.** v1 placed schema export as Task 1 before workspace tests. **Fold:** Task 1 is now the failing schema-export test; Task 2 implements the export. Workspace + resortUpsert tests follow.
- **§6 code-completeness.** v1 left `resolveValue`, `EditorErrorBoundary`, merge helpers, and `useWorkspaceState` helper bodies as comments. **Fold:** filled in `resolveValue` switch table and `EditorErrorBoundary` class body; left `mergeResort`/`mergeLive`/`buildBodyFromDraft` to executor (subagent-driven-development) with the tests as the correctness contract.
- **§8 seed fixtures missing.** v1 assumed they existed on `main`. **Fold:** authored as part of PR 4.4a-1 (Task 1).
- **§8 JSON serialization format.** v1 didn't pin. **Fold:** PR 4.4c Task 3 pins 2-space + trailing newline via a fixture round-trip test in `workspace.test.ts`.
- **§8 dispatch.ts modification.** v1 omitted; reviewer flagged that `editor_modes` cross-key reject test requires `details` pass-through. **Fold:** PR 4.4c Tasks 5-6 modify `dispatch.ts`.
- **§8 test-setup wiring.** v1 added test-setup.ts modify to PR 4.4a-2. **Fold:** dropped (file-budget pressure + matches existing `useResortList` pattern of local `afterEach`); pre-existing `useResortList.__resetForTests` debt explicitly left out-of-scope.
- **§8 freshness.ts non-existent.** v1 imported from `./freshness`. **Fold:** corrected to `./loadResortDatasetFromObject` everywhere.

### Codex round 1 (PR #90 review by `chatgpt-codex-connector`, 2026-05-08)

Two P2 findings on the v2 plan; both real correctness issues; both folded:

- **P2-1 — F1 scope wrong (live paths in MANUAL would 400 as `invalid-resort`).** v2 declared MANUAL editing for "10 numeric metric paths" but the `WorkspaceFile` cross-key invariant (spec §10.2) restricts `editor_modes` keys to `Object.keys(resort.field_sources)` — durable paths only (7). MANUAL on a live path (`snow_depth_cm`, `lifts_open.{count,total}`, `lift_pass_day`, `lodging_sample.median_eur`) would PUT-reject. **Fold:** F1 reduced to **7 durable numeric paths**. The 5 live paths render explanatory copy. `useModeToggle` now derives `validPaths` INTERNALLY from `useResortDetail(slug).resort.field_sources` (was: passed as arg). PR 4.4d Task 1 adds a live-path silent-no-op test (`toggleMode('snow_depth_cm')`) to pin the durable-only constraint at the test layer.
- **P2-2 — E1+ keystroke-clobber race.** v2's in-flight token check (`inFlightTokenRef.current === token`) doesn't catch the case where the user edits during the round-trip — the token stays the same throughout, so a newer dirty draft gets clobbered (or marked saved) when the response arrives. **Fold:** added a draft-revision counter (`revRef`) incremented on every `setDraft`. Flush snapshots `revRef.current` as `inFlightRev`; on response, only mark `saved` when BOTH `inFlightTokenRef.current === token` AND `revRef.current === inFlightRev`. PR 4.4d Task 2 adds an explicit "user edits during round-trip" test case that fails without the counter.

### Codex round 2 (PR #90 review by `chatgpt-codex-connector`, 2026-05-08)

Three findings on the v3 plan (one P1, two P2); all real correctness issues; all folded:

- **P1-1 — `useWorkspaceState` per-row state breaks E1+'s singleton guarantee.** v3 used `useState`/`useRef` inside the hook; each `useWorkspaceState()` call site (one per FieldRow × 12 rows) created an INDEPENDENT state instance. The whole concurrent-PUT race that E1+ closes reappears across rows: editing two fields in the same editor would fire two concurrent PUTs. **Fold:** rewrote the impl as a **module-scoped per-slug singleton store** with `useSyncExternalStore` subscription. `storesBySlug: Map<ResortSlug, SlugStore>`; all consumers in the same editor subscribe to the SAME store, sharing `draft`, `inFlightToken`, `queued`, `rev`. Mirrors `useResortDetail`'s per-slug cache pattern. PR 4.4d Task 2 adds two new tests: "shared store across consumers" (two `useWorkspaceState()` calls + one PUT carrying both edits) and "per-slug isolation" (slug switch produces fresh draft). Decisions log E1+ + Reviewer-fold log carry the rationale.
- **P2-3 — `projectFieldStates` applies live-data TTL to durable paths.** v3 applied the `ageDays > FRESHNESS_TTL_DAYS.{default,max_stale}` checks to ALL `METRIC_FIELDS`, including durable resort attributes. Canonical semantics in `loadResortDatasetFromObject.ts:83-99` + existing `health.ts` / `listResorts.ts` staleness gating treat durable fields as `fresh` unconditionally — only populated live paths can become stale/never_fetched by clock age. v3 would render an old `slopes_km.observed_at` as stale/failed in the editor while the dashboard projection still reports it fresh. **Fold:** added `DURABLE_PATHS` constant and `if (DURABLE_PATHS.has(path)) return { state: 'live', ... }` guard in `projectOne`. Decisions log A1.6 captures the rationale. PR 4.4a-1 Task 4 adds a regression-pinning test ("durable path with old `observed_at` is still `live`").
- **P2-4 — `resortView.ts` excluded from coverage.** `packages/schema/vite.config.ts` excludes `'src/resortView.ts'` with a v1 "types-only" rationale (correct then; ships only the type + `toFieldValue`). v3 added executable `projectFieldStates` to the same file but did NOT update the exclusion — coverage would silently skip the new code, untested branches passing the 100% gate. **Fold:** PR 4.4a-1 file list adds `packages/schema/vite.config.ts` MODIFY (5 files total) to remove the exclusion. PR 4.4a-1 Task 4.5 adds tests covering the existing `toFieldValue` (4 states) so removing the exclusion doesn't surface a coverage gap.

### Codex round 3 (PR #90 review by `chatgpt-codex-connector`, 2026-05-08)

Two findings on the v4 plan (one P1, one P2); both real correctness issues; both folded:

- **P1-1 — `useModeToggle.modeFor` doesn't hydrate from canonical state on reload (gate-blocking).** v4's `modeFor(path) = draft.editor_modes[path] ?? 'auto'` assumed a fresh draft is the source of truth. But after the mandatory reload-after-save flow (Tier 3 → 4 gate criterion 2), the singleton store's draft is empty and the only mode signal is the server-persisted `WorkspaceFile.editor_modes` reflected in `useResortDetail(slug).field_states[path].state === 'manual'`. v4 would render every toggle as AUTO post-reload — the gate fails. **Fold:** `modeFor` now falls back to `detail.field_states[path].state === 'manual' ? 'manual' : 'auto'` when no draft override exists. `toggleMode` reads through the same `modeFor` so the first toggle after reload inverts the persisted state correctly. PR 4.4d Task 1 adds two new tests: "canonical-mode reload preservation" (server projection 'manual' + empty draft → modeFor returns 'manual') and "draft override wins over canonical". Edge case (analyst saved MANUAL with missing value → projection compresses to 'failed' → modeFor returns 'auto' post-reload) is documented as Phase-1 acceptable; analyst re-flips MANUAL after providing a value.
- **P2-5 — Seed fixture `Money.currency` constraint violated.** v4's PR 4.4a-1 Task 1 wrote `lift_pass_day: { amount, currency: 'PLN' }` for the PL fixture and `currency: 'CZK'` for the CZ fixture. But `packages/schema/src/primitives.ts:5-9`'s `Money` schema has `currency: z.literal('EUR')` — non-EUR amounts MUST be encoded as `Money` with `currency: 'EUR'` (EUR-converted) plus `field_sources.<path>.fx: { source: 'ecb-reference-rate', native_amount, native_currency, rate, observed_at }` per ADR-0003. v4 fixtures would fail `WorkspaceFile.parse()` and block the entire Tier 3 chain. **Fold:** PR 4.4a-1 Task 1 corrected — `lift_pass_day.currency: 'EUR'` + `field_sources.lift_pass_day.fx.native_currency: 'PLN'` (or `'CZK'`) for the FX provenance.

### Codex round 4 (PR #90 review by `chatgpt-codex-connector`, 2026-05-08)

Two P2 findings on the v5 plan; both real correctness issues; both folded:

- **P2-6 — Nested-path drafts drop sibling values on PUT.** v5's `DraftShape.field_values: Partial<Record<MetricPath, unknown>>` was flat-keyed by metric path. The server's `resortUpsert` does **shallow merge for top-level Resort fields** (per spec §4.3) — so PUT body `{ resort: { altitude_m: { min: 100 } } }` shallow-replaces `Resort.altitude_m` whole, dropping the canonical `max`. v5 had no mechanism to reconstruct sibling values. **Fold:** decisions log **D10** added: `DraftShape.resort` mirrors `Partial<Resort>` directly. `setFieldValue` decomposes dotted paths into segments; on first edit of a nested parent, `patchDraftLeaf` hydrates the parent from `store.canonical` (synced on every render via `useWorkspaceState`'s `useResortDetail` access). `buildBodyFromDraft` becomes trivial — just emits the non-empty `draft.resort` / `draft.live_signal` / `draft.editor_modes`. PR 4.4d Task 2 adds a "nested-path edit preserves sibling" test (`altitude_m.min` edit preserves `altitude_m.max`); PR 4.4d Task 7 bridge integration test adds a `season.start_month` round-trip with explicit on-disk sibling assertion.
- **P2-7 — Edit controls violate AGENTS.md "Admin App Rules" below `md`.** AGENTS.md mandates "Admin UI is read-only below the `md` breakpoint; edit controls are removed from the tab order, not merely disabled." Spec §7.16 deferred this to PR 4.6a (polish), but the rule is baseline-mandatory — shipping 4.4d without the gate creates a 4.4d → 4.6a interim window of AGENTS.md non-compliance on `main`. **Fold:** decisions log **D11** added: PR 4.4d ships a **minimal** responsive gate via a co-located `useIsAboveMd()` hook (`window.matchMedia('(min-width: 768px)')` + `useSyncExternalStore`). Below md: input is absent, ModeToggle degrades to the v4.4b inline render-only `<span aria-disabled>` form. Tests for both viewport branches added to FieldRow.test.tsx. ModeToggle.test.tsx is dropped from PR 4.4d (file budget — coverage achieved through FieldRow.test.tsx + the integration test). 4.6a polishes UX (transitions, ARIA messaging, simulated-viewport regression test) per spec §7.16.

### Codex round 5 (PR #90 review by `chatgpt-codex-connector`, 2026-05-08)

One P1 finding on the v6 plan; folded:

- **P1-1 — Manual edits leave provenance pointing at the prior upstream.** v6's `setFieldValue` only patched the value (and the nested parent) — it did NOT update `resort.field_sources[path]`. Server's `resortUpsert` deep-merges `field_sources` (per spec §4.3), so absent a replacement the canonical entry survives. Result: PUT lands `resort.slopes_km === 150` AND `field_sources.slopes_km.source === 'opensnow'` (or whatever upstream existed). The published dataset would attribute a manual override to the prior upstream — a provenance lie. **Fold:** decisions log **D12** added: `setFieldValue` patches `draft.resort.field_sources[path]` alongside the value with a fresh manual `FieldSource` (`source: 'manual'`, `source_url: 'https://admin.local/manual'`, current ISO timestamps, `crypto.getRandomValues`-derived 64-char hex `upstream_hash`, `attribution_block: { en: 'Manual entry by analyst.' }`). The `manualFieldSource(path, value)` helper is co-located in `useWorkspaceState.ts`. `setMode` does NOT touch `field_sources` — mode-flip-without-edit preserves prior upstream provenance, which is the intended semantics. PR 4.4d Task 2 adds "manual provenance written on value edit" + "setMode does not touch field_sources" tests; PR 4.4d Task 7 bridge integration test asserts on-disk `resort.field_sources.slopes_km.source === 'manual'` post-PUT.

### Codex round 6 (PR #90 review by `chatgpt-codex-connector`, 2026-05-08)

Two findings on the v7 plan (one P1, one P2); both real correctness issues; both folded:

- **P1-1 — `patchFieldSource` hydrated non-manual provenance into PUT body.** v7's helper did `existing ?? { ...canonicalFs }` — on first edit, it copied the entire canonical `field_sources` map (including `source: 'opensnow'`/etc. for paths the analyst never touched) and patched the edited path's manual entry on top. Result: PUT body sent ALL upstream entries plus the manual one. Server's deep-merge for field_sources (per spec §4.3) overwrites server-side entries with this stale copy — risking races against concurrent adapter runs that updated upstream provenance for unrelated paths. **Fold:** dropped canonical hydration. `patchFieldSource(draft, side, path, fs)` now just patches the single edited entry into `draft.{resort,live_signal}.field_sources` (existing draft entries preserved, but no canonical pull-in). Server's deep-merge handles non-edited entries correctly.
- **P2-8 — `matchMedia` undefined in jsdom.** `useIsAboveMd()` calls `window.matchMedia(...)`, but jsdom doesn't implement matchMedia. Tests would throw `TypeError: window.matchMedia is not a function` on first render. **Fold:** PR 4.4d Task 6 Step 1 adds an inline `stubMatchMedia(matches)` helper (uses `vi.stubGlobal`) at the top of `FieldRow.test.tsx`; each test calls it with the appropriate viewport. `afterEach` calls `vi.unstubAllGlobals()`. PR 4.4d Task 7's bridge integration test setup adds the same stub (default `matches: true` for the above-md interactive path; below-md is covered by FieldRow.test.tsx). No `apps/admin/src/test-setup.ts` modification (file budget).

### Codex round 7 (PR #90 review by `chatgpt-codex-connector`, 2026-05-08)

Three findings on the v8 plan (one P1, two P2); all real correctness issues; all folded:

- **P1-1 — Successful PUTs don't clear the draft, so later edits re-send stale manual provenance.** v8's success branch only marked statuses `saved` — it left `draft.resort` / `draft.live_signal` / `draft.resort.field_sources` populated with the just-saved fields. A later edit to a different field would build a PUT body that includes the prior edit AND its now-stale manual `FieldSource`. Under server's last-writer-wins merge, this risks clobbering any concurrent server-side adapter update to the prior field. **Fold:** decisions log **D13** added: on PUT success (rev unchanged), the impl resets `draft` to `{ editor_modes: {} }` AND calls `prepopulateResortDetail(slug, response)` to replace the canonical cache with the post-PUT state. The prepopulate avoids a Suspense flicker — FieldRow's value display reads from canonical (which now matches what was saved), so the user doesn't see their just-edited value disappear. PR 4.4a-2 Task 5 + 6 add the new export + test for `prepopulateResortDetail`. PR 4.4d Task 2 adds a "save → later edit clears prior draft" test that fails without the reset.
- **P2-9 — Hardcoded 768px doesn't match the design-system `md` token (900px).** v8's `MD_QUERY = '(min-width: 768px)'` would leave 768–899px tablet widths interactive — violates AGENTS.md "Admin UI is read-only below the `md` breakpoint" because the project breakpoint is `tokens.breakpoint.md === 900` (`packages/design-system/src/tokens.ts:21`). **Fold:** decisions log **D11** updated: `MD_QUERY` now imports `tokens` from `@snowboard-trip-advisor/design-system` and constructs the query as `\`(min-width: ${tokens.breakpoint.md}px)\``. Test viewport stubs aligned to the same value.
- **P2-10 — Test required `field_sources` siblings copied from canonical, contradicting the round-6 sparse-PUT fold.** v8's PR 4.4d Task 2 test list still carried "field_sources siblings preserved" from a prior revision — but the round-6 P1-1 fold dropped canonical hydration in `patchFieldSource`. Implementers following the test would re-introduce the stale-provenance race; following the impl would break the test. **Fold:** test assertion replaced with "**`field_sources` is sparse** — `Object.keys(draft.resort.field_sources)` is exactly `['<edited-path>']` (no canonical siblings)". Aligns with the round-6 sparse PUT design; server's deep-merge preserves other entries.

### Codex round 8 (PR #90 review by `chatgpt-codex-connector`, 2026-05-08)

Two P2 findings on the v9 plan; both real correctness issues; both folded:

- **P2-11 — Formatter test asserted `lift_pass_day: { currency: 'PLN' }`.** v9's PR 4.4b Task 1 formatter-test list specified `lift_pass_day: { amount: 4250, currency: 'PLN' }` → `Intl.NumberFormat ... currency: 'PLN'`. But `Money.currency` is `z.literal('EUR')` (`packages/schema/src/primitives.ts:5-8`); non-EUR upstream prices are encoded via `field_sources.<path>.fx.native_currency` per ADR-0003, NOT via `Money.currency`. Following the test would either be unreachable (schema rejects PLN before the formatter sees it) or force fixtures that fail `ResortDetailResponse.parse()`. Same root cause as round-3 P2-5 (which fixed the seed fixtures); this fold catches the parallel slip in formatter tests. **Fold:** test list updated to `currency: 'EUR'` for both formatter assertions; non-EUR currencies remain a Phase-2 concern when the FX provenance gets a UI surface.
- **P2-12 — `useResortDetail.hmr.ts` imports `__resetForTests` back from `./useResortDetail`, forming a cycle.** `useResortDetail.ts` does `import './useResortDetail.hmr'` (side-effect import). The HMR file's `import { __resetForTests } from './useResortDetail'` closes the loop. Vite's HMR module-replacement step would re-evaluate both modules through the cycle on every reload — the canonical reset semantics aren't guaranteed. The existing `apps/public/src/state/useDataset.hmr.ts:14-25` explicitly avoids this by using `import.meta.hot.accept('./useDataset', () => {})` — a string-literal accept target with a no-op callback, relying on the new module body to naturally re-initialize its own `cached`. **Fold:** rewrote `useResortDetail.hmr.ts` to mirror the public pattern: `import.meta.hot.accept('./useResortDetail', () => { /* no-op */ })`. No `__resetForTests` import; no cycle. The new module body's `const cached = new Map<...>()` re-initializes naturally. Documentation block in the file references the public pattern + the cycle-avoidance reason.

### Codex round 9 (PR #90 review by `chatgpt-codex-connector`, 2026-05-08)

One P2 finding on the v10 plan; folded:

- **P2-13 — `prepopulateResortDetail(slug, Promise.resolve(response))` doesn't actually avoid the Suspense flicker.** v10 hoped that replacing the cached entry with `Promise.resolve(response)` (a synchronously-fulfilled Promise) would make the next `useResortDetail(slug)` render return synchronously through `use()`. Codex tested it: React 19's `use(Promise.resolve('ok'))` initially renders the Suspense fallback under the admin test setup. The thenable contract (`.then(resolve)`) enqueues resolution as a microtask — `use()` cannot synchronously observe the value. The post-PUT no-flicker guarantee in **D13** was wrong. **Fold:** decisions log **D3** updated to a **dual-cache** shape: `cachedPromises` (Promise-keyed; for first-mount `use()` reads) AND `cachedFulfilled` (data-keyed; synchronous returns). `useResortDetail(slug)` checks `cachedFulfilled` first; if a fulfilled entry exists, returns it synchronously (no `use()`, no Suspense). The `loadOnce` `.then` callback populates `cachedFulfilled` on resolution so subsequent renders take the sync path. `prepopulateResortDetail` populates BOTH caches; rejected promises only populate `cachedPromises` (cachedFulfilled stays empty per ADR-0010 pinning). PR 4.4a-2 Task 5 adds three new tests: prepopulate-no-flicker (assert Suspense fallback NEVER renders post-prepopulate), synchronous fast path (assert subsequent renders skip `use()`), and rejected-promise path skips sync cache (preserves ADR-0010 pinning).

### Codex round 10 (PR #90 review by `chatgpt-codex-connector`, 2026-05-08)

One P2 finding on the v11 plan; folded:

- **P2-14 — `editor_modes` reject test cases didn't match the actual request pipeline.** v11's PR 4.4c Task 7 specified two reject cases: (a) `editor_modes: { ghost: 'manual' }` → `400 invalid-resort`, and (b) "PUT drops `field_sources.a` while keeping `editor_modes.a`" → reject. Both were wrong. (a): `ResortUpsertBody`'s schema (`packages/schema/api/resortUpsert.ts`) uses `z.partialRecord(z.enum(METRIC_FIELDS), ...)` — a non-`MetricPath` key like `'ghost'` fails Zod parse at the request layer and returns `400 invalid-request` (NOT `invalid-resort`); the handler never runs. (b): `ResortUpsertBody.resort` is `Partial<Resort>` and spec §4.3 deep-merges `field_sources` server-side; the PUT body cannot REPRESENT a removal — clients can ADD/UPDATE entries but not DELETE them. **Fold:** (a) replaced with a valid-MetricPath-not-in-field_sources case: `editor_modes: { snow_depth_cm: 'manual' }` against `kotelnica` (whose `resort.field_sources` covers only the 7 durable paths). The body parses cleanly through `ResortUpsertBody` (snow_depth_cm IS a `MetricPath`), but `WorkspaceFile.parse()`'s cross-key refinement post-merge rejects (snow_depth_cm in editor_modes but not in resort.field_sources). Handler throws `InvalidResortError`; dispatch maps to `400 invalid-resort`. (b) dropped — not representable through the public PUT API; the cross-key invariant against this state is already covered by `workspaceFile.test.ts` schema tests in PR 4.1a. PR 4.4c local-test `curl` step now verifies BOTH the request-layer (`ghost`) and handler-layer (`snow_depth_cm`) reject paths.

### Codex round 11 (PR #90 review by `chatgpt-codex-connector`, 2026-05-08)

One P2 finding on the v12 plan; folded:

- **P2-15 — Empty/transient numeric input gets coerced to 0 and persisted.** v12's FieldRow `onChange` handler did `setFieldValue(path, Number(e.target.value))`. When the analyst clears a MANUAL field before retyping, `e.target.value` is `''`, `Number('')` is `0`, and the 500ms autosave persists `0` with manual provenance. For `slopes_km`, `altitude_m.*`, `skiable_terrain_ha`, `lift_count` — all of which validly accept `0` numerically per `Resort`'s Zod schema — the persisted `0` is silently saved and would corrupt the workspace (e.g., `slopes_km: 0` for a real resort). The same vulnerability exists for transient invalid intermediates like `'-'`, `'.'`, `'1e'` (each coerces to `NaN` which IS rejected by `z.number()` BUT the bridge integration test would still see the spurious PUT). **Fold:** FieldRow now keeps a **local string state** for the numeric input (`useState((): string => String(persistedValue ?? ''))`) — the input element is controlled by this string, not by the persisted draft. `onInputChange`: ALWAYS updates the local string (so the input element reflects what the user typed), but only calls `setFieldValue(path, parsed)` when `raw !== ''` AND `!Number.isNaN(parsed)`. Empty/invalid strings stay local-only — no PUT fires. The local string syncs back to `persistedValue` via a ref-tracked render-time check when the persisted value changes externally (post-PUT canonical update, navigation reload). PR 4.4d Task 6 test list adds two new cases: (1) "empty/transient input does NOT persist" — assert `apiClient.upsertResort` not called after clearing input; (2) "invalid intermediate input does NOT persist" — assert no PUT fires for `'-'`/`'.'`/`'1e'`.

### Codex round 12 (PR #90 review by `chatgpt-codex-connector`, 2026-05-08)

One P2 finding on the v13 plan; folded:

- **P2-16 — Seed fixture `lodging_sample` shape was wrong.** v13's PR 4.4a-1 Task 1 instruction wrote `lodging_sample.median_eur: { amount, currency: 'EUR', sample_size }` — putting `sample_size` INSIDE the Money shape. But the `ResortLiveSignal` schema at `packages/schema/src/liveSignal.ts:15` is `lodging_sample: z.object({ median_eur: Money, sample_size: z.number().int() }).optional()` — `sample_size` is a SIBLING of `median_eur`, NOT nested inside it. `Money` itself is just `{ amount, currency }` (no third field). An implementer following v13's instruction would generate fixtures that fail `WorkspaceFile.parse()` at the schema-validation step, blocking PR 4.4a-1's "verify both fixtures parse" Task 1 Step 3 and the entire downstream Tier 3 chain. **Fold:** PR 4.4a-1 Task 1 Step 1 corrected — `lodging_sample: { median_eur: { amount, currency: 'EUR' }, sample_size: <int> }` (siblings). Confirms the schema citation explicitly so the executor doesn't rebuild from memory.

### Codex round 13 (PR #90 review by `chatgpt-codex-connector`, 2026-05-08)

One P2 finding on the v14 plan; folded:

- **P2-17 — Bridge integration test asserted nested `editor_modes.season.start_month`, but the persisted shape is flat-keyed.** v14's PR 4.4d Task 7 nested-path round-trip step asserted `editor_modes.season.start_month === 'manual'`. But `editor_modes` is `Partial<Record<MetricPath, 'manual' \| 'auto'>>` — a SPARSE FLAT map keyed by the LITERAL DOTTED STRING `'season.start_month'`. The correct assertion is `editor_modes['season.start_month'] === 'manual'`. The previous assertion would either fail against the correct on-disk shape OR push the implementer toward a nested `{ season: { start_month: ... } }` structure that fails `WorkspaceFile.parse()` (because `season` is not a `MetricPath` enum value — `MetricPath` is the union of the 12 dotted-path strings). **Fold:** PR 4.4d Task 7 nested-path round-trip assertion corrected to `editor_modes['season.start_month'] === 'manual'`.

### Codex round 14 (PR #90 review by `chatgpt-codex-connector`, 2026-05-08)

One P2 finding on the v15 plan; folded:

- **P2-18 — `projectFieldStates` merged-map approach masks missing live provenance.** v15 did `combined = { ...resort.field_sources, ...liveSources }` then looked up `combined[path]` for every path. But `Resort.field_sources` accepts arbitrary string keys (the cross-key invariant is on `editor_modes`, not on `resort.field_sources` itself). If a hand-edited workspace file had `resort.field_sources.snow_depth_cm: <some entry>` (durable-style provenance for a live path) AND `live_signal.field_sources.snow_depth_cm` was missing, v15's projection would pick up the durable-side entry as a fallback and project the live path as `live`/`stale` — masking the missing live provenance instead of surfacing it as `failed (no field_sources entry)`. **Fold:** select the source map per path's durable-vs-live class — durable paths read ONLY from `resort.field_sources`; live paths read ONLY from `live_signal?.field_sources`. NO merge. PR 4.4a-1 Task 4 test case "live wins over resort.field_sources" replaced with "Per-path source selection: live paths read only from live_signal.field_sources" — fixture has a durable-style entry at `resort.field_sources.snow_depth_cm` AND missing `live_signal.field_sources.snow_depth_cm`; assertion: `field_states.snow_depth_cm.state === 'failed'` (not `'live'`).

### Codex round 15 (PR #90 review by `chatgpt-codex-connector`, 2026-05-08)

Two related P2 findings on the v16 plan; both real correctness issues blocking the lint quality gate; both folded:

- **P2-19 — Raw `<button>` JSX banned in apps/admin/src/**.** v16's `ModeToggle.tsx` impl used a raw `<button type="button" role="switch">`. But `eslint.config.js:19` defines `RAW_HTML_ELS = '^(button|input|a|dialog|select|textarea)$'` and the apps/** lint block at line 255 rejects any `JSXOpeningElement` matching that regex — `npm run lint` would block the PR before tests even run. AGENTS.md "UI Code Rules" says "No raw HTML element imports where a design-system component exists". **Fold:** `ModeToggle.tsx` now uses the DS `Button` component with `variant="ghost"` + `aria-pressed={mode === 'manual'}`. The DS `Button` already exposes `aria-pressed` for toggle-style usage (`packages/design-system/src/components/Button.tsx:15-19,34`); semantics shift from `role="switch"` to "toggle button" but functionally equivalent for the editor UX. No DS extension needed.
- **P2-20 — Raw `<input>` JSX similarly banned, AND DS `Input` doesn't ship `type="number"`.** Same lint rule blocks `<input type="number">`. The DS `Input` component supports only `type: 'text' | 'date'` (`packages/design-system/src/components/Input.tsx:20`). Extending DS Input would add `packages/design-system/**` files to PR 4.4d, busting its 8-file budget. **Fold:** PR 4.4d uses DS `Input` with `type="text"` and adds JS-side numeric + month-range validation (extends the round-11 `Number.isNaN` guard with `parsed < 1 || parsed > 12 || !Number.isInteger(parsed)` for the month paths). Test queries change to `getByRole('textbox', { name: labelForPath(path) })`. Tradeoff: lose the browser's native `type="number"` spinner buttons + numeric keyboard on mobile — acceptable for Phase-1 admin (loopback dev-only on desktop). DS Input extension is a Phase-2 / 4.6a-polish concern, NOT a Tier-3 blocker.

### Codex round 16 (PR #90 review by `chatgpt-codex-connector`, 2026-05-08)

Two P2 findings on the v17 plan; both real correctness issues; both folded:

- **P2-21 — `<EditorErrorBoundary>` Back/Retry buttons are raw `<button>`.** Same lint ban as round-15 (P2-19). v17 fixed `<ModeToggle>` but left the boundary's controls as raw HTML. **Fold:** EditorErrorBoundary now uses DS `Button` for both controls (`variant="ghost"` for Back; `variant="primary"` for Retry). Imports added to `ResortEditor.tsx`'s top-of-file: `import { Button, Tabs } from '@snowboard-trip-advisor/design-system'`.
- **P2-22 — Queued flush after rev-moved success re-sends already-persisted fields.** v17's flush handled rev-unchanged success (reset draft + prepopulate) but skipped both branches when rev moved during the round-trip. The queued flush then fired with the FULL current draft — including paths the first PUT already persisted with manual provenance. Under server's last-writer-wins merge for `field_sources`, this risked overwriting concurrent server-side adapter updates to those paths between the two PUTs. **Fold:** added `lastSentDraft: DraftShape | null` to `SlugStore` + a diff-based PUT body. Each flush builds the body as the diff between the current draft and `store.lastSentDraft`. On rev-unchanged success: reset draft + clear `lastSentDraft` to null (next flush sends entire fresh draft). On rev-moved success: keep the draft (it has newer edits), set `store.lastSentDraft = inFlightDraft` so the queued flush diffs correctly — only paths whose values differ from `lastSentDraft` go in the next PUT body. PR 4.4d Task 2 adds an "edit during round-trip → queued flush diffs against lastSentDraft" test that fails without the diff (assert second PUT body excludes the first PUT's slopes_km).

### Codex round 17 (PR #90 review by `chatgpt-codex-connector`, 2026-05-08)

Two P2 findings on the v18 plan; both real correctness issues; both folded:

- **P2-23 — Whitespace-only numeric input bypasses the empty-string guard.** v18's `onLocalChange` checked `raw === ''` but accepted `'   '` (whitespace only). `Number(' ')` is `0`, so `setFieldValue(path, 0)` would fire and persist 0 with manual provenance — workspace data corruption (e.g., `slopes_km: 0` for a real resort). **Fold:** changed the guard to `raw.trim() === ''`. Whitespace-only strings are now transient like the empty string. Test list updated to cover the whitespace case.
- **P2-24 — Round-11 test assertion required draft to hold a value that should remain absent in a fresh-mount sparse-draft case.** v18's PR 4.4d Task 6 test asserted that after clearing the input, `draft.resort.slopes_km` STILL holds 150 (the persisted value). But in the fresh-mount case described, the 150 comes from canonical `field_states`, not from the draft — the draft starts as `{ editor_modes: {} }` (sparse). Clearing the input returns before `setFieldValue` fires, so `draft.resort.slopes_km` is never written and remains `undefined`. The previous assertion would either fail against the correct sparse-draft impl OR push implementers to pre-populate the draft with canonical data (which conflicts with the sparse-PUT design from rounds 6/7/16). **Fold:** assertion corrected to "**`draft.resort?.slopes_km` is still `undefined`** — sparse draft, no setFieldValue fired". Display value continues to come from canonical via `valueFor(state)`.

### Codex round 18 (PR #90 review by `chatgpt-codex-connector`, 2026-05-08)

One P2 finding on the v19 plan; folded:

- **P2-25 — Empty-diff queued flush 400s and leaves the field in `save-failed`.** v19's flush always called `apiClient.upsertResort(slug, body)` regardless of body size. After a rev-moved success (round 16 P2-22), the queued flush builds a diff body. If the user edited during the round-trip then reverted the edit back to the already-sent value before the queued flush ran, `buildBodyFromDraft` returns `{}` (no fields differ from `lastSentDraft`). The server's `ResortUpsertBody` schema rejects empty bodies with `400 invalid-request` (per spec §4.3 / Codex round-1 fold on `0b235e3`); the queued flush hits the catch branch and marks the path as `save-failed` — even though the workspace already matches the current draft. **Fold:** added an empty-diff short-circuit BEFORE `apiClient.upsertResort`. If `Object.keys(body).length === 0`, mark dirty/saving statuses as `saved` (workspace already matches, no PUT needed) and `return` — the existing `finally` block runs cleanup (`store.inFlightToken = null` + queued-flush scheduling). PR 4.4d Task 2 adds an "empty-diff queued flush short-circuits" test that simulates the edit-then-revert sequence and asserts `apiClient.upsertResort` is NOT called for the empty diff.

### Codex round 19 (PR #90 review by `chatgpt-codex-connector`, 2026-05-08)

Two findings on the v20 plan (one P2, one P3); both folded:

- **P2-26 — Fractional `lift_count` would server-reject and leave `save-failed`.** v20's `onLocalChange` only validated integer/range for month paths (`isMonth` check). But `Resort.lift_count` is `z.number().int()` (`packages/schema/src/resort.ts:14`); typing `'7.5'` would parse to `7.5` (NOT NaN), pass through onLocalChange, and `setFieldValue(path, 7.5)` would fire the debounced PUT. Server rejects `lift_count: 7.5` with `400 invalid-resort`, leaving the field in `save-failed`. **Fold:** added a per-path integer guard for `lift_count` (`if (path === 'lift_count' && !Number.isInteger(parsed)) { return }`). `slopes_km`, `altitude_m.*`, `skiable_terrain_ha` stay un-guarded since their schema is `z.number()` (not `.int()`). PR 4.4d Task 6 test list adds a "fractional `lift_count` does not persist" case.
- **P3-27 — Bridge integration test referenced `<input type="number">`.** v20's PR 4.4d Task 7 step said "Type `150` into the new MANUAL `<input type="number">`" — but round-15 P2-20 swapped to DS Input (`type="text"`). The test's selector would fail against the actual implementation. **Fold:** updated the bridge-test step to `getByRole('textbox', { name: labelForPath('slopes_km') })` — the correct query for DS Input's rendered `<label>` + `<input type="text">`.

### Codex round 20 (PR #90 review by `chatgpt-codex-connector`, 2026-05-08)

One P2 finding on the v21 plan; folded:

- **P2-28 — Transient input branches don't clear pre-existing pending draft.** v21's `onLocalChange` had each transient/invalid branch (empty/whitespace/NaN/out-of-range/non-integer) update `localString` and `return` — but if the user had previously typed a valid value (which already wrote to draft + scheduled the 500ms debounce), the SUBSEQUENT clear/invalid input would only update the local string. Draft still held the prior valid value AND the debounce timer was still set; 500ms later the PUT would fire with the stale value despite the input currently being empty/invalid. **Fold:** added a module-level `clearFieldValue(slug, path)` function that removes both the value AND the field_sources manual entry from draft.resort/draft.live_signal (preserving `editor_modes[path]` since the MANUAL flag is independent of the value), bumps rev, and reschedules the flush (which then sees the cleared draft and either short-circuits via the round-18 P2-25 empty-diff branch OR sends a smaller body without the cleared path). Each transient branch in `onLocalChange` now calls `clearFieldValue(path)` before `return`. PR 4.4d Task 6 test list adds two new cases: (1) "edit-then-clear cancels the pending PUT" — assert `apiClient.upsertResort` is NOT called after type-then-clear sequence; (2) "edit-then-clear preserves editor_modes" — assert `draft.editor_modes[path]` is NOT removed by `clearFieldValue`.

**End of plan.**
