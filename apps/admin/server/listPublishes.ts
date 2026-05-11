import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ISODateTimeString } from '@snowboard-trip-advisor/schema'
import type {
  ListPublishesQuery,
  ListPublishesResponse,
  PublishMetadata,
} from '@snowboard-trip-advisor/schema/api'

import type { HandlerDeps } from './listResorts'

// P1-8 fold: filename encoding is `${counter}-${sanitizeIsoForPath(iso)}.json`
// per packages/schema/src/publishDataset.ts:80-86, where sanitizeIsoForPath at
// line 246 is `iso.replace(/[:.]/g, '-')`. The counter is straightforward to
// capture; the iso portion is NOT a clean round-trip target via regex (the `-`
// substitution is lossy with respect to which characters were originally `:`
// vs `.` vs `-`). Authoritative `published_at` lives inside each archived
// JSON file — read from `body.published_at` (round-3 P1 fold: the schema
// field is `published_at`; `generated_at` does not exist on PublishedDataset).
const VERSION_FILENAME = /^(\d+)-(.+)\.json$/
const DEFAULT_LIMIT = 20

export interface ListPublishesInput {
  readonly query: ListPublishesQuery
}

interface ArchiveBody {
  readonly published_at: string
  readonly resorts: ReadonlyArray<{ slug: string }>
  readonly manifest?: { generated_by?: string }
}

export async function listPublishesHandler(
  input: ListPublishesInput,
  deps: HandlerDeps,
): Promise<ListPublishesResponse> {
  const historyDir = join(deps.workspaceRoot, 'data', 'published', 'history')
  const offset = input.query.page?.offset ?? 0
  const limit = input.query.page?.limit ?? DEFAULT_LIMIT

  let entries: ReadonlyArray<string>
  try {
    entries = await readdir(historyDir)
  } catch (e: unknown) {
    // Round-13 P2 fold: only ENOENT (directory doesn't exist = no publishes
    // yet, cold-start per spec §10.9) yields empty; other errors (EACCES, EIO,
    // non-directory at path) must propagate so the operator sees a 500 with
    // the failing operation instead of a misleading empty history.
    /* v8 ignore next 3 -- non-ENOENT readdir errors require OS-level injection
       (EACCES, EIO) to exercise; defensive rethrow matches health.ts /
       listResorts.ts pattern. */
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw e
    }
    entries = []
  }

  // Build sortable entries by counter; the lock-allocated counter IS the
  // canonical newest-first ordering per `publishDataset.ts:74-86`.
  const filtered: ReadonlyArray<{ counter: number; entry: string }> = entries.flatMap(
    (entry): ReadonlyArray<{ counter: number; entry: string }> => {
      const m = VERSION_FILENAME.exec(entry)
      if (m === null) {
        return []
      }
      const counterRaw = m[1]
      /* v8 ignore next -- VERSION_FILENAME's `(\d+)` group is guaranteed to
         match a non-empty digit string when the regex succeeds; the optional
         capture here only exists for noUncheckedIndexedAccess strictness. */
      if (counterRaw === undefined) {
        return []
      }
      return [{ counter: Number(counterRaw), entry }]
    },
  )
  const sorted = [...filtered].sort((a, b): number => b.counter - a.counter)

  const items: PublishMetadata[] = []
  for (const { entry } of sorted.slice(offset, offset + limit)) {
    const archivePath = join(historyDir, entry)
    const body = JSON.parse(await readFile(archivePath, 'utf-8')) as ArchiveBody
    items.push({
      version_id: entry.replace(/\.json$/, ''),
      // Brand the on-disk ISO string via the schema (PublishMetadata.
      // published_at is `ISODateTimeString`, a Zod brand on string).
      // Malformed archives would throw here — the operator surfaces a 500;
      // archives written by publishDataset are already format-valid by
      // construction (validatePublishedDataset gates the write).
      published_at: ISODateTimeString.parse(body.published_at),
      archive_path: archivePath,
      resort_count: body.resorts.length,
      // Phase 1 host fingerprint per spec §4.7 / §4.5.1.
      published_by: body.manifest?.generated_by ?? 'admin-workspace',
    })
  }

  return {
    items,
    page: { offset, limit, total: sorted.length },
  }
}
