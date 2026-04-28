import '@testing-library/jest-dom/vitest'

import { toHaveNoViolations } from 'jest-axe'
import { expect, vi } from 'vitest'

expect.extend(toHaveNoViolations)

// jsdom does not implement ResizeObserver / matchMedia. Radix UI primitives
// (Tooltip's floating element via `useSize`) rely on ResizeObserver; without
// the stub the layout-effect crashes synchronously inside React's commit
// phase. matchMedia is similarly polled by some Radix primitives — stubbed
// here so the design-system tests don't have to repeat the setup boilerplate
// the apps/public test-setup already does.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub)

vi.stubGlobal(
  'matchMedia',
  (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: (): void => undefined,
    removeListener: (): void => undefined,
    addEventListener: (): void => undefined,
    removeEventListener: (): void => undefined,
    dispatchEvent: (): boolean => false,
  }),
)
