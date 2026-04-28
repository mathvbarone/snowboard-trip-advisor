import { render, screen } from '@testing-library/react'
import { axe } from 'jest-axe'
import { describe, expect, it } from 'vitest'

import { Card } from './Card'

describe('Card', (): void => {
  it('renders the children inside an article landmark', (): void => {
    render(
      <Card>
        <p>card body</p>
      </Card>,
    )
    expect(screen.getByRole('article')).toBeInTheDocument()
    expect(screen.getByText('card body')).toBeInTheDocument()
  })

  it('defaults variant to "elevated"', (): void => {
    render(<Card>x</Card>)
    expect(screen.getByRole('article')).toHaveAttribute(
      'data-variant',
      'elevated',
    )
  })

  it('renders the flat variant when variant="flat"', (): void => {
    render(<Card variant="flat">x</Card>)
    expect(screen.getByRole('article')).toHaveAttribute('data-variant', 'flat')
  })

  it('renders header / body / footer slots in source order', (): void => {
    render(
      <Card
        header={<h2 data-testid="header">Title</h2>}
        footer={<div data-testid="footer">Footer</div>}
      >
        <div data-testid="body">Body</div>
      </Card>,
    )
    const article = screen.getByRole('article')
    const regions = article.querySelectorAll('[data-region]')
    expect(regions).toHaveLength(3)
    expect(regions[0]?.getAttribute('data-region')).toBe('header')
    expect(regions[1]?.getAttribute('data-region')).toBe('body')
    expect(regions[2]?.getAttribute('data-region')).toBe('footer')
  })

  it('omits the header region when no header prop is supplied', (): void => {
    const { container } = render(<Card>x</Card>)
    expect(container.querySelector('[data-region="header"]')).toBeNull()
  })

  it('omits the footer region when no footer prop is supplied', (): void => {
    const { container } = render(<Card>x</Card>)
    expect(container.querySelector('[data-region="footer"]')).toBeNull()
  })

  it('is axe-clean (elevated + flat + with header/footer)', async (): Promise<void> => {
    const { container, rerender } = render(<Card>body</Card>)
    expect(await axe(container)).toHaveNoViolations()
    rerender(<Card variant="flat">body</Card>)
    expect(await axe(container)).toHaveNoViolations()
    rerender(
      <Card header={<h2>Title</h2>} footer={<p>foot</p>}>
        body
      </Card>,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
