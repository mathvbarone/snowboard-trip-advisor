import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { describe, expect, it, vi } from 'vitest'

import { Chip } from './Chip'

describe('Chip', (): void => {
  it('renders the children inside a button element', (): void => {
    render(
      <Chip pressed={false} onToggle={(): void => undefined}>
        Poland
      </Chip>,
    )
    expect(screen.getByRole('button', { name: 'Poland' })).toBeInTheDocument()
  })

  it('reflects pressed state via aria-pressed', (): void => {
    render(
      <Chip pressed onToggle={(): void => undefined}>
        Poland
      </Chip>,
    )
    expect(
      screen.getByRole('button', { name: 'Poland', pressed: true }),
    ).toBeInTheDocument()
  })

  it('reports aria-pressed=false when not pressed', (): void => {
    render(
      <Chip pressed={false} onToggle={(): void => undefined}>
        Poland
      </Chip>,
    )
    expect(
      screen.getByRole('button', { name: 'Poland', pressed: false }),
    ).toBeInTheDocument()
  })

  it('invokes onToggle with the negated pressed value when clicked', async (): Promise<void> => {
    const onToggle = vi.fn()
    const user = userEvent.setup()
    render(
      <Chip pressed={false} onToggle={onToggle}>
        Poland
      </Chip>,
    )
    await user.click(screen.getByRole('button', { name: 'Poland' }))
    expect(onToggle).toHaveBeenCalledWith(true)
  })

  it('invokes onToggle(false) when clicked while pressed', async (): Promise<void> => {
    const onToggle = vi.fn()
    const user = userEvent.setup()
    render(
      <Chip pressed onToggle={onToggle}>
        Poland
      </Chip>,
    )
    await user.click(screen.getByRole('button', { name: 'Poland' }))
    expect(onToggle).toHaveBeenCalledWith(false)
  })

  it('respects the disabled prop', (): void => {
    render(
      <Chip pressed={false} onToggle={(): void => undefined} disabled>
        Poland
      </Chip>,
    )
    expect(screen.getByRole('button', { name: 'Poland' })).toBeDisabled()
  })

  it('does not invoke onToggle when disabled', async (): Promise<void> => {
    const onToggle = vi.fn()
    const user = userEvent.setup()
    render(
      <Chip pressed={false} onToggle={onToggle} disabled>
        Poland
      </Chip>,
    )
    await user.click(screen.getByRole('button', { name: 'Poland' }))
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('is axe-clean (pressed + unpressed + disabled)', async (): Promise<void> => {
    const { container, rerender } = render(
      <Chip pressed={false} onToggle={(): void => undefined}>
        Poland
      </Chip>,
    )
    expect(await axe(container)).toHaveNoViolations()
    rerender(
      <Chip pressed onToggle={(): void => undefined}>
        Poland
      </Chip>,
    )
    expect(await axe(container)).toHaveNoViolations()
    rerender(
      <Chip pressed={false} onToggle={(): void => undefined} disabled>
        Poland
      </Chip>,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
