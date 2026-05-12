import type { JSX } from 'react'

import { useURLState } from './state/useURLState'
import { Dashboard } from './views/Dashboard'
import { PublishHistory } from './views/PublishHistory'
import { ResortEditor } from './views/ResortEditor'
import { ResortsTable } from './views/ResortsTable'
import { Shell } from './views/Shell'

export default function App(): JSX.Element {
  const route = useURLState()
  // PR 4.4b lands the dedicated editor branch — the PR 4.3 stop-gap (which
  // routed editor → ResortsTable to avoid a context-loss jump back to Dashboard
  // before the editor view shipped) is replaced here. Each route renders its
  // own view; ResortEditor consumes the URL slug directly. PR 4.5d adds the
  // publishes branch — PublishHistory reads the page index from URL state.
  return (
    <Shell>
      {route.route === 'dashboard' ? <Dashboard /> : null}
      {route.route === 'resorts' ? <ResortsTable /> : null}
      {route.route === 'editor' ? <ResortEditor slug={route.slug} /> : null}
      {route.route === 'publishes' ? <PublishHistory /> : null}
    </Shell>
  )
}
