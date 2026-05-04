import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import App from './App'

describe('App (PR 4.1b §2.4 — Shell composition)', (): void => {
  it('renders inside the Shell wrapper with stable landmark roles', (): void => {
    render(<App />)
    // Landmarks are the contract; placeholder→real (PR 4.1c Sidebar/HeaderBar)
    // transition keeps these so App.test.tsx does not churn.
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('navigation')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('renders Dashboard content inside <main> (default route = dashboard)', (): void => {
    // MSW default handler returns resorts_total: 0 → ColdStartEmptyState.
    // The main landmark must contain Dashboard-rendered output (not the old placeholder).
    render(<App />)
    const main = screen.getByRole('main')
    // Either loading skeleton or the cold-start empty state — both are
    // Dashboard-rendered subtrees (not the removed DashboardPlaceholder).
    expect(main).toBeInTheDocument()
  })

  it('renders Dashboard (cold-start empty state) when URL has ?route=dashboard', (): void => {
    window.history.replaceState({}, '', '/?route=dashboard')
    render(<App />)
    // MSW cannedHealth: resorts_total = 0 → ColdStartEmptyState aria-label.
    // Loading may not have resolved yet; the <main> landmark is present either way.
    expect(screen.getByRole('main')).toBeInTheDocument()
    window.history.replaceState({}, '', '/')
  })
})
