import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import NoResorts from './NoResorts'

describe('NoResorts', (): void => {
  it('renders the empty-result heading and body', (): void => {
    render(<NoResorts />)
    expect(screen.getByText('No resorts to show')).toBeInTheDocument()
    expect(screen.getByText('Try adjusting your filters.')).toBeInTheDocument()
  })

  it('omits the clear-filters button when onClearFilters is not provided', (): void => {
    // Defence-in-depth: with no recovery handler, NoResorts is a pure
    // status panel — no extra affordance, no surprise focus targets for
    // keyboard users.
    render(<NoResorts />)
    expect(screen.queryByRole('button', { name: /clear filters/i })).toBeNull()
  })

  it('renders a clear-filters button when onClearFilters is provided', (): void => {
    // Single-country deployments hide FilterBar's country chips
    // (`countries.length > 1` gate), so a stale `?country=XX` link
    // strands the user in <NoResorts> with no in-UI recovery. Co-locate
    // the recovery affordance with the empty state so it works regardless
    // of which filter caused the empty result.
    render(<NoResorts onClearFilters={(): void => undefined} />)
    expect(
      screen.getByRole('button', { name: /clear filters/i }),
    ).toBeInTheDocument()
  })

  it('invokes onClearFilters exactly once per click', async (): Promise<void> => {
    const onClearFilters = vi.fn()
    render(<NoResorts onClearFilters={onClearFilters} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /clear filters/i }))
    expect(onClearFilters).toHaveBeenCalledTimes(1)
  })
})
