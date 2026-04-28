import { describe, expect, it } from 'vitest'

import { airbnbDeepLink, bookingDeepLink } from './deepLinks'

// PR 3.1c ships a skeleton: the builders throw `'lands in PR 3.5'` so any
// accidental call site (other than the deliberate stub-throw in
// views/detail.tsx, which is gated behind URL state and never invoked in
// PR 3.1c tests) surfaces as a clear error. PR 3.5 fills the bodies and
// replaces these tests with the full happy-path matrix.

describe('deepLinks (PR 3.1c skeleton)', (): void => {
  it('bookingDeepLink throws "lands in PR 3.5"', (): void => {
    expect(() => bookingDeepLink({ slug: 'a-resort', name: 'A' })).toThrow('lands in PR 3.5')
  })

  it('airbnbDeepLink throws "lands in PR 3.5"', (): void => {
    expect(() => airbnbDeepLink({ slug: 'a-resort', name: 'A' })).toThrow('lands in PR 3.5')
  })
})
