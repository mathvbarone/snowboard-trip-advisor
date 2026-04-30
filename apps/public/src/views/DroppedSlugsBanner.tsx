import type { JSX } from 'react'

import { useDataset } from '../state/useDataset'
import { useDroppedSlugs } from '../state/useDroppedSlugs'
import { useURLState } from '../state/useURLState'

// DroppedSlugsBanner — surfaces requested-but-missing shortlist slugs
// (e.g. share-link with a resort that's been removed from the dataset).
// Read-only signal: the banner auto-clears when the URL updates (the
// user toggling the offending slug off / shortening their share-link),
// so no dismiss button is needed in Phase 1.
//
// Pluralization: "1 requested resort not found" vs "N requested resorts
// not found in dataset." — short, honest copy that matches the project's
// data-transparency tone (spec §3.7).
//
// No `lang` attribute on slug entries — dropped slugs are by definition
// absent from the dataset, so we have no country code to look up. The
// raw slug is rendered as-is in the list.
//
// Element choice — `<div>` (not `<aside>`): axe-core's
// `aria-allowed-role` rule rejects `<aside role="status">` because
// `<aside>` already carries an implicit `complementary` role that
// conflicts with `status`. A neutral `<div role="status">` is the
// canonical pattern for a polite-live status region.
export default function DroppedSlugsBanner(): JSX.Element | null {
  const { slugs } = useDataset()
  const url = useURLState()
  const dropped = useDroppedSlugs(url.shortlist, slugs)
  if (dropped.size === 0) {
    return null
  }
  const message = dropped.size === 1
    ? '1 requested resort not found in dataset.'
    : `${String(dropped.size)} requested resorts not found in dataset.`
  return (
    <div
      role="status"
      aria-live="polite"
      data-region="dropped-slugs-banner"
      className="sta-dropped-slugs-banner"
    >
      <p>{message}</p>
      <ul>
        {Array.from(dropped).map((slug): JSX.Element => (
          <li key={slug}>{slug}</li>
        ))}
      </ul>
    </div>
  )
}
