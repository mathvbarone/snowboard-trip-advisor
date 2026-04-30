/**
 * publishDataset — atomic dataset publisher with monotonic counter under O_EXCL-based file lock.
 *
 * Spec ref: §9 PR 2.3 (atomic rename-based writes, archive filename `{monotonic-counter}-{iso-ms}.json`,
 * flock counter), §10.2 disposition row (pre-pivot impl was NOT atomic), §10.5 invariant 2
 * (validate before publish).
 *
 * Lock strategy: hand-rolled O_EXCL (fs.open with 'wx' flag). Avoids adding a runtime dependency
 * for a single call site. O_EXCL semantics are reliable on local POSIX filesystems (ext4, APFS) and
 * local NTFS. If this proves insufficient on network shares, migrate to `proper-lockfile` (Epic 5+).
 *
 * rootDir option: test-only seam that redirects writes away from the production data/published/.
 * Production callers use the default (process.cwd()-relative data/published/).
 */

import { randomUUID } from 'node:crypto'
import { open, mkdir, readFile, rename, unlink } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import { validatePublishedDataset } from './validatePublishedDataset'
import type { ValidationIssue } from './validatePublishedDataset'

// ---------------------------------------------------------------------------
// Constants — named at module top per plan implementer notes.
// ---------------------------------------------------------------------------

const DEFAULT_ROOT_DIR = 'data/published'                       // resolved relative to process.cwd() unless overridden
const COUNTER_FILE_NAME = '.archive-counter'
const COUNTER_LOCK_NAME = '.archive-counter.lock'
const HISTORY_DIR_NAME = 'history'
const CURRENT_FILE_NAME = 'current.v1.json'

/**
 * Maximum O_EXCL spin attempts before surfacing a lock-timeout error.
 * 50 × 100 ms = 5 seconds; generous for Phase 1 single-process admin app.
 */
export const COUNTER_LOCK_MAX_ATTEMPTS = 50

/**
 * Milliseconds to wait between lock-acquisition attempts.
 */
export const COUNTER_LOCK_RETRY_MS = 100

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type PublishOptions = { rootDir?: string }

export type PublishResult =
  | { ok: true; current_path: string; archive_path: string; counter: number }
  | { ok: false; issues: ReadonlyArray<ValidationIssue> }

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function publishDataset(
  input: unknown,
  { rootDir = DEFAULT_ROOT_DIR }: PublishOptions = {},
): Promise<PublishResult> {
  // §10.5 invariant 2: validate before any filesystem write.
  const validation = validatePublishedDataset(input)
  if (!validation.ok) {
    return { ok: false, issues: validation.issues }
  }

  const dataset = validation.dataset

  // Ensure the root + history directories exist (idempotent).
  const historyDir = join(rootDir, HISTORY_DIR_NAME)
  await mkdir(historyDir, { recursive: true })

  // Hold the lock for the entire publish — counter allocation + archive write + current
  // replacement — so concurrent publishes can't write current.v1.json out of counter order.
  // (The earlier design released the lock after counter allocation, which left a window where
  // a slow publish with a lower counter could overwrite a faster publish's current.v1.json
  // and regress the published snapshot relative to archive order. Codex P2 finding on PR #9.)
  return withPublishLock(rootDir, async (counter): Promise<PublishResult> => {
    const isoMs = sanitizeIsoForPath(new Date().toISOString())
    const archivePath = join(historyDir, `${String(counter)}-${isoMs}.json`)
    const currentPath = join(rootDir, CURRENT_FILE_NAME)
    const body = JSON.stringify(dataset, null, 2)
    await atomicWriteText(archivePath, body)
    await atomicWriteText(currentPath, body)
    return { ok: true, current_path: currentPath, archive_path: archivePath, counter }
  })
}

// ---------------------------------------------------------------------------
// Publish lock — O_EXCL spin lock that wraps the entire publish lifecycle.
//
// Acquires the lock, reads + increments + persists the counter, then runs `body(counter)`
// while still holding the lock. The lock is released only after `body` resolves (or throws).
// This serializes both counter allocation AND the archive/current writes, preventing the
// out-of-counter-order overwrite race a counter-only lock would permit.
// ---------------------------------------------------------------------------

