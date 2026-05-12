import { HealthResponse } from '@snowboard-trip-advisor/schema/api'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// Cross-package deep import via relative path — apps/admin/package.json declares
// no `exports` map and the eslint config bans @snowboard-trip-advisor/admin-app/*
// deep imports. Mirrors the existing tests/integration/apps/admin/shell.test.tsx
// pattern.
import App from '../../../../apps/admin/src/App'
import { __resetForTests as resetHealth } from '../../../../apps/admin/src/state/useHealth'
import { __resetForTests as resetURLState } from '../../../../apps/admin/src/state/useURLState'
import { server } from '../../../../apps/public/src/mocks/server'

// PR 4.6b Task 4.6b-1 — canned-tier integration test for the Dashboard view.
// Mirrors apps/admin/src/views/Dashboard.tsx's branch table:
//   - error  → ErrorPanel (section aria-label="Dashboard error")
//   - null   → DashboardSkeleton (section aria-label="Loading dashboard")
//   - cold-start (resorts_total + corrupt_workspace + pending_integration_errors === 0)
//            → ColdStartEmptyState (section aria-label="No resorts yet") per §10.9
//   - otherwise → HealthMetricsGrid (section aria-label="Health metrics")
//
// Cross-cuts:
//   - "Failed fields" MetricCard click → setRoute({ route: 'resorts', hasFailures: true })
//     per spec §7.9.1 (only filter wired in Phase 1; verified by URL change).
//   - Cold-start branch boundary: corrupt_workspace > 0 must NOT collapse to the
//     friendly "No resorts yet" card — those health signals need to surface
//     through the grid per spec §10.9 ("workspace with corrupt files is NOT
//     empty").

const ZERO_HEALTH = HealthResponse.parse({
  resorts_total: 0,
  resorts_with_stale_fields: 0,
  resorts_with_failed_fields: 0,
  resorts_with_missing_provenance: 0,
  resorts_with_corrupt_workspace: 0,
  pending_integration_errors: 0,
  last_published_at: null,
  archive_size_bytes: 0,
})

const POPULATED_HEALTH = HealthResponse.parse({
  resorts_total: 4,
  resorts_with_stale_fields: 1,
  resorts_with_failed_fields: 2,
  resorts_with_missing_provenance: 0,
  resorts_with_corrupt_workspace: 0,
  pending_integration_errors: 0,
  last_published_at: '2026-05-10T08:30:00Z',
  archive_size_bytes: 2048,
})

// renderAsync drains microtasks under `act` so useHealth's effect resolves the
// MSW promise before the test assertions run. Mirrors resort-editor-read.test
// .tsx:109 — without this, the first render returns the Skeleton and assertions
// against rendered card labels miss.
async function renderAsync(node: ReactNode): Promise<ReturnType<typeof render>> {
  let view!: ReturnType<typeof render>
  await act(async (): Promise<void> => {
    view = render(node)
    for (let i = 0; i < 10; i += 1) {
      await Promise.resolve()
    }
  })
  return view
}

beforeEach((): void => {
  // Reset state modules before navigating: useURLState's history-replace must
  // happen against a fresh route AND useHealth's module-level in-flight cache
  // must be empty so each test re-fetches against its own server.use(...) handler.
  resetURLState()
  resetHealth()
  window.history.replaceState({}, '', '/')
})

afterEach((): void => {
  resetURLState()
  resetHealth()
  window.history.replaceState({}, '', '/')
})

