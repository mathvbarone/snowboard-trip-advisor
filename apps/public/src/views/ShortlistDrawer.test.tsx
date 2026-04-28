import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import ShortlistDrawer from './ShortlistDrawer'

describe('ShortlistDrawer (stub)', (): void => {
  it('renders nothing — full impl lands in PR 3.3', (): void => {
    const { container } = render(<ShortlistDrawer />)
    expect(container.firstChild).toBeNull()
  })
})
