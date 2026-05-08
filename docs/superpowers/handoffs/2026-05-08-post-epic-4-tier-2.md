# Post-Epic-4-Tier-2 Handoff

**Date:** 2026-05-08
**Milestone closed:** Epic 4 Tiers 1 + 2 (admin foundation + navigation) + the Tier 2 → Tier 3 gate fold (PR 4.3.1).
**Next milestone:** Epic 4 Tier 3 — admin editor (PRs 4.4a / 4.4b / 4.4c / 4.4d).

**Tier 1 / Tier 2 / gate-fold PR lineage:** Tier 1 = #79 (4.1a) → #80 (4.1b) → #81 (4.1c). Tier 2 = #84 (4.2) → #85 (4.3). Gate-fold trio = #86 (PR 4.3.1 design spec — merged then pruned out in this PR per the post-milestone playbook), #87 (macOS env unblocker for the local pre-commit hook), #88 (PR 4.3.1 impl). Plan PRs #72 (Tier 1 plan) + #82 (Tier 2 plan) and the agent-discipline PR #83 are in `git log` for context but their planning artifacts are deleted in this same prune (the merged PRs + ADRs + spec are the durable record).

## TL;DR

The admin app's foundation, navigation, and gate-fold work all merged. `main` now has a runnable loopback admin (`npm run dev:admin`) with real `/api/health` + `/api/resorts` handlers, a Dashboard, a ResortsTable, and URL-state navigation including a clickable "Failed fields" Dashboard card. The next agent picks up Tier 3 (the resort editor) — which can branch parallel-capable PRs 4.4a (server read path) and 4.4b (editor view, read-only) immediately off `main`, then 4.4c → 4.4d sequentially.

## What exists on `main` after Tier 2 + the gate fold

- **`packages/schema/api/`** — typed wire contract for all 6 admin endpoints, snapshot-pinned at `__snapshots__/contract.snap`. The `publish` endpoint's `:slug` path-param is the union `z.union([ResortSlug, z.literal('__all__')])` per the all-or-nothing Phase 1 publish convention.
- **`packages/schema/src/workspaceFile.ts`** — `WorkspaceFile` Zod schema with `.passthrough()` + `editor_modes: z.partialRecord(z.enum(METRIC_FIELDS), z.enum(['manual', 'auto'])).default({})` + the cross-key `.refine()` invariant (every `editor_modes` key MUST be present in `resort.field_sources`).
- **`packages/schema/src/resortView.ts`** — `FieldStateFor<T>` (4-state discriminated union: `Live` | `Stale` | `Failed` | `Manual`) + `toFieldValue<T>` admin → public mapper. **Note:** the spec originally implied a `Resort.field_sources → FieldStateFor<T>` projection function would land in 4.1a; only the *type* shipped. Tier 3 PR 4.4a's `resortDetail` handler is the right place to extract the projection function.
- **`apps/admin/`** — Vite plugin middleware (`vite-plugin-admin-api.ts`) + dispatcher (`server/dispatch.ts`) + workspace helpers (`server/workspace.ts`) + 6 server endpoint handlers: `health` and `listResorts` are real, `resortDetail` / `resortUpsert` / `publish` / `listPublishes` are 501-stubs that ship in Tier 3 / Tier 4. Tiered MSW under `apps/admin/src/mocks/`: `server.ts` (canned for SPA unit tests) + `realHandlers.ts` (bridge for side-effect-bearing integration tests with per-test workspace tmpdir override).
- **`apps/admin/src/views/`** — `Shell`, `Dashboard` (8 cards including the clickable "Failed fields" with discriminated-union `MetricCardProps`), `ResortsTable` (sortable/filterable, with cold-start + filtered-empty states, country dropdown, hasFailures filter, Clear-filters affordance, row-click to editor route).
- **`apps/admin/src/state/`** — `useHealth`, `useResortList`, `useURLState` (`useSyncExternalStore` writer with module-scoped subscriber broadcast for programmatic `pushState` re-render — Epic 3 pattern).
- **`apps/admin/src/lib/urlState.ts`** — pure parse/serialize for routes: `dashboard` (default), `resorts` (with `country` + `hasFailures` filters), `editor` (slug-required; render branch lands in 4.4b — pre-4.4b an editor URL keeps the user on `<ResortsTable />` per §App.tsx `inResortsContext` grouping).
- **5 new design-system components** from PR 4.1c: `Sidebar`, `StatusPill` (4 variants), `Tabs`, `Popover`, `DropdownMenu`. `Button variant="ghost"` is the canonical action wrapper used by `ResortsTable` column-sort headers and the Dashboard's clickable card. The DS ships **no `.sta-*` CSS rules** — primitives rely on browser defaults; consumer apps style via `tokens.css` only.

## Spec deviations to remember

