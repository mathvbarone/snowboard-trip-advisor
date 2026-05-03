import '@testing-library/jest-dom/vitest'

import { afterAll, afterEach, beforeAll } from 'vitest'

import { server } from './mocks/server'

// Global MSW lifecycle. Every admin test file inherits the canned harness;
// per-test overrides via server.use(http.get(...)) inside individual tests.
// onUnhandledRequest: 'error' surfaces SPA fetches that hit endpoints with
// no canned default — forces tests to be explicit about their network
// expectations.
beforeAll((): void => {
  server.listen({ onUnhandledRequest: 'error' })
})
afterEach((): void => {
  server.resetHandlers()
})
afterAll((): void => {
  server.close()
})
