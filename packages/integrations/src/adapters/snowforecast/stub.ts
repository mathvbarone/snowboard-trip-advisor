import { buildStub } from '../buildStub'

export const snowforecastStub = buildStub({
  source: 'snowforecast',
  fields: ['snow_depth_cm'],
  attribution_block_en: 'Source: Snow-Forecast (stub — Epic 5 swaps in real adapter)',
})
