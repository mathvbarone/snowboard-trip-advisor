import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { toHaveNoViolations } from 'jest-axe'
import { afterAll, afterEach, beforeAll, expect, vi } from 'vitest'

import { server } from '../../apps/public/src/mocks/server'

// Integration test setup. Re-exports the apps/public MSW server so seed
// handlers stay one source of truth (a parallel server instance would
// drift). Registers the jest-axe matcher (ADR-0007) on the global
// `expect` so per-test code can call
// `expect(container).toHaveNoViolations()` directly without re-running
// `expect.extend(...)` per file. Cleans up Testing Library DOM between
// tests so leaked nodes / portals don't bleed into the next render.
//
// The matchMedia + ResizeObserver stubs mirror apps/public's test-setup
// (jsdom does not implement either; design-system primitives + a few
// public-app hooks probe both). Without these stubs an App-driven
// integration render crashes inside FieldValueRenderer's Tooltip
// (ResizeObserver) or useMediaQuery (matchMedia).

// Query-aware matchMedia stub. PR 4.6a introduced `useResponsiveTabOrder`
// which keys Shell tab-order on `(min-width: 900px)`; integration tests run
// as desktop-default (admin is loopback-only on desktop in Phase 1), so any
// `(min-width: ...)` query returns matches: true. Other queries return
// matches: false (preserves the apps/public matrix-below-md semantic, whose
// useMediaQuery doesn't gate on min-width). Per-test overrides via
// `vi.stubGlobal('matchMedia', ...)` can simulate sub-md viewports when a
// specific test needs that.
vi.stubGlobal(
  'matchMedia',
  (query: string): MediaQueryList => ({
    matches: query.startsWith('(min-width:'),
    media: query,
    onchange: null,
    addListener: (): void => undefined,
    removeListener: (): void => undefined,
    addEventListener: (): void => undefined,
    removeEventListener: (): void => undefined,
    dispatchEvent: (): boolean => false,
  }),
)

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
  cleanup()
})

afterAll((): void => {
  server.close()
})
