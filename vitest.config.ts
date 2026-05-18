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
    include: ['scripts/**/*.test.ts', 'config/**/*.test.ts', 'tests/eslint/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'apps/*/src/**',
        // PR 4.0 fold: Tier 1 PR 4.1b stub handlers + Vite plugin (dispatch
        // helper unit-tested; lifecycle adapter is /* v8 ignore */-marked
        // because Vite must boot for the hook to fire).
        'apps/admin/server/**',
        'apps/admin/vite-plugin-admin-api.ts',
        'packages/*/src/**',
        // PR 4.0 fold: Tier 1 PR 4.1a wire-contract surface lives outside
        // packages/schema/src/ — covered explicitly so the 100% gate is
        // not vacuous on that path.
        'packages/schema/api/**',
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
        // `apps/admin/src/mocks/server.ts` — same rationale as apps/public
        // above. The canned MSW handlers (PR 4.1b §2.5) are fallback defaults;
        // SPA tests (apiClient.test.ts and the future view tests) override
        // every endpoint they hit via server.use(...). The canned handler
        // closures therefore don't fire in tests. Exercising them would
        // require dedicated round-trip tests that pin canned-default
        // behavior — overkill for what is essentially boilerplate.
        //
        // `apps/admin/src/mocks/realHandlers.ts` (PR 4.1b §2.6 bridge harness)
        // IS in coverage — its tests exercise the dispatch-bridge round trip
        // directly. Only the canned defaults are skipped.
        'apps/admin/src/mocks/server.ts',
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
        // `apps/admin/src/state/useResortDetail.hmr.ts` — same rationale as
        // useDataset.hmr.ts above. PR 4.4a-2 (Decision D3 dual-cache + Codex
        // round-8 P2-12 cycle-free HMR). Mirrored in apps/admin/vite.config.ts
        // for the workspace-level coverage view.
        'apps/admin/src/state/useResortDetail.hmr.ts',
        // `apps/admin/src/state/useAnalystNotes.hmr.ts` — same HMR dead-code
        // pattern as useResortDetail.hmr.ts. PR N.c1 (read hook). Mirrored
        // in apps/admin/vite.config.ts for the workspace-level coverage view.
        'apps/admin/src/state/useAnalystNotes.hmr.ts',
        // `apps/admin/src/state/useAnalystNoteDraft.hmr.ts` — same HMR
        // dead-code pattern as useAnalystNotes.hmr.ts. PR N.c2 (write hook).
        // Mirrored in apps/admin/vite.config.ts for the workspace-level
        // coverage view.
        'apps/admin/src/state/useAnalystNoteDraft.hmr.ts',
        // `apps/admin/src/state/useWorkspaceState.hmr.ts` — same HMR
        // dead-code pattern as useAnalystNoteDraft.hmr.ts. PR N.c3:
        // useWorkspaceState now registers a flusher into the persistent
        // flushAll.ts registry, so it inherits the same cross-generation
        // stale-flusher cleanup. Mirrored in apps/admin/vite.config.ts for
        // the workspace-level coverage view.
        'apps/admin/src/state/useWorkspaceState.hmr.ts',
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
        // S1.0: gallery-smoke.md is the co-located per-PR smoke procedure doc
        // for the dev-only component gallery. It lives under apps/admin/src/
        // (next to Gallery.tsx so the cascade-verification steps stay with the
        // surface they verify) so the `apps/*/src/**` include glob sweeps it;
        // v8's uncovered-file walk then tries to parse the Markdown as source
        // and logs a non-fatal parse error every coverage run. It has no
        // executable code — exclude it explicitly (same rationale as the
        // non-source config excludes above). Mirrored in apps/admin/vite.config.ts.
        'apps/admin/src/views/gallery-smoke.md',
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
