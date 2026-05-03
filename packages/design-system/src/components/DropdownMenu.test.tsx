import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import type { JSX } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Button } from './Button'
import { DropdownMenu, type DropdownMenuItem } from './DropdownMenu'

function makeItems(onSelect: () => void): ReadonlyArray<DropdownMenuItem> {
  return [
    { label: 'Sources', onSelect },
    { label: 'Integrations', onSelect },
    { label: 'History', onSelect },
  ]
}

function Harness({ onSelect = vi.fn() }: { onSelect?: () => void }): JSX.Element {
  return (
    <DropdownMenu trigger={<Button>Account</Button>} label="Account menu" items={makeItems(onSelect)} />
  )
}

describe('DropdownMenu', (): void => {
  it('renders the trigger as aria-haspopup="menu" with aria-expanded reflecting state', async (): Promise<void> => {
    const user = userEvent.setup()
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Account' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  it('renders the menu with menuitem roles when open', async (): Promise<void> => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Account' }))
    expect(screen.getByRole('menu', { name: 'Account menu' })).toBeInTheDocument()
    expect(screen.getAllByRole('menuitem')).toHaveLength(3)
    expect(screen.getByRole('menuitem', { name: 'Sources' })).toBeInTheDocument()
  })

  it('Down-arrow on open focuses the first item; cycles through items', async (): Promise<void> => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Account' }))
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Sources' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Integrations' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'History' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Sources' })).toHaveFocus()
  })

  it('Up-arrow cycles items in reverse', async (): Promise<void> => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Account' }))
    await user.keyboard('{ArrowUp}')
    expect(screen.getByRole('menuitem', { name: 'History' })).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(screen.getByRole('menuitem', { name: 'Integrations' })).toHaveFocus()
  })

  it('Enter on a focused item invokes onSelect and closes the menu', async (): Promise<void> => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<Harness onSelect={onSelect} />)
    await user.click(screen.getByRole('button', { name: 'Account' }))
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('clicking a menu item invokes onSelect and closes the menu', async (): Promise<void> => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<Harness onSelect={onSelect} />)
    await user.click(screen.getByRole('button', { name: 'Account' }))
    await user.click(screen.getByRole('menuitem', { name: 'Integrations' }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('Escape closes the menu and returns aria-expanded to false', async (): Promise<void> => {
    const user = userEvent.setup()
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Account' })
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard('{Escape}')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('renders nothing menu-side when items is empty', async (): Promise<void> => {
    const user = userEvent.setup()
    render(<DropdownMenu trigger={<Button>Empty</Button>} label="empty" items={[]} />)
    await user.click(screen.getByRole('button', { name: 'Empty' }))
    expect(screen.getByRole('menu', { name: 'empty' })).toBeInTheDocument()
    expect(screen.queryAllByRole('menuitem')).toHaveLength(0)
  })

  it('arrow keys on an empty menu are no-ops (defensive)', async (): Promise<void> => {
    const user = userEvent.setup()
    render(<DropdownMenu trigger={<Button>Empty</Button>} label="empty" items={[]} />)
    await user.click(screen.getByRole('button', { name: 'Empty' }))
    await user.keyboard('{ArrowDown}')
    // No items to focus; the menu region remains active and the test verifies
    // the keydown handler returned cleanly (no throw).
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('clicking the trigger again while open closes the menu', async (): Promise<void> => {
    const user = userEvent.setup()
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Account' })
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('Escape on a closed dropdown is a no-op (does not throw)', async (): Promise<void> => {
    const user = userEvent.setup()
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Account' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    trigger.focus()
    await user.keyboard('{Escape}')
    // State stays closed; the early-return in onEscapeKeyDown when `!open` runs.
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('clicking outside while open closes the menu', async (): Promise<void> => {
    const user = userEvent.setup()
    function HarnessWithOutside(): JSX.Element {
      return (
        <>
          <button type="button" data-testid="outside">outside</button>
          <Harness />
        </>
      )
    }
    render(<HarnessWithOutside />)
    await user.click(screen.getByRole('button', { name: 'Account' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await user.click(screen.getByTestId('outside'))
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('is axe-clean when closed', async (): Promise<void> => {
    const { container } = render(<Harness />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('is axe-clean when open', async (): Promise<void> => {
    const user = userEvent.setup()
    const { container } = render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Account' }))
    expect(await axe(container)).toHaveNoViolations()
  })
})
