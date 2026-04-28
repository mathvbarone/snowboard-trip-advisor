import { render, screen } from '@testing-library/react'
import { axe } from 'jest-axe'
import { describe, expect, it } from 'vitest'

import { HeaderBar } from './HeaderBar'

describe('HeaderBar', (): void => {
  it('renders inside a banner landmark', (): void => {
    render(
      <HeaderBar
        brandLabel="Snowboard Trip Advisor"
        brandHref="/"
        shortlistSlot={null}
      />,
    )
    expect(screen.getByRole('banner')).toBeInTheDocument()
  })

  it('renders the brand link with the given label and href', (): void => {
    render(
      <HeaderBar
        brandLabel="Snowboard Trip Advisor"
        brandHref="/"
        shortlistSlot={null}
      />,
    )
    const link = screen.getByRole('link', { name: 'Snowboard Trip Advisor' })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/')
  })

  it('renders the shortlist slot content', (): void => {
    render(
      <HeaderBar
        brandLabel="Snowboard Trip Advisor"
        brandHref="/"
        shortlistSlot={<button type="button">Shortlist (2)</button>}
      />,
    )
    expect(
      screen.getByRole('button', { name: 'Shortlist (2)' }),
    ).toBeInTheDocument()
  })

  it('renders the optional view-toggle slot when supplied (PR 3.4 fills it)', (): void => {
    render(
      <HeaderBar
        brandLabel="Brand"
        brandHref="/"
        shortlistSlot={null}
        viewToggleSlot={<div data-testid="view-toggle">toggle</div>}
      />,
    )
    expect(screen.getByTestId('view-toggle')).toBeInTheDocument()
  })

  it('omits the view-toggle slot when undefined', (): void => {
    const { container } = render(
      <HeaderBar
        brandLabel="Brand"
        brandHref="/"
        shortlistSlot={null}
      />,
    )
    expect(container.querySelector('[data-region="view-toggle"]')).toBeNull()
  })

  it('is axe-clean', async (): Promise<void> => {
    const { container } = render(
      <HeaderBar
        brandLabel="Snowboard Trip Advisor"
        brandHref="/"
        shortlistSlot={<button type="button">Shortlist</button>}
        viewToggleSlot={<div>cards/matrix</div>}
      />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
