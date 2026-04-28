import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { describe, expect, it } from 'vitest'

import { Tooltip } from './Tooltip'

describe('Tooltip', (): void => {
  it('shows the tooltip content when the trigger receives focus', async (): Promise<void> => {
    const user = userEvent.setup()
    render(
      <Tooltip content="Tooltip body">
        <button type="button">Trigger</button>
      </Tooltip>,
    )
    expect(screen.queryByRole('tooltip')).toBeNull()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Trigger' })).toHaveFocus()
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Tooltip body')
  })

  it('renders the floating element with role="tooltip"', async (): Promise<void> => {
    const user = userEvent.setup()
    render(
      <Tooltip content="Body">
        <button type="button">Trigger</button>
      </Tooltip>,
    )
    await user.tab()
    expect(await screen.findByRole('tooltip')).toBeInTheDocument()
  })

  it('dismisses on Escape', async (): Promise<void> => {
    const user = userEvent.setup()
    render(
      <Tooltip content="Body">
        <button type="button">Trigger</button>
      </Tooltip>,
    )
    await user.tab()
    expect(await screen.findByRole('tooltip')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('is axe-clean (open + closed)', async (): Promise<void> => {
    const user = userEvent.setup()
    const { container } = render(
      <Tooltip content="Body">
        <button type="button">Trigger</button>
      </Tooltip>,
    )
    expect(await axe(container)).toHaveNoViolations()
    await user.tab()
    expect(await screen.findByRole('tooltip')).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })
})
