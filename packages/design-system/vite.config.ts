import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { InlineConfig } from 'vitest/node'

declare module 'vite' {
  interface UserConfig {
    test?: InlineConfig
  }
}

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
        // PR 3.1c: test-setup.ts wires '@testing-library/jest-dom/vitest'
        // and jest-axe's `toHaveNoViolations` matcher into vitest's expect.
        // It runs at vitest setup time, has no production caller, and
        // contains no testable conditional logic.
        'src/test-setup.ts',
      ],
      reporter: ['text', 'lcov'],
    },
  },
})
