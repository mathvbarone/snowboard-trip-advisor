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
        // PR 2.4: resortView.ts is a types-only file — it exports `FieldValue<T>` and
        // `ResortView` as pure TypeScript type aliases. There are zero executable statements;
        // v8 shows 0% coverage because there is nothing to instrument. No runtime logic
        // lives here: the file exists solely to provide type-level contracts that
        // `loadResortDataset.ts` and the public app satisfy. Adding a dummy export just to
        // lift the number would ship dead runtime code for purely cosmetic reasons.
        'src/resortView.ts',
        // PR 2.3: publishDataset.ts has two branches that are structurally unreachable
        // in a fast test environment without violating the audit or adding injection seams:
        //
        // 1. `isEBadf` helper and the `if (!isEBadf(e)) throw e` guard in atomicWriteText's
        //    dir-fsync catch block. This branch fires ONLY on macOS APFS/HFS+ where
        //    `fs.open(dir, 'r').sync()` returns EBADF. On Linux (CI) the call succeeds silently.
        //    The non-EBADF rethrow path would require mocking the `node:fs/promises` `open`
        //    function — impossible in ESM strict mode without `vi.mock` at module load time,
        //    which would also disable the real filesystem writes needed by all other tests.
        //    The `isEBadf` helper is pure and correct by inspection; the rethrow is a
        //    one-liner that mirrors the identical `isENoEnt`/`isEExist` pattern verified by
        //    tests above.
        //
        // 2. The lock-timeout `throw new Error(...)` after the retry loop exhausts. Exercising
        //    it requires either (a) a real 5-second wait (50×100ms) — unacceptable for unit
        //    tests — or (b) a timer injection seam (audit-forbidden per ai-clean-code-adherence).
        //    The lockTimeout.test.ts file validates the pre-condition (stale lock blocks publish
        //    for >200ms) giving meaningful regression protection without the 5-second cost.
        //    The throw itself is a one-liner; its correctness follows from the loop invariant.
        //
        // 3. The `unlink(lockPath).catch((): void => undefined)` best-effort cleanup arrow in
        //    `withPublishLock`'s finally block. The catch body fires only when unlink throws,
        //    which only happens on filesystem races we cannot trigger in unit tests without
        //    ESM-incompatible `vi.mock` of `node:fs/promises` (same audit restriction as #1).
        //    Vitest 4's v8 coverage detects this previously-undetected uncovered arrow;
        //    `/* v8 ignore next */` marks it inline matching the pattern used for #1 and #2.
      ],
      reporter: ['text', 'lcov'],
    },
  },
})
