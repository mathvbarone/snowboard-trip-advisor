# ADR-0010: `useDataset` pins rejected promises (React 19 `use()` cache discipline)

- **Status:** Accepted
- **Date:** 2026-04-30
- **Deciders:** @mathvbarone
- **Related spec:** [`docs/superpowers/specs/2026-04-28-epic-3-public-app-design.md`](../superpowers/specs/2026-04-28-epic-3-public-app-design.md) §4.3 (the prescribed pattern this ADR deviates from)
- **Related code:** [`apps/public/src/state/useDataset.ts`](../../apps/public/src/state/useDataset.ts), [`apps/public/src/App.tsx`](../../apps/public/src/App.tsx) (`ShellErrorBoundary.retry`)

## Context

Spec §4.3 specifies a Suspense-friendly dataset hook built on React 19's `use(promise)`. The spec's reference implementation auto-clears the module-scoped cache when the underlying fetch rejects:

```ts
// spec §4.3 — prescribed shape
cached = fetchDataset()
  .then((result) => { if (!result.ok) throw new DatasetValidationError(...); return ... })
  .catch((err) => {
    cached = null                          // don't pin a rejected promise
    throw err
  })
```

The intent is reasonable: a rejected promise in the cache could starve future consumers of the chance to re-fetch. Auto-clearing in the chained `.catch` looks like the right discipline.

In practice, building this against React 19 + jsdom (the test environment) surfaced an infinite re-render loop. The reproduction:

1. The `.catch` arm runs, sets `cached = null`, and re-throws.
2. React's `use()` machinery propagates the rejection up the boundary.
3. The boundary catches the error, sets `hasError`, and re-renders.
4. The retry path (or any sibling render) calls `loadOnce()` again — `cached` is `null`, so a fresh `fetchDataset()` promise is allocated.
5. The new promise is unsettled at the moment it's read by `use()`, so React suspends.
6. React's render machinery re-runs the suspended subtree.
7. Each re-run allocates **another** fresh promise (because `cached = null` on the previous round, and React's `use()` cache for non-Cached promises is per-render-pass).
8. The console fills with `A component was suspended by an uncached promise.` warnings; render loop never settles.

The root cause is that React 19's `use()` requires the SAME promise reference across re-renders to identify a "cached" suspension. Auto-clearing inside `.catch` violates that invariant during the failure-then-retry transition. The boundary's `setState` schedules a re-render, but `loadOnce()` is called inside that render before the boundary's `<Fragment key>` remount has detached the failing subtree, so the same render generates a new promise that the same `use()` call observes as un-cached.

The retry path the spec assumes (boundary catches → user clicks retry → `invalidateDataset()` clears the cache → fresh fetch starts) works in real browsers when the boundary's `setState` is scheduled inside `startTransition` and the subtree is remounted via a `key` change. But the auto-clear-in-`.catch` short-circuits this discipline by clearing the cache during the failing render itself, which is what triggers the loop.

The fix is to keep the explicit retry path (`invalidateDataset()` + `startTransition` + `<Fragment key={retryKey}>`) and stop racing it with an automatic clear inside `.catch`. The retry path remains structurally identical to the spec's intent — the rejected promise is replaced by a fresh one, just at the moment the boundary actually wants the retry, not eagerly during the failing render.

## Decision

**`useDataset` does NOT auto-clear `cached` inside the chained `.catch`. Rejected promises stay pinned in the cache. The retry path is the explicit boundary-driven sequence: `ShellErrorBoundary.retry()` → `invalidateDataset()` → `startTransition(() => setState({ retryKey: prev + 1 }))` → `<Fragment key={retryKey}>` remount, which forces a fresh `loadOnce()` call.**

Concretely, [`apps/public/src/state/useDataset.ts`](../../apps/public/src/state/useDataset.ts) implements:

```ts
let cached: Promise<DatasetSnapshot> | null = null

function loadOnce(): Promise<DatasetSnapshot> {
  if (cached !== null) {
    return cached
  }
  const next: Promise<DatasetSnapshot> = fetchDataset().then((result) => {
    if (!result.ok) throw new DatasetValidationError('Dataset failed validation', result.issues)
    return { views: result.views, slugs: new Set(result.views.map((v) => v.slug)) }
  })
  cached = next
  // Empty terminal .catch keeps the unhandled-rejection signal off; the
  // rejection is observed by `use()` inside React's render machinery.
  next.catch(() => { /* swallow */ })
  return next
}

export function invalidateDataset(): void { cached = null }   // boundary-driven retry path
export function __resetForTests(): void { cached = null }     // afterEach hook
```

The leading docblock in the file [points back to this ADR](../../apps/public/src/state/useDataset.ts) so a future agent reading the source sees the rationale before considering a "fix."

## Consequences

### Positive

- **No infinite re-render loop.** The render path is stable across the failing-then-retry transition because the cache only changes when the boundary explicitly drives it.
- **Retry path is structurally equivalent to the spec's intent.** The user-visible behavior matches what spec §4.3 describes: rejected fetch → boundary surfaces the error → user clicks retry → fresh fetch. The only difference is *who* clears the cache (the boundary's explicit `invalidateDataset()` call vs. the chained `.catch`).
- **Boundary owns retry by design.** Co-locating the cache-clear with the boundary's `startTransition + remount` makes the discipline visible at a single call site. Reading App.tsx tells the whole retry story.
- **Tests stable.** The `useDataset.test.tsx` suite mirrors the production retry path (unmount + `invalidateDataset` + fresh render), so the test surface is what would actually run in production.
- **Reversible.** A future ADR can restore the spec's auto-clear pattern once the React `use()` semantics are verified to be loop-safe (React 19.x patch release, React 20, etc.).

