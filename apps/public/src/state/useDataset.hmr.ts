// HMR-only safety net: in dev, when `useDataset.ts` hot-reloads, accept the
// update so Vite cleanly swaps the module (the new module body re-initializes
// its own `cached` to null naturally).
//
// Excluded from coverage in apps/public/vite.config.ts because import.meta.hot
// is undefined under vitest (the entire module body is dead code in the test
// environment). This file exists as a separate module specifically so the
// exclusion can be a whole-file glob — CLAUDE.md "Coverage Rules" bans inline
// suppression comments (the rule was written against `/* istanbul ignore */`
// but the intent covers any provider, including v8's
// `/* v8 ignore start/stop */`). See useDataset.ts header for the
// design-rationale on the cache-discipline pattern itself.
//
// The accept target is `./useDataset` (a peer module, not this file's own
// module). When useDataset.ts changes, Vite re-evaluates it and a fresh
// `cached = null` is the new module's initial state — no callback work is
// needed. Importing `./useDataset` here is forbidden (it would form a cycle
// with the side-effect import in useDataset.ts itself); the dependency is
// expressed via the string literal in the accept call instead.

if (import.meta.hot) {
  import.meta.hot.accept('./useDataset', (): void => {
    /* no-op — module replacement re-initializes cached to null naturally */
  })
}
