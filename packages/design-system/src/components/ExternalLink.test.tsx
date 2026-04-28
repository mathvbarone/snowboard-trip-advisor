import { render, screen } from '@testing-library/react'
import { axe } from 'jest-axe'
import { describe, expect, it } from 'vitest'

import { ExternalLink } from './ExternalLink'

describe('ExternalLink', (): void => {
  it('renders an <a> with the supplied href', (): void => {
    render(
      <ExternalLink href="https://example.com">Example</ExternalLink>,
    )
    expect(screen.getByRole('link', { name: 'Example' })).toHaveAttribute(
      'href',
      'https://example.com',
    )
  })

  it('always sets rel="noopener noreferrer"', (): void => {
    render(<ExternalLink href="https://x.test">x</ExternalLink>)
    expect(screen.getByRole('link', { name: 'x' })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    )
  })

  it('always sets referrerpolicy="no-referrer"', (): void => {
    render(<ExternalLink href="https://x.test">x</ExternalLink>)
    expect(screen.getByRole('link', { name: 'x' })).toHaveAttribute(
      'referrerpolicy',
      'no-referrer',
    )
  })

  it('opens in a new tab when target="_blank" is supplied', (): void => {
    render(
      <ExternalLink href="https://x.test" target="_blank">
        x
      </ExternalLink>,
    )
    expect(screen.getByRole('link', { name: 'x' })).toHaveAttribute(
      'target',
      '_blank',
    )
  })

  it('forwards a variant data attribute (default vs button-style)', (): void => {
    render(
      <ExternalLink href="https://x.test" variant="button">
        x
      </ExternalLink>,
    )
    expect(screen.getByRole('link', { name: 'x' })).toHaveAttribute(
      'data-variant',
      'button',
    )
  })

  it('is axe-clean', async (): Promise<void> => {
    const { container } = render(
      <ExternalLink href="https://x.test">x</ExternalLink>,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
