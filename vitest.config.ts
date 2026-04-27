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
//
// The root project (referenced as `.` in `vitest.workspace.ts`) only claims
// `scripts/**/*.test.ts` — package workspaces still own everything under
// `apps/*` and `packages/*`. This is what lets `scripts/generate-tokens.test.ts`
// participate in the global coverage gate without belonging to a workspace.
export default defineConfig({
  test: {
    include: ['scripts/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'apps/*/src/**',
        'packages/*/src/**',
        'scripts/**',
      ],
      exclude: [
        '**/main.tsx',
        '**/test-setup.ts',
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
        // `scripts/hooks/**` are shell scripts (test-hooks.sh, deny-dangerous-git.sh).
        'scripts/hooks/**',
        // `scripts/pre-commit` is a shell script installed into the worktree
        // hooks dir by `npm run setup`.
        'scripts/pre-commit',
        // `scripts/generate-tokens.cli.ts` is a side-effect entry point that
        // writes `packages/design-system/tokens.css` at import time. Its three
        // executable lines are exercised end-to-end by `npm run tokens:generate`
        // (and the `tokens:check` drift gate in `npm run qa`); the pure
        // renderer it wraps lives in `scripts/generate-tokens.ts` and carries
        // 100% unit coverage. Keeping the CLI out of v8 instrumentation avoids
        // an awkward "spawn a subprocess from a unit test" pattern just to
        // cover three lines.
        'scripts/generate-tokens.cli.ts',
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
