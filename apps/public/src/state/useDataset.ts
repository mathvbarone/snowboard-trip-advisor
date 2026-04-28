import { use } from 'react'

import type { ResortSlug, ResortView } from '@snowboard-trip-advisor/schema'

import { fetchDataset } from '../lib/datasetFetch'
import { DatasetValidationError } from '../lib/errors'

// React 19 `use(loadOnce())` cache pattern (spec §4.3).
//
// `cached` is module-scoped so every render shares one in-flight promise; the
// .catch() clears the cache on rejection so a subsequent render can retry
// against a freshly-issued fetch. (Pinning a rejected promise causes the
// Suspense / boundary loop documented in the parent spec.)
//
// `__resetForTests` is wired into apps/public/src/test-setup.ts's afterEach.
// `invalidateDataset` is the runtime hook: ShellErrorBoundary's retry calls
// it before bumping the boundary's `key` so the next render issues a new
// fetch instead of replaying the failed promise.

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
  // Keep the rejected promise pinned in `cached` after rejection. React 19's
  // `use()` requires a stable promise identity across renders within a
  // boundary; clearing the cache from inside a chained .catch causes the
  // next render to allocate a *new* promise, which React rejects with
  // "A component was suspended by an uncached promise" and an infinite
  // re-render loop. The retry path is explicit: ShellErrorBoundary catches
  // the rejection, calls `invalidateDataset()` (which clears `cached`), and
  // bumps its `key` to remount the suspended subtree — at which point
  // loadOnce() is called fresh and issues a new fetch. This same flow makes
  // the contamination regression non-load-bearing here, because the test
  // path mirrors the runtime path: failed render → unmount or
  // invalidateDataset() → re-render with a fresh fetch. The empty terminal
  // .catch keeps the unhandled-rejection signal off — the rejection is
  // observed by `use()` inside React's render machinery.
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

// HMR-only safety net: in dev, accept module updates by clearing the cache.
// `import.meta.hot` is undefined in vitest, so this branch is never executed
// in tests. The v8-ignore comment scopes the exclusion to this 3-line block
// (rationale: vite.config.ts comment).
/* v8 ignore start */
if (import.meta.hot) {
  import.meta.hot.accept((): void => {
    cached = null
  })
}
/* v8 ignore stop */
