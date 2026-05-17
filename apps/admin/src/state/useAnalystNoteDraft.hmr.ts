// HMR-only safety net: in dev, when `useAnalystNoteDraft.ts` hot-reloads,
// accept the update so Vite cleanly swaps the module. The new module body
// re-initializes its own `slugStores` Map (fresh empty Map) — no callback
// work needed.
//
// Excluded from coverage in apps/admin/vite.config.ts (and the root
// vitest.config.ts) because import.meta.hot is undefined under vitest (the
// entire module body is dead code in the test environment). This file exists
// as a separate module specifically so the exclusion can be a whole-file
// glob — CLAUDE.md "Coverage Rules" bans inline suppression comments.
// Mirrors apps/admin/src/state/useAnalystNotes.hmr.ts.
//
// The accept target is `./useAnalystNoteDraft` (a peer module, not this
// file's own module). When useAnalystNoteDraft.ts changes, Vite re-evaluates
// it and the fresh empty Map becomes the new module's initial state.
// Importing `./useAnalystNoteDraft` here is forbidden — it would form a cycle
// with the side-effect import in useAnalystNoteDraft.ts (per Codex round-8
// P2-12); the dependency is expressed via the string literal in the accept
// call instead.

if (import.meta.hot) {
  import.meta.hot.accept('./useAnalystNoteDraft', (): void => {
    /* no-op — module replacement re-initializes slugStores to a fresh empty Map */
  })
}
