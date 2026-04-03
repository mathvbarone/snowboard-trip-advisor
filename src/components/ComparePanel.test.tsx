import { render, screen } from '@testing-library/react'
import ComparePanel from './ComparePanel'

it('lists selected resorts for comparison', () => {
  render(
    <ComparePanel
      resorts={[
        { id: 'verbier', name: 'Verbier' },
        { id: 'st-anton', name: 'St Anton am Arlberg' },
      ]}
    />,
  )

  expect(screen.getByRole('heading', { name: /compare resorts/i })).toBeInTheDocument()
  expect(screen.getByText('Verbier')).toBeInTheDocument()
  expect(screen.getByText('St Anton am Arlberg')).toBeInTheDocument()
})
