import { Shell } from '@snowboard-trip-advisor/design-system'
import {
  Component,
  Fragment,
  Suspense,
  lazy,
  startTransition,
  useState,
  type JSX,
  type ReactNode,
} from 'react'

import { onDatasetError } from './lib/errors'
import { invalidateDataset, useDataset } from './state/useDataset'
import { useDocumentMeta } from './state/useDocumentMeta'
import { useURLState } from './state/useURLState'
import CardsView from './views/cards'
import type DetailDrawerType from './views/detail'
import DroppedSlugsBanner from './views/DroppedSlugsBanner'
import ShortlistDrawer from './views/ShortlistDrawer'
import DatasetLoading from './views/states/DatasetLoading'
import DatasetUnavailable from './views/states/DatasetUnavailable'

// Lazy-imported routes — code-split by view + the detail overlay. The lazy
// imports work as soon as the stub files exist; PR 3.4 fills matrix.tsx and
// PR 3.5 fills detail.tsx.
const MatrixView = lazy(
  (): Promise<{ default: () => JSX.Element }> => import('./views/matrix'),
)
const DetailDrawer = lazy(
  (): Promise<{ default: typeof DetailDrawerType }> => import('./views/detail'),
)

type BoundaryState = { hasError: boolean; retryKey: number; error: Error | undefined }

// ShellErrorBoundary is intentionally inlined in this file (spec §2.3 — the
// AppShell wrapper file was dropped). It is exported so the test suite can
// drive `getDerivedStateFromError` directly without rendering a child that
// throws synchronously during initial mount.
export class ShellErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  override state: BoundaryState = { hasError: false, retryKey: 0, error: undefined }

  static getDerivedStateFromError(error: Error): Partial<BoundaryState> {
    return { hasError: true, error }
  }

  override componentDidCatch(err: Error): void {
    onDatasetError(err)
  }

  retry = (): void => {
    invalidateDataset()
    startTransition((): void => {
      this.setState((s): BoundaryState => ({
        hasError: false,
        retryKey: s.retryKey + 1,
        error: undefined,
      }))
    })
  }

  override render(): JSX.Element {
    if (this.state.hasError) {
      return <DatasetUnavailable error={this.state.error} onRetry={this.retry} />
    }
    return <Fragment key={this.state.retryKey}>{this.props.children}</Fragment>
  }
}

function AppContent(): JSX.Element {
  // useDataset() suspends, so AppContent must live inside the Suspense
  // boundary mounted by App() below. useURLState() is read here because the
  // detail overlay's slug-existence check depends on the dataset's slug set
  // — co-locating the two reads keeps the gate atomic.
  const url = useURLState()
  // Mirror URL state into <title> and <link rel="canonical"> so SPA route
  // changes (?view=matrix, future sort/filter shares, etc.) keep document
  // metadata in sync. Hook is effect-based; spec §3.7 + §6.1.
  useDocumentMeta(url)
  const { slugs, views } = useDataset()
  const View = url.view === 'matrix' ? MatrixView : CardsView
  // The dataset slug set is widened to ReadonlySet<string> for the lookup —
  // url.detail is a plain string parsed off the query, ResortSlug is a
  // brand-narrowed string. After the .has() guard the slug is known to be a
  // real dataset key; we project it back into ResortSlug via the dataset's
  // own ResortView (whichever view's slug equals url.detail). This keeps the
  // brand-cast lint rule (no `as ResortSlug`) intact.
  const wide: ReadonlySet<string> = slugs
  const detailMatch =
    url.detail !== undefined && wide.has(url.detail)
      ? views.find((v): boolean => v.slug === url.detail)
      : undefined
  // ShortlistDrawer takes controlled open/onOpenChange props (PR 3.3
  // contract; the panel is reusable in PR 3.5's matrix-view route too).
  // PR 3.4 will lift these into HeaderBar's shortlist trigger when Shell
  // composes HeaderBar; until then App.tsx owns the state.
  const [shortlistOpen, setShortlistOpen] = useState<boolean>(false)
  return (
    <>
      <DroppedSlugsBanner />
      <View />
      {detailMatch !== undefined ? <DetailDrawer slug={detailMatch.slug} /> : null}
      <ShortlistDrawer
        open={shortlistOpen}
        onOpenChange={setShortlistOpen}
      />
    </>
  )
}

export default function App(): JSX.Element {
  return (
    <Shell>
      <ShellErrorBoundary>
        <Suspense fallback={<DatasetLoading />}>
          <AppContent />
        </Suspense>
      </ShellErrorBoundary>
    </Shell>
  )
}