describe('Dashboard integration (PR 4.6b Task 4.6b-1)', (): void => {
  it('cold-start (§10.9): renders the "No resorts yet" empty state when all cold-start signals are zero', async (): Promise<void> => {
    server.use(
      http.get('/api/health', (): Response => HttpResponse.json(ZERO_HEALTH)),
    )
    await renderAsync(<App />)
    expect(
      screen.getByRole('region', { name: 'No resorts yet' }),
    ).toBeInTheDocument()
    // The HealthMetricsGrid section is NOT rendered in cold-start.
    expect(screen.queryByRole('region', { name: 'Health metrics' })).toBeNull()
  })

  it('populated: renders the Health metrics grid with all 8 HealthResponse signals', async (): Promise<void> => {
    server.use(
      http.get('/api/health', (): Response => HttpResponse.json(POPULATED_HEALTH)),
    )
    await renderAsync(<App />)
    const grid = screen.getByRole('region', { name: 'Health metrics' })
    expect(grid).toBeInTheDocument()
    // The 6 counter cards + 2 formatted cards (Last published, Archive size).
    expect(within(grid).getByText('Resorts total')).toBeInTheDocument()
    expect(within(grid).getByText('Stale fields')).toBeInTheDocument()
    expect(within(grid).getByText('Failed fields')).toBeInTheDocument()
    expect(within(grid).getByText('Missing provenance')).toBeInTheDocument()
    expect(within(grid).getByText('Corrupt workspace')).toBeInTheDocument()
    expect(within(grid).getByText('Pending integration errors')).toBeInTheDocument()
    expect(within(grid).getByText('Last published')).toBeInTheDocument()
    expect(within(grid).getByText('Archive size')).toBeInTheDocument()
    // Numeric values surface for the counter cards.
    expect(within(grid).getByText('4')).toBeInTheDocument()
    // Two cards both render `0`; assert at least one occurrence (Missing
    // provenance + Corrupt workspace + Pending integration errors all 0).
    expect(within(grid).getAllByText('0').length).toBeGreaterThan(0)
    // Archive size formatted as "2.0 KB" (Dashboard formatArchiveSize).
    expect(within(grid).getByText('2.0 KB')).toBeInTheDocument()
  })

  it('click-through: "Failed fields" card click navigates to ?route=resorts&hasFailures=true', async (): Promise<void> => {
    server.use(
      http.get('/api/health', (): Response => HttpResponse.json(POPULATED_HEALTH)),
    )
    const user = userEvent.setup()
    await renderAsync(<App />)
    // The clickable variant of MetricCard wraps its content in a <button> with
    // a composed aria-label including the count (Dashboard.tsx ariaLabel).
    const failedFieldsButton = screen.getByRole('button', {
      name: /View resorts with failed fields\. Current count: 2\./,
    })
    await user.click(failedFieldsButton)
    // setRoute updates window.location via history.pushState. Reading after the
    // click verifies the URL contract that Sidebar links + deep-link reload depend on.
    expect(window.location.search).toBe('?route=resorts&hasFailures=true')
  })

  it('cold-start boundary (§10.9): corrupt_workspace > 0 surfaces the metrics grid, NOT the "No resorts yet" card', async (): Promise<void> => {
    const CORRUPT_BUT_NO_RESORTS = HealthResponse.parse({
      ...ZERO_HEALTH,
      resorts_with_corrupt_workspace: 1,
    })
    server.use(
      http.get('/api/health', (): Response => HttpResponse.json(CORRUPT_BUT_NO_RESORTS)),
    )
    await renderAsync(<App />)
    // The boundary: resorts_total === 0 but corrupt_workspace > 0 must NOT
    // collapse to ColdStartEmptyState — the health signal needs to surface.
    expect(screen.getByRole('region', { name: 'Health metrics' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'No resorts yet' })).toBeNull()
  })

  it('error: surfaces "Failed to load health data" when /api/health returns 500', async (): Promise<void> => {
    server.use(
      http.get('/api/health', (): Response =>
        HttpResponse.json(
          { error: { code: 'internal', message: 'boom' } },
          { status: 500 },
        ),
      ),
    )
    await renderAsync(<App />)
    // ErrorPanel renders <section role="alert" aria-label="Dashboard error">.
    // The explicit role="alert" overrides the implicit `region` role, so query
    // by alert + accessible name.
    expect(screen.getByRole('alert', { name: 'Dashboard error' })).toBeInTheDocument()
    expect(screen.getByText(/Failed to load health data/)).toBeInTheDocument()
  })
})
