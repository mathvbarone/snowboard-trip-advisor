import type { ResortSlug } from '@snowboard-trip-advisor/schema'
import type { AnalystNotesGetResponse } from '@snowboard-trip-advisor/schema/api'
import { use, useSyncExternalStore } from 'react'

import { apiClient } from '../lib/apiClient'

import './useAnalystNotes.hmr'

/**
 * useAnalystNotes — Suspense-friendly per-slug analyst-notes hook (React 19 `use()`).
 *
 * Per-slug variant of `useResortDetail` (Decision D3 / ADR-0010 dual-cache shape).
 *   - `cachedPromises`: Map<ResortSlug, Promise<AnalystNotesGetResponse>> for the
 *     first-mount Suspense path. Rejected promises stay PINNED here per
 *     ADR-0010; the chained `.catch` is empty (only suppresses
 *     unhandled-rejection signal). The retry path goes through
 *     `invalidateAnalystNotes(slug)` from a higher-up boundary.
 *   - `cachedFulfilled`: Map<ResortSlug, AnalystNotesGetResponse> for the
 *     synchronous return path. Populated by the `.then` callback ONLY on
 *     success; rejections never populate this map (the `.then` resolver
 *     simply doesn't run on rejection), so ADR-0010 pinning still holds.
 *
 * Why two maps: React 19's `use(Promise.resolve(value))` does NOT return
 * synchronously. The thenable contract `(then(resolve))` enqueues resolution
 * as a microtask, so `use()` always suspends for at least one render cycle —
 * even when the value is already known (e.g. post-PUT prepopulate). The
 * synchronous fast path skips `use()` entirely when `cachedFulfilled` has
 * the slug. `prepopulateAnalystNotes(slug, response)` is called on successful
 * PUT to seed both caches, avoiding a Suspense flicker between save and re-render.
 */
const cachedPromises = new Map<ResortSlug, Promise<AnalystNotesGetResponse>>()
const cachedFulfilled = new Map<ResortSlug, AnalystNotesGetResponse>()

// Per-slug rev counter + subscriber registry — mirrors useResortDetail.ts.
// Cache mutations (prepopulate / invalidate) bump the rev so mounted
// consumers re-render and read the fresh cachedFulfilled entry.
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

function loadOnce(slug: ResortSlug): Promise<AnalystNotesGetResponse> {
  const existing = cachedPromises.get(slug)
  if (existing !== undefined) {
    return existing
  }
  // Chain via .then so the synchronous cache populates on resolution; on
  // rejection the .then callback never runs and cachedFulfilled stays empty
  // (ADR-0010 pinning preserved across the dual-cache shape).
  //
  // Stale-request guard (mirrors useResortDetail.ts): if
  // `prepopulateAnalystNotes(slug, newer)` lands while THIS GET is still in
  // flight, the prepopulate replaces `cachedPromises.get(slug)` with a fresh
  // resolved promise. When the older GET eventually resolves, we MUST NOT
  // overwrite cachedFulfilled with the older response. Gate the write on
  // identity: only populate cachedFulfilled if `next` is still the active
  // cache entry.
  const next: Promise<AnalystNotesGetResponse> = apiClient.getAnalystNotes(slug).then(
    (response): AnalystNotesGetResponse => {
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

export function useAnalystNotes(slug: ResortSlug): AnalystNotesGetResponse {
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

export function invalidateAnalystNotes(slug?: ResortSlug): void {
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
 * Seed both caches with a known response for `slug`. Called on successful
 * PUT by `useAnalystNoteDraft` (N.c2) to publish the post-PUT response into
 * both caches. The synchronous `cachedFulfilled` entry is the load-bearing
 * piece — the next `useAnalystNotes(slug)` call returns synchronously,
 * avoiding the React-19 `use(Promise.resolve())` flicker. `cachedPromises`
 * is also updated so any concurrent Suspense reader sees the same resolved
 * data instead of an in-flight promise that would re-fetch.
 */
export function prepopulateAnalystNotes(slug: ResortSlug, response: AnalystNotesGetResponse): void {
  cachedFulfilled.set(slug, response)
  cachedPromises.set(slug, Promise.resolve(response))
  bumpSlugRev(slug)
}

/** Test-only: clear all module-level state between tests. */
export function __resetForTests(): void {
  cachedPromises.clear()
  cachedFulfilled.clear()
  slugRevs.clear()
  slugSubscribers.clear()
}
