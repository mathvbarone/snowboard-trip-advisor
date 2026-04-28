import type { FieldValue, ResortView } from '@snowboard-trip-advisor/schema'

import type { SortValue } from '../lib/urlState'

import type { PriceBucket } from './FilterBar'

// Pure projection helpers for CardsView. Kept in a sibling module so they
// can be unit-tested directly against synthetic ResortView fixtures —
// branches involving `never_fetched` fields are unreachable through the
// published seed dataset (which has fresh values for every metric), so a
// view-level test driven by the MSW seed cannot cover them in isolation.
//
// Filter-then-sort semantics (mirrored in CardsView):
//   1. Country filter — keep resorts whose `country` matches the URL set,
//      OR (no countries selected) keep everything.
//   2. Price bucket filter — keep resorts whose `lift_pass_day.value.amount`
//      lands in the bucket. `never_fetched` is excluded from any non-`any`
//      bucket because the bucket cannot be evaluated.
//   3. Sort — applied in-place on a copy of the filtered slice. The sort
//      is stable, so equal-key resorts keep their dataset order. Resorts
//      with a `never_fetched` sort key sink to the bottom irrespective of
//      direction.

export function filterViews(
  views: ReadonlyArray<ResortView>,
  countries: ReadonlyArray<string>,
  bucket: PriceBucket,
): ReadonlyArray<ResortView> {
  return views.filter((v): boolean => {
    if (countries.length > 0 && !countries.includes(v.country)) {
      return false
    }
    return matchesBucket(v.lift_pass_day, bucket)
  })
}

export function sortViews(
  views: ReadonlyArray<ResortView>,
  sort: SortValue,
): ReadonlyArray<ResortView> {
  const copy = [...views]
  if (sort === 'name') {
    return copy.sort((a, b): number => a.name.en.localeCompare(b.name.en))
  }
  if (sort === 'price_asc') {
    return copy.sort((a, b): number => compareNumeric(amountOf(a), amountOf(b), 'asc'))
  }
  if (sort === 'price_desc') {
    return copy.sort((a, b): number => compareNumeric(amountOf(a), amountOf(b), 'desc'))
  }
  // sort === 'snow_depth_desc'
  return copy.sort((a, b): number => compareNumeric(snowOf(a), snowOf(b), 'desc'))
}

function matchesBucket(
  field: FieldValue<{ amount: number; currency: string }>,
  bucket: PriceBucket,
): boolean {
  if (bucket === 'any') {
    return true
  }
  if (field.state === 'never_fetched') {
    return false
  }
  const amount = field.value.amount
  if (bucket === 'lo') {
    return amount <= 40
  }
  if (bucket === 'mid') {
    return amount > 40 && amount <= 80
  }
  // bucket === 'hi'
  return amount > 80
}

// Returns the live price amount for a resort, or undefined if the field is
// in a never_fetched state. `stale` values are treated as live for sort
// purposes — a stale price is more informative than no price.
function amountOf(view: ResortView): number | undefined {
  if (view.lift_pass_day.state === 'never_fetched') {
    return undefined
  }
  return view.lift_pass_day.value.amount
}

function snowOf(view: ResortView): number | undefined {
  if (view.snow_depth_cm.state === 'never_fetched') {
    return undefined
  }
  return view.snow_depth_cm.value
}

function compareNumeric(
  a: number | undefined,
  b: number | undefined,
  direction: 'asc' | 'desc',
): number {
  // Push undefineds to the end regardless of direction (a resort missing the
  // sort key has no useful place in the ordering).
  if (a === undefined && b === undefined) {
    return 0
  }
  if (a === undefined) {
    return 1
  }
  if (b === undefined) {
    return -1
  }
  return direction === 'asc' ? a - b : b - a
}
