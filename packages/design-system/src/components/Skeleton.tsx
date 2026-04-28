import type { JSX } from 'react'

export type SkeletonVariant = 'line' | 'block' | 'card'

// Loading placeholder. Variant 'line' = single text line; 'block' = rectangular
// region; 'card' = full card silhouette (used by views/states/DatasetLoading
// in apps/public to compose a 3-card grid as the Suspense fallback).
//
// role="status" + aria-busy="true" + a visually-hidden "Loading…" string is
// the WCAG-recommended live-region pattern for indeterminate progress; the
// SR-only string is what screen readers actually announce.
export function Skeleton({ variant }: { variant: SkeletonVariant }): JSX.Element {
  return (
    <div
      role="status"
      aria-busy="true"
      data-variant={variant}
      className={`sta-skeleton sta-skeleton--${variant}`}
    >
      <span className="sta-visually-hidden">Loading...</span>
    </div>
  )
}
