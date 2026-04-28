import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { useState } from 'react'
import type { JSX } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Modal } from './Modal'

// Spec §7.9: Modal must focus-trap, scroll-lock the body, and dismiss on
// Escape. Built on @radix-ui/react-dialog. The component is the canonical
// wrapper that MergeReplaceDialog and ShareUrlDialog (apps/public) compose
// against; tests cover the primitive contract once so consumers don't have
// to repeat them.

function ControlledHarness({
  initialOpen = true,
  withInsideButtons = false,
}: {
  initialOpen?: boolean
  withInsideButtons?: boolean
}): JSX.Element {
  const [open, setOpen] = useState<boolean>(initialOpen)
  return (
    <Modal open={open} onOpenChange={setOpen} title="Heading">
      <p>Body</p>
      {withInsideButtons ? (
        <>
          <button type="button">First</button>
          <button type="button">Second</button>
        </>
      ) : null}
    </Modal>
  )
}

describe('Modal', (): void => {
  it('renders the title and body when open', (): void => {
    render(<ControlledHarness />)
    expect(
      screen.getByRole('dialog', { name: 'Heading' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Body')).toBeInTheDocument()
  })

  it('does not render when closed', (): void => {
    render(<ControlledHarness initialOpen={false} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('locks body scroll while open (sets overflow:hidden)', (): void => {
    render(<ControlledHarness />)
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('restores body scroll when closed', async (): Promise<void> => {
    const user = userEvent.setup()
    render(<ControlledHarness />)
    expect(document.body.style.overflow).toBe('hidden')
    await user.keyboard('{Escape}')
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('dismisses on Escape', async (): Promise<void> => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(
      <Modal open onOpenChange={onOpenChange} title="Heading">
        <p>Body</p>
      </Modal>,
    )
    await user.keyboard('{Escape}')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('traps Tab focus inside the dialog', async (): Promise<void> => {
    const user = userEvent.setup()
    render(<ControlledHarness withInsideButtons />)
    // Radix moves initial focus into the dialog. After two Tabs we must
    // still be inside the dialog (focus did not escape to the document body).
    await user.tab()
    await user.tab()
    await user.tab()
    expect(document.activeElement?.closest('[role="dialog"]')).not.toBeNull()
  })

  it('returns focus to the trigger on close', async (): Promise<void> => {
    function TriggerHarness(): JSX.Element {
      const [open, setOpen] = useState<boolean>(false)
      return (
        <>
          <button
            type="button"
            data-testid="trigger"
            onClick={(): void => {
              setOpen(true)
            }}
          >
            Open
          </button>
          <Modal open={open} onOpenChange={setOpen} title="Heading">
            <p>Body</p>
          </Modal>
        </>
      )
    }
    const user = userEvent.setup()
    render(<TriggerHarness />)
    const trigger = screen.getByTestId('trigger')
    trigger.focus()
    await user.click(trigger)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(trigger).toHaveFocus()
  })

  it('is axe-clean when open', async (): Promise<void> => {
    const { container } = render(<ControlledHarness />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('is axe-clean when closed', async (): Promise<void> => {
    const { container } = render(<ControlledHarness initialOpen={false} />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('does not throw if the activeElement at open is not an HTMLElement', async (): Promise<void> => {
    // jsdom's default activeElement is <body> (an HTMLElement). To exercise
    // the "not an HTMLElement" branch we stub activeElement with a getter
    // that returns an SVGElement; restore on close should be skipped
    // silently rather than crashing.
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    document.body.appendChild(svg)
    const restoreDescriptor = Object.getOwnPropertyDescriptor(
      Document.prototype,
      'activeElement',
    )
    Object.defineProperty(document, 'activeElement', {
      configurable: true,
      get: (): SVGElement => svg,
    })
    try {
      const user = userEvent.setup()
      render(<ControlledHarness />)
      // Closing is exercised below — no throw is the assertion.
      await user.keyboard('{Escape}')
    } finally {
      // Restore activeElement getter so subsequent tests aren't polluted.
      if (restoreDescriptor !== undefined) {
        Object.defineProperty(document, 'activeElement', restoreDescriptor)
      }
      svg.remove()
    }
  })

})
