import type { SourceKey } from '@snowboard-trip-advisor/schema'
import type { JSX } from 'react'

import { SOURCE_GLYPHS } from '../icons/sources'

// Inline source attribution badge. Pairs a self-hosted source glyph with
// the source's display name. Phase-1 contract: never fetch external
// favicons (CSP `img-src 'self'` + zero-tracking promise — see spec §2.6).
//
// Display names are spelled out below. Adding a new SourceKey to the schema
// without an entry here would type-error (Record<SourceKey, string> on the
// const), keeping the public surface in sync with the schema enum.

const SOURCE_DISPLAY_NAME = {
  opensnow: 'OpenSnow',
  snowforecast: 'Snow-Forecast',
  'resort-feed': 'Resort Feed',
  booking: 'Booking.com',
  airbnb: 'Airbnb',
  manual: 'Manual',
} as const satisfies Record<SourceKey, string>

export interface SourceBadgeProps {
  source: SourceKey
  /** Glyph size in css px; defaults to 14. */
  size?: number
}

export function SourceBadge({
  source,
  size = 14,
}: SourceBadgeProps): JSX.Element {
  const Glyph = SOURCE_GLYPHS[source]
  return (
    <span className="sta-source-badge" data-source={source}>
      <Glyph size={size} />
      <span className="sta-source-badge__name">
        {SOURCE_DISPLAY_NAME[source]}
      </span>
    </span>
  )
}
