import { render, screen } from '@testing-library/react'
import { axe } from 'jest-axe'
import { describe, expect, it } from 'vitest'

import { Skeleton } from './Skeleton'

describe('Skeleton', (): void => {
  it('renders with role="status" and aria-busy="true" so SR announces loading', (): void => {
    render(<Skeleton variant="line" />)
    const node = screen.getByRole('status')
    expect(node).toHaveAttribute('aria-busy', 'true')
  })

  it('carries a hidden visually-only label "Loading..." for screen readers', (): void => {
    render(<Skeleton variant="card" />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it.each(['line', 'block', 'card'] as const)(
    'renders variant=%s and adds the variant class',
    (variant): void => {
      const { container } = render(<Skeleton variant={variant} />)
      const root = container.firstElementChild
      expect(root?.className).toMatch(new RegExp(variant))
    },
  )

  it('is axe-clean for every variant', async (): Promise<void> => {
    for (const variant of ['line', 'block', 'card'] as const) {
      const { container, unmount } = render(<Skeleton variant={variant} />)
      const results = await axe(container)
      expect(results).toHaveNoViolations()
      unmount()
    }
  })
})
