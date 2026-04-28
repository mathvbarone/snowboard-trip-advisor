import type { ResortSlug, ResortView } from '@snowboard-trip-advisor/schema'
import { use } from 'react'

import { fetchDataset } from '../lib/datasetFetch'
import { DatasetValidationError } from '../lib/errors'

import './useDataset.hmr'

/**
 * useDataset — Suspense-friendly dataset hook (React 19 `use(promise)` style).
 *
 * Module-level `cached` promise pattern (spec §4.3). Important: rejected
 * promises stay pinned (NOT cleared in .catch). Auto-clearing inside the
 * chained .catch causes "A component was suspended by an uncached promise"
 * infinite re-render loops in jsdom, because each render allocates a new
 * fetch promise into a still-unsettled boundary.
 *
 * The retry path goes through ShellErrorBoundary in App.tsx: on user click,
 * `retry()` calls `invalidateDataset()` then bumps a `retryKey` inside
 * `startTransition`, which remounts the subtree via
 * `<Fragment key={retryKey}>` — the remount is what allocates a fresh
 * `loadOnce()` call.
 *
 * The contamination regression test (useDataset.test.tsx) mirrors this
 * production retry path: unmount + invalidateDataset + fresh render.
 *
 * Spec §4.3 originally specified `cached = null` in the chained .catch;
 * this deviation was driven by the React-19 `use()` cache-discipline
 * interaction described above. Do NOT re-introduce the auto-clear without
 * verifying the suspended-by-uncached-promise loop is fixed at the React
 * side.
 *
 * `__resetForTests` is wired into apps/public/src/test-setup.ts's afterEach
 * to keep `cached` from leaking across tests. `invalidateDataset` is the
 * runtime hook used by the ShellErrorBoundary retry path. The HMR
 * side-effect lives in ./useDataset.hmr (separate file so it can be
 * excluded from coverage by glob — CLAUDE.md bans inline coverage-
 * suppression comments).
 */

type DatasetSnapshot = {
  views: ReadonlyArray<ResortView>
  slugs: ReadonlySet<ResortSlug>
}

let cached: Promise<DatasetSnapshot> | null = null

function loadOnce(): Promise<DatasetSnapshot> {
  if (cached !== null) {
    return cached
  }
  const next: Promise<DatasetSnapshot> = fetchDataset().then((result): DatasetSnapshot => {
    if (!result.ok) {
      throw new DatasetValidationError('Dataset failed validation', result.issues)
    }
    return {
      views: result.views,
      slugs: new Set(result.views.map((v): ResortSlug => v.slug)),
    }
  })
  cached = next
  // Empty terminal .catch keeps the unhandled-rejection signal off. The
  // rejection itself is observed by `use()` inside React's render
  // machinery; see the leading docblock for why we deliberately pin
  // rejected promises rather than auto-clearing `cached` here.
  next.catch((): void => {
    /* swallow — used only to suppress unhandled rejection */
  })
  return next
}

export function useDataset(): DatasetSnapshot {
  return use(loadOnce())
}

export function invalidateDataset(): void {
  cached = null
}

export function __resetForTests(): void {
  cached = null
}
