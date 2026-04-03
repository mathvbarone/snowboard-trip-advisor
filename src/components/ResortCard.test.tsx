import { render, screen } from '@testing-library/react'
import ResortCard from './ResortCard'
import type { PublishedResort } from '../data/loadPublishedDataset'

const featuredResort: PublishedResort = {
  id: 'verbier',
  name: 'Verbier',
  country: 'Switzerland',
  region: 'Valais',
  status: 'active',
  overall_confidence: 0.91,
  source_urls: ['https://example.com/verbier'],
  field_sources: {},
  piste_km: 412,
  lift_pass_day_eur: 89,
  estimated_trip_cost_3_days_eur: 640,
  size_category_official: 'Mega',
  price_category_ski_only: 'Premium',
}

it('renders a published resort summary', () => {
  render(<ResortCard resort={featuredResort} />)

  expect(screen.getByText('Switzerland · Valais')).toBeInTheDocument()
  expect(screen.getByText('Verbier')).toBeInTheDocument()
  expect(screen.getByText('active')).toBeInTheDocument()
  expect(screen.getByText('Verbier').closest('article')).toHaveAttribute(
    'data-resort-id',
    'verbier',
  )

  expect(screen.getByText('Piste km').parentElement).toHaveTextContent('412')
  expect(screen.getByText('Day pass').parentElement).toHaveTextContent('€89')
  expect(screen.getByText('3-day trip').parentElement).toHaveTextContent('€640')
  expect(screen.getByText('Confidence').parentElement).toHaveTextContent(
    'High confidence',
  )
  expect(screen.getByText('Mega').parentElement).toHaveTextContent('Mega')
  expect(screen.getByText('Premium').parentElement).toHaveTextContent('Premium')
})

it('falls back when optional classification fields are missing', () => {
  render(
    <ResortCard
      resort={{
        ...featuredResort,
        id: 'laax',
        name: 'Laax',
        piste_km: undefined,
        size_category_official: undefined,
        price_category_ski_only: undefined,
      }}
    />,
  )

  expect(screen.getByText('Piste km').parentElement).toHaveTextContent('—')
  expect(screen.getByText('Size unclassified').parentElement).toHaveTextContent(
    'Size unclassified',
  )
  expect(screen.getByText('Price unclassified').parentElement).toHaveTextContent(
    'Price unclassified',
  )
})