### Negative / costs

- **Deviation from spec §4.3 wording.** Anyone reading the spec without the file's leading comment would expect the prescribed shape. Mitigation: this ADR + the leading comment in `useDataset.ts` carry the deviation rationale; the spec section will be amended to cite this ADR when the next spec-rev PR lands.
- **Extra empty `.catch` to suppress unhandled-rejection signal.** Without it, the promise's rejection bubbles to the runtime as an unhandled-rejection event; tests fail and prod loggers light up. The empty `.catch` is purely a side-channel suppressor — it doesn't observe the rejection (that happens inside `use()`).
- **Module-level cache survives Vite HMR.** A separate file (`useDataset.hmr.ts`) handles the HMR-driven reset because the rejected-promise pin would otherwise persist across hot reloads during development. The HMR file is coverage-excluded by glob (`vite.config.ts`), per CLAUDE.md's "no inline coverage suppression" rule.
- **Consumer discipline required.** Anything outside `ShellErrorBoundary` that needs to retry the dataset must call `invalidateDataset()` first; just re-rendering won't re-fetch. Today the only retry consumer is the boundary itself, but a future feature (manual refresh button, polling) would need to know this.

### Neutral / follow-on

- **Spec section update.** A future spec-rev PR adds a "deviation note" to §4.3 pointing at this ADR. Out of scope for this ADR PR.
- **React-side fix detection.** If/when React 19.x or React 20 fixes the suspended-by-uncached-promise loop, a verification PR can re-introduce the spec's auto-clear and confirm the loop doesn't recur. This ADR's `Status` will then move to "Superseded by ADR-NNNN" with a date.
- **Test contamination guard.** `__resetForTests` is called in `afterEach` in `apps/public/src/test-setup.ts` to clear `cached` between tests. The pinned-promise pattern made this guard load-bearing — without it, a failing test's rejected promise leaks into the next test's first render.

## Alternatives considered

### A. Spec's auto-clear pattern (rejected — root cause of the loop)

```ts
cached = fetchDataset().then(...).catch((err) => { cached = null; throw err })
```

Demonstrably loops in jsdom + React 19 RC2 / React 19.0.0; the loop trace is in the file's leading comment. Re-introducing this without verifying React's `use()` semantics have changed would re-introduce the loop.

### B. Manual settled-flag with deferred reset (rejected — added complexity for no net gain)

```ts
let cached: Promise<DatasetSnapshot> | null = null
let settled = false
// ...inside .catch: queueMicrotask(() => { if (!settled) cached = null })
```

Pushes the cache-clear to a microtask after the failing render completes. Avoids the loop but introduces a timing-dependent invariant (the microtask must run before the next `loadOnce()` call) that's hard to audit and harder to test. The boundary-driven path achieves the same goal with explicit ordering — preferred.

### C. Don't use `use()` — fall back to `useEffect + useState` (rejected — loses Suspense integration)

The whole point of the spec §4.3 design is that `useDataset()` suspends under `<Suspense>`, so `<DatasetLoading>` renders during the initial fetch without any state-management ceremony in App.tsx. Switching to effect-based loading would require manual loading/error state plumbing through every consumer.

### D. Re-architect around React Query / TanStack Query (rejected — out of project scope)

The project explicitly avoids server-state libraries in Phase 1 (one fetch, one snapshot, no incremental syncing). Adding a library to dodge a single React-quirk interaction would be disproportionate to the problem.

## Mitigation status — what protects against re-introduction

- **Leading docblock in `useDataset.ts`** explicitly forbids re-introducing the auto-clear without first verifying React's behavior. A subagent or contributor changing the file will see the warning before the diff.
- **This ADR** carries the rationale beyond the file. Project rule: significant decisions get an ADR (CLAUDE.md "Documentation Discipline"); the auto-clear deviation crosses that bar because it differs from the published spec.
- **Test contamination test** (`useDataset.test.tsx`) regression-asserts that the failing-then-retry path remounts cleanly. Re-introducing the auto-clear would break this test in CI.
