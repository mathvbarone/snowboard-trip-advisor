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
  Toast,
  ToastProvider,
  tokens,
  useToast,
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

  // PR 4.5b: Toast primitive lands; the admin app's publish flow (PR 4.5c)
  // imports `Toast`, `ToastProvider`, `useToast` (and the three types
  // re-exported via `export type`). Pin the runtime re-exports here so
  // accidental drops in the barrel surface as a test failure.
  it('re-exports Toast, ToastProvider, and useToast for the Tier 4 publish flow', (): void => {
    expect(Toast).toBeDefined()
    expect(ToastProvider).toBeDefined()
    expect(useToast).toBeDefined()
  })
})
