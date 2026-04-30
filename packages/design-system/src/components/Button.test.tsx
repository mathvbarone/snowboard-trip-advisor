import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { describe, expect, it, vi } from 'vitest'

import { Button } from './Button'

describe('Button', (): void => {
  it('renders the children inside a button element', (): void => {
    render(<Button onClick={(): void => undefined}>Click me</Button>)
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument()
  })

  it('invokes onClick when clicked', async (): Promise<void> => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(<Button onClick={onClick}>Go</Button>)
    await user.click(screen.getByRole('button', { name: 'Go' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('defaults type to "button" so it does not submit ambient forms', (): void => {
    render(<Button onClick={(): void => undefined}>Save</Button>)
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button')
  })

  it('accepts an explicit "submit" type for form submission', (): void => {
    render(
      <Button type="submit" onClick={(): void => undefined}>
        Submit
      </Button>,
    )
    expect(screen.getByRole('button', { name: 'Submit' })).toHaveAttribute('type', 'submit')
  })

  it('forwards aria-label to the underlying element', (): void => {
    render(
      <Button onClick={(): void => undefined} aria-label="Close dialog">
        ×
      </Button>,
    )
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeInTheDocument()
  })

  it('respects the disabled prop', (): void => {
    render(
      <Button onClick={(): void => undefined} disabled>
        Disabled
      </Button>,
    )
    expect(screen.getByRole('button', { name: 'Disabled' })).toBeDisabled()
  })

  it('defaults variant to "primary"', (): void => {
    render(<Button onClick={(): void => undefined}>Default</Button>)
    expect(screen.getByRole('button', { name: 'Default' })).toHaveAttribute(
      'data-variant',
      'primary',
    )
  })

  it('renders the secondary variant when variant="secondary"', (): void => {
    render(
      <Button onClick={(): void => undefined} variant="secondary">
        Secondary
      </Button>,
    )
    expect(screen.getByRole('button', { name: 'Secondary' })).toHaveAttribute(
      'data-variant',
      'secondary',
    )
  })

  it('renders the ghost variant when variant="ghost"', (): void => {
    render(
      <Button onClick={(): void => undefined} variant="ghost">
        Ghost
      </Button>,
    )
    expect(screen.getByRole('button', { name: 'Ghost' })).toHaveAttribute(
      'data-variant',
      'ghost',
    )
  })

  it('forwards aria-pressed to the underlying element when used as a toggle', (): void => {
    render(
      <Button onClick={(): void => undefined} aria-pressed>
        Toggle
      </Button>,
    )
    expect(screen.getByRole('button', { name: 'Toggle' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('passes through data-* attributes (e.g. data-detail-trigger per spec §5.5)', (): void => {
    // Mirrors IconButton's data-* pass-through. apps/public's ResortCard
    // attaches `data-detail-trigger=<slug>` to its "View details" Button so
    // the Drawer primitive's focus-restore (querySelector lookup on close)
    // lands on the visible trigger.
    render(
      <Button
        onClick={(): void => undefined}
        data-detail-trigger="kotelnica-bialczanska"
      >
        View details
      </Button>,
    )
    expect(screen.getByRole('button', { name: 'View details' })).toHaveAttribute(
      'data-detail-trigger',
      'kotelnica-bialczanska',
    )
  })

  it('is axe-clean across primary / secondary / ghost / disabled', async (): Promise<void> => {
    const { container, rerender } = render(
      <Button onClick={(): void => undefined}>Primary</Button>,
    )
    expect(await axe(container)).toHaveNoViolations()
    rerender(
      <Button onClick={(): void => undefined} variant="secondary">
        Secondary
      </Button>,
    )
    expect(await axe(container)).toHaveNoViolations()
    rerender(
      <Button onClick={(): void => undefined} variant="ghost">
        Ghost
      </Button>,
    )
    expect(await axe(container)).toHaveNoViolations()
    rerender(
      <Button onClick={(): void => undefined} disabled>
        Disabled
      </Button>,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
