import { Button, EmptyStateLayout } from '@snowboard-trip-advisor/design-system'
import type { JSX } from 'react'

// Empty-result state — reachable when filters reduce the visible dataset to
// zero rows. Distinct from DatasetUnavailable: data IS loaded; the query just
// matches nothing. Plain region (no role=alert) so changing filters doesn't
// re-announce.
//
// `onClearFilters` is optional. When provided, NoResorts renders a "Clear
// filters" button via EmptyStateLayout's `cta` slot — co-locating the
// recovery affordance with the empty state. CardsView passes the handler
// only when at least one filter is active, so the button never appears in
// the no-data-loaded edge case (the validator's min:1 rule prevents that
// from reaching here anyway).
//
// Why co-locate vs. relying on FilterBar above: FilterBar hides its country
// chip group for single-country datasets (`countries.length > 1` gate),
// which strands users with a stale `?country=XX` link in the empty state
// with no in-UI recovery path. The button here works regardless of which
// filter caused the empty result and regardless of FilterBar's visible
// chip set.
export interface NoResortsProps {
  onClearFilters?: () => void
}

export default function NoResorts({
  onClearFilters,
}: NoResortsProps = {}): JSX.Element {
  const cta = onClearFilters !== undefined
    ? (
      <Button variant="secondary" onClick={onClearFilters}>
        Clear filters
      </Button>
    )
    : undefined

  return (
    <div className="sta-no-resorts">
      <EmptyStateLayout
        heading="No resorts to show"
        body="Try adjusting your filters."
        cta={cta}
      />
    </div>
  )
}
