import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { describe, expect, it, vi } from 'vitest'

import { IconButton } from './IconButton'

describe('IconButton', (): void => {
  it('renders an accessible button labelled by the required aria-label', (): void => {
    render(
      <IconButton aria-label="Add to shortlist" onClick={(): void => undefined}>
        <svg data-testid="icon" />
      </IconButton>,
    )
    expect(screen.getByRole('button', { name: 'Add to shortlist' })).toBeInTheDocument()
    expect(screen.getByTestId('icon')).toBeInTheDocument()
  })

  it('invokes onClick when clicked', async (): Promise<void> => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(
      <IconButton aria-label="Star" onClick={onClick}>
        <svg />
      </IconButton>,
    )
    await user.click(screen.getByRole('button', { name: 'Star' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('exposes the square hit-area data attribute so CSS sizes the target', (): void => {
    render(
      <IconButton aria-label="Star" onClick={(): void => undefined}>
        <svg />
      </IconButton>,
    )
    expect(screen.getByRole('button', { name: 'Star' })).toHaveAttribute(
      'data-hit-area',
      'square',
    )
  })

  it('respects the disabled prop', (): void => {
    render(
      <IconButton aria-label="Star" onClick={(): void => undefined} disabled>
        <svg />
      </IconButton>,
    )
    expect(screen.getByRole('button', { name: 'Star' })).toBeDisabled()
  })

  it('forwards aria-pressed for toggle usage (e.g. ResortCard star)', (): void => {
    render(
      <IconButton
        aria-label="Add to shortlist"
        aria-pressed
        onClick={(): void => undefined}
      >
        <svg />
      </IconButton>,
    )
    expect(
      screen.getByRole('button', { name: 'Add to shortlist' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('passes through data-* attributes (data-detail-trigger required by §5.5)', (): void => {
    render(
      <IconButton
        aria-label="Open detail"
        onClick={(): void => undefined}
        data-detail-trigger="kotelnica-bialczanska"
      >
        <svg />
      </IconButton>,
    )
    expect(screen.getByRole('button', { name: 'Open detail' })).toHaveAttribute(
      'data-detail-trigger',
      'kotelnica-bialczanska',
    )
  })

  it('defaults type="button" so it does not submit ambient forms', (): void => {
    render(
      <IconButton aria-label="Star" onClick={(): void => undefined}>
        <svg />
      </IconButton>,
    )
    expect(screen.getByRole('button', { name: 'Star' })).toHaveAttribute('type', 'button')
  })

  it('is axe-clean (default + pressed + disabled)', async (): Promise<void> => {
    const { container, rerender } = render(
      <IconButton aria-label="Star" onClick={(): void => undefined}>
        <svg />
      </IconButton>,
    )
    expect(await axe(container)).toHaveNoViolations()
    rerender(
      <IconButton aria-label="Star" aria-pressed onClick={(): void => undefined}>
        <svg />
      </IconButton>,
    )
    expect(await axe(container)).toHaveNoViolations()
    rerender(
      <IconButton aria-label="Star" disabled onClick={(): void => undefined}>
        <svg />
      </IconButton>,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
