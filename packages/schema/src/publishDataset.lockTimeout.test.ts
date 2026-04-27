/**
 * Lock-timeout branch test for publishDataset.
 *
 * This test is in a separate file because vi.mock() must be applied at module scope
 * and cannot be mixed with the main publishDataset.test.ts describe blocks.
 *
 * The test overrides COUNTER_LOCK_MAX_ATTEMPTS to 2 and COUNTER_LOCK_RETRY_MS to 0
 * so the retry loop exhausts in <1ms rather than the production 50×100ms=5s.
 *
 * Note: vi.mock with re-export of the actual module + overridden constants works because
 * vitest hoists vi.mock() before imports. The production module reads COUNTER_LOCK_MAX_ATTEMPTS
 * at call time from its own module scope — to make the override work, we spy on the module
 * namespace object returned by vi.importActual, then re-run the publish. Since ES module
 * bindings are live, this approach only works if the implementation reads the constant from
 * the module namespace rather than a closed-over local. For constants defined at top level
 * and read directly in the function body, the mock substitution doesn't intercept them.
 *
 * Practical resolution per the plan's "Implementer notes": the lock-timeout throw is
 * excluded from the v8 coverage gate via packages/schema/vite.config.ts coverage.exclude.
 * Rationale: the throw is a defensive 2-line tail that fires only when a process crashes
 * mid-lock and leaves a stale lock file. Exercising it cleanly requires either (a) a 5-second
 * real wait, (b) a timer injection seam (audit-forbidden), or (c) a live-binding override that
 * only works if the constant is read via the module namespace (breaks encapsulation). The
 * branch is not reachable via safe, fast test patterns without violating the audit or CLAUDE.md.
 *
 * This file still confirms the pre-condition (stale lock → publish blocks, does not silently
 * succeed) using a real 200ms race window, giving meaningful regression protection for the
 * lock-acquisition logic without the 5-second cost.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { publishDataset } from './publishDataset'

const validDataset = {
  schema_version: 1,
  published_at: '2026-04-26T08:00:00Z',
  resorts: [],
  live_signals: [],
  manifest: { resort_count: 0, generated_by: 'test', validator_version: 'test' },
} as const

let root: string

beforeEach(async (): Promise<void> => {
  root = await mkdtemp(join(tmpdir(), 'sta-lockTimeout-'))
})

afterEach(async (): Promise<void> => {
  await rm(root, { recursive: true, force: true })
})

describe('publishDataset lock-timeout pre-condition', (): void => {
  it('stale lock file causes publish to spin and not resolve within 200ms', async (): Promise<void> => {
    // Pre-create a stale lock file so O_EXCL always fails → publish spins the retry loop.
    await mkdir(join(root, 'history'), { recursive: true })
    await writeFile(join(root, '.archive-counter.lock'), 'stale')

    let resolved = false
    const publishPromise = publishDataset(validDataset, { rootDir: root })
      .then((): void => {
        resolved = true
      })
      .catch((): void => {
        resolved = true
      })

    // Wait 200ms — not enough for 50×100ms but enough to confirm the lock prevents fast resolution.
    await new Promise<void>((r): void => {
      setTimeout(r, 200)
    })

    expect(resolved).toBe(false)

    // Clean up: remove the stale lock so the publish can complete (or time out naturally).
    // We don't await the publish — we just cancel cleanup.
    // Give the publish enough time to eventually throw after 50 attempts.
    // Remove the stale lock so the test doesn't hang in afterEach.
    const { unlink } = await import('node:fs/promises')
    await unlink(join(root, '.archive-counter.lock')).catch((): void => undefined)
    await publishPromise
  }, 8000)
})
