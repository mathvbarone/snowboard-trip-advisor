import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { listPublishesHandler } from '../listPublishes'
import type { HandlerDeps } from '../listResorts'

/**
 * Build a minimal valid archive body for a given published_at + resort count.
 * The handler reads `body.published_at` + `body.resorts.length` +
 * `body.manifest.generated_by` from each file matching VERSION_FILENAME.
 */
function archiveBody(
  publishedAt: string,
  resortCount: number,
  generatedBy: string = 'test-seed',
): string {
  return JSON.stringify({
    schema_version: 1,
    published_at: publishedAt,
    resorts: Array.from({ length: resortCount }, (_, i): { slug: string } => ({
      slug: `resort-${String(i)}`,
    })),
    live_signals: [],
    manifest: {
      resort_count: resortCount,
      generated_by: generatedBy,
      validator_version: '1',
    },
  })
}

describe('listPublishesHandler', (): void => {
  let workspaceRoot: string
  let deps: HandlerDeps

  beforeEach(async (): Promise<void> => {
    workspaceRoot = await mkdtemp(join(tmpdir(), 'snowboard-list-pub-'))
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-11T00:00:00.000Z'))
    deps = { workspaceRoot }
  })

  afterEach(async (): Promise<void> => {
    vi.useRealTimers()
    await rm(workspaceRoot, { recursive: true, force: true })
  })

  it('returns empty items + page metadata for empty history', async (): Promise<void> => {
    const r = await listPublishesHandler({ query: {} }, deps)
    expect(r.items).toEqual([])
    expect(r.page).toEqual({ offset: 0, limit: 20, total: 0 })
  })

  it('parses ${counter}-${iso}.json filenames; sorts newest-first by counter', async (): Promise<void> => {
    const dir = join(workspaceRoot, 'data', 'published', 'history')
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, '1-2026-05-09T00-00-00-000Z.json'),
      archiveBody('2026-05-09T00:00:00.000Z', 0),
    )
    await writeFile(
      join(dir, '2-2026-05-10T00-00-00-000Z.json'),
      archiveBody('2026-05-10T00:00:00.000Z', 0),
    )

    const r = await listPublishesHandler({ query: {} }, deps)
    expect(r.items).toHaveLength(2)
    expect(r.items[0]?.version_id).toBe('2-2026-05-10T00-00-00-000Z')
    expect(r.items[1]?.version_id).toBe('1-2026-05-09T00-00-00-000Z')
    // Authoritative published_at is read from inside the file, NOT reverse-
    // regex'd from the filename (P1-8 fold). The fixture writes the canonical
    // ISO format; the handler returns it unchanged.
    expect(r.items[0]?.published_at).toBe('2026-05-10T00:00:00.000Z')
  })

  it('respects page.offset + page.limit', async (): Promise<void> => {
    const dir = join(workspaceRoot, 'data', 'published', 'history')
    await mkdir(dir, { recursive: true })
    for (let n = 1; n <= 25; n += 1) {
      const dd = String(n).padStart(2, '0')
      await writeFile(
        join(dir, `${String(n)}-2026-05-${dd}T00-00-00-000Z.json`),
        archiveBody(`2026-05-${dd}T00:00:00.000Z`, 0),
      )
    }
    const r = await listPublishesHandler(
      { query: { page: { offset: 20, limit: 5 } } },
      deps,
    )
    expect(r.items).toHaveLength(5)
    expect(r.page).toEqual({ offset: 20, limit: 5, total: 25 })
  })

  it('skips files that do not match the version pattern', async (): Promise<void> => {
    const dir = join(workspaceRoot, 'data', 'published', 'history')
    await mkdir(dir, { recursive: true })
    // P2 fold: the matching `1-...json` needs a real archive body — the
    // handler reads body.published_at + body.resorts for every filename
    // matching VERSION_FILENAME, so `{}` would crash before the
    // non-matching assertion could fire.
    await writeFile(
      join(dir, '1-2026-05-09T00-00-00-000Z.json'),
      archiveBody('2026-05-09T00:00:00.000Z', 0),
    )
    await writeFile(join(dir, 'not-a-version.json'), '{}')
    await writeFile(join(dir, 'README.txt'), 'unrelated')

    const r = await listPublishesHandler({ query: {} }, deps)
    expect(r.items).toHaveLength(1)
  })

  it('reads `published_by` from `manifest.generated_by` (spec §4.7)', async (): Promise<void> => {
    const dir = join(workspaceRoot, 'data', 'published', 'history')
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, '1-2026-05-09T00-00-00-000Z.json'),
      archiveBody('2026-05-09T00:00:00.000Z', 2, 'admin-workspace host=abc123'),
    )

    const r = await listPublishesHandler({ query: {} }, deps)
    expect(r.items[0]?.published_by).toBe('admin-workspace host=abc123')
    expect(r.items[0]?.resort_count).toBe(2)
  })

  it('falls back to `admin-workspace` when manifest.generated_by is absent (defensive — older archive shape)', async (): Promise<void> => {
    // Archives written by publishDataset always carry manifest.generated_by;
    // this branch is a defensive ?? fallback for any archive that pre-dates
    // the round-22 fold or was hand-written.
    const dir = join(workspaceRoot, 'data', 'published', 'history')
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, '1-2026-05-09T00-00-00-000Z.json'),
      JSON.stringify({
        schema_version: 1,
        published_at: '2026-05-09T00:00:00.000Z',
        resorts: [],
        live_signals: [],
        // manifest absent entirely → falls back to 'admin-workspace'.
      }),
    )

    const r = await listPublishesHandler({ query: {} }, deps)
    expect(r.items[0]?.published_by).toBe('admin-workspace')
  })
})
