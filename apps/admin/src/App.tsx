import type { JSX } from 'react'

import { useURLState } from './state/useURLState'
import { Dashboard } from './views/Dashboard'
import { ResortsTable } from './views/ResortsTable'
import { Shell } from './views/Shell'

export default function App(): JSX.Element {
  const route = useURLState()
  // PR 4.4b will add an 'editor' render branch. Pre-4.4b, an editor route
  // (which row-click in ResortsTable can produce) reaches App.tsx but has no
  // matching branch — fall through to the Dashboard. This is the documented
  // Phase 1 transition (URL contract precedes the view). The drop-invalid
  // guard in parseURL ensures only valid editor states (parseable slug) reach
  // here; a stale URL with an unknown slug rewrites to dashboard at parse time.
  return (
    <Shell>
      {route.route === 'resorts' ? <ResortsTable /> : <Dashboard />}
    </Shell>
  )
}
