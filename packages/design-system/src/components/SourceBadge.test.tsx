import type { SourceKey } from '@snowboard-trip-advisor/schema'
import { render, screen } from '@testing-library/react'
import { axe } from 'jest-axe'
import { describe, expect, it, vi } from 'vitest'

import { SourceBadge } from './SourceBadge'

const ALL_SOURCES: ReadonlyArray<SourceKey> = [
  'opensnow',
  'snowforecast',
  'resort-feed',
  'booking',
  'airbnb',
  'manual',
]

describe('SourceBadge', (): void => {
  for (const source of ALL_SOURCES) {
    it(`renders the matching glyph and display name for source="${source}"`, (): void => {
      const { container } = render(<SourceBadge source={source} />)
      // Glyph is rendered (every glyph is an SVG with currentColor).
      expect(container.querySelector('svg')).not.toBeNull()
      // Display name is announced (sr-only or visible — depends on layout).
      expect(screen.getByText(SOURCE_DISPLAY_NAME[source])).toBeInTheDocument()
    })
  }

  it('never fetches favicons (CSP + zero-tracking)', (): void => {
    const fetchSpy = vi.spyOn(global, 'fetch')
    render(<SourceBadge source="opensnow" />)
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('is axe-clean for every source variant', async (): Promise<void> => {
    for (const source of ALL_SOURCES) {
      const { container, unmount } = render(<SourceBadge source={source} />)
      expect(await axe(container)).toHaveNoViolations()
      unmount()
    }
  })
})

// Mirrors SourceBadge's internal map. If display names diverge between this
// test and the implementation, the per-source assertion above will fail.
const SOURCE_DISPLAY_NAME: Record<SourceKey, string> = {
  opensnow: 'OpenSnow',
  snowforecast: 'Snow-Forecast',
  'resort-feed': 'Resort Feed',
  booking: 'Booking.com',
  airbnb: 'Airbnb',
  manual: 'Manual',
}
