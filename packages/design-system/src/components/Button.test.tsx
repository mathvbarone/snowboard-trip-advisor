import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
})
