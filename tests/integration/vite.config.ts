import { defineConfig } from 'vite'
import type { InlineConfig } from 'vitest'

declare module 'vite' {
  interface UserConfig {
    test?: InlineConfig
  }
}

// Integration test workspace. Per-route extensions (MSW handlers,
// Testing Library renders, axe assertions) land in Epic 3 PR 3.6.
// Default jsdom environment is required because `runAxe` parses HTML
// via `DOMParser` and feeds the resulting Document to axe-core.
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
    coverage: {
      provider: 'v8',
      include: ['*.ts'],
      exclude: ['*.test.ts', '*.d.ts'],
      reporter: ['text', 'lcov'],
    },
  },
})
