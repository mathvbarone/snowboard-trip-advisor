import { render, screen } from '@testing-library/react'
import App from './App'

it('renders the snowboard trip advisor shell', () => {
  render(<App />)
  expect(screen.getByText('Snowboard Trip Advisor')).toBeInTheDocument()
  expect(
    screen.getByText('Best ski resorts in Europe, ranked by objective metrics'),
  ).toBeInTheDocument()
})
