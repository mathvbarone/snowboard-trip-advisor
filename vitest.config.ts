import { defineConfig } from 'vite'
import type { InlineConfig } from 'vitest'

declare module 'vite' {
  interface UserConfig {
    test?: InlineConfig
  }
}

// Root vitest config — merges per-workspace coverage so the 100% threshold
// is evaluated once across the whole tree. Per-workspace `vite.config.ts`
// files still drive their own test environment + setup; coverage thresholds
// here are the source of truth (v8 aggregates instrumentation across projects).
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: [
        'apps/*/src/**',
        'packages/*/src/**',
      ],
      exclude: [
        '**/main.tsx',
        '**/test-setup.ts',
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
      ],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
      reporter: ['text', 'lcov'],
    },
  },
})
