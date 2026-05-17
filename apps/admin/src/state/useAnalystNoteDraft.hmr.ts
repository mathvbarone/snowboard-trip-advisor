// HMR-only safety net + cross-generation flushAll deregistration for
// `useAnalystNoteDraft.ts`. Excluded from coverage in apps/admin/vite.config.ts
// (and the root vitest.config.ts) because the `import.meta.hot` block is
// undefined under vitest (dead code in the test environment). This file exists
// as a separate module specifically so the exclusion can be a whole-file glob
// — CLAUDE.md "Coverage Rules" bans inline suppression comments. The plain,
// non-hot-gated `registerHmrDisposer` latch below is still unit-tested
// directly (coverage exclusion ≠ untestable) so the load-bearing
// generation-swap logic is exercised by a real test.
//
// Why this file owns the latch (spec §5.4 — "Deregistration only fires from
// the sibling `.hmr.ts` cleanup, not from any component unmount"):
// `useAnalystNoteDraft.ts` registers a flusher into the GLOBAL `flushAll.ts`
// registry, which has NO HMR handling — its `flushers` Map survives a
// hot-reload of `useAnalystNoteDraft.ts`. Without explicit deregistration the
// OLD module's flusher leaks: the NEW module lazily registers its own and
// `flushAllForSlug` (Promise.all) would invoke BOTH, letting a stale old
// store overwrite the newer note.
//
// Vite HMR ordering this relies on: when `useAnalystNoteDraft.ts` changes,
// Vite re-evaluates the NEW module body (this `.hmr.ts` does NOT re-evaluate —
// it didn't change — so its module scope, including `previousDisposer`,
// persists across reloads). During that re-evaluation the new module calls
// `registerHmrDisposer(newDisposer)`; the latch below first invokes the
// PREVIOUS generation's disposer (removing the OLD generation's flushers from
// the registry — the old store already registered them; the new store has not
// yet, because registration is lazy on first read), then latches the new one.
// The `accept` no-op callback then lets Vite finish the swap.
//
// The accept target is `./useAnalystNoteDraft` (a peer module, not this
// file's own module). Importing `./useAnalystNoteDraft` here is forbidden —
// it would form a cycle with the side-effect/value import in
// useAnalystNoteDraft.ts (per Codex round-8 P2-12). The dependency is
// expressed via the string literal in the accept call instead, and the
// data flows the allowed direction only: `useAnalystNoteDraft.ts` imports
// `registerHmrDisposer` from here; this file imports nothing from there.

let previousDisposer: (() => void) | undefined

/**
 * Latch the current module generation's flushAll disposer. Called by
 * `useAnalystNoteDraft.ts` at module-evaluation time (including each HMR
 * re-evaluation). On every call after the first, the PREVIOUS generation's
 * disposer is invoked first — that removes the prior generation's leaked
 * `flushAll.ts` registrations — then the new generation's disposer is
 * latched for the next reload. Plain logic, unit-tested directly.
 */
export function registerHmrDisposer(disposer: () => void): void {
  if (previousDisposer !== undefined) { previousDisposer() }
  previousDisposer = disposer
}

if (import.meta.hot) {
  import.meta.hot.accept('./useAnalystNoteDraft', (): void => {
    /* no-op — the prior generation's flushAll registrations were already
       disposed by registerHmrDisposer when the new module evaluated. */
  })
}
