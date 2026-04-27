import { defineConfig } from 'vite'
import type { InlineConfig } from 'vitest/node'

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
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
        // PR 2.1: the fixture-loading test pulls `data/published/current.v1.json` from
        // outside `packages/schema/src/`. The JSON itself is data, not instrumented
        // source — and v8's `include: ['src/**']` already excludes it from the coverage
        // surface. This entry is belt-and-braces in case future test files inline the
        // fixture path differently.
        'src/fixtures/**/*.json',
      ],
      reporter: ['text', 'lcov'],
    },
  },
})
