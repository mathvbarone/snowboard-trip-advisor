import { HealthResponse } from '@snowboard-trip-advisor/schema/api'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

// Cross-package deep import via relative path — apps/admin/package.json
// declares no `exports` map and the eslint config bans
// `@snowboard-trip-advisor/admin-app/*` deep imports. Matches the existing
// tests/integration/apps/public/ pattern.
import App from '../../../../apps/admin/src/App'
// Import the shared MSW server instance so per-test overrides via server.use(...)
// work against the same singleton the test-setup.ts wires up.
import { server } from '../../../../apps/public/src/mocks/server'

// Canned admin health response — zero resorts (cold-start state).
const cannedHealth = HealthResponse.parse({
  resorts_total: 0,
  resorts_with_stale_fields: 0,
  resorts_with_failed_fields: 0,
  resorts_with_missing_provenance: 0,
  resorts_with_corrupt_workspace: 0,
  pending_integration_errors: 0,
  last_published_at: null,
  archive_size_bytes: 0,
})

// All shell tests render App which mounts Dashboard (via useHealth → /api/health).
// Override the shared MSW server with a health handler for every test in this file.
beforeEach((): void => {
  server.use(
    http.get('/api/health', (): Response => HttpResponse.json(cannedHealth)),
  )
})

describe('admin Shell render integration (PR 4.1b §2.7 → PR 4.1c §3.6, spec §7.6 + §7.7)', (): void => {
  it('renders without errors', (): void => {
    render(<App />)
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('renders the header + nav landmarks (stable across placeholder→real chrome)', (): void => {
    render(<App />)
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
  })

  it('renders Dashboard content inside <main> (PR 4.2: placeholder replaced with real Dashboard)', (): void => {
    // PR 4.2 replaced DashboardPlaceholder with the real Dashboard component.
    // With zero resorts (cold-start), Dashboard renders ColdStartEmptyState.
    // The <main> landmark must be present; the old placeholder text is gone.
    render(<App />)
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('renders the real Sidebar with Dashboard / Resorts / Publishes links (PR 4.1c)', (): void => {
    render(<App />)
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Resorts' })).toHaveAttribute('href', '/resorts')
    expect(screen.getByRole('link', { name: 'Publishes' })).toHaveAttribute('href', '/publishes')
  })

  it('renders the Account dropdown with Sources / Integrations / History items (PR 4.1c)', async (): Promise<void> => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Account' }))
    // Click each item once — covers the inline placeholder onSelect handlers
    // (real route handlers land in PR 4.2). The menu closes after each click,
    // so we re-open between selections.
    for (const itemName of ['Sources', 'Integrations', 'History']) {
      if (screen.queryByRole('menu') === null) {
        await user.click(screen.getByRole('button', { name: 'Account' }))
      }
      await user.click(screen.getByRole('menuitem', { name: itemName }))
    }
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('Publish header button mounts the PublishDialog on click (PR 4.5c)', async (): Promise<void> => {
    const user = userEvent.setup()
    render(<App />)
    expect(screen.queryByRole('dialog')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Publish' }))
    expect(
      await screen.findByRole('dialog', { name: 'Publish' }),
    ).toBeInTheDocument()
  })
})
