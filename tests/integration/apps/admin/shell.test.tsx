import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

// Cross-package deep import via relative path — apps/admin/package.json
// declares no `exports` map and the eslint config bans
// `@snowboard-trip-advisor/admin-app/*` deep imports. Matches the existing
// tests/integration/apps/public/ pattern.
import App from '../../../../apps/admin/src/App'

describe('admin Shell render integration (PR 4.1b §2.7, spec §7.6)', (): void => {
  it('renders without errors', (): void => {
    render(<App />)
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('renders the placeholder header + nav landmarks', (): void => {
    render(<App />)
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('navigation')).toBeInTheDocument()
  })

  it('main contains a placeholder dashboard text content (until PR 4.2 lands the real Dashboard)', (): void => {
    render(<App />)
    expect(screen.getByRole('main').textContent).toMatch(/admin/i)
  })
})
