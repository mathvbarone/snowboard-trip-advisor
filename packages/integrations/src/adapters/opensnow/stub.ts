import { buildStub } from '../buildStub'

export const opensnowStub = buildStub({
  source: 'opensnow',
  fields: ['snow_depth_cm', 'lifts_open.count', 'lifts_open.total'],
  attribution_block_en: 'Source: OpenSnow (stub — Epic 5 swaps in real adapter)',
})
