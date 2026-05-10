// HMR-only safety net: in dev, when `useResortDetail.ts` hot-reloads, accept
// the update so Vite cleanly swaps the module. The new module body
// re-initializes its own dual cache (`cachedPromises` + `cachedFulfilled`,
// both fresh empty Maps) — no callback work needed.
//
// Excluded from coverage in apps/admin/vite.config.ts because import.meta.hot
// is undefined under vitest (the entire module body is dead code in the test
// environment). This file exists as a separate module specifically so the
// exclusion can be a whole-file glob — CLAUDE.md "Coverage Rules" bans inline
// suppression comments. Mirrors apps/public/src/state/useDataset.hmr.ts.
//
// The accept target is `./useResortDetail` (a peer module, not this file's
// own module). When useResortDetail.ts changes, Vite re-evaluates it and the
// fresh empty Maps become the new module's initial state. Importing
// `./useResortDetail` here is forbidden — it would form a cycle with the
// side-effect import in useResortDetail.ts (per Codex round-8 P2-12); the
// dependency is expressed via the string literal in the accept call instead.

if (import.meta.hot) {
  import.meta.hot.accept('./useResortDetail', (): void => {
    /* no-op — module replacement re-initializes the dual cache to fresh empty Maps */
  })
}
