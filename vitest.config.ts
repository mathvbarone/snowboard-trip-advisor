import { defineConfig } from 'vite'
import type { InlineConfig } from 'vitest/node'

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
//
// `tests/integration/**` is excluded from the root project because it is its
// own Vitest workspace (jsdom environment). Running its specs at the root
// would re-execute them in the default `node` environment where `DOMParser`
// and friends are undefined.
export default defineConfig({
  test: {
    // Vitest 4 replaces the standalone `vitest.workspace.ts` with the
    // `projects` field on the root config. Each entry is a workspace's
    // directory whose `vite.config.ts` defines its own test environment +
    // setup; coverage thresholds + include / exclude live here so the
    // 100% gate is evaluated once across the merged tree.
    projects: [
      'apps/public',
      'apps/admin',
      'packages/schema',
      'packages/design-system',
      'packages/integrations',
      'tests/integration',
      // Root project — runs only `scripts/**/*.test.ts` and `config/**/*.test.ts`
      // (see `test.include` below). Lets `scripts/generate-tokens.test.ts`
      // participate in the global coverage gate without belonging to a
      // package workspace.
      '.',
    ],
    include: ['scripts/**/*.test.ts', 'config/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'apps/*/src/**',
        'packages/*/src/**',
        'scripts/**',
        'config/**',
        'tests/integration/**',
      ],
      exclude: [
        '**/main.tsx',
        '**/test-setup.ts',
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
        // Vitest 4's v8 coverage walks every file matched by `include` as a
        // potential coverage target, which now includes JSON config files
        // colocated in workspaces. Exclude them explicitly — they have no
        // executable code so they always report 0/0 and drag coverage off
        // 100%. (Vitest 2 didn't pick these up; the discovery rules tightened.)
        '**/package.json',
        '**/tsconfig.json',
        // Per-workspace `vite.config.ts` files are configuration, not
        // production source. They aren't picked up under `apps/*/src/**`
        // or `packages/*/src/**`, but `tests/integration/**` is broader
        // (no `src/` subdir) so we exclude its config file explicitly.
        'tests/integration/vite.config.ts',
        // `apps/public/src/mocks/server.ts` is the MSW request handler bag for
        // the public app's test setup. It is loaded from `test-setup.ts` (also
        // excluded) and only fires from Vitest's lifecycle hooks; its handler
        // bodies will be exercised once tests start hitting `fetch` paths in
        // PR 3.1c. Excluding it keeps coverage honest while the SPA still has
        // no fetch call site.
        'apps/public/src/mocks/**',
        // `apps/public/src/state/useDataset.hmr.ts` — HMR-only safety net.
        // `import.meta.hot` is undefined in vitest (the entire module body
        // is dead code), so coverage measurement against it is structurally
        // impossible. The whole-file glob exclusion is the project's
        // standard pattern. CLAUDE.md "Coverage Rules" bans inline
        // coverage-suppression comments; the HMR block was extracted into
        // its own file specifically so the exclusion can be expressed as a
        // glob both here and in apps/public/vite.config.ts. See
        // useDataset.ts header for the cache-discipline rationale.
        'apps/public/src/state/useDataset.hmr.ts',
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
        // `scripts/check-*.cli.ts` are side-effect entry points run only via
        // `npm run analyze` (PR 3.6 — spec §7.12 / §6.7 / §10.2 / §10.7). The
        // pure logic each wraps lives in the matching `scripts/check-*.ts`
        // and carries 100% unit coverage. Same rationale as
        // `generate-tokens.cli.ts` above — running the CLI under vitest would
        // require spawning subprocesses to cover ~10 lines per file.
        'scripts/check-*.cli.ts',
        // `scripts/detect-qa-scope.cli.ts` — side-effect entry point that
        // streams stdin into the pure `detectQaScope` classifier in
        // `scripts/detect-qa-scope.ts` (which carries 100% unit coverage).
        // Invoked by `scripts/pre-commit` and `.github/workflows/quality-gate.yml`
        // for the docs-only QA carve-out. Same rationale as the other
        // `*.cli.ts` exclusions: covering the stdin-read shim would require
        // spawning subprocesses for no additional safety.
        'scripts/detect-qa-scope.cli.ts',
        // `scripts/install-git-hooks.cli.ts` — side-effect entry that resolves
        // the worktree's hooks dir via `git rev-parse --git-path hooks` and
        // writes the hook files. Same exclusion rationale as the other `*.cli.ts`
        // files above; the pure orchestrator at `scripts/install-git-hooks.ts`
        // carries 100% unit coverage with injected fs.
        'scripts/install-git-hooks.cli.ts',
        // `scripts/prepare-commit-msg` — shell script installed into the worktree
        // hooks dir by `npm run setup`; auto-adds the DCO `Signed-off-by:` trailer.
        'scripts/prepare-commit-msg',
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
