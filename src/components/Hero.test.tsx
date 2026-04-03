import { render, screen } from '@testing-library/react'
import Hero from './Hero'

it('renders the introduction and key feature list', () => {
  render(<Hero />)

  expect(
    screen.getByRole('region', { name: /snowboard trip advisor introduction/i }),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('heading', { name: /snowboard trip advisor/i }),
  ).toBeInTheDocument()
  expect(screen.getByRole('list', { name: /key features/i })).toBeInTheDocument()
  expect(
    screen.getByText(/compare size, price, and snow reliability/i),
  ).toBeInTheDocument()
})
