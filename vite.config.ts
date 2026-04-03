import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { InlineConfig } from 'vitest'

declare module 'vite' {
  interface UserConfig {
    test?: InlineConfig
  }
}

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true,
    exclude: ['node_modules/**', '.worktrees/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**', 'research/**'],
      exclude: [
        'src/main.tsx',
        'src/test/**',
        'research/sources/fetchText.ts',
        'config/scoring.ts',
        '**/*.test.{ts,tsx}',
        '**/__fixtures__/**',
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
