import {
  Button,
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from '@snowboard-trip-advisor/design-system'
import type { ResortSlug } from '@snowboard-trip-advisor/schema'
import type { ResortDetailResponse } from '@snowboard-trip-advisor/schema/api'
import {
  Component,
  Suspense,
  startTransition,
  useState,
  type JSX,
  type ReactNode,
} from 'react'

import { ApiClientError } from '../lib/apiClient'
import { invalidateResortDetail, useResortDetail } from '../state/useResortDetail'
import { setRoute } from '../state/useURLState'

import { MetricPanel } from './ResortEditor/MetricPanel'

// PR 4.4b §D1 / §D4 — co-located EditorErrorBoundary + per-route Suspense.
// The boundary is `key`-bumped on Retry so its state.error resets via remount,
// avoiding the prevProps !== this.props comparison the plan's v9 sketch used
// (over-broad and makes coverage of componentDidUpdate awkward; remount-on-retry
// is the simpler invariant). The Back affordance routes back to /resorts and
// simultaneously invalidates the slug cache so the next visit re-fetches.

interface ResortEditorProps {
  readonly slug: ResortSlug
}

export function ResortEditor({ slug }: ResortEditorProps): JSX.Element {
  const [retryKey, setRetryKey] = useState(0)
  const onRetry = (): void => {
    startTransition((): void => {
      invalidateResortDetail(slug)
      setRetryKey((k): number => k + 1)
    })
  }
  const onBack = (): void => {
    invalidateResortDetail(slug)
    setRoute({ route: 'resorts' })
  }
  return (
    <EditorErrorBoundary key={retryKey} slug={slug} onRetry={onRetry} onBack={onBack}>
      <Suspense fallback={<div role="status" aria-live="polite">Loading…</div>}>
        <ResortEditorBody slug={slug} />
      </Suspense>
    </EditorErrorBoundary>
  )
}

// ResortEditorBody owns the Suspense `use()` call and nothing else — keeping
// its hook list minimal sidesteps a React 19 hook-count race during the Retry
// flow, where the prior render's `use()` throw and the next render's `useState`
// would mismatch hook indices when the boundary remounts mid-transition.
// State (active tab) lives in ResortEditorTabs, which only mounts AFTER `use()`
// has resolved synchronously.
function ResortEditorBody({ slug }: { readonly slug: ResortSlug }): JSX.Element {
  const detail = useResortDetail(slug)
  return <ResortEditorTabs detail={detail} />
}

function ResortEditorTabs({
  detail,
}: {
  readonly detail: ResortDetailResponse
}): JSX.Element {
  const [active, setActive] = useState<string>('durable')
  return (
    <Tabs value={active} onValueChange={setActive} label="Editor sections">
      <TabList>
        <Tab value="durable">Durable</Tab>
        <Tab value="live">Live</Tab>
      </TabList>
      <TabPanel value="durable">
        <MetricPanel kind="durable" field_states={detail.field_states} />
      </TabPanel>
      <TabPanel value="live">
        <MetricPanel kind="live" field_states={detail.field_states} />
      </TabPanel>
    </Tabs>
  )
}

interface BoundaryProps {
  readonly slug: ResortSlug
  readonly onRetry: () => void
  readonly onBack: () => void
  readonly children: ReactNode
}

interface BoundaryState {
  readonly error: ApiClientError | null
}

class EditorErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  public override state: BoundaryState = { error: null }

  public static getDerivedStateFromError(err: unknown): BoundaryState {
    if (err instanceof ApiClientError) {
      return { error: err }
    }
    // Defensive: useResortDetail / apiClient throws ApiClientError on the failure
    // paths we model; anything else is unexpected (component bug, schema-parse
    // miss, etc.) and lands on the generic-fallback render branch below.
    return {
      error: new ApiClientError(500, {
        error: { code: 'internal', message: String(err) },
      }),
    }
  }

  public override render(): ReactNode {
    if (this.state.error === null) {
      return this.props.children
    }
    const { error } = this.state
    const code = error.envelope.error.code
    if (code === 'not-found') {
      return (
        <div role="alert">
          <p>Resort not found.</p>
          {/* Per Codex round-16 P2-21: DS Button (raw <button> JSX is banned in
              apps/admin/src/** by eslint.config.js / RAW_HTML_ELS). */}
          <Button variant="ghost" onClick={this.props.onBack}>Back to resorts</Button>
        </div>
      )
    }
    if (code === 'workspace-corrupt') {
      return (
        <div role="alert">
          <p>
            Workspace file <code>data/admin-workspace/{this.props.slug}.json</code>{' '}
            is corrupt. Inspect the file and either repair or <code>rm</code> it
            before retrying. See server logs for details.
          </p>
          <Button variant="ghost" onClick={this.props.onBack}>Back to resorts</Button>
          <Button variant="primary" onClick={this.props.onRetry}>Retry</Button>
        </div>
      )
    }
    return (
      <div role="alert">
        <p>Error loading resort: {error.envelope.error.message}</p>
        <Button variant="primary" onClick={this.props.onRetry}>Retry</Button>
      </div>
    )
  }
}
