import '@testing-library/jest-dom/vitest'

import { toHaveNoViolations } from 'jest-axe'
import { afterAll, afterEach, beforeAll, expect, vi } from 'vitest'

import { server } from './mocks/server'
import { __resetForTests as resetDatasetCache } from './state/useDataset'

// jsdom does not implement matchMedia. Stub it with a stable
// MediaQueryList shape so React hooks that probe `(prefers-color-scheme: …)`
// or breakpoints don't crash in tests.
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

// jsdom does not implement ResizeObserver. Radix's react-popper (used by
// FieldValueRenderer's Tooltip) calls `new ResizeObserver(...)` inside a
// useLayoutEffect when its content/arrow refs populate. ShortlistDrawer
// did not trigger this branch (no FieldValueRenderer inside the drawer);
// DetailDrawer composes FieldValueRenderer inside the Drawer's Portal,
// which is the first place in apps/public's tests that hits the popper
// ResizeObserver path. Mirrors the design-system test-setup stub.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub)

expect.extend(toHaveNoViolations)

beforeAll((): void => {
  server.listen({ onUnhandledRequest: 'error' })
})

afterEach((): void => {
  server.resetHandlers()
  server.events.removeAllListeners()
  resetDatasetCache()
})

afterAll((): void => {
  server.close()
})
