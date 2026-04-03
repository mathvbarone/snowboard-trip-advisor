import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import App from './App'
import * as datasetModule from './data/loadPublishedDataset'

vi.spyOn(datasetModule, 'loadPublishedDataset').mockResolvedValue({
  version: '2026-04-03T01-45-00Z',
  generated_at: '2026-04-03T01:45:00Z',
  scoring: { normalization: 'min-max', boundaries: {} },
  resorts: [
    {
      id: 'three-valleys',
      name: 'Les 3 Vallees',
      country: 'France',
      region: 'Savoie',
      status: 'active',
      overall_confidence: 0.9,
      source_urls: [],
      field_sources: {},
    },
    {
      id: 'st-anton',
      name: 'St Anton am Arlberg',
      country: 'Austria',
      region: 'Tyrol',
      status: 'active',
      overall_confidence: 0.88,
      source_urls: [],
      field_sources: {},
    },
  ],
})

it('preserves the discovery UI while rendering published resorts', async () => {
  render(<App />)

  expect(
    await screen.findByRole('searchbox', { name: /search resorts/i }),
  ).toBeInTheDocument()
  expect(await screen.findByText(/compare up to four resorts/i)).toBeInTheDocument()
  expect(await screen.findByText('Les 3 Vallees')).toBeInTheDocument()
  expect(await screen.findByText('St Anton am Arlberg')).toBeInTheDocument()
})
