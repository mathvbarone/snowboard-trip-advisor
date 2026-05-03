import type { JSX } from 'react'

import { Shell } from './views/Shell'

// Inline DashboardPlaceholder until PR 4.2 lands the real Dashboard view.
// Per ai-clean-code-adherence §2: do not extract this until there's a
// second consumer (the real Dashboard module IS the second consumer; it
// will replace this inline element when it lands).
function DashboardPlaceholder(): JSX.Element {
  return <div>Admin (dashboard placeholder — coming in PR 4.2)</div>
}

export default function App(): JSX.Element {
  return (
    <Shell>
      <DashboardPlaceholder />
    </Shell>
  )
}
