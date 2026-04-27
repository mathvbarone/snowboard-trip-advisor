import { buildStub } from '../buildStub'

export const resortFeedStub = buildStub({
  source: 'resort-feed',
  fields: [
    'altitude_m.min',
    'altitude_m.max',
    'slopes_km',
    'lift_count',
    'skiable_terrain_ha',
    'season.start_month',
    'season.end_month',
  ],
  attribution_block_en: 'Source: Resort feed (stub — Epic 5 swaps in real adapter)',
})
