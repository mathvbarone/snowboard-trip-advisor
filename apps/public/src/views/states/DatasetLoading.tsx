import { Skeleton } from '@snowboard-trip-advisor/design-system'
import type { JSX } from 'react'

// Suspense fallback rendered while the dataset is in flight (spec §4.5
// "loading"). Three card silhouettes mirror the cards-view layout density,
// so the loading-to-content transition does not jolt above-the-fold layout.
//
// The wrapping <div> carries role=status + aria-busy so screen readers get
// one consolidated 'loading' announcement rather than three. Each individual
// Skeleton also carries its own role=status string — collectively that means
// the SR experience is "Loading..." spoken once on entry.
export default function DatasetLoading(): JSX.Element {
  return (
    <div
      data-testid="dataset-loading"
      role="status"
      aria-busy="true"
      className="sta-dataset-loading"
    >
      <Skeleton variant="card" />
      <Skeleton variant="card" />
      <Skeleton variant="card" />
    </div>
  )
}
