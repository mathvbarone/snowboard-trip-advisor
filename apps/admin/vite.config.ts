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
      exclude: ['src/main.tsx', 'src/test-setup.ts', '**/*.test.{ts,tsx}', '**/*.d.ts'],
      reporter: ['text', 'lcov'],
    },
  },
})
