import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { isEBadf, isEExist, isENoEnt, publishDataset, sleep } from './publishDataset'
import { PublishedDataset } from './published'

let root: string

// One-resort minimum fixture: PR 3.1a tightens PublishedDataset to
// `resorts.min(1)`. publishDataset runs the full validatePublishedDataset
// pipeline, which enforces METRIC_FIELDS coverage — so the resort needs a
// field_sources entry per durable metric path.
const SOURCE = {
  source: 'manual',
  source_url: 'https://bialkatatrzanska.pl/en/',
  observed_at: '2026-04-26T08:00:00Z',
  fetched_at: '2026-04-26T08:00:00Z',
  attribution_block: { en: 'Source: manual seed.' },
} as const

const validResort = {
  schema_version: 1,
  slug: 'kotelnica-bialczanska',
  name: { en: 'Kotelnica Białczańska' },
  country: 'PL',
  region: { en: 'Białka Tatrzańska, Tatra Mountains' },
  altitude_m: { min: 770, max: 920 },
  slopes_km: 8,
  lift_count: 7,
  skiable_terrain_ha: 40,
  season: { start_month: 12, end_month: 4 },
  publish_state: 'published',
  field_sources: {
    'altitude_m.min': { ...SOURCE, upstream_hash: '0000000000000000000000000000000000000000000000000000000000000001' },
    'altitude_m.max': { ...SOURCE, upstream_hash: '0000000000000000000000000000000000000000000000000000000000000002' },
    'slopes_km': { ...SOURCE, upstream_hash: '0000000000000000000000000000000000000000000000000000000000000003' },
    'lift_count': { ...SOURCE, upstream_hash: '0000000000000000000000000000000000000000000000000000000000000004' },
    'skiable_terrain_ha': { ...SOURCE, upstream_hash: '0000000000000000000000000000000000000000000000000000000000000005' },
    'season.start_month': { ...SOURCE, upstream_hash: '0000000000000000000000000000000000000000000000000000000000000006' },
    'season.end_month': { ...SOURCE, upstream_hash: '0000000000000000000000000000000000000000000000000000000000000007' },
  },
} as const

const validDataset = {
  schema_version: 1,
  published_at: '2026-04-26T08:00:00Z',
  resorts: [validResort],
  live_signals: [],
  manifest: { resort_count: 1, generated_by: 'test', validator_version: 'test' },
} as const

beforeEach(async (): Promise<void> => {
  root = await mkdtemp(join(tmpdir(), 'sta-publishDataset-'))
})

afterEach(async (): Promise<void> => {
  await rm(root, { recursive: true, force: true })
})

