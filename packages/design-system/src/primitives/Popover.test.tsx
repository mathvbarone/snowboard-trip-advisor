import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { useState } from 'react'
import type { JSX } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Popover } from './Popover'

function ControlledHarness({
  initialOpen = true,
  withInsideButtons = false,
}: {
  initialOpen?: boolean
  withInsideButtons?: boolean
}): JSX.Element {
  const [open, setOpen] = useState<boolean>(initialOpen)
  return (
    <>
      <button type="button" data-testid="outside">outside</button>
      <Popover open={open} onOpenChange={setOpen} label="Field actions">
        <p>Body</p>
        {withInsideButtons ? (
          <>
            <button type="button">First</button>
            <button type="button">Second</button>
          </>
        ) : null}
      </Popover>
    </>
  )
}

describe('Popover', (): void => {
  it('renders nothing when closed', (): void => {
    render(<ControlledHarness initialOpen={false} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('Body')).toBeNull()
  })

  it('renders body when open with the supplied accessible name', (): void => {
    render(<ControlledHarness />)
    expect(screen.getByRole('dialog', { name: 'Field actions' })).toBeInTheDocument()
    expect(screen.getByText('Body')).toBeInTheDocument()
  })

  it('dismisses on Escape', async (): Promise<void> => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(
      <Popover open onOpenChange={onOpenChange} label="x">
        <p>Body</p>
      </Popover>,
    )
    await user.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('dismisses when a pointerdown happens outside the popover', async (): Promise<void> => {
    const user = userEvent.setup()
    render(<ControlledHarness />)
    expect(screen.getByText('Body')).toBeInTheDocument()
    await user.click(screen.getByTestId('outside'))
    expect(screen.queryByText('Body')).toBeNull()
  })

  it('does not dismiss when a click happens inside the popover', async (): Promise<void> => {
    const user = userEvent.setup()
    render(<ControlledHarness withInsideButtons />)
    await user.click(screen.getByRole('button', { name: 'First' }))
    expect(screen.getByText('Body')).toBeInTheDocument()
  })

  it('moves focus into the popover on open (non-modal auto-focus)', async (): Promise<void> => {
    render(<ControlledHarness withInsideButtons />)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    // FocusScope auto-focuses the first focusable inside on mount.
    // (Non-modal: focus is moved INTO the popover for keyboard users, but the
    // scope is not trapped — Tab from inside escapes naturally; covered below.)
    expect(document.activeElement?.closest('[role="dialog"]')).not.toBeNull()
  })

  it('Tab from inside the popover escapes to surrounding focusables (non-modal contract)', async (): Promise<void> => {
    const user = userEvent.setup()
    function HarnessWithAfter(): JSX.Element {
      const [open, setOpen] = useState<boolean>(true)
      return (
        <>
          <Popover open={open} onOpenChange={setOpen} label="x">
            <button type="button">inside</button>
          </Popover>
          <button type="button" data-testid="after">after</button>
        </>
      )
    }
    render(<HarnessWithAfter />)
    // FocusScope auto-focuses the inside button on mount.
    expect(screen.getByRole('button', { name: 'inside' })).toHaveFocus()
    // Tab progresses out of the popover to the next page focusable — proves
    // FocusScope is not configured with `trapped` / `loop`.
    await user.tab()
    expect(screen.getByTestId('after')).toHaveFocus()
  })

  it('is axe-clean when open', async (): Promise<void> => {
    const { container } = render(<ControlledHarness withInsideButtons />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('is axe-clean when closed', async (): Promise<void> => {
    const { container } = render(<ControlledHarness initialOpen={false} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
