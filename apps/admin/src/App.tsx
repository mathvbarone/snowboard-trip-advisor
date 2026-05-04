import type { JSX } from 'react'

import { useURLState } from './state/useURLState'
import { Dashboard } from './views/Dashboard'
import { Shell } from './views/Shell'

export default function App(): JSX.Element {
  const route = useURLState()
  // PR 4.3: switch on route.route — when ROUTE_VALUES extends with 'resorts',
  // add: {route.route === 'dashboard' ? <Dashboard /> : <ResortsTable />}
  void route // silence no-unused-vars until PR 4.3 (single-value enum)
  return (
    <Shell>
      <Dashboard />
    </Shell>
  )
}
