import type { AdapterSourceKey } from '@snowboard-trip-advisor/schema'

import { airbnbStub } from './adapters/airbnb/stub'
import { bookingStub } from './adapters/booking/stub'
import { opensnowStub } from './adapters/opensnow/stub'
import { resortFeedStub } from './adapters/resort-feed/stub'
import { snowforecastStub } from './adapters/snowforecast/stub'
import type { Adapter } from './contract'

// Phase 1 ownership map (per stub fields[]):
//   - opensnow:     snow_depth_cm, lifts_open.{count,total}
//   - snowforecast: snow_depth_cm
//   - resort-feed:  altitude_m.{min,max}, slopes_km, lift_count, skiable_terrain_ha, season.{start,end}_month
//   - booking:      lodging_sample.median_eur
//   - airbnb:       lodging_sample.median_eur
// `lift_pass_day` is intentionally unowned in Phase 1 — admins enter it manually until Epic 5
// chooses an upstream source (per spec §7.8 + §4.4 METRIC_FIELDS).
type AdapterRegistry = { [K in AdapterSourceKey]: Adapter<K> }

export const registry: AdapterRegistry = {
  opensnow: opensnowStub,
  snowforecast: snowforecastStub,
  'resort-feed': resortFeedStub,
  booking: bookingStub,
  airbnb: airbnbStub,
}
