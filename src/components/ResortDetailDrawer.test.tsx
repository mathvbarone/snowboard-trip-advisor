import { render, screen } from '@testing-library/react'
import type { PublishedResort } from '../data/loadPublishedDataset'
import ResortDetailDrawer from './ResortDetailDrawer'

const resort: PublishedResort = {
  id: 'verbier',
  name: 'Verbier',
  country: 'Switzerland',
  region: 'Valais',
  status: 'active',
  overall_confidence: 0.91,
  source_urls: ['https://www.verbier.ch/en/'],
  field_sources: {},
  piste_km: 4123,
  lift_pass_day_eur: 97,
  estimated_trip_cost_3_days_eur: 512,
}

it('renders nothing when no resort is selected', () => {
  const { container } = render(<ResortDetailDrawer resort={null} />)

  expect(container).toBeEmptyDOMElement()
})

it('renders the selected resort details and source links', () => {
  render(<ResortDetailDrawer resort={resort} />)

  expect(
    screen.getByRole('complementary', { name: /resort details/i }),
  ).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Verbier' })).toBeInTheDocument()
  expect(screen.getByText('Switzerland · Valais')).toBeInTheDocument()
  expect(screen.getByText('High confidence')).toBeInTheDocument()
  expect(screen.getByText('active')).toBeInTheDocument()
  expect(screen.getByText('4,123')).toBeInTheDocument()
  expect(screen.getByText('€97')).toBeInTheDocument()
  expect(screen.getByText('€512')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'https://www.verbier.ch/en/' })).toHaveAttribute(
    'href',
    'https://www.verbier.ch/en/',
  )
})
