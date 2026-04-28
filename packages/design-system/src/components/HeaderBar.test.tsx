import { render, screen } from '@testing-library/react'
import { axe } from 'jest-axe'
import { describe, expect, it } from 'vitest'

import { HeaderBar } from './HeaderBar'

describe('HeaderBar', (): void => {
  it('renders a semantic <header> element (landmark role decided by context)', (): void => {
    // Don't hardcode `role="banner"` on a reusable design-system
    // component. The `banner` landmark is meant to be the single
    // top-level site header — fine when the app shell renders this
    // at the document root, broken when nested inside <main> or when
    // multiple instances exist. By using a plain semantic <header>,
    // the browser/AT assigns the implicit banner role only in the
    // correct context; nested <header>s get a generic role.
    const { container } = render(
      <HeaderBar
        brandLabel="Snowboard Trip Advisor"
        brandHref="/"
        shortlistSlot={null}
      />,
    )
    expect(container.querySelector('header')).not.toBeNull()
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
