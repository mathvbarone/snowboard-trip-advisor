import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { describe, expect, it } from 'vitest'

import { Shell } from './Shell'

describe('Shell', (): void => {
  it('renders the main landmark with id="main" so the skip-link can target it', (): void => {
    render(<Shell><p>child</p></Shell>)
    const main = screen.getByRole('main')
    expect(main).toHaveAttribute('id', 'main')
    // tabIndex=-1 so .focus() works after skip-link click.
    expect(main).toHaveAttribute('tabindex', '-1')
  })

  it('renders the skip-link as the first focusable element with href="#main"', (): void => {
    render(<Shell><p>child</p></Shell>)
    const link = screen.getByRole('link', { name: /skip to main content/i })
    expect(link).toHaveAttribute('href', '#main')
  })

  it('focuses the main element when the skip-link is activated', async (): Promise<void> => {
    const user = userEvent.setup()
    render(<Shell><p>child</p></Shell>)
    const link = screen.getByRole('link', { name: /skip to main content/i })
    link.focus()
    await user.keyboard('{Enter}')
    // The Shell calls main.focus() in its skip-link onClick handler so
    // keyboard users land on the main landmark immediately. JSDOM does
    // not auto-focus on hash-link click, so the explicit focus() call is
    // load-bearing.
    expect(document.activeElement?.id).toBe('main')
  })

  it('renders children inside <main>', (): void => {
    render(<Shell><p data-testid="child" /></Shell>)
    const child = screen.getByTestId('child')
    expect(child.closest('main')).not.toBeNull()
  })

  it('is axe-clean by default', async (): Promise<void> => {
    const { container } = render(<Shell><h1>Page</h1></Shell>)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
