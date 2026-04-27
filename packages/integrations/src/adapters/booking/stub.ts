import { buildStub } from '../buildStub'

export const bookingStub = buildStub({
  source: 'booking',
  fields: ['lodging_sample.median_eur'],
  attribution_block_en: 'Source: Booking.com (stub — Epic 5 swaps in real adapter)',
})
