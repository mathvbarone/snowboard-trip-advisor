# Dashboard Card-Click Navigation — Design Spec

**Date:** 2026-05-07
**Author:** Snowboard Bot (via Opus 4.7 brainstorming session)
**Tier:** Epic 4 Tier 2 → Tier 3 gate fold (closes deferred item)
**Branch:** `epic-4/pr-4.3.1-dashboard-card-click`
**Depends on:** PR 4.3 merged (origin/main = `27b5456`).
**Related ADRs / spec sections:** [Epic 4 spec §7.4 Tier 2 → Tier 3 gate](2026-05-01-epic-4-admin-app-design.md); [§7.8 PR 4.2 deliverable list](2026-05-01-epic-4-admin-app-design.md#78-pr-42--dashboard-view--get-apihealth-endpoint).

## 0. Why this exists

Tier 2 → Tier 3 gate criterion 3 in [Epic 4 spec §7.4](2026-05-01-epic-4-admin-app-design.md) reads:

> Card-click + row-click navigation works in browser smoke (URL state updates).

PR 4.3's row-click satisfies the second half. PR 4.2's card-click was deferred during implementation: [Tier 2 plan §1.4 step 1](../plans/2026-05-03-epic-4-tier-2-navigation-plan.md) listed "(f) click on a 'Failed fields' card updates URL state" as a test case, but [Dashboard.test.tsx:5](../../../apps/admin/src/views/Dashboard.test.tsx) skipped it ("deferred to §1.5") and §1.5 shipped without folding it back in. [Dashboard.tsx:103](../../../apps/admin/src/views/Dashboard.tsx) still carries the stale `TODO(PR 4.2 §1.5 + PR 4.3)`. This spec closes the gap with a minimal fold so Tier 3 work can open against a clean gate.

## 1. Scope

### 1.1 In scope

- The "Failed fields" `MetricCard` becomes clickable; click pushes `?route=resorts&hasFailures=true` via `setRoute`.
- The deferred test (f) is added.
- The stale `TODO` and the deferred-test comment block are removed.

### 1.2 Out of scope (intentional)

- Other counter cards (`Stale fields`, `Missing provenance`, `Corrupt workspace`, `Pending integration errors`, `Last published`, `Archive size`) stay inert. The current URL schema in [`apps/admin/src/lib/urlState.ts`](../../../apps/admin/src/lib/urlState.ts) only supports `country` + `hasFailures` filters; wiring the other cards would require schema extension + handler-side filter implementation, which is properly Tier 4 / Tier 5 work.
- Sidebar pathname-vs-query mismatch (sidebar nav uses `/`, `/resorts`, `/publishes`; `urlState.ts` uses `?route=…`). Pre-existing; tracked separately, not gate-blocking.
- Any change to `apps/admin/server/listResorts.ts` — the `hasFailures` filter is already implemented per PR 4.3.
- Any change to `urlState.ts` — `?route=resorts&hasFailures=true` is already a valid serialization.

## 2. Architecture

### 2.1 File surface

| File | Change | Concern |
|---|---|---|
| `apps/admin/src/views/Dashboard.tsx` | Modify | `MetricCard` gains optional `onClick`; "Failed fields" card passes `onClick`. Stale TODO + comment removed. |
| `apps/admin/src/views/Dashboard.test.tsx` | Modify | Test (f) added; deferred-test header comment dropped. |

Two files. No schema, no handler, no design-system primitive.

### 2.2 `MetricCard` behavior

```tsx
interface MetricCardProps {
  readonly label: string
  readonly value: string | number
  readonly onClick?: () => void
  readonly ariaLabel?: string
}
```

When `onClick` is provided, `MetricCard` renders a `<Button variant="ghost">` (existing design-system primitive) wrapping the `<dl>`. When `onClick` is undefined, the current `<Card><dl>...</dl></Card>` rendering stays unchanged. The `ariaLabel` lets the caller override the default name (the inner `<dt>` text might not be sufficient for an aria-name on the button — e.g., screen readers should hear "View resorts with failed fields", not just "Failed fields 1"). Default `ariaLabel` falls back to `label` if not supplied.

Why a `Button` from the design-system rather than a raw `<button>`: the project's UI rules forbid raw HTML elements where a design-system component exists ([AGENTS.md §"UI Code Rules"](../../../AGENTS.md)). The `Button` primitive is used elsewhere as a navigation trigger (e.g. column-sort headers in `ResortsTable.tsx`).

### 2.3 Only the "Failed fields" card is wired

Inside `HealthMetricsGrid`, only the failed-fields card invokes `setRoute`:

```tsx
<MetricCard
  label="Failed fields"
  value={health.resorts_with_failed_fields}
  onClick={(): void => { setRoute({ route: 'resorts', hasFailures: true }) }}
  ariaLabel="View resorts with failed fields"
/>
```

A short comment in `HealthMetricsGrid` documents that the other 7 cards stay inert by design and points to this spec.

## 3. Data flow

```
User click on "Failed fields" card
  → MetricCard's <Button> onClick fires
  → setRoute({ route: 'resorts', hasFailures: true })
  → serializeURL → "?route=resorts&hasFailures=true"
  → window.history.pushState + cachedSearch=null + notify()
  → useSyncExternalStore subscribers re-read window.location.search
  → App.tsx re-renders; route.route === 'resorts' so inResortsContext = true
  → <ResortsTable /> mounts (replacing <Dashboard />)
  → useURLState reads hasFailures: true
  → useResortList({ filter: { hasFailures: true }, page: { offset: 0, limit: 50 } })
  → GET /api/resorts?filter[hasFailures]=true
  → listResorts.ts filters via existing hasFailures branch
  → Table renders only resorts with failed_field_count > 0
```

Every step uses existing infrastructure. The new code is the click handler + the `onClick` prop in `MetricCard`.

## 4. Tests (TDD)

Per [AGENTS.md §"TDD Workflow"](../../../AGENTS.md), tests are written FIRST.

### 4.1 New test in `Dashboard.test.tsx`

```ts
it('pushes ?route=resorts&hasFailures=true when the "Failed fields" card is clicked', async (): Promise<void> => {
  server.use(
    http.get('/api/health', (): Response =>
      HttpResponse.json({
        resorts_total: 3,
        resorts_with_stale_fields: 0,
        resorts_with_failed_fields: 1,
        resorts_with_missing_provenance: 0,
        resorts_with_corrupt_workspace: 0,
        pending_integration_errors: 0,
        last_published_at: null,
        archive_size_bytes: 0,
      }),
    ),
  )

  render(<Dashboard />)
  await waitFor((): void => {
    expect(screen.getByRole('button', { name: /view resorts with failed fields/i })).toBeInTheDocument()
  })

  await userEvent.click(screen.getByRole('button', { name: /view resorts with failed fields/i }))

  expect(window.location.search).toBe('?route=resorts&hasFailures=true')
})
```

A `beforeEach`/`afterEach` resets `window.history.replaceState({}, '', '/')` AND calls `__resetForTests` from `useURLState` so the URL doesn't bleed across tests.

### 4.2 Coverage discipline

The new branch in `MetricCard` (the `onClick !== undefined` path) is exercised by the click-through test. The `onClick === undefined` path stays exercised by the existing 7 inert cards in the resolved-state test. 100% lines / branches / functions / statements per [AGENTS.md §"Coverage Rules"](../../../AGENTS.md) is held.

### 4.3 `axe` clean

The new clickable `MetricCard` must pass `axe` in the resolved state. The resolved-state test already runs `axe`; the click-through test adds an `axe` assertion before the click and after the navigation re-render so the post-click DOM stays a11y-clean.

## 5. Backwards compatibility / regressions

- The `onClick` prop is optional. The 7 inert cards keep their existing render path. No visual change.
- The Failed-fields card now renders as a button (visual treatment via `Button variant="ghost"`). Reviewers should check the variant blends with the surrounding card grid; a token-only adjustment (no new tokens) is expected.
- No URL contract change. The `?route=resorts&hasFailures=true` shape was already valid as of PR 4.3.

## 6. Documentation drift to fold

In the same PR (Epic 4 PR-sizing rule lets readme/memory drift ride with the feature):

- Remove [Dashboard.tsx:103-105](../../../apps/admin/src/views/Dashboard.tsx) stale `TODO(PR 4.2 §1.5 + PR 4.3)`.
- Remove [Dashboard.test.tsx:5-6](../../../apps/admin/src/views/Dashboard.test.tsx) "Test (f) … is deferred to §1.5".

No README change (admin-internal feature, per spec §7.8 "README: skip"). No spec change beyond this new spec file. No memory entry.

## 7. PR sizing

- Files changed: 2 (Dashboard.tsx + Dashboard.test.tsx). Plus this spec doc, optionally folded as the planning artifact for the same PR.
- Lines added (excluding spec doc): ~30–50.
- Commits: 1 (TDD: test commit + impl commit can be combined since the test is added in the same PR-1 commit by convention; AGENTS.md §"TDD Workflow" requires the workflow, not separate commits).
- Hard ceilings (≤300 LOC, ≤5 commits, ≤8 files) all comfortably under.

## 8. Quality gate

`npm run qa` must pass. The full chain runs because `apps/admin/**` is a code path. No docs-only carve-out applies.

The 2 environmental `test:hooks` failures observed during gate verification (case-sensitivity of `Projects` vs `projects` on this user's macOS) are NOT introduced by this PR and are pre-existing; the script returns 0 so qa stays green.

## 9. Subagent review trigger

NO — `apps/admin/src/views/**` is not on the trigger path list in [AGENTS.md §"Subagent Review Discipline"](../../../AGENTS.md#subagent-review-discipline). Reviewer-discipline check passes by default for this PR.

## 10. Rollback

Per [parent spec §10.4](2026-04-22-product-pivot-design.md): rollback is `git revert <merge-sha>` directly on `main`. No downstream worktrees; no schema migration; no fixture change.

## 11. Done definition

- [ ] Test (f) added and red against current `main`.
- [ ] `MetricCard` accepts optional `onClick` + `ariaLabel`.
- [ ] "Failed fields" card wired with `setRoute({ route: 'resorts', hasFailures: true })`.
- [ ] Stale TODO + deferred-test comment removed.
- [ ] `npm run qa` green.
- [ ] Browser smoke: clicking "Failed fields" on a populated dashboard updates URL bar to `?route=resorts&hasFailures=true` AND ResortsTable mounts with the filter applied.
- [ ] PR opened, `@codex review` posted, local-test plan executed (per memory `feedback_codex_review_per_pr.md` + `feedback_local_test_per_pr.md`).
