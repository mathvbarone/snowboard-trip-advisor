import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import App from './App'

describe('App', (): void => {
  it('renders the app shell landmark', (): void => {
    render(<App />)
    expect(screen.getByRole('main')).toBeInTheDocument()
  })
})
