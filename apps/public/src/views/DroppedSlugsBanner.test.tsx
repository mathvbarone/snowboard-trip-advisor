import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import DroppedSlugsBanner from './DroppedSlugsBanner'

describe('DroppedSlugsBanner (stub)', (): void => {
  it('renders nothing — full impl lands later in Epic 3', (): void => {
    const { container } = render(<DroppedSlugsBanner />)
    expect(container.firstChild).toBeNull()
  })
})
