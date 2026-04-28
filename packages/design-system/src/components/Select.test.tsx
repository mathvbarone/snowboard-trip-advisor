import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { describe, expect, it, vi } from 'vitest'

import { Select } from './Select'

const OPTIONS = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana' },
  { value: 'c', label: 'Cherry' },
]

describe('Select', (): void => {
  it('renders a native <select> element with the supplied options', (): void => {
    render(
      <Select
        label="Fruit"
        value="a"
        options={OPTIONS}
        onChange={(): void => undefined}
      />,
    )
    const combobox = screen.getByRole('combobox', { name: 'Fruit' })
    expect(combobox.tagName).toBe('SELECT')
    expect(screen.getByRole('option', { name: 'Apple' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Banana' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Cherry' })).toBeInTheDocument()
  })

  it('reflects the controlled value', (): void => {
    render(
      <Select
        label="Fruit"
        value="b"
        options={OPTIONS}
        onChange={(): void => undefined}
      />,
    )
    expect(screen.getByRole('combobox', { name: 'Fruit' })).toHaveValue('b')
  })

  it('invokes onChange with the new value when the user selects an option', async (): Promise<void> => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <Select
        label="Fruit"
        value="a"
        options={OPTIONS}
        onChange={onChange}
      />,
    )
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Fruit' }),
      'c',
    )
    expect(onChange).toHaveBeenCalledWith('c')
  })

  it('respects the disabled prop', (): void => {
    render(
      <Select
        label="Fruit"
        value="a"
        options={OPTIONS}
        onChange={(): void => undefined}
        disabled
      />,
    )
    expect(screen.getByRole('combobox', { name: 'Fruit' })).toBeDisabled()
  })

  it('is axe-clean (default + disabled)', async (): Promise<void> => {
    const { container, rerender } = render(
      <Select
        label="Fruit"
        value="a"
        options={OPTIONS}
        onChange={(): void => undefined}
      />,
    )
    expect(await axe(container)).toHaveNoViolations()
    rerender(
      <Select
        label="Fruit"
        value="a"
        options={OPTIONS}
        onChange={(): void => undefined}
        disabled
      />,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
