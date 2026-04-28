import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import DatasetLoading from './DatasetLoading'

describe('DatasetLoading', (): void => {
  it('renders 3 card-variant skeletons inside an aria-busy live region', (): void => {
    render(<DatasetLoading />)
    const region = screen.getByTestId('dataset-loading')
    expect(region).toHaveAttribute('aria-busy', 'true')
    expect(region.querySelectorAll('[data-variant="card"]')).toHaveLength(3)
  })

  it('exposes a single role="status" wrapper to consolidate SR announcements', (): void => {
    render(<DatasetLoading />)
    expect(screen.getByTestId('dataset-loading')).toHaveAttribute('role', 'status')
  })
})
