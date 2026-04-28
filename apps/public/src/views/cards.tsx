import { useState, type JSX } from 'react'

import { useDataset } from '../state/useDataset'
import { useURLState } from '../state/useURLState'

import { filterViews, sortViews } from './cardsSelectors'
import FilterBar, { type PriceBucket } from './FilterBar'
import Hero from './Hero'
import ResortCard from './ResortCard'

// Cards landing — composes Hero + FilterBar + a grid of ResortCard, with
// dataset projections derived from URL state (`sort`, `country`) and the
// private (non-URL) `priceBucket` filter (spec §3.1: bucketed price is a
// transient filter, not shareable).
//
// Sort + filter logic lives in `cardsSelectors` (sibling pure module) so
// branches that depend on `never_fetched` field states — unreachable
// through the seed-dataset MSW path — can be unit-tested with synthetic
// ResortView fixtures.

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
