import type { AdapterSourceKey } from '@snowboard-trip-advisor/schema'
import type { Adapter } from './contract'
import { opensnowStub } from './adapters/opensnow/stub'
import { snowforecastStub } from './adapters/snowforecast/stub'
import { resortFeedStub } from './adapters/resort-feed/stub'
import { bookingStub } from './adapters/booking/stub'
import { airbnbStub } from './adapters/airbnb/stub'

type AdapterRegistry = { [K in AdapterSourceKey]: Adapter<K> }

export const registry: AdapterRegistry = {
  opensnow: opensnowStub,
  snowforecast: snowforecastStub,
  'resort-feed': resortFeedStub,
  booking: bookingStub,
  airbnb: airbnbStub,
}
