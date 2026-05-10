import type { ResortSlug } from '@snowboard-trip-advisor/schema'
import type { ResortDetailResponse } from '@snowboard-trip-advisor/schema/api'
import { use, useSyncExternalStore } from 'react'

import { apiClient } from '../lib/apiClient'

import './useResortDetail.hmr'

/**
 * useResortDetail — Suspense-friendly per-slug detail hook (React 19 `use()`).
 *
 * Per Decision **D3** + Codex round-9 P2-13: dual-cache shape.
 *   - `cachedPromises`: Map<ResortSlug, Promise<ResortDetailResponse>> for the
 *     first-mount Suspense path. Rejected promises stay PINNED here per
 *     ADR-0010; the chained `.catch` is empty (only suppresses
 *     unhandled-rejection signal). The retry path goes through
 *     `invalidateResortDetail(slug)` from a higher-up boundary.
 *   - `cachedFulfilled`: Map<ResortSlug, ResortDetailResponse> for the
 *     synchronous return path. Populated by the `.then` callback ONLY on
 *     success; rejections never populate this map (the `.then` resolver
 *     simply doesn't run on rejection), so ADR-0010 pinning still holds.
 *
 * Why two maps: React 19's `use(Promise.resolve(value))` does NOT return
 * synchronously. The thenable contract `(then(resolve))` enqueues resolution
 * as a microtask, so `use()` always suspends for at least one render cycle —
 * even when the value is already known (e.g. post-PUT prepopulate, post-
 * remount with cached data). The synchronous fast path skips `use()`
 * entirely when `cachedFulfilled` has the slug. PR 4.4d's
 * `useWorkspaceState.ts` calls `prepopulateResortDetail(slug, response)` on
 * successful PUT to seed both caches, avoiding a Suspense flicker between
 * save and re-render (Decision **D13**).
 */
const cachedPromises = new Map<ResortSlug, Promise<ResortDetailResponse>>()
const cachedFulfilled = new Map<ResortSlug, ResortDetailResponse>()

// Per Codex P2-C round-2 fold (PR 4.4d): cache mutations (prepopulate /
// invalidate) must wake mounted consumers so the parent (e.g.,
// `ResortEditorTabs`) re-renders and the fresh `detail.field_states`
// flows through MetricPanel → FieldRow as a new `state` prop. Without
// this, a clean PUT success would update the cache but the row would
// snap back to the stale prop on the next draft-cleared render. A
// per-slug rev counter is the minimal subscription surface that
// `useSyncExternalStore` needs — the snapshot is just a number, so
// React's referential-equality check is cheap, and only consumers of
// the bumped slug re-render.
const slugRevs = new Map<ResortSlug, number>()
const slugSubscribers = new Map<ResortSlug, Set<() => void>>()

function getSlugRev(slug: ResortSlug): number {
  return slugRevs.get(slug) ?? 0
}

function bumpSlugRev(slug: ResortSlug): void {
  slugRevs.set(slug, getSlugRev(slug) + 1)
  const subs = slugSubscribers.get(slug)
  if (subs !== undefined) {
    for (const cb of subs) { cb() }
  }
}

function subscribeSlug(slug: ResortSlug, cb: () => void): () => void {
  let set = slugSubscribers.get(slug)
  if (set === undefined) {
    set = new Set()
    slugSubscribers.set(slug, set)
  }
  set.add(cb)
  return (): void => {
    const s = slugSubscribers.get(slug)
    if (s === undefined) { return }
    s.delete(cb)
    if (s.size === 0) { slugSubscribers.delete(slug) }
  }
}

function loadOnce(slug: ResortSlug): Promise<ResortDetailResponse> {
  const existing = cachedPromises.get(slug)
  if (existing !== undefined) {
    return existing
  }
  // Chain via .then so the synchronous cache populates on resolution; on
  // rejection the .then callback never runs and cachedFulfilled stays empty
  // (ADR-0010 pinning preserved across the dual-cache shape).
  //
  // Codex P2 fold: stale-request guard. If `prepopulateResortDetail(slug,
  // newer)` lands while THIS GET is still in flight, the prepopulate replaces
  // `cachedPromises.get(slug)` with a fresh resolved promise. When the older
  // GET eventually resolves, we MUST NOT overwrite cachedFulfilled with the
  // older response — that would serve pre-PUT data to subsequent renders
  // until the next manual invalidate. Gate the write on identity: only
  // populate cachedFulfilled if `next` is still the active cache entry.
  const next: Promise<ResortDetailResponse> = apiClient.getResort(slug).then(
    (response): ResortDetailResponse => {
      if (cachedPromises.get(slug) === next) {
        cachedFulfilled.set(slug, response)
      }
      return response
    },
  )
  cachedPromises.set(slug, next)
  // Empty terminal .catch suppresses the unhandled-rejection signal; the
  // rejection itself is observed by `use()` inside React's render machinery.
  next.catch((): void => {
    /* swallow — used only to suppress unhandled rejection */
  })
  return next
}

export function useResortDetail(slug: ResortSlug): ResortDetailResponse {
  // Subscribe to slug-rev mutations so cache writes (prepopulate /
  // invalidate) wake mounted consumers and the next render reads the
  // fresh cachedFulfilled entry. The snapshot is just a number; React's
  // referential equality bypasses re-renders when nothing changed.
  useSyncExternalStore(
    (cb: () => void): (() => void) => subscribeSlug(slug, cb),
    (): number => getSlugRev(slug),
  )
  // Synchronous fast path — avoids the React-19 use(Promise.resolve) flicker.
  // `use()` is allowed in conditionals per React 19 docs.
  const fulfilled = cachedFulfilled.get(slug)
  if (fulfilled !== undefined) {
    return fulfilled
  }
  return use(loadOnce(slug))
}

export function invalidateResortDetail(slug?: ResortSlug): void {
  if (slug === undefined) {
    cachedPromises.clear()
    cachedFulfilled.clear()
    // Wake every subscribed slug so each mounted consumer re-checks the
    // (now-empty) cache and falls through to a fresh `use(loadOnce)`.
    for (const s of slugSubscribers.keys()) { bumpSlugRev(s) }
  } else {
    cachedPromises.delete(slug)
    cachedFulfilled.delete(slug)
    bumpSlugRev(slug)
  }
}

/**
 * Per **D13** + Codex round-7 P1-1 + round-9 P2-13: PR 4.4d's
 * `useWorkspaceState` calls this on successful PUT to publish the post-PUT
 * response into both caches. The synchronous `cachedFulfilled` entry is the
 * load-bearing piece — the next `useResortDetail(slug)` call returns
 * synchronously, avoiding the React-19 `use(Promise.resolve())` flicker.
 * `cachedPromises` is also updated so any concurrent Suspense reader (rare,
 * but possible if a sibling component is mid-suspend) sees the same
 * resolved data instead of an in-flight promise that would re-fetch.
 */
export function prepopulateResortDetail(slug: ResortSlug, response: ResortDetailResponse): void {
  cachedFulfilled.set(slug, response)
  cachedPromises.set(slug, Promise.resolve(response))
  bumpSlugRev(slug)
}

/** Test-only: clear both caches between tests. */
export function __resetForTests(): void {
  cachedPromises.clear()
  cachedFulfilled.clear()
  slugRevs.clear()
  slugSubscribers.clear()
}
