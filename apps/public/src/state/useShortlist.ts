import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'

import { setURLState, useURLState } from './useURLState'

// Spec §6.1 + plan step 5.4 contract:
//   - URL is the source of truth; localStorage `sta-shortlist-last-known`
//     is a one-shot hydration channel + a collision side-channel. Never a
//     sync mechanism.
//   - Mount: parse URL `&shortlist=`. Absent → hydrate from LS by writing
//     LS into the URL (so back/forward navigation, share-link copy, and
//     in-page reads all see the same data).
//   - On URL change (post-mount): mirror the URL value into LS.
//   - Collision detection: when both URL and LS have non-empty payloads on
//     mount AND the sets differ, surface a `pendingCollision` so the
//     consumer renders MergeReplaceDialog. Order-only differences are
//     suppressed silently — URL order wins.
//   - Setters: `toggle(slug)`, `add(slug)`, `remove(slug)`. The 6-cap +
//     dedupe live in lib/urlState.ts; the hook appends and trusts the URL
//     layer to truncate.
//   - Collision actions: `acceptUrl()` (Replace), `keepStored()` (Keep
//     mine — writes stored back to URL), `merge()` (URL ∪ stored, URL
//     order first, head-truncate to 6).

const STORAGE_KEY = 'sta-shortlist-last-known'

// Persisted payload is a flat string array. The shape is loose by design —
// downstream consumers (selectors / MatrixView) operate on the URL-derived
// snapshot, not on this LS payload directly. Schema validation only guards
// against malformed third-party writes.
const StoredShortlistSchema = z.array(z.string())

const SHORTLIST_MAX = 6

export interface PendingCollision {
  urlSlugs: ReadonlyArray<string>
  storedSlugs: ReadonlyArray<string>
}

export interface UseShortlistResult {
  shortlist: ReadonlyArray<string>
  pendingCollision: PendingCollision | null
  toggle: (slug: string) => void
  add: (slug: string) => void
  remove: (slug: string) => void
  /** Replace = take URL, drop pending. */
  acceptUrl: () => void
  /** Keep mine = write stored back to URL. */
  keepStored: () => void
  /** Merge = URL order first, then unique stored extras (head-truncate to 6). */
  merge: () => void
}

export function useShortlist(): UseShortlistResult {
  const url = useURLState()
  const urlShortlist = url.shortlist
  const [pendingCollision, setPendingCollision] =
    useState<PendingCollision | null>(null)

  // First-mount hydration + collision-detection. Runs once (deps=[]). The
  // hydration effect runs in source order BEFORE the mirror effect on the
  // mount commit, so when the URL is empty + LS has slugs, the
  // setURLState({ shortlist: stored }) call here schedules a re-render
  // that flows through the mirror effect's `[urlShortlist]` dep update —
  // and the LS payload (still the same value we just hydrated from)
  // remains untouched.
  useEffect((): void => {
    const stored = readStored()
    if (urlShortlist.length === 0) {
      // URL empty → hydrate from LS. No collision possible.
      if (stored !== null && stored.length > 0) {
        setURLState({ shortlist: stored })
      }
      return
    }
    if (stored === null || stored.length === 0) {
      return
    }
    if (setEqual(urlShortlist, stored)) {
      // Same set, possibly different order: URL order silently wins.
      return
    }
    setPendingCollision({ urlSlugs: urlShortlist, storedSlugs: stored })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot mount
  }, [])

  // Mirror URL → LS on every URL change *after* mount. The mount-tick run
  // is suppressed via a ref so we never overwrite the LS payload that the
  // hydration effect just consumed. From the second commit forward the
  // mirror writes whatever the URL contains.
  const skipMirrorMountRef = useRef<boolean>(true)
  useEffect((): void => {
    if (skipMirrorMountRef.current) {
      skipMirrorMountRef.current = false
      return
    }
    writeStored(urlShortlist)
  }, [urlShortlist])

  function toggle(slug: string): void {
    if (urlShortlist.includes(slug)) {
      const next = urlShortlist.filter((s): boolean => s !== slug)
      setURLState({ shortlist: next })
      return
    }
    setURLState({ shortlist: capWithNewest([...urlShortlist, slug]) })
  }

  function add(slug: string): void {
    if (urlShortlist.includes(slug)) {
      return
    }
    setURLState({ shortlist: capWithNewest([...urlShortlist, slug]) })
  }

  function remove(slug: string): void {
    if (!urlShortlist.includes(slug)) {
      return
    }
    setURLState({
      shortlist: urlShortlist.filter((s): boolean => s !== slug),
    })
  }

  function acceptUrl(): void {
    setPendingCollision(null)
  }

  function keepStored(): void {
    if (pendingCollision === null) {
      return
    }
    setURLState({ shortlist: [...pendingCollision.storedSlugs] })
    setPendingCollision(null)
  }

  function merge(): void {
    if (pendingCollision === null) {
      return
    }
    const { urlSlugs, storedSlugs } = pendingCollision
    const seen = new Set<string>(urlSlugs)
    const union: string[] = [...urlSlugs]
    for (const slug of storedSlugs) {
      if (!seen.has(slug)) {
        seen.add(slug)
        union.push(slug)
      }
    }
    setURLState({ shortlist: union.slice(0, SHORTLIST_MAX) })
    setPendingCollision(null)
  }

  return {
    shortlist: urlShortlist,
    pendingCollision,
    toggle,
    add,
    remove,
    acceptUrl,
    keepStored,
    merge,
  }
}

function readStored(): ReadonlyArray<string> | null {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (raw === null) {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  const result = StoredShortlistSchema.safeParse(parsed)
  return result.success ? result.data : null
}

function writeStored(value: ReadonlyArray<string>): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
}

function capWithNewest(slugs: ReadonlyArray<string>): string[] {
  // Spec §6.1 "Add: dedupe, head-truncate to 6". The new slug is appended
  // at the tail; truncating from the *head* keeps the most recent 6 entries
  // and drops the oldest. (lib/urlState.ts also clamps to 6 — its
  // implementation cuts the tail; the hook owns the user-visible semantic
  // and pre-clamps before writing so the URL layer never has to discard the
  // user's most recent action.)
  if (slugs.length <= SHORTLIST_MAX) {
    return [...slugs]
  }
  return slugs.slice(slugs.length - SHORTLIST_MAX)
}

function setEqual(
  a: ReadonlyArray<string>,
  b: ReadonlyArray<string>,
): boolean {
  if (a.length !== b.length) {
    return false
  }
  const set = new Set<string>(a)
  for (const item of b) {
    if (!set.has(item)) {
      return false
    }
  }
  return true
}
