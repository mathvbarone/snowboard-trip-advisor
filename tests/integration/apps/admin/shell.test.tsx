import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

// Cross-package deep import via relative path — apps/admin/package.json
// declares no `exports` map and the eslint config bans
// `@snowboard-trip-advisor/admin-app/*` deep imports. Matches the existing
// tests/integration/apps/public/ pattern.
import App from '../../../../apps/admin/src/App'

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

  it('main contains a placeholder dashboard text content (until PR 4.2 lands the real Dashboard)', (): void => {
    render(<App />)
    expect(screen.getByRole('main').textContent).toMatch(/admin/i)
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
})
