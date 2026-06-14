import '@testing-library/jest-dom/vitest'

import { toHaveNoViolations } from 'jest-axe'
import { afterAll, afterEach, beforeAll, beforeEach, expect, vi } from 'vitest'

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

// Freeze the wall clock for every public-app test. Live-signal freshness
// (`loadResortDataset` → `liveField`) is computed from the real `Date` against
// each signal's `observed_at`; the public views (cards/matrix/detail) call the
// loader with `new Date()`, so without a fixed clock any test that asserts a
// concrete fresh value is a time-bomb — it silently flips to `stale` after
// FRESHNESS_TTL_DAYS.default (14d) and to `never_fetched`/"—" after .max_stale
// (30d) as the committed seed dataset ages. Pinning "now" one day after the
// seed's `observed_at` (2026-06-13) keeps the seed in its fresh window forever,
// decoupling the suite from the calendar. Only `Date` is faked
// (`shouldAdvanceTime` keeps Testing Library's real-timer `waitFor` deadlines
// working); MSW/Suspense timers stay real.
const PUBLIC_TEST_NOW = new Date('2026-06-14T08:00:00Z')

beforeEach((): void => {
  vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true })
  vi.setSystemTime(PUBLIC_TEST_NOW)
})

afterEach((): void => {
  vi.useRealTimers()
})

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