async function withPublishLock<T>(
  rootDir: string,
  body: (counter: number) => Promise<T>,
): Promise<T> {
  const counterPath = join(rootDir, COUNTER_FILE_NAME)
  const lockPath = join(rootDir, COUNTER_LOCK_NAME)

  for (let attempt = 0; attempt < COUNTER_LOCK_MAX_ATTEMPTS; attempt += 1) {
    try {
      // 'wx' = O_WRONLY | O_CREAT | O_EXCL — atomic create-or-fail.
      const lockFh = await open(lockPath, 'wx')
      try {
        // Read current counter; default to 0 if absent (first publish).
        let current = 0
        try {
          const raw = await readFile(counterPath, 'utf8')
          const parsed = Number.parseInt(raw, 10)
          if (Number.isFinite(parsed) && parsed >= 0) {
            current = parsed
          }
        } catch (e: unknown) {
          // ENOENT = counter file doesn't exist yet (first publish). Any other error is
          // unexpected (e.g. EISDIR, permission denied) and must surface to the caller.
          if (!isENoEnt(e)) {
            throw e
          }
        }
        const next = current + 1
        await atomicWriteText(counterPath, String(next))
        // Run the publish body while still holding the lock.
        return await body(next)
      } finally {
        await lockFh.close()
        // Best-effort cleanup: if unlink fails, the next caller times out cleanly.
        // A future hardening pass (Epic 5) could add stale-lock detection via PID.
        // The catch arrow body is unreachable in the test environment — unlink only
        // throws on filesystem race conditions we can't trigger in unit tests
        // without ESM-incompatible vi.mock of node:fs/promises (the same audit
        // restriction that motivates the EBADF and lock-timeout `v8 ignore`
        // markers below). Exclusion rationale also recorded in
        // packages/schema/vite.config.ts.
        /* v8 ignore next */
        await unlink(lockPath).catch((): void => undefined)
      }
    } catch (e: unknown) {
      // EEXIST = another process holds the lock — spin with backoff.
      if (!isEExist(e)) {
        throw e
      }
      await sleep(COUNTER_LOCK_RETRY_MS)
    }
  }

  /* v8 ignore next 3 -- lock-timeout throw: reachable only when a process crashes mid-lock and
     leaves a stale .archive-counter.lock file for >5s (50×100ms). Exercising this in a fast unit
     test requires either a 5s real wait (unacceptable) or a timer/constant injection seam
     (audit-forbidden). The lockTimeout.test.ts validates the spin-loop pre-condition (stale lock
     blocks publish for >200ms). Exclusion rationale also recorded in packages/schema/vite.config.ts. */
  throw new Error(
    `publishDataset: could not acquire lock on ${lockPath} after ${String(COUNTER_LOCK_MAX_ATTEMPTS)} attempts`,
  )
}

// ---------------------------------------------------------------------------
// Atomic write helper — staged tmp → fsync(fd) → rename → fsync(parent_dir)
//
// Per ai-clean-code-adherence audit: a single helper; callers stringify before calling.
// This makes call sites honest about what they're writing and removes the two-helper ceremony.
// ---------------------------------------------------------------------------

async function atomicWriteText(targetPath: string, body: string): Promise<void> {
  const dir = dirname(targetPath)
  const tmp = join(dir, `.${basename(targetPath)}.tmp.${String(process.pid)}.${randomUUID()}`)

  // 1. Write tempfile (exclusive create — fail loudly if tmp collides, which is impossible
  //    given the UUID suffix, but the open mode makes it explicit).
  const fh = await open(tmp, 'wx')
  try {
    await fh.writeFile(`${body}\n`, 'utf8')
    // 2. fsync file contents to disk before rename (durable even on power loss).
    await fh.sync()
  } finally {
    await fh.close()
  }

  // 3. Atomic rename — on POSIX this is a single syscall; the target either sees the old or
  //    new content, never a partial write.
  await rename(tmp, targetPath)

  // 4. fsync the parent directory so the rename's directory entry survives a crash.
  //    On Linux ext4 this is mandatory; on macOS APFS it is a no-op (2026-04-27: macOS
  //    fs.open(dir, 'r').sync() returns EBADF on APFS — tolerate it silently).
  const dirFh = await open(dir, 'r')
  try {
    await dirFh.sync()
  /* v8 ignore start -- catch block for dirFh.sync() is only entered on macOS APFS/HFS+
     where fs.open(dir,'r').sync() returns EBADF. On Linux ext4 (CI) dirFh.sync() never
     throws, so this catch is unreachable in the test environment. The non-EBADF rethrow
     path requires an unexpected filesystem error untriggerable without mocking node:fs/promises
     at module load — impossible in ESM without vi.mock (which would break the real-fs tests).
     Exclusion rationale also recorded in packages/schema/vite.config.ts. */
  } catch (e: unknown) {
    // macOS APFS / HFS+: fs.open(dir, 'r').sync() returns EBADF because the OS does not
    // permit fsync on a directory fd. This is a known no-op platform limitation — the rename
    // is already durable on APFS without an explicit dir fsync. Re-throw all other errors.
    if (!isEBadf(e)) {
      throw e
    }
  /* v8 ignore stop */
  } finally {
    await dirFh.close()
  }
}

// ---------------------------------------------------------------------------
// Error-code helpers
//
// These are exported for direct unit testing to cover the pure conditional
// logic without triggering platform-specific filesystem behaviour.
// ---------------------------------------------------------------------------

export function isENoEnt(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === 'ENOENT'
}

export function isEExist(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === 'EEXIST'
}

/**
 * Returns true if `e` is an EBADF ("Bad file descriptor") error.
 * Used to tolerate macOS APFS/HFS+ returning EBADF when syncing a directory fd —
 * a no-op platform limitation; the rename is already durable on APFS without dir fsync.
 * Exported for unit testing (the production code path that exercises this is macOS-only).
 */
export function isEBadf(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === 'EBADF'
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sanitizeIsoForPath(iso: string): string {
  // Replace `:` and `.` with `-` so the filename is portable across all filesystems.
  return iso.replace(/[:.]/g, '-')
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve): void => {
    setTimeout(resolve, ms)
  })
}
