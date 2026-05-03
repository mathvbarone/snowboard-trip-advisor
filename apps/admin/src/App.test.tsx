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

  it('renders the dashboard placeholder text inside <main>', (): void => {
    render(<App />)
    const main = screen.getByRole('main')
    expect(main.textContent).toMatch(/admin/i)
  })
})