describe('publishDataset (Epic 2 PR 2.3)', (): void => {
  it('refuses invalid input and writes nothing', async (): Promise<void> => {
    const result = await publishDataset({ schema_version: 99 }, { rootDir: root })
    expect(result.ok).toBe(false)
    const dir = await readdir(root).catch((): string[] => [])
    expect(dir).toEqual([])                                     // nothing written
  })

  it('happy path: validates, writes current.v1.json, and writes a history archive', async (): Promise<void> => {
    const result = await publishDataset(validDataset, { rootDir: root })
    expect(result.ok).toBe(true)
    if (result.ok) {
      const written = await readFile(result.current_path, 'utf8')
      const parsed = PublishedDataset.parse(JSON.parse(written))
      expect(parsed.schema_version).toBe(1)
      expect(result.counter).toBe(1)
      expect(result.archive_path).toMatch(/\/history\/1-.+\.json$/)
    }
  })

  it('counter increments monotonically across publishes', async (): Promise<void> => {
    const r1 = await publishDataset(validDataset, { rootDir: root })
    const r2 = await publishDataset(validDataset, { rootDir: root })
    if (r1.ok && r2.ok) {
      expect(r2.counter).toBe(r1.counter + 1)
    } else {
      expect.fail('both publishes must succeed')
    }
  })

  it('clock regression does NOT decrement the counter', async (): Promise<void> => {
    const r1 = await publishDataset({ ...validDataset, published_at: '2026-04-26T10:00:00Z' }, { rootDir: root })
    const r2 = await publishDataset({ ...validDataset, published_at: '2026-04-25T10:00:00Z' }, { rootDir: root })
    if (r1.ok && r2.ok) {
      expect(r2.counter).toBe(r1.counter + 1)                   // counter still advances
      // Archive paths sort by counter prefix (monotonic): counter 2 > counter 1 lexicographically.
      // Even though r2 has an *earlier* published_at, the counter-based archive name is higher.
      expect(r2.archive_path > r1.archive_path).toBe(true)
    } else {
      expect.fail('both publishes must succeed')
    }
  })

  it('concurrent publishes produce two archives and converge on a single current.v1.json', async (): Promise<void> => {
    const [a, b] = await Promise.all([
      publishDataset(validDataset, { rootDir: root }),
      publishDataset(validDataset, { rootDir: root }),
    ])
    if (a.ok && b.ok) {
      // Counter values are 1 and 2 (in some order).
      expect(new Set([a.counter, b.counter])).toEqual(new Set([1, 2]))
      // Two archive files exist.
      const historyDir = join(root, 'history')
      const archives = await readdir(historyDir)
      expect(archives.length).toBe(2)
      // current.v1.json exists exactly once.
      const top = await readdir(root)
      expect(top.filter((f): boolean => f === 'current.v1.json').length).toBe(1)
    } else {
      expect.fail('concurrent publishes must both succeed')
    }
  })

  it('current.v1.json reflects the highest-counter dataset under concurrent publishes (Codex P2 #9)', async (): Promise<void> => {
    // Regression: with the lock holding only counter allocation, two concurrent publishes
    // with DIFFERENT datasets could end with current.v1.json carrying the LOWER counter's
    // payload (slow process overwrites fast). After the fix, the lock wraps the entire
    // publish, so current.v1.json always matches the highest counter's dataset.
    const datasetA = { ...validDataset, published_at: '2026-04-26T08:00:00Z' }
    const datasetB = { ...validDataset, published_at: '2026-04-26T09:00:00Z' }
    const [r1, r2] = await Promise.all([
      publishDataset(datasetA, { rootDir: root }),
      publishDataset(datasetB, { rootDir: root }),
    ])
    if (!r1.ok || !r2.ok) {
      expect.fail('both publishes must succeed')
      return
    }
    const winnerPayload = r1.counter > r2.counter ? datasetA : datasetB
    const written = JSON.parse(await readFile(join(root, 'current.v1.json'), 'utf8')) as { published_at: string }
    expect(written.published_at).toBe(winnerPayload.published_at)
  })

  it('cleans up the lock file even when validation fails (lock is never created)', async (): Promise<void> => {
    // Validation runs before any filesystem write; the lock file must NOT be created at all.
    await publishDataset({ schema_version: 99 }, { rootDir: root })
    const dir = await readdir(root).catch((): string[] => [])
    expect(dir).not.toContain('.archive-counter.lock')
  })

  it('handles malformed counter file by treating counter as 0 (first publish wins)', async (): Promise<void> => {
    // Pre-create the root and history dirs then write a corrupted counter file.
    await mkdir(join(root, 'history'), { recursive: true })
    await writeFile(join(root, '.archive-counter'), 'bogus-not-a-number')
    const result = await publishDataset(validDataset, { rootDir: root })
    expect(result.ok).toBe(true)
    if (result.ok) {
      // The malformed counter defaults to 0 → next = 1
      expect(result.counter).toBe(1)
    }
  })

  it('handles negative counter file by treating counter as 0', async (): Promise<void> => {
    await mkdir(join(root, 'history'), { recursive: true })
    await writeFile(join(root, '.archive-counter'), '-5')
    const result = await publishDataset(validDataset, { rootDir: root })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.counter).toBe(1)
    }
  })

  it('throws (does not retry) on non-ENOENT error reading counter file', async (): Promise<void> => {
    // Make the counter path a directory — reading a directory as a file throws EISDIR (non-ENOENT).
    await mkdir(join(root, 'history'), { recursive: true })
    await mkdir(join(root, '.archive-counter'), { recursive: true })
    await expect(publishDataset(validDataset, { rootDir: root })).rejects.toThrow()
  })

})

describe('publishDataset internal helpers', (): void => {
  it('isENoEnt: true for ENOENT errors', (): void => {
    expect(isENoEnt(Object.assign(new Error('x'), { code: 'ENOENT' }))).toBe(true)
    expect(isENoEnt(Object.assign(new Error('x'), { code: 'EACCES' }))).toBe(false)
    expect(isENoEnt(null)).toBe(false)
    expect(isENoEnt('string')).toBe(false)
    expect(isENoEnt(42)).toBe(false)
  })

  it('isEExist: true for EEXIST errors', (): void => {
    expect(isEExist(Object.assign(new Error('x'), { code: 'EEXIST' }))).toBe(true)
    expect(isEExist(Object.assign(new Error('x'), { code: 'ENOENT' }))).toBe(false)
    expect(isEExist(null)).toBe(false)
    expect(isEExist(undefined)).toBe(false)
  })

  it('isEBadf: true for EBADF errors', (): void => {
    expect(isEBadf(Object.assign(new Error('x'), { code: 'EBADF' }))).toBe(true)
    expect(isEBadf(Object.assign(new Error('x'), { code: 'ENOENT' }))).toBe(false)
    expect(isEBadf(null)).toBe(false)
    expect(isEBadf({})).toBe(false)
  })

  it('sleep: resolves after the given delay', async (): Promise<void> => {
    const start = Date.now()
    await sleep(10)
    const elapsed = Date.now() - start
    // Allow wide tolerance (10–500ms) to avoid flakiness in slow CI environments.
    expect(elapsed).toBeGreaterThanOrEqual(5)
    expect(elapsed).toBeLessThan(500)
  })
})
