import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { PublishedDataset, WorkspaceFile, type ResortSlug } from '@snowboard-trip-advisor/schema'
import { atomicWriteText } from '@snowboard-trip-advisor/schema/node'
import type { z } from 'zod'

// Phase 1 lazy-create per spec §10.9 — matches publishDataset.ts:30's pattern
// for data/published/history/. mkdir -p semantics, idempotent.
export async function ensureWorkspaceDir(root: string): Promise<void> {
  await mkdir(join(root, 'data', 'admin-workspace'), { recursive: true })
}

// Per Decision C1+: canonical read-helper signatures land here in PR 4.4a-2
// for `resortDetail.ts` to consume. `health.ts` and `listResorts.ts` keep
// their existing duplicates; a separate post-Tier-3 refactor PR ports them
// onto this shape. Mirrors health.ts's separate ENOENT / SyntaxError guards
// (NOT listResorts.ts's collapsed predicate) so each error class has a
// dedicated test surface.

export class WorkspaceCorruptError extends Error {
  public readonly code = 'workspace-corrupt' as const
  public readonly slug: string
  public readonly issues: ReadonlyArray<z.core.$ZodIssue>

  public constructor(slug: string, issues: ReadonlyArray<z.core.$ZodIssue>, message: string) {
    super(message)
    this.name = 'WorkspaceCorruptError'
    this.slug = slug
    this.issues = issues
  }

  // PR 4.4c modifies dispatch.ts to read `.details` and pass it through the
  // error envelope (per spec §4.10). Until then dispatch only forwards
  // `.code` and `.message`; `.details` is dormant but already pinned by
  // workspace.test.ts so a future executor doesn't drop it.
  public get details(): { slug: string; issues: ReadonlyArray<z.core.$ZodIssue> } {
    return { slug: this.slug, issues: this.issues }
  }
}

export async function readWorkspaceFileForSlug(
  workspaceDir: string,
  slug: string,
): Promise<WorkspaceFile | null> {
  const path = join(workspaceDir, `${slug}.json`)
  let text: string
  try {
    text = await readFile(path, 'utf-8')
  } catch (err: unknown) {
    /* v8 ignore next 3 -- non-ENOENT readFile errors (EACCES, EIO, etc.) are defensive
       rethrows; testing them would require injecting OS-level permission failures. */
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err
    }
    return null
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (err: unknown) {
    /* v8 ignore next 3 -- JSON.parse only throws SyntaxError; the rethrow guards
       future Node versions that might surface different error classes. */
    if (!(err instanceof SyntaxError)) {
      throw err
    }
    throw new WorkspaceCorruptError(slug, [], `malformed JSON in ${slug}.json: ${err.message}`)
  }
  const parsed = WorkspaceFile.safeParse(raw)
  if (!parsed.success) {
    throw new WorkspaceCorruptError(
      slug,
      parsed.error.issues,
      `workspace file ${slug}.json failed schema validation: ${parsed.error.issues.map((i): string => i.message).join('; ')}`,
    )
  }
  // Codex P2 fold: WorkspaceFile.parse only enforces internal consistency
  // (top-level slug === resort.slug === live_signal.resort_slug). It does
  // NOT verify the filename matches the embedded slug. A renamed/copied file
  // (kotelnica.json containing slug: 'spindleruv-mlyn', valid internally)
  // would otherwise project the wrong resort under the requested route.
  // Treat filename↔slug drift as corruption — same surface as the other
  // schema-validation failures.
  if (parsed.data.slug !== slug) {
    throw new WorkspaceCorruptError(
      slug,
      [],
      `workspace file ${slug}.json embeds slug "${parsed.data.slug}" — filename/slug drift`,
    )
  }
  return parsed.data
}

// Per PR 4.4c §B1: thin pass-through to the canonical
// atomicWriteText (publishDataset.ts:169) so the workspace write path uses
// the same fsync→rename→fsync sequence the publish path proved out — no
// drift on the macOS-APFS EBADF tolerance + tmp-cleanup branches. The
// wrapper exists so workspace-write call sites read as
// atomicWriteWorkspaceFile rather than the schema-level primitive — domain
// naming + a stable seam if a workspace-specific behavior (e.g., dir create
// on cold-start) ever needs to layer in.
export async function atomicWriteWorkspaceFile(
  targetPath: string,
  body: string,
): Promise<void> {
  await atomicWriteText(targetPath, body)
}

export async function readPublishedDocOrNull(
  publishedPath: string,
): Promise<z.infer<typeof PublishedDataset> | null> {
  let text: string
  try {
    text = await readFile(publishedPath, 'utf-8')
  } catch (err: unknown) {
    /* v8 ignore next 3 -- non-ENOENT readFile errors are defensive rethrows. */
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err
    }
    return null
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (err: unknown) {
    /* v8 ignore next 3 -- JSON.parse only throws SyntaxError; the rethrow guards
       future Node versions that might surface different error classes. */
    if (!(err instanceof SyntaxError)) {
      throw err
    }
    // Spec §10.9: malformed published doc is operationally equivalent to
    // absent — degrade gracefully so the admin app keeps working.
    return null
  }
  const parsed = PublishedDataset.safeParse(raw)
  return parsed.success ? parsed.data : null
}

// Exported for the no-leak probe in workspace.test.ts — the cleanup
// invariant (entry deleted on identity match after settle) is only
// observable via the map itself. Not part of the production API surface.
export const slugLocks = new Map<ResortSlug, Promise<unknown>>()

/**
 * Serializes write operations for a slug. INTRA-PROCESS promise mutex —
 * distinct from `publishDataset`'s `withPublishLock`, which is an
 * INTER-PROCESS file lock (O_EXCL).
 *
 * Phase 1: Vite middleware runs single-process; in-memory Map serializes.
 * Phase 2: Hono service may run multi-instance; lift to inter-process
 *   (Postgres `pg_advisory_lock` or equivalent).
 *
 * Readers do NOT acquire — atomic rename gives readers old-or-new file,
 * never partial.
 */
export async function withSlugLock<T>(slug: ResortSlug, fn: () => Promise<T>): Promise<T> {
  const prev = slugLocks.get(slug) ?? Promise.resolve()
  const next = prev.then(fn, fn)  // run fn after prev settles (success or fail)
  slugLocks.set(slug, next)
  void next.catch(() => {})  // `void` satisfies AGENTS.md §"Code Rules → TypeScript" ("Do not leave promises unhandled. Await them or mark them with `void`."); the `.catch` suppresses unhandled-rejection without rebinding the lock entry
  try {
    return await next
  } finally {
    // Strict identity compare: only delete the entry we ourselves stored.
    // The bug pattern `slugLocks.set(slug, next.catch(() => {}))` would make
    // this never match (different Promise) and the map would leak.
    if (slugLocks.get(slug) === next) {
      slugLocks.delete(slug)
    }
  }
}
