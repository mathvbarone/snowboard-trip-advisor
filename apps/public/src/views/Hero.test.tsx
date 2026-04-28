import { render, screen } from '@testing-library/react'
import { axe } from 'jest-axe'
import { describe, expect, it } from 'vitest'

import Hero from './Hero'

describe('Hero', (): void => {
  it('renders an <h1> with the headline copy', (): void => {
    render(<Hero />)
    expect(
      screen.getByRole('heading', { level: 1 }),
    ).toBeInTheDocument()
  })

  it('does NOT render an <img> for the background photo (decorative CSS background)', (): void => {
    const { container } = render(<Hero />)
    // Background is a CSS background-image so the image stays decorative —
    // an <img alt> would announce text for a purely visual element. Spec §6.5.
    expect(container.querySelector('img')).toBeNull()
  })

  it('renders inside a <section> landmark with a region role', (): void => {
    const { container } = render(<Hero />)
    expect(container.querySelector('section')).not.toBeNull()
  })

  it('is axe-clean', async (): Promise<void> => {
    const { container } = render(<Hero />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
