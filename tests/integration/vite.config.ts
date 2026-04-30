import { defineConfig } from 'vite'
import type { InlineConfig } from 'vitest/node'

declare module 'vite' {
  interface UserConfig {
    test?: InlineConfig
  }
}

// Integration test workspace. Hosts the cross-app integration suite —
// MSW handlers re-exported from apps/public/src/mocks/server.ts, full
// React Testing Library renders of `apps/public/src/App` against the
// seed dataset, jest-axe assertions per ADR-0007. Default jsdom
// environment is required because `runAxe` parses HTML via `DOMParser`
// and feeds the resulting Document to axe-core.
//
// `setupFiles` registers the jest-axe matcher and the MSW server
// lifecycle hooks. Coverage `include` covers both `.ts` (harness +
// existing eslint-config tests) and `.tsx` (the integration test
// scenarios under apps/public/) so the new tsx files are subject to
// the root 100% gate.
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test-setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['**/*.ts', '**/*.tsx'],
      exclude: ['**/*.test.ts', '**/*.test.tsx', '**/*.d.ts'],
      reporter: ['text', 'lcov'],
    },
  },
})
