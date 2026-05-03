import { render, screen } from '@testing-library/react'
import { axe } from 'jest-axe'
import { describe, expect, it } from 'vitest'

import { StatusPill, type StatusPillVariant } from './StatusPill'

const VARIANTS: ReadonlyArray<StatusPillVariant> = ['live', 'stale', 'failed', 'manual']

describe('StatusPill', (): void => {
  it.each(VARIANTS)('renders variant %s with the data-variant hook + visible children', (variant): void => {
    render(<StatusPill variant={variant}>12d</StatusPill>)
    expect(screen.getByText('12d')).toBeInTheDocument()
    const pill = screen.getByText('12d').closest('.sta-status-pill')
    expect(pill).not.toBeNull()
    expect(pill).toHaveAttribute('data-variant', variant)
  })

  it.each<[StatusPillVariant, string]>([
    ['live', 'Live'],
    ['stale', 'Stale'],
    ['failed', 'Failed'],
    ['manual', 'Manual'],
  ])('exposes a screen-reader-only state label for variant %s', (variant, label): void => {
    render(<StatusPill variant={variant}>value</StatusPill>)
    // The visible "value" + the SR-only state label both contribute to the
    // accessible name; the SR text uses the canonical .sta-visually-hidden
    // utility, the same pattern Pill / Skeleton already use.
    const pill = screen.getByText('value').closest('.sta-status-pill')
    expect(pill?.textContent).toContain(label)
    const srSpan = pill?.querySelector('.sta-visually-hidden')
    expect(srSpan?.textContent).toBe(label)
  })

  it.each(VARIANTS)('is axe-clean for variant %s', async (variant): Promise<void> => {
    const { container } = render(<StatusPill variant={variant}>12d</StatusPill>)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('renders without children (state-label-only mode)', (): void => {
    render(<StatusPill variant="failed" />)
    expect(screen.getByText('Failed')).toBeInTheDocument()
  })
})
