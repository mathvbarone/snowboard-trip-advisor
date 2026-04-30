import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ViewToggle from './ViewToggle'

function setLocation(search: string): void {
  window.history.replaceState({}, '', `/${search.length > 0 ? `?${search}` : ''}`)
}

describe('ViewToggle', (): void => {
  beforeEach((): void => {
    setLocation('')
  })
  afterEach((): void => {
    setLocation('')
  })

  it('renders Cards + Matrix buttons inside a labelled group', (): void => {
    render(<ViewToggle />)
    expect(screen.getByRole('group', { name: 'View' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cards' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Matrix' })).toBeInTheDocument()
  })

  it('reflects the URL view in aria-pressed (default = cards)', (): void => {
    render(<ViewToggle />)
    expect(
      screen.getByRole('button', { name: 'Cards', pressed: true }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Matrix', pressed: false }),
    ).toBeInTheDocument()
  })

  it('reflects the URL view in aria-pressed when ?view=matrix is set on mount', (): void => {
    setLocation('view=matrix')
    render(<ViewToggle />)
    expect(
      screen.getByRole('button', { name: 'Matrix', pressed: true }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Cards', pressed: false }),
    ).toBeInTheDocument()
  })

  it('clicking "Matrix" pushes ?view=matrix via setURLState (PUSH transition)', async (): Promise<void> => {
    const user = userEvent.setup()
    const pushSpy = vi.spyOn(window.history, 'pushState')
    render(<ViewToggle />)
    await user.click(screen.getByRole('button', { name: 'Matrix' }))
    expect(pushSpy).toHaveBeenCalled()
    expect(window.location.search).toContain('view=matrix')
    pushSpy.mockRestore()
  })

  it('browser back from ?view=matrix returns toggle aria-pressed to cards', (): void => {
    setLocation('view=matrix')
    render(<ViewToggle />)
    expect(
      screen.getByRole('button', { name: 'Matrix', pressed: true }),
    ).toBeInTheDocument()
    act((): void => {
      window.history.replaceState({}, '', '/')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(
      screen.getByRole('button', { name: 'Cards', pressed: true }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Matrix', pressed: false }),
    ).toBeInTheDocument()
  })

  it('is axe-clean', async (): Promise<void> => {
    const { container } = render(<ViewToggle />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