- **Discriminated-union `MetricCardProps`** (PR 4.3.1 / `4657df3`): the spec §2.2 originally specified an optional `ariaLabel` prop. Two implementer iterations hit dead-branch coverage gaps (ternary fallback unreachable; `??` v8-instrumented as a branch). The shipped form is a discriminated union — inert (label/value) vs clickable (label/value/onClick/ariaLabel, all required when clickable). The aria-label is composed at the call site to include the count: `"View resorts with failed fields. Current count: 1."`.
- **No `<dl>` inside `<button>`** (PR 4.3.1): the clickable card variant uses phrasing-content `<span>`s. Inert cards keep `<dl>/<dt>/<dd>`. HTML5 forbids flow content inside `<button>`; folded from Codex P2 on the spec PR.
- **Sidebar pathname-vs-query mismatch:** `Shell`'s sidebar links to `/`, `/resorts`, `/publishes` (pathnames) but `urlState.ts` is query-string-driven (`?route=…`). Clicking "Resorts" in the sidebar lands on `/resorts` and renders Dashboard (parseURL falls back). Pre-existing; not gate-blocking. Tier 5 polish (PR 4.6a) should reconcile.
- **`max_stale` upper-bound on staleness:** `health.ts` and `listResorts.ts` treat `ageDays > max_stale` as `never_fetched`, NOT stale. The "stale" window is strictly `default < ageDays <= max_stale` (Codex round-5 P2 fold).
- **macOS case-preserving filesystem env unblock:** PR [#87](https://github.com/mathvbarone/snowboard-trip-advisor/pull/87) (`a59006a`) made `npm run qa` exit 0 on user worktrees where `git worktree list --porcelain` and `git rev-parse --show-toplevel` disagree on case. If you create a new worktree on macOS, no special handling is needed.

## Next milestone — Epic 4 Tier 3 outline

Per spec §7.4 and §7.10–§7.13:

- **PR 4.4a — Server read path** (`apps/admin/server/resortDetail.ts` real handler + `apps/admin/server/workspace.ts` read helpers + `useResortDetail` hook with React-19 `use()` + Suspense + rejected-promise pinning per [ADR-0010](../../adr/0010-usedataset-rejected-promise-pinning.md)). **Subagent review trigger: YES** (`apps/admin/server/**` is on the load-bearing list). Parallel-capable with 4.4b.
- **PR 4.4b — Editor view (read-only)** (`apps/admin/src/views/ResortEditor.tsx` + `DurablePanel` + `LivePanel` + `FieldRow` render-mode + `ModeToggle` disabled-visible) + extends `urlState.ts` with the editor route's render branch. **Trigger:** NO. Parallel-capable with 4.4a (different files; 4.4b's tests stay on canned MSW until 4.4d's bridge tier).
- **PR 4.4c — Server write path + atomic-write** (`workspace.ts` atomic-write helper + `resortUpsert.ts` real handler with shallow-merge + the `editor_modes` cross-key invariant rejecting malformed PUTs as `400 invalid-resort`). **Trigger:** YES. Sequential after 4.4a + 4.4b.
- **PR 4.4d — Editor edit interaction** (`useWorkspaceState` + `useModeToggle` + bridge integration test `resort-editor-write.test.tsx`). **Trigger:** NO. Sequential after 4.4c.

**Tier 3 → Tier 4 gate** (after 4.4a/b/c/d merged):
- Editor opens for both seed slugs (`kotelnica-bialczanska`, `spindleruv-mlyn`); MANUAL edit round-trips through PUT; page reload preserves workspace state via `editor_modes`.
- Bridge integration test green; per-test workspace tmpdir verified to receive the atomic-written file.
- `editor_modes` cross-key invariant rejects malformed PUTs (handler test asserts `400 invalid-resort` carrying the refinement message).

## How to start verification

```bash
git checkout main
git pull
npm install
npm run setup       # regenerates tokens.css; installs hooks
npm run qa          # full chain — must exit 0
npm run dev:admin   # boots 127.0.0.1:5174
# In another shell: open http://127.0.0.1:5174 — confirm 8 dashboard cards;
# the "Failed fields" card is clickable (button name "View resorts with
# failed fields. Current count: 0.") and pushes ?route=resorts&hasFailures=true.
```

## Known gaps / forward backlog

- **`FieldStateFor<T>` projection function** missing (only the type ships); extract in 4.4a.
- **No `apps/admin` build into prod containers** (rule per [AGENTS.md §"Admin App Rules"](../../../AGENTS.md)). `apps/admin` is loopback-only.
- **Toast** deferred to PR 4.5b (first real consumer is publish success/failure).
- **Visual-Diff Workflow** (PR 4.6.x precedent: `visual:approve` label + screenshots) lands with Epic 6 PR 6.3 per AGENTS.md §"Visual-Diff Workflow".
- **Required-CODEOWNER-review on `main`** is OFF in Phase 1 (single-maintainer); the original `main` protection JSON is preserved at `/tmp/main-protection-pre-relax.json` for reference. Re-enable when a second maintainer joins.
