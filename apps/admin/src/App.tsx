import type { JSX } from 'react'

import { useURLState } from './state/useURLState'
import { Dashboard } from './views/Dashboard'
import { ResortsTable } from './views/ResortsTable'
import { Shell } from './views/Shell'

export default function App(): JSX.Element {
  const route = useURLState()
  // PR 4.4b will add a dedicated editor render branch. Pre-4.4b, the editor
  // route (produced by row-click in ResortsTable) keeps the user inside the
  // resorts view rather than dropping them onto the Dashboard — Codex round-4
  // P1: a Dashboard fallback on an editor URL is a context-loss jump that
  // hides the selected resort and breaks the row-click navigation flow. The
  // slug stays in the URL; PR 4.4b's editor branch will pick it up without a
  // change to ResortsTable. The `inResortsContext` shape is the canonical
  // Phase-1 grouping ("anywhere downstream of /resorts").
  const inResortsContext = route.route === 'resorts' || route.route === 'editor'
  return (
    <Shell>
      {inResortsContext ? <ResortsTable /> : <Dashboard />}
    </Shell>
  )
}
