import type { ResortSlug } from '@snowboard-trip-advisor/schema'
import { useMemo } from 'react'

// Pure derivation: which URL-supplied slugs are NOT in the dataset?
// Consumed by DroppedSlugsBanner (currently a stub returning null in this PR;
// the banner copy + dismissable affordance lands later in Epic 3).
//
// The hook accepts the URL slug list and dataset slug set as arguments rather
// than reaching for them via useURLState + useDataset. That keeps the hook
// usable from a memo / selector seam in App.tsx and avoids a hidden Suspense
// dependency in components that never need it.
//
// Lookup widening: ResortSlug is a Zod-branded string (`string & { brand:
// 'ResortSlug' }`). The URL slug list is plain string. We want to look up
// each plain-string slug against the branded-Set, which TypeScript blocks
// without a cast. We avoid the brand cast (banned by ESLint) by widening the
// receiver via `Set.prototype.has.call(...)` — the runtime semantics are
// identical (Set.has does referential / SameValueZero comparison on strings),
// and the typing seam stays explicit at the boundary.
export function useDroppedSlugs(
  urlSlugs: ReadonlyArray<string>,
  datasetSlugs: ReadonlySet<ResortSlug>,
): ReadonlySet<string> {
  return useMemo((): ReadonlySet<string> => {
    const wide: ReadonlySet<string> = datasetSlugs
    const dropped = new Set<string>()
    for (const slug of urlSlugs) {
      if (!wide.has(slug)) {
        dropped.add(slug)
      }
    }
    return dropped
  }, [urlSlugs, datasetSlugs])
}
