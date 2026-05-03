import { render, screen } from '@testing-library/react'
import { axe } from 'jest-axe'
import { describe, expect, it } from 'vitest'

import { Sidebar } from './Sidebar'

const ITEMS = [
  { href: '/', label: 'Dashboard' },
  { href: '/resorts', label: 'Resorts' },
  { href: '/publishes', label: 'Publishes' },
] as const

describe('Sidebar', (): void => {
  it('renders a nav landmark with the supplied items as links', (): void => {
    render(<Sidebar items={ITEMS} />)
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(nav).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Resorts' })).toHaveAttribute('href', '/resorts')
    expect(screen.getByRole('link', { name: 'Publishes' })).toHaveAttribute('href', '/publishes')
  })

  it('marks the matching item with aria-current="page" when activeHref is set', (): void => {
    render(<Sidebar items={ITEMS} activeHref="/resorts" />)
    expect(screen.getByRole('link', { name: 'Resorts' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    // Non-matching items omit aria-current entirely.
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('omits aria-current on every item when activeHref is undefined', (): void => {
    render(<Sidebar items={ITEMS} />)
    for (const label of ['Dashboard', 'Resorts', 'Publishes']) {
      expect(screen.getByRole('link', { name: label })).not.toHaveAttribute(
        'aria-current',
      )
    }
  })

  it('renders an empty nav without crashing when items is empty', (): void => {
    render(<Sidebar items={[]} />)
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })

  it('uses real anchor elements (middle/cmd-click semantics preserved)', (): void => {
    render(<Sidebar items={ITEMS} />)
    const link = screen.getByRole('link', { name: 'Dashboard' })
    expect(link.tagName).toBe('A')
  })

  it('is axe-clean with items', async (): Promise<void> => {
    const { container } = render(<Sidebar items={ITEMS} activeHref="/" />)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('is axe-clean when empty', async (): Promise<void> => {
    const { container } = render(<Sidebar items={[]} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
