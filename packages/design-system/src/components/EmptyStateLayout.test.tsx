import { render, screen } from '@testing-library/react'
import { axe } from 'jest-axe'
import { describe, expect, it } from 'vitest'

import { EmptyStateLayout } from './EmptyStateLayout'

describe('EmptyStateLayout', (): void => {
  it('renders heading + body with semantic structure', (): void => {
    render(
      <EmptyStateLayout
        heading="No resorts"
        body="Try removing a country filter."
      />,
    )
    expect(screen.getByRole('heading', { name: 'No resorts' })).toBeInTheDocument()
    expect(screen.getByText('Try removing a country filter.')).toBeInTheDocument()
  })

  it('renders the optional cta slot when supplied', (): void => {
    render(
      <EmptyStateLayout
        heading="Couldn't load"
        body="Network error."
        cta={<button type="button">Retry</button>}
      />,
    )
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('omits the cta region entirely when no cta prop is passed', (): void => {
    const { container } = render(
      <EmptyStateLayout heading="Empty" body="Nothing here." />,
    )
    expect(container.querySelector('[data-region="cta"]')).toBeNull()
  })

  it('renders the optional icon slot when supplied', (): void => {
    render(
      <EmptyStateLayout
        heading="x"
        body="y"
        icon={<svg data-testid="icon" />}
      />,
    )
    expect(screen.getByTestId('icon')).toBeInTheDocument()
  })

  it('renders the optional details slot when supplied', (): void => {
    render(
      <EmptyStateLayout
        heading="x"
        body="y"
        details={<span data-testid="details">debug</span>}
      />,
    )
    expect(screen.getByTestId('details')).toBeInTheDocument()
  })

  it('is axe-clean (default + with cta)', async (): Promise<void> => {
    const { container, rerender } = render(
      <EmptyStateLayout heading="Empty" body="Nothing here." />,
    )
    expect(await axe(container)).toHaveNoViolations()
    rerender(
      <EmptyStateLayout
        heading="Empty"
        body="Nothing here."
        cta={<button type="button">Refresh</button>}
      />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
