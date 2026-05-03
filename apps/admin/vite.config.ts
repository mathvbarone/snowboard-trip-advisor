import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { InlineConfig } from 'vitest/node'

import { adminApiPlugin } from './vite-plugin-admin-api'

declare module 'vite' {
  interface UserConfig {
    test?: InlineConfig
  }
}

// Phase 1 admin runs loopback-only on 127.0.0.1:5174 with strictPort. The
// adminApiPlugin attaches the typed /api/* dispatch as Connect middleware
// (see vite-plugin-admin-api.ts). No CSP per spec §10.6 — admin is dev-only.
export default defineConfig({
  plugins: [react(), adminApiPlugin()],
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
  },
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
