import type { JSX } from 'react'

import { useDataset } from '../state/useDataset'

// Placeholder — PR 3.2 ships the real card grid, sort/filter affordances,
// and the live status badge. PR 3.1c only mounts the data path so App.tsx
// composition + Suspense fallback transition are exercised end-to-end.
export default function CardsView(): JSX.Element {
  const { views } = useDataset()
  return <p data-testid="cards-placeholder">{`Resort count: ${String(views.length)}`}</p>
}
