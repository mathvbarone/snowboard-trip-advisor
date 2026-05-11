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
    // The main landmark must CONTAIN Dashboard-rendered output, not just exist.
    // Dashboard's first paint is the loading skeleton (`aria-label="Loading
    // dashboard"`); the post-resolve state is the cold-start empty state
    // (`aria-label="No resorts yet"`). Either is valid evidence that App
    // mounted Dashboard inside Shell rather than the removed placeholder.
    render(<App />)
    const main = screen.getByRole('main')
    const loading = screen.queryByLabelText(/loading dashboard/i)
    const coldStart = screen.queryByLabelText(/no resorts yet/i)
    expect(loading ?? coldStart).not.toBeNull()
    expect(main).toContainElement(loading ?? coldStart)
  })

  it('renders Dashboard (cold-start empty state) when URL has ?route=dashboard', (): void => {
    window.history.replaceState({}, '', '/?route=dashboard')
    render(<App />)
    // Same disambiguation as the default-route test: assert the Dashboard
    // subtree is present inside <main>, not just that the landmark exists.
    const main = screen.getByRole('main')
    const loading = screen.queryByLabelText(/loading dashboard/i)
    const coldStart = screen.queryByLabelText(/no resorts yet/i)
    expect(loading ?? coldStart).not.toBeNull()
    expect(main).toContainElement(loading ?? coldStart)
    window.history.replaceState({}, '', '/')
  })

  it('renders ResortsTable when URL has ?route=resorts', (): void => {
    window.history.replaceState({}, '', '/?route=resorts')
    render(<App />)
    // The resorts branch must mount ResortsTable (not Dashboard). The Dashboard
    // skeleton's "Loading dashboard" aria-label being absent disambiguates the
    // two — Dashboard would surface either that loading state or its
    // health-metrics section. ResortsTable's own subtree carries the
    // "Loading resorts" or "Resorts list" aria-label depending on resolve order.
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.queryByLabelText(/loading dashboard/i)).toBeNull()
    expect(screen.queryByLabelText(/health metrics/i)).toBeNull()
    window.history.replaceState({}, '', '/')
  })

  it('renders ResortEditor on editor route (PR 4.4b)', (): void => {
    // PR 4.4b replaces the PR 4.3 stop-gap (which kept ResortsTable mounted on
    // the editor route to avoid a context-loss jump back to Dashboard). The
    // editor branch now mounts <ResortEditor slug={route.slug} />; useResortDetail
    // suspends on first render so the synchronous evidence is the inline
    // Suspense fallback (`role="status"` + "Loading…"). Dashboard and
    // ResortsTable subtrees MUST NOT render on the editor route.
    window.history.replaceState({}, '', '/?route=editor&slug=kotelnica-bialczanska')
    render(<App />)
    expect(screen.getByRole('main')).toBeInTheDocument()
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Loading…')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(screen.queryByLabelText(/loading dashboard/i)).toBeNull()
    expect(screen.queryByLabelText(/health metrics/i)).toBeNull()
    expect(screen.queryByRole('table')).toBeNull()
    window.history.replaceState({}, '', '/')
  })
})
