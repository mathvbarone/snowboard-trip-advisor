import type { SourceKey } from '@snowboard-trip-advisor/schema'

import type { IconComponent } from '../types'

import { AirbnbGlyph } from './airbnb'
import { BookingGlyph } from './booking'
import { ManualGlyph } from './manual'
import { OpenSnowGlyph } from './opensnow'
import { ResortFeedGlyph } from './resort-feed'
import { SnowForecastGlyph } from './snowforecast'

// Compile-time exhaustive: `satisfies Record<SourceKey, IconComponent>`
// makes adding a new SourceKey to the schema enum without an
// accompanying glyph a typecheck failure. The runtime sanity check in
// index.test.ts is a regression guard if the satisfies annotation is
// ever dropped.
export const SOURCE_GLYPHS = {
  opensnow: OpenSnowGlyph,
  snowforecast: SnowForecastGlyph,
  'resort-feed': ResortFeedGlyph,
  booking: BookingGlyph,
  airbnb: AirbnbGlyph,
  manual: ManualGlyph,
} as const satisfies Record<SourceKey, IconComponent>

export {
  AirbnbGlyph,
  BookingGlyph,
  ManualGlyph,
  OpenSnowGlyph,
  ResortFeedGlyph,
  SnowForecastGlyph,
}
