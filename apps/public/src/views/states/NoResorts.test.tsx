import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import NoResorts from './NoResorts'

describe('NoResorts', (): void => {
  it('renders the empty-result heading and body', (): void => {
    render(<NoResorts />)
    expect(screen.getByText('No resorts to show')).toBeInTheDocument()
    expect(screen.getByText('Try adjusting your filters.')).toBeInTheDocument()
  })
})
