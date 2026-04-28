import { EmptyStateLayout } from '@snowboard-trip-advisor/design-system'
import type { JSX } from 'react'

// Empty-result state — reachable when filters reduce the visible dataset to
// zero rows. Distinct from DatasetUnavailable: data IS loaded; the query just
// matches nothing. Plain region (no role=alert) so changing filters doesn't
// re-announce.
export default function NoResorts(): JSX.Element {
  return (
    <div className="sta-no-resorts">
      <EmptyStateLayout
        heading="No resorts to show"
        body="Try adjusting your filters."
      />
    </div>
  )
}
