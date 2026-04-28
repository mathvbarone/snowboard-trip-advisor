import { useState, type JSX } from 'react'

import { useDataset } from '../state/useDataset'
import { useURLState } from '../state/useURLState'

import { filterViews, sortViews } from './cardsSelectors'
import FilterBar, { type PriceBucket } from './FilterBar'
import Hero from './Hero'
import ResortCard from './ResortCard'

// CardsView composes Hero + FilterBar + a grid of ResortCard. Filter/sort
// live in `cardsSelectors.ts` so the never_fetched-handling branches stay
// testable without coverage exclusions.

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
      <ul className="sta-cards-grid" data-region="cards-grid">
        {sorted.map((view): JSX.Element => (
          <li key={view.slug} className="sta-cards-grid__item">
            <ResortCard resort={view} />
          </li>
        ))}
      </ul>
    </>
  )
}
