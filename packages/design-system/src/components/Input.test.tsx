import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { describe, expect, it, vi } from 'vitest'

import { Input } from './Input'

describe('Input', (): void => {
  it('renders a labelled text input by default', (): void => {
    render(
      <Input
        label="Resort name"
        value=""
        onChange={(): void => undefined}
      />,
    )
    const input = screen.getByLabelText('Resort name')
    expect(input).toBeInTheDocument()
    expect(input).toHaveAttribute('type', 'text')
  })

  it('renders a date input when type="date"', (): void => {
    render(
      <Input
        label="Trip start"
        type="date"
        value=""
        onChange={(): void => undefined}
      />,
    )
    expect(screen.getByLabelText('Trip start')).toHaveAttribute('type', 'date')
  })

  it('reflects the controlled value', (): void => {
    render(
      <Input
        label="Resort name"
        value="Spindleruv"
        onChange={(): void => undefined}
      />,
    )
    expect(screen.getByLabelText('Resort name')).toHaveValue('Spindleruv')
  })

  it('invokes onChange with the new value while typing', async (): Promise<void> => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <Input
        label="Resort name"
        value=""
        onChange={onChange}
      />,
    )
    await user.type(screen.getByLabelText('Resort name'), 'a')
    expect(onChange).toHaveBeenCalledWith('a')
  })

  it('respects the disabled prop', (): void => {
    render(
      <Input
        label="Resort name"
        value=""
        onChange={(): void => undefined}
        disabled
      />,
    )
    expect(screen.getByLabelText('Resort name')).toBeDisabled()
  })

  it('forwards aria-invalid', (): void => {
    render(
      <Input
        label="Resort name"
        value=""
        onChange={(): void => undefined}
        aria-invalid
      />,
    )
    expect(screen.getByLabelText('Resort name')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
  })

  it('is axe-clean (default + date + disabled + invalid)', async (): Promise<void> => {
    const { container, rerender } = render(
      <Input label="Name" value="" onChange={(): void => undefined} />,
    )
    expect(await axe(container)).toHaveNoViolations()
    rerender(
      <Input
        label="Trip start"
        type="date"
        value=""
        onChange={(): void => undefined}
      />,
    )
    expect(await axe(container)).toHaveNoViolations()
    rerender(
      <Input
        label="Name"
        value=""
        onChange={(): void => undefined}
        disabled
      />,
    )
    expect(await axe(container)).toHaveNoViolations()
    rerender(
      <Input
        label="Name"
        value=""
        onChange={(): void => undefined}
        aria-invalid
      />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
