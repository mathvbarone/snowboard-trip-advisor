import {
  Card,
  EmptyStateLayout,
  Skeleton,
} from '@snowboard-trip-advisor/design-system'
import type { HealthResponse } from '@snowboard-trip-advisor/schema/api'
import type { JSX } from 'react'

import { useHealth } from '../state/useHealth'

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DashboardSkeleton(): JSX.Element {
  return (
    <section aria-label="Loading dashboard">
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
  return new Date(value).toLocaleString()
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

interface MetricCardProps {
  readonly label: string
  readonly value: string | number
}

function MetricCard({ label, value }: MetricCardProps): JSX.Element {
  return (
    <Card>
      <dl>
        <dt>{label}</dt>
        <dd>{String(value)}</dd>
      </dl>
    </Card>
  )
}

function HealthMetricsGrid({ health }: { readonly health: HealthResponse }): JSX.Element {
  // TODO(PR 4.2 §1.5 + PR 4.3): Card click navigates via URL state per spec §7.8.
  // Cards are inert in §1.4; setRoute lands in §1.5; the resorts route + filter
  // schema lands in PR 4.3 §2.3.
  return (
    <section aria-label="Health metrics">
      <MetricCard label="Resorts total" value={health.resorts_total} />
      <MetricCard label="Stale fields" value={health.resorts_with_stale_fields} />
      <MetricCard label="Failed fields" value={health.resorts_with_failed_fields} />
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
  if (value.resorts_total === 0) {
    return <ColdStartEmptyState />
  }
  return <HealthMetricsGrid health={value} />
}
