import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, vi } from 'vitest'
import App from './App'
import * as datasetModule from './data/loadPublishedDataset'
import type { PublishedDataset } from './data/loadPublishedDataset'

const loadPublishedDatasetSpy = vi.spyOn(datasetModule, 'loadPublishedDataset')

const publishedDataset: PublishedDataset = {
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
}

beforeEach(() => {
  window.history.replaceState({}, '', '/')
  loadPublishedDatasetSpy.mockResolvedValue(publishedDataset)
})

afterEach(() => {
  window.history.replaceState({}, '', '/')
  loadPublishedDatasetSpy.mockReset()
})

it('preserves the discovery UI while rendering published resorts and filtering them', async () => {
  window.history.replaceState({}, '', '/?compare=st-anton')
  render(<App />)
  const user = userEvent.setup()

  expect(
    await screen.findByRole('searchbox', { name: /search resorts/i }),
  ).toBeInTheDocument()
  expect(await screen.findByText(/compare up to four resorts/i)).toBeInTheDocument()

  await user.type(screen.getByRole('searchbox', { name: /search resorts/i }), 'france')

  const comparePanel = screen.getByRole('region', { name: /compare resorts/i })
  const resultsPanel = screen.getByRole('region', { name: /resort results/i })

  expect(comparePanel).toHaveTextContent('St Anton am Arlberg')
  expect(resultsPanel).toHaveTextContent('Les 3 Vallees')
  expect(resultsPanel).not.toHaveTextContent('St Anton am Arlberg')
})

it('ignores a late dataset resolution after unmounting', async () => {
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const resortsGetter = vi.fn(() => {
    throw new Error('resorts getter accessed after unmount')
  })
  let resolveDataset!: (value: PublishedDataset) => void
  const pendingDataset = new Promise<PublishedDataset>((resolve) => {
    resolveDataset = resolve
  })
  const lateDataset = {
    ...publishedDataset,
    get resorts() {
      return resortsGetter()
    },
  } as PublishedDataset

  loadPublishedDatasetSpy.mockReturnValueOnce(pendingDataset)

  const { unmount } = render(<App />)
  unmount()

  resolveDataset(lateDataset)
  await pendingDataset
  await Promise.resolve()

  expect(resortsGetter).not.toHaveBeenCalled()
  expect(consoleErrorSpy).not.toHaveBeenCalled()
  consoleErrorSpy.mockRestore()
})
