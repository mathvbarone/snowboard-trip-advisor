// Dashboard view tests — PR 4.2 §1.4
// Covers (a) loading state, (b) resolved state (8 HealthResponse fields),
// (c) cold-start empty state (resorts_total === 0), (d) error state,
// (e) axe-clean across all 4 states.
// Test (f) — click on "Failed fields" card updates URL state — is deferred
// to §1.5 (setRoute / useURLState don't exist yet).

import { render, screen, waitFor } from '@testing-library/react'
import { axe } from 'jest-axe'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { server } from '../mocks/server'
import { __resetForTests } from '../state/useHealth'

import { Dashboard } from './Dashboard'

// Mirror the hook's beforeEach/afterEach reset discipline from useHealth.test.ts
// so in-flight promise state never bleeds between tests.
beforeEach((): void => {
  __resetForTests()
})
afterEach((): void => {
  __resetForTests()
  server.resetHandlers()
})

describe('Dashboard (PR 4.2 §1.4)', (): void => {
  // ---------------------------------------------------------------------------
  // (a) Loading state — renders skeleton while fetch is in-flight
  // ---------------------------------------------------------------------------
  it('renders a loading skeleton before the fetch resolves', async (): Promise<void> => {
    // useHealth starts in the { value: null, error: null } state synchronously
    // (before the first microtask tick), so the skeleton is visible immediately
    // on the first render. No need to hold the server response in-flight.
    const { container } = render(<Dashboard />)

    // The skeleton ARIA pattern: 8 cards, each role="status" + aria-busy="true",
    // to match the 8 HealthMetricsGrid cards and prevent layout shift on resolve.
    const skeletons = screen.getAllByRole('status')
    expect(skeletons).toHaveLength(8)
    expect(skeletons[0]).toHaveAttribute('aria-busy', 'true')

    // axe (e) — loading state
    expect(await axe(container)).toHaveNoViolations()
  })

  // ---------------------------------------------------------------------------
  // (b) Resolved state — all 8 HealthResponse field labels visible
  // Also exercises formatLastPublished (non-null ISO string → formatted date)
  // and formatArchiveSize (KB branch: 102400 bytes).
  // ---------------------------------------------------------------------------
  it('renders all 8 HealthResponse field labels when resolved', async (): Promise<void> => {
    server.use(
      http.get('/api/health', (): Response =>
        HttpResponse.json({
          resorts_total: 5,
          resorts_with_stale_fields: 2,
          resorts_with_failed_fields: 1,
          resorts_with_missing_provenance: 0,
          resorts_with_corrupt_workspace: 0,
          pending_integration_errors: 3,
          last_published_at: '2026-04-26T08:00:00Z',
          archive_size_bytes: 102400,
        }),
      ),
    )

    const { container } = render(<Dashboard />)

    await waitFor((): void => {
      expect(screen.getByText(/resorts total/i)).toBeInTheDocument()
    })

    expect(screen.getByText(/resorts total/i)).toBeInTheDocument()
    expect(screen.getByText(/stale fields/i)).toBeInTheDocument()
    expect(screen.getByText(/failed fields/i)).toBeInTheDocument()
    expect(screen.getByText(/missing provenance/i)).toBeInTheDocument()
    expect(screen.getByText(/corrupt workspace/i)).toBeInTheDocument()
    expect(screen.getByText(/pending integration errors/i)).toBeInTheDocument()
    expect(screen.getByText(/last published/i)).toBeInTheDocument()
    expect(screen.getByText(/archive size/i)).toBeInTheDocument()

    // axe (e) — resolved state
    expect(await axe(container)).toHaveNoViolations()
  })

  // Exercises formatLastPublished (null → "Never") and remaining archive size
  // branches: 0 B, < 1 KB (bytes), and MB (> 1 MB).
  it('renders "Never" for null last_published_at and correct size formatting', async (): Promise<void> => {
    // null last_published_at → "Never", 0 archive_size_bytes → "0 B"
    server.use(
      http.get('/api/health', (): Response =>
        HttpResponse.json({
          resorts_total: 2,
          resorts_with_stale_fields: 0,
          resorts_with_failed_fields: 0,
          resorts_with_missing_provenance: 0,
          resorts_with_corrupt_workspace: 0,
          pending_integration_errors: 0,
          last_published_at: null,
          archive_size_bytes: 0,
        }),
      ),
    )

    render(<Dashboard />)
    await waitFor((): void => {
      expect(screen.getByText('Never')).toBeInTheDocument()
    })
    expect(screen.getByText('0 B')).toBeInTheDocument()
  })

  it('formats archive size in bytes (< 1 KB) correctly', async (): Promise<void> => {
    server.use(
      http.get('/api/health', (): Response =>
        HttpResponse.json({
          resorts_total: 2,
          resorts_with_stale_fields: 0,
          resorts_with_failed_fields: 0,
          resorts_with_missing_provenance: 0,
          resorts_with_corrupt_workspace: 0,
          pending_integration_errors: 0,
          last_published_at: '2026-04-26T08:00:00Z',
          archive_size_bytes: 512,
        }),
      ),
    )

    render(<Dashboard />)
    await waitFor((): void => {
      expect(screen.getByText('512 B')).toBeInTheDocument()
    })
  })

  it('formats archive size in MB (>= 1 MB) correctly', async (): Promise<void> => {
    server.use(
      http.get('/api/health', (): Response =>
        HttpResponse.json({
          resorts_total: 2,
          resorts_with_stale_fields: 0,
          resorts_with_failed_fields: 0,
          resorts_with_missing_provenance: 0,
          resorts_with_corrupt_workspace: 0,
          pending_integration_errors: 0,
          last_published_at: '2026-04-26T08:00:00Z',
          archive_size_bytes: 2097152,
        }),
      ),
    )

    render(<Dashboard />)
    await waitFor((): void => {
      expect(screen.getByText('2.0 MB')).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------------------
  // (c) Cold-start empty state — resorts_total === 0
  // ---------------------------------------------------------------------------
  it('renders "No resorts yet" empty-state card when resorts_total === 0', async (): Promise<void> => {
    // Default canned handler already returns resorts_total: 0 — use it as-is.
    const { container } = render(<Dashboard />)

    await waitFor((): void => {
      expect(screen.getByText(/no resorts yet/i)).toBeInTheDocument()
    })

    expect(screen.getByText(/manual-creation instructions/i)).toBeInTheDocument()

    // axe (e) — cold-start state
    expect(await axe(container)).toHaveNoViolations()
  })

  // ---------------------------------------------------------------------------
  // (d) Error state — renders error message when fetch fails
  // ---------------------------------------------------------------------------
  it('renders an error message when the health fetch fails', async (): Promise<void> => {
    server.use(
      http.get('/api/health', (): Response =>
        HttpResponse.json(
          { error: { code: 'internal', message: 'test error' } },
          { status: 500 },
        ),
      ),
    )

    const { container } = render(<Dashboard />)

    await waitFor((): void => {
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument()
    })

    // axe (e) — error state
    expect(await axe(container)).toHaveNoViolations()
  })
})
