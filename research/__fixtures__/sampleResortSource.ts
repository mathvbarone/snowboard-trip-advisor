export const sampleResortSource = {
  id: 'three-valleys',
  name: 'Les 3 Vallees',
  country: 'France',
  region: 'Savoie',
  source_urls: ['https://www.les3vallees.com/en/'],
  fields: {
    piste_km: {
      value: 600,
      source: 'https://www.les3vallees.com/en/ski-area/',
      retrieved_at: '2026-04-03T00:00:00Z',
      confidence: 0.95,
    },
    lift_pass_day_eur: {
      value: 79,
      source: 'https://www.les3vallees.com/en/lift-pass/',
      retrieved_at: '2026-04-03T00:00:00Z',
      confidence: 0.9,
    },
  },
}
