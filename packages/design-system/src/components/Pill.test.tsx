import { render, screen } from '@testing-library/react'
import { axe } from 'jest-axe'
import { describe, expect, it } from 'vitest'

import { Pill } from './Pill'

describe('Pill', (): void => {
  it('renders the children', (): void => {
    render(<Pill>powder</Pill>)
    expect(screen.getByText('powder')).toBeInTheDocument()
  })

  it('defaults variant to "default"', (): void => {
    render(<Pill>fresh</Pill>)
    expect(screen.getByText('fresh')).toHaveAttribute('data-variant', 'default')
  })

  it('renders the stale indicator when variant="stale"', (): void => {
    render(<Pill variant="stale">stale</Pill>)
    const pill = screen.getByText('stale')
    expect(pill).toHaveAttribute('data-variant', 'stale')
    // stale carries an additional sr-only "stale" announcement so SR users
    // learn the value is older than the freshness TTL.
    expect(screen.getByText('stale value', { selector: '.sta-visually-hidden' }))
      .toBeInTheDocument()
  })

  it('is axe-clean (default + stale)', async (): Promise<void> => {
    const { container, rerender } = render(<Pill>powder</Pill>)
    expect(await axe(container)).toHaveNoViolations()
    rerender(<Pill variant="stale">12 days old</Pill>)
    expect(await axe(container)).toHaveNoViolations()
  })
})
