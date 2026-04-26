import { defineConfig } from 'vite'
import type { InlineConfig } from 'vitest'

declare module 'vite' {
  interface UserConfig {
    test?: InlineConfig
  }
}

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: [],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['**/*.test.{ts,tsx}', '**/*.d.ts'],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
      reporter: ['text', 'lcov'],
    },
  },
})
