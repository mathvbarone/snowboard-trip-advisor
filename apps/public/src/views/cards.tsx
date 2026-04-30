import { useState, type JSX } from 'react'

import { useDataset } from '../state/useDataset'
import { useURLState } from '../state/useURLState'

import { filterViews, sortViews } from './cardsSelectors'
import FilterBar, { type PriceBucket } from './FilterBar'
import Hero from './Hero'
import ResortCard from './ResortCard'
import NoResorts from './states/NoResorts'

// CardsView composes Hero + FilterBar + a grid of ResortCard. Filter/sort
// live in `cardsSelectors.ts` so the never_fetched-handling branches stay
// testable without coverage exclusions.
//
// Empty-state contract (spec §4.7): when filters reduce the visible
// dataset to zero rows, render <NoResorts> in place of the grid. Hero +
// FilterBar stay mounted so the user can recover by toggling chips or
// changing the price bucket — without those affordances above the empty
// state, a stale share-link like `?country=XX` would have no in-UI
// recovery path. The validator's min:1 rule prevents the no-data-loaded
// case from reaching this component.

export default function CardsView(): JSX.Element {
  const { views } = useDataset()
  const url = useURLState()
  const [priceBucket, setPriceBucket] = useState<PriceBucket>('any')

  const filtered = filterViews(views, url.country, priceBucket)
  const sorted = sortViews(filtered, url.sort)

  return (
    <>
      <Hero />
      <FilterBar
        views={views}
        priceBucket={priceBucket}
        onPriceBucketChange={setPriceBucket}
      />
      {sorted.length === 0 ? (
        <NoResorts />
      ) : (
        <ul className="sta-cards-grid" data-region="cards-grid">
          {sorted.map((view): JSX.Element => (
            <li key={view.slug} className="sta-cards-grid__item">
              <ResortCard resort={view} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
