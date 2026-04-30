import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { describe, expect, it, vi } from 'vitest'

import { ToggleButtonGroup, type ToggleButtonOption } from './ToggleButtonGroup'

const OPTIONS: ReadonlyArray<ToggleButtonOption> = [
  { value: 'cards', label: 'Cards' },
  { value: 'matrix', label: 'Matrix' },
]

describe('ToggleButtonGroup', (): void => {
  it('wraps the options in a role="group" with the supplied label', (): void => {
    render(
      <ToggleButtonGroup
        label="View"
        options={OPTIONS}
        selected="cards"
        onChange={(): void => undefined}
      />,
    )
    expect(screen.getByRole('group', { name: 'View' })).toBeInTheDocument()
  })

  it('renders one button per option with aria-pressed reflecting selected', (): void => {
    render(
      <ToggleButtonGroup
        label="View"
        options={OPTIONS}
        selected="cards"
        onChange={(): void => undefined}
      />,
    )
    expect(
      screen.getByRole('button', { name: 'Cards', pressed: true }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Matrix', pressed: false }),
    ).toBeInTheDocument()
  })

  it('does NOT use role="tab" (parent §2.4 — aria-pressed group)', (): void => {
    render(
      <ToggleButtonGroup
        label="View"
        options={OPTIONS}
        selected="cards"
        onChange={(): void => undefined}
      />,
    )
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
    expect(screen.queryByRole('tablist')).toBeNull()
  })

  it('invokes onChange with the option value when an option is clicked', async (): Promise<void> => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <ToggleButtonGroup
        label="View"
        options={OPTIONS}
        selected="cards"
        onChange={onChange}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Matrix' }))
    expect(onChange).toHaveBeenCalledWith('matrix')
  })

  it('moves focus to the next option on ArrowRight (no auto onChange)', async (): Promise<void> => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <ToggleButtonGroup
        label="View"
        options={OPTIONS}
        selected="cards"
        onChange={onChange}
      />,
    )
    const cards = screen.getByRole('button', { name: 'Cards' })
    cards.focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('button', { name: 'Matrix' })).toHaveFocus()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('wraps around on ArrowRight from the last option', async (): Promise<void> => {
    const user = userEvent.setup()
    render(
      <ToggleButtonGroup
        label="View"
        options={OPTIONS}
        selected="cards"
        onChange={(): void => undefined}
      />,
    )
    screen.getByRole('button', { name: 'Matrix' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('button', { name: 'Cards' })).toHaveFocus()
  })

  it('wraps around on ArrowLeft from the first option', async (): Promise<void> => {
    const user = userEvent.setup()
    render(
      <ToggleButtonGroup
        label="View"
        options={OPTIONS}
        selected="cards"
        onChange={(): void => undefined}
      />,
    )
    screen.getByRole('button', { name: 'Cards' }).focus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('button', { name: 'Matrix' })).toHaveFocus()
  })

  it('moves focus to the previous option on ArrowLeft', async (): Promise<void> => {
    const user = userEvent.setup()
    render(
      <ToggleButtonGroup
        label="View"
        options={OPTIONS}
        selected="cards"
        onChange={(): void => undefined}
      />,
    )
    screen.getByRole('button', { name: 'Matrix' }).focus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('button', { name: 'Cards' })).toHaveFocus()
  })

  it('Home focuses the first option', async (): Promise<void> => {
    const user = userEvent.setup()
    render(
      <ToggleButtonGroup
        label="View"
        options={OPTIONS}
        selected="cards"
        onChange={(): void => undefined}
      />,
    )
    screen.getByRole('button', { name: 'Matrix' }).focus()
    await user.keyboard('{Home}')
    expect(screen.getByRole('button', { name: 'Cards' })).toHaveFocus()
  })

  it('End focuses the last option', async (): Promise<void> => {
    const user = userEvent.setup()
    render(
      <ToggleButtonGroup
        label="View"
        options={OPTIONS}
        selected="cards"
        onChange={(): void => undefined}
      />,
    )
    screen.getByRole('button', { name: 'Cards' }).focus()
    await user.keyboard('{End}')
    expect(screen.getByRole('button', { name: 'Matrix' })).toHaveFocus()
  })

  it('does not respond to non-arrow / non-home/end keys', async (): Promise<void> => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <ToggleButtonGroup
        label="View"
        options={OPTIONS}
        selected="cards"
        onChange={onChange}
      />,
    )
    const cards = screen.getByRole('button', { name: 'Cards' })
    cards.focus()
    await user.keyboard('a')
    // Focus stays where it was; no onChange.
    expect(cards).toHaveFocus()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('disabled propagates to every option button', (): void => {
    render(
      <ToggleButtonGroup
        label="View"
        options={OPTIONS}
        selected="cards"
        onChange={(): void => undefined}
        disabled
      />,
    )
    expect(screen.getByRole('button', { name: 'Cards' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Matrix' })).toBeDisabled()
  })

  it('is axe-clean (selected / unselected / disabled)', async (): Promise<void> => {
    const { container, rerender } = render(
      <ToggleButtonGroup
        label="View"
        options={OPTIONS}
        selected="cards"
        onChange={(): void => undefined}
      />,
    )
    expect(await axe(container)).toHaveNoViolations()
    rerender(
      <ToggleButtonGroup
        label="View"
        options={OPTIONS}
        selected="matrix"
        onChange={(): void => undefined}
      />,
    )
    expect(await axe(container)).toHaveNoViolations()
    rerender(
      <ToggleButtonGroup
        label="View"
        options={OPTIONS}
        selected="cards"
        onChange={(): void => undefined}
        disabled
      />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
