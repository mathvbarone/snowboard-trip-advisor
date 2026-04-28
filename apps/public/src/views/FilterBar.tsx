import { Chip, Select, type SelectOption } from '@snowboard-trip-advisor/design-system'
import type { ResortView } from '@snowboard-trip-advisor/schema'
import type { JSX, ReactNode } from 'react'

import { SORT_VALUES, type SortValue } from '../lib/urlState'
import { setURLState, useURLState } from '../state/useURLState'

// Cards-landing filter strip. Three controls + an optional slot:
//   - country chip group (URL-shared via `country` array)
//   - sort `<Select>` (URL-shared via `sort`)
//   - bucketed price `<Select>` (NOT URL-shared per spec §3.1 — private
//     filter UX; the bucket is owned by the parent CardsView)
//   - `slot?: ReactNode` filled by PR 3.4 with the cards/matrix toggle
//
// Country chip group is hidden when the dataset has ≤1 country — there's
// no useful filter to apply, and a 1-chip group is a noisy SR
// announcement. The seed dataset has 2 countries (PL + CZ); the
// chip-hidden branch is exercised in tests with a single-country
// fixture.

export type PriceBucket = 'any' | 'lo' | 'mid' | 'hi'

const SORT_LABELS: Record<SortValue, string> = {
  name: 'Name',
  price_asc: 'Price (low → high)',
  price_desc: 'Price (high → low)',
  snow_depth_desc: 'Snow depth',
}

const SORT_OPTIONS: ReadonlyArray<SelectOption> = SORT_VALUES.map(
  (v): SelectOption => ({ value: v, label: SORT_LABELS[v] }),
)

const PRICE_OPTIONS: ReadonlyArray<SelectOption> = [
  { value: 'any', label: 'Any price' },
  { value: 'lo', label: '≤ €40' },
  { value: 'mid', label: '€40–80' },
  { value: 'hi', label: '€80+' },
]

export interface FilterBarProps {
  views: ReadonlyArray<ResortView>
  priceBucket: PriceBucket
  onPriceBucketChange: (next: PriceBucket) => void
  /** Filled with cards/matrix toggle in PR 3.4; undefined here. */
  slot?: ReactNode
}

export default function FilterBar({
  views,
  priceBucket,
  onPriceBucketChange,
  slot,
}: FilterBarProps): JSX.Element {
  const url = useURLState()
  const countries = uniqueCountries(views)
  const showCountryChips = countries.length > 1
  const selectedSet = new Set(url.country)

  function toggleCountry(country: string, next: boolean): void {
    const nextSet = new Set(selectedSet)
    if (next) {
      nextSet.add(country)
    } else {
      nextSet.delete(country)
    }
    setURLState({ country: Array.from(nextSet) })
  }

  function onSortChange(next: string): void {
    // Safe cast: <option> values are SORT_OPTIONS-bound; type narrowing across
    // generic `<select>` onChange is a known TS limitation (parse-don't-cast
    // would require redundant z.parse here for no behavior change).
    setURLState({ sort: next as SortValue })
  }

  return (
    <div className="sta-filter-bar">
      {showCountryChips ? (
        <div data-region="countries">
          {countries.map((c): JSX.Element => (
            <Chip
              key={c}
              pressed={selectedSet.has(c)}
              onToggle={(next): void => {
                toggleCountry(c, next)
              }}
            >
              {c}
            </Chip>
          ))}
        </div>
      ) : null}
      <Select
        label="Sort"
        value={url.sort}
        options={SORT_OPTIONS}
        onChange={onSortChange}
      />
      <Select
        label="Price"
        value={priceBucket}
        options={PRICE_OPTIONS}
        onChange={(v): void => {
          // Safe cast: <option> values are PRICE_OPTIONS-bound; type narrowing
          // across generic `<select>` onChange is a known TS limitation
          // (parse-don't-cast would require a redundant runtime guard here for
          // no behavior change).
          onPriceBucketChange(v as PriceBucket)
        }}
      />
      {slot !== undefined ? <div data-region="slot">{slot}</div> : null}
    </div>
  )
}

function uniqueCountries(views: ReadonlyArray<ResortView>): ReadonlyArray<string> {
  const set = new Set<string>()
  for (const v of views) {
    set.add(v.country)
  }
  return Array.from(set).sort()
}
