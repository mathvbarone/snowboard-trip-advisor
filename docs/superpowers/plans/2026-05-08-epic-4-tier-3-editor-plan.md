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
| **D3** (cache shape) | `useResortDetail`: per-slug `Map<ResortSlug, Promise<ResortDetailResponse>>`; rejected promises pinned per ADR-0010; `invalidateResortDetail(slug)` for boundary-driven retry; `__resetForTests()` clears the Map; HMR reset in sibling `useResortDetail.hmr.ts` (coverage-excluded by glob via `apps/admin/vite.config.ts`). | Per-slug cache prevents re-fetch on slug-switch. |
| **D4** (Suspense placement) | Per-route `<Suspense>` inside `<EditorErrorBoundary>`, NOT at `<Shell>` level. Fallback: inline `<div role="status" aria-live="polite">Loading…</div>`. | Editor suspending must NOT blank sidebar/dashboard. |
| **D5** (concurrent tabs) | Phase-1 documented as last-writer-wins between two browser tabs on the same loopback. PUT is `If-Match`-less in Phase 1. Phase 2 ships ETag/If-Match. PR 4.4c includes a defensive test asserting the handler ignores any `If-Match` header (so a Phase-2 leak doesn't break Phase 1). | Single-analyst topology makes concurrent tabs rare. |
| **D6** (test isolation) | Hook tests own their own `__resetForTests()` calls in local `afterEach` blocks. NO global `apps/admin/src/test-setup.ts` modification in PR 4.4a-2 (file-budget pressure; matches the existing `useResortList` pattern). The unwired `useResortList.__resetForTests` is pre-existing technical debt and explicitly out-of-scope for Tier 3. | Vitest gives each test file its own module instance; cross-file leakage is impossible. Local `afterEach` is sufficient and matches existing codebase pattern. |
| **D7** (slug derivation in 4.4d) | `useWorkspaceState()` and `useModeToggle()` derive the `slug` internally by reading `useURLState()`. FieldRow calls the hooks WITHOUT passing slug (`useWorkspaceState()` is no-arg from the consumer's point of view). This avoids prop-drilling through `MetricPanel.tsx` and `ResortEditor.tsx` modifications in PR 4.4d. The hooks assert the route is `'editor'`; calling them outside the editor route is a programming error caught at the assertion. | Keeps PR 4.4d at 8 files. The URL-state coupling is a tradeoff — Phase-2 can refactor to context if FieldRow becomes reusable elsewhere. |
| **D8** (dispatch.ts details pass-through) | PR 4.4c modifies `apps/admin/server/dispatch.ts` to read `(err as Error & { code, details }).details` and pass it to the error envelope. Currently dispatch only carries `code` + `message`. The `editor_modes` cross-key reject test in 4.4c requires the refinement message to surface in `details`. | Spec §4.10 envelope shape `{ error: { code, message, details? } }` requires details pass-through for the cross-key reject case. |
| **D9** (seed fixtures location) | The `tests/fixtures/admin-workspace/{kotelnica-bialczanska,spindleruv-mlyn}.json` files MISSING from `main` (declared as PR 4.1a §10.8 deliverable but not actually shipped). Recovered as part of PR 4.4a-1 (already a small schema PR; fixtures + projection function are conceptually adjacent). PR 4.4a-1 file count: 4 files (still ≤8). | Without the fixtures, every server-side and bridge-tier test in Tier 3 has nothing to load. |

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
| 1 | `apps/admin/src/state/useModeToggle.test.ts` | NEW — `validPaths` guard + silent-no-op ghost-path test |
| 2 | `apps/admin/src/state/useWorkspaceState.test.ts` | NEW — debounce + in-flight token + concurrent-PUT queue + 4-state indicator + observable-spy cache-isolation test (per fold §5) |
| 3 | `apps/admin/src/views/ResortEditor/ModeToggle.test.tsx` | NEW — interactive AUTO ↔ MANUAL (button-based, replaces 4.4b's inline span) |
| 4 | `tests/integration/apps/admin/resort-editor-write.test.tsx` | NEW — bridge tier; on-disk file assertion; reload via `__resetForTests()` between unmount/remount (per fold §5) |
| 5 | `apps/admin/src/state/useModeToggle.ts` | NEW — derives `slug` from `useURLState()` per **D7** |
| 6 | `apps/admin/src/state/useWorkspaceState.ts` | NEW — derives `slug` from `useURLState()` per **D7** |
| 7 | `apps/admin/src/views/ResortEditor/ModeToggle.tsx` | NEW — extracted as `<button role="switch">` |
| 8 | `apps/admin/src/views/ResortEditor/FieldRow.tsx` | MODIFY — add MANUAL input affordance (numeric inputs for the 10 paths per **F1**; explanatory copy for the 2 money paths) + replace inline `<span>` with `<ModeToggle>` |

**Files: 8.** `ResortEditor.tsx` is NOT modified — slug is derived inside the hooks via `useURLState`, eliminating prop-drilling.

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
  - `live_signal: ResortLiveSignal | null` — non-null with `snow_depth_cm`, `lifts_open: { count, total }`, `lift_pass_day: { amount, currency: 'PLN' }`, `lodging_sample.median_eur: { amount, currency: 'EUR', sample_size }` + matching `field_sources`.
  - `modified_at` — recent ISO datetime.
  - `editor_modes: {}` (sparse default).

- [ ] **Step 2: Write `spindleruv-mlyn.json`** — analogous CZ Krkonoše resort with `country: 'CZ'`, `lift_pass_day.currency: 'CZK'`. Same shape.

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
  const liveSources = live?.field_sources ?? {}
  const combined = { ...resort.field_sources, ...liveSources }
  const out = {} as Record<MetricPath, FieldStateFor<unknown>>
  for (const path of METRIC_FIELDS) {
    out[path] = projectOne(path, combined[path], resolveValue(path, resort, live), modes[path], now)
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
  - **live wins over resort.field_sources**: when `live_signal.field_sources.snow_depth_cm` is more recent than `resort.field_sources.snow_depth_cm`, the projection uses live's `observed_at` for the staleness check.
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

const cached = new Map<ResortSlug, Promise<ResortDetailResponse>>()

function loadOnce(slug: ResortSlug): Promise<ResortDetailResponse> {
  const existing = cached.get(slug)
  if (existing !== undefined) { return existing }
  const next = apiClient.getResort(slug)
  cached.set(slug, next)
  // Empty terminal .catch suppresses unhandled-rejection signal; rejected
  // promises stay PINNED in the cache per ADR-0010.
  next.catch((): void => { /* swallow */ })
  return next
}

export function useResortDetail(slug: ResortSlug): ResortDetailResponse {
  return use(loadOnce(slug))
}

export function invalidateResortDetail(slug?: ResortSlug): void {
  if (slug === undefined) { cached.clear() } else { cached.delete(slug) }
}

export function __resetForTests(): void { cached.clear() }
```

`useResortDetail.hmr.ts`:

```ts
import { __resetForTests } from './useResortDetail'

if (import.meta.hot !== undefined) {
  import.meta.hot.dispose((): void => { __resetForTests() })
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
  - `lift_pass_day: { amount: 4250, currency: 'PLN' }` → `Intl.NumberFormat(undefined, { style: 'currency', currency: 'PLN' }).format(4250)` (locale-dependent string; assert via the same construction).
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

import { Tabs } from '@snowboard-trip-advisor/design-system'

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
    if (error.envelope.error.code === 'not-found') {
      return (
        <div role="alert">
          <p>Resort not found.</p>
          <button onClick={this.props.onBack}>Back to resorts</button>
        </div>
      )
    }
    if (error.envelope.error.code === 'workspace-corrupt') {
      return (
        <div role="alert">
          <p>Workspace file <code>data/admin-workspace/{this.props.slug}.json</code> is corrupt. Inspect the file and either repair or <code>rm</code> it before retrying. See server logs for details.</p>
          <button onClick={this.props.onBack}>Back to resorts</button>
          <button onClick={this.props.onRetry}>Retry</button>
        </div>
      )
    }
    // Generic fallback for unexpected error codes.
    return (
      <div role="alert">
        <p>Error loading resort: {error.envelope.error.message}</p>
        <button onClick={this.props.onRetry}>Retry</button>
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
  - `editor_modes` ghost-path reject: PUT `{ghost: 'manual'}` when `field_sources` has no `ghost` → `InvalidResortError` with `.details` containing the refinement message; dispatch maps to `400 invalid-resort` with details surfaced.
  - `editor_modes` field-source-removal reject: PUT drops `field_sources.a` while keeping `editor_modes.a` → reject.
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
- [ ] **Step 4:** Local-test plan: spin `npm run dev:admin`; manually `curl -X PUT http://127.0.0.1:5174/api/resorts/kotelnica-bialczanska -H 'Content-Type: application/json' -d '{"editor_modes":{"slopes_km":"manual"}}'` and confirm the workspace file is written. Confirm a malformed PUT (`{"editor_modes":{"ghost":"manual"}}`) returns 400 with the refinement message in `details`.
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
  - Default reading: missing `editor_modes` entry → `'auto'`.
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
- [ ] **Step 2:** Run. FAIL.

### Task 3 — Implement `useWorkspaceState`

**Files:** New `apps/admin/src/state/useWorkspaceState.ts`.

- [ ] **Step 1:** Implement the module-scoped per-slug singleton store with `useSyncExternalStore` subscription (per **E1+** + Codex round-2 P1-1 fold + Codex round-1 P2-2 fold). Pseudo-shape:

```ts
import { useCallback } from 'react'
import { useSyncExternalStore } from 'react'

import type { MetricPath, ResortSlug } from '@snowboard-trip-advisor/schema'
import type { ResortUpsertBody } from '@snowboard-trip-advisor/schema/api'

import { apiClient } from '../lib/apiClient'
import { useURLState } from './useURLState'

const DEBOUNCE_MS = 500
type Status = 'saved' | 'dirty' | 'saving' | 'save-failed'

type DraftShape = {
  field_values: Partial<Record<MetricPath, unknown>>
  editor_modes: Partial<Record<MetricPath, 'manual' | 'auto'>>
}

interface StoreState {
  readonly draft: DraftShape
  readonly status: Record<MetricPath, Status>
  readonly rev: number
}

interface SlugStore {
  state: StoreState
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
  return { draft: { field_values: {}, editor_modes: {} }, status: {} as Record<MetricPath, Status>, rev: 0 }
}

function getOrCreateStore(slug: ResortSlug): SlugStore {
  let store = storesBySlug.get(slug)
  if (store === undefined) {
    store = { state: emptyState(), inFlightToken: null, queued: false, timer: null, subscribers: new Set() }
    storesBySlug.set(slug, store)
  }
  return store
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
    const body = buildBodyFromDraft(inFlightDraft)
    await apiClient.upsertResort(slug, body)
    // Mark saved only if BOTH the token is still ours (no race) AND the rev
    // did NOT advance during the round-trip (Codex round-1 P2-2 fold).
    if (store.inFlightToken === token && store.state.rev === inFlightRev) {
      setStatusForDirty(store, 'saved')
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

function buildBodyFromDraft(draft: DraftShape): ResortUpsertBody {
  // Filled in per spec §4.3 — wraps non-empty parts of draft into the
  // ResortUpsertBody shape. Body must contain at least one of
  // resort/live_signal/editor_modes (server rejects empty body as
  // invalid-request).
  // ... executor implements
  return {} as ResortUpsertBody
}

export function setFieldValue(slug: ResortSlug, path: MetricPath, value: unknown): void {
  const store = getOrCreateStore(slug)
  patchState(store, (s) => ({
    rev: s.rev + 1,
    draft: { ...s.draft, field_values: { ...s.draft.field_values, [path]: value } },
    status: { ...s.status, [path]: 'dirty' },
  }))
  scheduleFlush(slug)
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

export function useWorkspaceState() {
  const route = useURLState()
  if (route.route !== 'editor') {
    throw new Error('useWorkspaceState called outside the editor route')
  }
  const slug = route.slug
  const store = getOrCreateStore(slug)

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

- [ ] **Step 1:** Implement as a thin wrapper over `useWorkspaceState`. **Per Codex round-1 P2-1 fold:** `validPaths` is derived INTERNALLY from `useResortDetail(slug).resort.field_sources` — NOT taken as an arg. This keeps PR 4.4d at 8 files (no prop drilling through `MetricPanel` / `ResortEditor`) and pins the durable-only constraint at the hook layer where it cannot be bypassed.

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

  function toggleMode(path: MetricPath): void {
    if (!validPaths.includes(path)) { return /* silent no-op per §6.1 + F1 fold */ }
    const current = draft.editor_modes[path] ?? 'auto'
    setMode(path, current === 'manual' ? 'auto' : 'manual')
  }
  return {
    toggleMode,
    modeFor: (p: MetricPath): 'manual' | 'auto' => draft.editor_modes[p] ?? 'auto',
  }
}
```

- [ ] **Step 2:** Run. PASS.

### Task 5 — Extract `<ModeToggle>` (button-based) + tests

**Files:** New `apps/admin/src/views/ResortEditor/ModeToggle.tsx` + `ModeToggle.test.tsx`.

- [ ] **Step 1: Write tests** asserting:
  - `<button role="switch" aria-checked aria-label>` (NOT `aria-disabled` — interactive now).
  - Click → `onToggle()` called.
  - Keyboard: `Space`/`Enter` → `onToggle()` called.
  - jest-axe passes.
- [ ] **Step 2: Implement.**

```tsx
import type { JSX } from 'react'
import type { MetricPath } from '@snowboard-trip-advisor/schema'

import { labelForPath } from './FieldRow'  // re-export from FieldRow's co-location

interface ModeToggleProps {
  readonly path: MetricPath
  readonly mode: 'manual' | 'auto'
  readonly onToggle: () => void
}

export function ModeToggle({ path, mode, onToggle }: ModeToggleProps): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={mode === 'manual'}
      aria-label={`Mode for ${labelForPath(path)}`}
      onClick={onToggle}
    >
      {mode === 'manual' ? 'MANUAL' : 'AUTO'}
    </button>
  )
}
```

- [ ] **Step 3:** Run. PASS.

### Task 6 — Modify `FieldRow.tsx` for MANUAL input + ModeToggle wiring

**Files:** Modify `apps/admin/src/views/ResortEditor/FieldRow.tsx`.

- [ ] **Step 1:** Replace the inline `<span role="switch">` ModeToggle with the new `<ModeToggle>` component. Add an editor-mode branch. **Per F1 fold (Codex round-1 P2-1):** `MANUAL_EDITABLE_PATHS` is the **7 durable numeric paths** only — live paths cannot be MANUAL because the `WorkspaceFile` cross-key invariant restricts `editor_modes` keys to `Object.keys(resort.field_sources)` (durable subset). `useModeToggle` enforces the same durable-only constraint internally (it derives `validPaths` from `useResortDetail`); FieldRow does NOT need a `resort` prop. `FieldRowProps` is unchanged from PR 4.4b's `{ path, state }` signature.

```tsx
// 7 durable paths that can be MANUAL-edited via numeric inputs.
// Live paths (snow_depth_cm, lifts_open.{count,total}, lift_pass_day,
// lodging_sample.median_eur) are NOT in this set — see the explanatory-
// copy branch below. Phase 2 widens the WorkspaceFile schema if live-path
// MANUAL becomes needed.
const MANUAL_EDITABLE_PATHS: ReadonlySet<MetricPath> = new Set([
  'altitude_m.min', 'altitude_m.max', 'slopes_km', 'lift_count',
  'skiable_terrain_ha', 'season.start_month', 'season.end_month',
])

function FieldRow({ path, state }: FieldRowProps): JSX.Element {
  const { draft, setFieldValue } = useWorkspaceState()
  const { toggleMode, modeFor } = useModeToggle()  // no args; reads slug + validPaths internally

  const inputValue = draft.field_values[path] ?? valueFor(state)
  const isManual = modeFor(path) === 'manual'
  const isMonth = path === 'season.start_month' || path === 'season.end_month'

  const inputElement = !isManual ? null
    : MANUAL_EDITABLE_PATHS.has(path)
      ? (
        <input
          type="number"
          value={inputValue as number}
          onChange={(e): void => setFieldValue(path, Number(e.target.value))}
          {...(isMonth ? { min: 1, max: 12 } : {})}
        />
      )
      // Per F1 fold: live paths (3 numeric + 2 money) all render explanatory
      // copy in MANUAL — the editor_modes schema invariant rejects PUTs that
      // mode-flag a path not in resort.field_sources.
      : <span>MANUAL editing for {path} lands in PR 4.6a.</span>

  return (
    <div role="group" aria-label={labelForPath(path)}>
      <StatusPill variant={pillVariantFor(state)} />
      <span>{formatMetricValue(path, isManual ? inputValue : valueFor(state))}</span>
      <span>{sourceFor(state)}</span>
      {/*
        ModeToggle is rendered for ALL paths — clicking a live-path's toggle
        is a silent no-op via useModeToggle's validPaths guard. This is
        intentional: the toggle being VISIBLE on every row is the spec §6.1
        surface; the no-op happens at the hook layer, not the render layer.
      */}
      <ModeToggle path={path} mode={modeFor(path)} onToggle={(): void => toggleMode(path)} />
      {inputElement}
    </div>
  )
}
```

(Executor fills in the data-flow detail. **Per Codex round-1 P2-1 fold:** `useModeToggle` reads `useResortDetail(slug).resort.field_sources` for `validPaths` — derivation lives at the hook layer where the durable-only constraint cannot be bypassed.)

- [ ] **Step 2:** Run existing FieldRow tests. Tests asserting `<span role="switch" aria-disabled="true">` will FAIL (the inline span is replaced by `<button>`); update those tests to assert the new structure or rely on `ModeToggle.test.tsx` for the toggle's behavior.

### Task 7 — Bridge integration test

**Files:** New `tests/integration/apps/admin/resort-editor-write.test.tsx`.

- [ ] **Step 1: Setup.** `beforeEach` creates per-test workspace tmpdir (`mkdtemp`); seeds with the `kotelnica-bialczanska.json` fixture (`fs.copyFile` from `tests/fixtures/admin-workspace/`); calls `server.use(...bridgeHandlers(tmpdir))`. `afterEach` removes tmpdir AND calls `useResortDetail.__resetForTests()` + `useWorkspaceState.__resetForTests()`.
- [ ] **Step 2: Write test:**
  - Mount `<App />` with `?route=editor&slug=kotelnica-bialczanska`.
  - Wait for editor render (await `findByRole('tablist')` or similar).
  - Click `<ModeToggle>` for `slopes_km` → MANUAL.
  - Type `150` into the new MANUAL `<input type="number">`.
  - Fast-forward debounce (500ms via `vi.advanceTimersByTime` or `vi.useFakeTimers`).
  - Wait for PUT response.
  - **Filesystem assertion**: `await readFile(join(tmpdir, 'data/admin-workspace/kotelnica-bialczanska.json'), 'utf-8')` → parses to `WorkspaceFile`; `editor_modes.slopes_km === 'manual'`; field_sources reflects edit.
  - **Reload simulation** (per fold §5): unmount; **call `useResortDetail.__resetForTests()` AND `useWorkspaceState.__resetForTests()`** to clear module-level caches; spy on `apiClient.getResort` to verify the next mount triggers a fresh fetch (cache miss); re-mount `<App />`; assert editor renders with `slopes_km` MANUAL + value `150` (read from the server's freshly-loaded canonical state, not from a stale cached promise).
- [ ] **Step 3:** Run. PASS.

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
  - Submit malformed PUT via `curl`: `curl -X PUT http://127.0.0.1:5174/api/resorts/kotelnica-bialczanska -H 'Content-Type: application/json' -d '{"editor_modes":{"ghost":"manual"}}'` → 400 `invalid-resort` with refinement in `details`.
- [ ] **Step 4:** Surface to maintainer.

---

## Tier 3 → Tier 4 gate closeout (after PR 4.4d merges)

Per spec §7.4, on `main`:

1. **Editor opens for both seed slugs** — verified by gate-closing local-test plan.
2. **MANUAL edit round-trips through PUT; reload preserves state** — verified by gate-closing plan.
3. **Bridge integration test green** — verified by `npm run test:integration`.
4. **`editor_modes` cross-key invariant rejects malformed PUTs** — verified by `apps/admin/server/__tests__/resortUpsert.test.ts` ghost-path case + manual `curl`.

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

**End of plan.**
