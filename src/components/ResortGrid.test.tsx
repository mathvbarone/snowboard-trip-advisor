import { render, screen } from '@testing-library/react'
import ResortGrid from './ResortGrid'
import type { PublishedResort } from '../data/loadPublishedDataset'

const resorts: PublishedResort[] = [
  {
    id: 'verbier',
    name: 'Verbier',
    country: 'Switzerland',
    region: 'Valais',
    status: 'active',
    overall_confidence: 0.91,
    source_urls: [],
    field_sources: {},
    piste_km: 412,
    lift_pass_day_eur: 89,
    estimated_trip_cost_3_days_eur: 640,
    size_category_official: 'Mega',
    price_category_ski_only: 'Premium',
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
    piste_km: 305,
    lift_pass_day_eur: 84,
    estimated_trip_cost_3_days_eur: 610,
    size_category_official: 'Large',
    price_category_ski_only: 'Premium',
  },
]

it('shows the empty state when no resorts match', () => {
  render(<ResortGrid resorts={[]} />)

  expect(
    screen.getByRole('region', { name: /resort results/i }),
  ).toBeInTheDocument()
  expect(
    screen.getByText('No resorts match the current filters.'),
  ).toBeInTheDocument()
})

it('renders a list of resort cards when results are available', () => {
  render(<ResortGrid resorts={resorts} />)

  expect(screen.getByRole('list')).toBeInTheDocument()
  expect(screen.getAllByRole('listitem')).toHaveLength(2)
  expect(screen.getByText('Verbier')).toBeInTheDocument()
  expect(screen.getByText('St Anton am Arlberg')).toBeInTheDocument()
})
