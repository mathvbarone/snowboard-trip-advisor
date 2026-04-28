import { describe, expect, it } from 'vitest'

import { urlToView } from './router'

describe('urlToView', (): void => {
  it('returns "cards" by default', (): void => {
    expect(urlToView({ view: 'cards', sort: 'name', country: [], shortlist: [] })).toBe('cards')
  })

  it('returns "matrix" when view is matrix', (): void => {
    expect(urlToView({ view: 'matrix', sort: 'name', country: [], shortlist: [] })).toBe('matrix')
  })
})
