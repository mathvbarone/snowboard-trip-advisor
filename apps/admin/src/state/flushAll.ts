import type { ResortSlug } from '@snowboard-trip-advisor/schema'

/**
 * flushAll registry — PR N.c1, spec §5.4.
 *
 * Each slug-level SlugStore (useWorkspaceState, useAnalystNoteDraft) registers
 * a single `flushAll(): Promise<void>` method here the first time the store is
 * created for a given slug. Registration sits on the SlugStore (not on any
 * React hook) so that component unmounts do NOT deregister — a slug flusher
 * must remain reachable to `flushAllForSlug` even when no component for that
 * slug is currently mounted (e.g. during row-collapse → mod+enter sequences).
 *
 * `Shell.tsx`'s `onModEnter` callback calls `void flushAllForSlug(route.slug)`
 * instead of addressing any specific hook's flushNow directly (N.c3 refactor).
 *
 * Rejection semantics (spec §5.4 + Promise.all): if any registered flusher
 * rejects, `flushAllForSlug` rejects with that reason. The caller
 * (`Shell.tsx`) wraps in try/catch. Do NOT swallow rejections here — that
 * would violate AGENTS.md "do not leave promises unhandled" and mask silent
 * save failures.
 */
const flushers: Map<ResortSlug, Set<() => Promise<void> | void>> = new Map()

/**
 * Register `fn` as a flusher for `slug`. Returns a dispose function that
 * removes `fn` from the registry and cleans up the slug entry when empty.
 */
export function registerSlugFlusher(
  slug: ResortSlug,
  fn: () => Promise<void> | void,
): () => void {
  const set = flushers.get(slug) ?? new Set()
  set.add(fn)
  flushers.set(slug, set)
  return (): void => {
    set.delete(fn)
    if (set.size === 0) { flushers.delete(slug) }
  }
}

/**
 * Call all registered flushers for `slug` in parallel via `Promise.all`.
 * Resolves when all flushers have settled. Rejects if any flusher rejects
 * (spec §5.4 — rejection-propagation; caller wraps in try/catch).
 *
 * Each flusher is scheduled via `Promise.resolve().then(fn)` so that a
 * synchronous throw inside `fn` becomes a per-flusher rejected promise rather
 * than aborting the `.map` callback. This guarantees ALL registered flushers
 * are invoked even when an earlier one throws synchronously, while still
 * propagating rejections through `Promise.all` (no rejections are swallowed).
 *
 * Returns `undefined` immediately when no flushers are registered for the slug.
 */
export async function flushAllForSlug(slug: ResortSlug): Promise<void> {
  const set = flushers.get(slug)
  if (set === undefined) { return }
  await Promise.all([...set].map((fn) => Promise.resolve().then(fn)))
}

/** Test-only: clear all module-level state between tests. */
export function __resetForTests(): void {
  flushers.clear()
}
