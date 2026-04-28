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
