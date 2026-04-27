import { buildStub } from '../buildStub'

export const airbnbStub = buildStub({
  source: 'airbnb',
  fields: ['lodging_sample.median_eur'],
  attribution_block_en: 'Source: Airbnb (stub — Epic 5 swaps in real adapter)',
})
