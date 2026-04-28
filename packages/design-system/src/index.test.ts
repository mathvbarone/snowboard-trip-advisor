import { describe, expect, it } from 'vitest'

import {
  Button,
  EmptyStateLayout,
  formatDateRelative,
  formatMoney,
  formatMonths,
  formatNumber,
  formatPercent,
  Shell,
  Skeleton,
  tokens,
} from './index'

describe('package barrel (index.ts)', (): void => {
  it('re-exports the design tokens object the public API needs', (): void => {
    // Smoke check: each re-export resolves to a defined value at runtime.
    // Catches accidental mis-spellings or dropped exports in the barrel.
    expect(tokens).toBeDefined()
    expect(formatNumber).toBeDefined()
    expect(formatMoney).toBeDefined()
    expect(formatPercent).toBeDefined()
    expect(formatMonths).toBeDefined()
    expect(formatDateRelative).toBeDefined()
    expect(Shell).toBeDefined()
    expect(Skeleton).toBeDefined()
    expect(EmptyStateLayout).toBeDefined()
    expect(Button).toBeDefined()
  })
})
