import type { JSX } from 'react'

import { useURLState } from './state/useURLState'
import { Dashboard } from './views/Dashboard'
import { Shell } from './views/Shell'

export default function App(): JSX.Element {
  // useURLState() drives future route dispatch. PR 4.3 adds 'resorts' to
  // RouteState, at which point this becomes a switch on `route.route`.
  // Phase 1 (PR 4.2): only 'dashboard' exists; always render Dashboard.
  useURLState()
  return (
    <Shell>
      <Dashboard />
    </Shell>
  )
}
