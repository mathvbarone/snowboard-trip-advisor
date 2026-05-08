import {
  Button,
  Card,
  EmptyStateLayout,
  Skeleton,
} from '@snowboard-trip-advisor/design-system'
import type { HealthResponse } from '@snowboard-trip-advisor/schema/api'
import type { JSX } from 'react'

import { useHealth } from '../state/useHealth'
import { setRoute } from '../state/useURLState'

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DashboardSkeleton(): JSX.Element {
  // 8 skeleton cards mirror the 8 HealthMetricsGrid cards so the loading-to-
  // content transition doesn't cause a jarring layout shift. Pattern matches
  // Epic 3's DatasetLoading.tsx (3 cards for its 3-card layout).
  // The <section> wrapper mirrors HealthMetricsGrid's structure; individual
  // <Skeleton> components carry role="status" + aria-busy="true" per the
  // design-system WCAG live-region pattern.
  return (
    <section aria-label="Loading dashboard">
      <Skeleton variant="card" />
      <Skeleton variant="card" />
      <Skeleton variant="card" />
      <Skeleton variant="card" />
      <Skeleton variant="card" />
      <Skeleton variant="card" />
      <Skeleton variant="card" />
      <Skeleton variant="card" />
    </section>
  )
}

function ErrorPanel({ error }: { readonly error: Error }): JSX.Element {
  return (
    <section aria-label="Dashboard error" role="alert">
      <Card>
        <p>Failed to load health data: {error.message}</p>
      </Card>
    </section>
  )
}

function ColdStartEmptyState(): JSX.Element {
  return (
    <section aria-label="No resorts yet">
      <Card>
        <EmptyStateLayout
          heading="No resorts yet"
          body={
            'To add a resort in Phase 1, see the manual-creation instructions: ' +
            'author data/admin-workspace/<slug>.json by hand — see ' +
            'docs/superpowers/specs/2026-05-01-epic-4-admin-app-design.md §10.9 ' +
            'for the full Phase 1 manual-creation steps.'
          }
        />
      </Card>
    </section>
  )
}

// Format last_published_at: null → "Never", ISO string → human-readable date.
function formatLastPublished(value: string | null): string {
  if (value === null) {
    return 'Never'
  }
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

// Format archive_size_bytes: bytes → KB or MB for readability.
function formatArchiveSize(bytes: number): string {
  if (bytes === 0) {
    return '0 B'
  }
  if (bytes < 1024) {
    return `${String(bytes)} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

type MetricCardInertProps = {
  readonly label: string
  readonly value: string | number
}

type MetricCardClickableProps = MetricCardInertProps & {
  readonly onClick: () => void
  readonly ariaLabel: string
}

type MetricCardProps = MetricCardInertProps | MetricCardClickableProps

function MetricCard(props: MetricCardProps): JSX.Element {
  if ('onClick' in props) {
    // Clickable variant: phrasing-content <span>s only — HTML5 forbids flow
    // content (incl. <dl>) inside <button>. See spec §2.2.
    // The call site composes the full aria-label (including the count) so SR
    // users hear what the action does AND the current value.
    return (
      <Card>
        <Button variant="ghost" onClick={props.onClick} aria-label={props.ariaLabel}>
          <span data-role="metric-label">{props.label}</span>
          <span data-role="metric-value">{String(props.value)}</span>
        </Button>
      </Card>
    )
  }
  return (
    <Card>
      <dl>
        <dt>{props.label}</dt>
        <dd>{String(props.value)}</dd>
      </dl>
    </Card>
  )
}

function HealthMetricsGrid({ health }: { readonly health: HealthResponse }): JSX.Element {
  // Only "Failed fields" is wired pre-Epic-5; other counter cards lack a
  // stable URL filter (see spec docs/superpowers/specs/2026-05-07-dashboard-card-click-design.md §1.2).
  return (
    <section aria-label="Health metrics">
      <MetricCard label="Resorts total" value={health.resorts_total} />
      <MetricCard label="Stale fields" value={health.resorts_with_stale_fields} />
      <MetricCard
        label="Failed fields"
        value={health.resorts_with_failed_fields}
        onClick={(): void => { setRoute({ route: 'resorts', hasFailures: true }) }}
        ariaLabel={`View resorts with failed fields. Current count: ${String(health.resorts_with_failed_fields)}.`}
      />
      <MetricCard label="Missing provenance" value={health.resorts_with_missing_provenance} />
      <MetricCard label="Corrupt workspace" value={health.resorts_with_corrupt_workspace} />
      <MetricCard label="Pending integration errors" value={health.pending_integration_errors} />
      <MetricCard label="Last published" value={formatLastPublished(health.last_published_at)} />
      <MetricCard label="Archive size" value={formatArchiveSize(health.archive_size_bytes)} />
    </section>
  )
}

// ---------------------------------------------------------------------------
// Dashboard (exported — consumed by App.tsx in §1.5)
// ---------------------------------------------------------------------------

export function Dashboard(): JSX.Element {
  const { value, error } = useHealth()

  if (error !== null) {
    return <ErrorPanel error={error} />
  }
  if (value === null) {
    return <DashboardSkeleton />
  }
  // True cold-start requires ALL health signals to be zero: no resorts, no
  // corrupt workspace files, and no integration errors. Per spec §10.9, a
  // workspace with corrupt files or active integration errors is NOT empty —
  // those signals need to be surfaced via HealthMetricsGrid, not hidden behind
  // the friendly "No resorts yet" card. pending_integration_errors is
  // hardcoded to 0 in Phase 1 (no adapters), but the gate is defensive for
  // Epic 5 adapters that may surface errors even before any resort is ingested.
  const isTrueColdStart =
    value.resorts_total === 0 &&
    value.resorts_with_corrupt_workspace === 0 &&
    value.pending_integration_errors === 0

  if (isTrueColdStart) {
    return <ColdStartEmptyState />
  }
  return <HealthMetricsGrid health={value} />
}
