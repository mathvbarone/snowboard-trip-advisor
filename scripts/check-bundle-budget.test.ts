import { describe, expect, it } from 'vitest'

import {
  BUNDLE_BUDGET_BYTES,
  checkBundleBudget,
  type VisualizerStats,
} from './check-bundle-budget'

interface MetaInput {
  id: string
  isEntry?: boolean
  imported?: ReadonlyArray<{ uid: string; dynamic?: boolean }>
}

interface PartInput {
  uid: string
  metaUid: string
  gzipLength: number
}

function makeStats(
  metas: ReadonlyArray<readonly [uid: string, MetaInput]>,
  parts: readonly PartInput[],
): VisualizerStats {
  const nodeMetas: Record<string, VisualizerStats['nodeMetas'][string]> = {}
  for (const [uid, m] of metas) {
    nodeMetas[uid] = {
      id: m.id,
      ...(m.isEntry === undefined ? {} : { isEntry: m.isEntry }),
      imported: m.imported ?? [],
      importedBy: [],
      moduleParts: {},
    }
  }
  const nodeParts: Record<string, VisualizerStats['nodeParts'][string]> = {}
  for (const p of parts) {
    nodeParts[p.uid] = {
      metaUid: p.metaUid,
      renderedLength: p.gzipLength * 2,
      gzipLength: p.gzipLength,
      brotliLength: Math.floor(p.gzipLength * 0.85),
    }
  }
  return { version: 2, nodeMetas, nodeParts }
}

describe('BUNDLE_BUDGET_BYTES', (): void => {
  it('matches the 100 KiB advisory budget from spec §6.7', (): void => {
    expect(BUNDLE_BUDGET_BYTES).toBe(100 * 1024)
  })
})

describe('checkBundleBudget', (): void => {
  it('returns 0 bytes and no warning when no entry chunks are marked', (): void => {
    const stats = makeStats(
      [['m1', { id: 'orphan.js' }]],
      [{ uid: 'p1', metaUid: 'm1', gzipLength: 999 }],
    )
    const result = checkBundleBudget(stats)
    expect(result.totalBytes).toBe(0)
    expect(result.exceedsBudget).toBe(false)
    expect(result.warning).toBe(null)
  })

  it('sums gzip of an entry chunk with no imports', (): void => {
    const stats = makeStats(
      [['m1', { id: 'index.js', isEntry: true }]],
      [{ uid: 'p1', metaUid: 'm1', gzipLength: 1024 }],
    )
    expect(checkBundleBudget(stats).totalBytes).toBe(1024)
  })

  it('includes statically imported chunks in the total', (): void => {
    const stats = makeStats(
      [
        ['m1', { id: 'index.js', isEntry: true, imported: [{ uid: 'm2' }] }],
        ['m2', { id: 'vendor.js' }],
      ],
      [
        { uid: 'p1', metaUid: 'm1', gzipLength: 1024 },
        { uid: 'p2', metaUid: 'm2', gzipLength: 2048 },
      ],
    )
    expect(checkBundleBudget(stats).totalBytes).toBe(3072)
  })

  it('excludes dynamically imported chunks (lazy/code-split)', (): void => {
    const stats = makeStats(
      [
        [
          'm1',
          {
            id: 'index.js',
            isEntry: true,
            imported: [{ uid: 'm2', dynamic: true }],
          },
        ],
        ['m2', { id: 'matrix.js' }],
      ],
      [
        { uid: 'p1', metaUid: 'm1', gzipLength: 1024 },
        { uid: 'p2', metaUid: 'm2', gzipLength: 9999 },
      ],
    )
    expect(checkBundleBudget(stats).totalBytes).toBe(1024)
  })

  it('walks transitive static imports', (): void => {
    const stats = makeStats(
      [
        ['m1', { id: 'index.js', isEntry: true, imported: [{ uid: 'm2' }] }],
        ['m2', { id: 'a.js', imported: [{ uid: 'm3' }] }],
        ['m3', { id: 'b.js' }],
      ],
      [
        { uid: 'p1', metaUid: 'm1', gzipLength: 100 },
        { uid: 'p2', metaUid: 'm2', gzipLength: 200 },
        { uid: 'p3', metaUid: 'm3', gzipLength: 300 },
      ],
    )
    expect(checkBundleBudget(stats).totalBytes).toBe(600)
  })

  it('handles import cycles without infinite-looping', (): void => {
    const stats = makeStats(
      [
        ['m1', { id: 'a.js', isEntry: true, imported: [{ uid: 'm2' }] }],
        ['m2', { id: 'b.js', imported: [{ uid: 'm1' }] }],
      ],
      [
        { uid: 'p1', metaUid: 'm1', gzipLength: 100 },
        { uid: 'p2', metaUid: 'm2', gzipLength: 200 },
      ],
    )
    expect(checkBundleBudget(stats).totalBytes).toBe(300)
  })

  it('counts shared modules once when reached from multiple entries', (): void => {
    const stats = makeStats(
      [
        ['m1', { id: 'a.js', isEntry: true, imported: [{ uid: 'shared' }] }],
        ['m2', { id: 'b.js', isEntry: true, imported: [{ uid: 'shared' }] }],
        ['shared', { id: 'shared.js' }],
      ],
      [
        { uid: 'p1', metaUid: 'm1', gzipLength: 50 },
        { uid: 'p2', metaUid: 'm2', gzipLength: 50 },
        { uid: 'p3', metaUid: 'shared', gzipLength: 100 },
      ],
    )
    expect(checkBundleBudget(stats).totalBytes).toBe(200)
  })

  it('sums every part of a module split across multiple chunks', (): void => {
    const stats = makeStats(
      [['m1', { id: 'index.js', isEntry: true }]],
      [
        { uid: 'p1', metaUid: 'm1', gzipLength: 60 },
        { uid: 'p2', metaUid: 'm1', gzipLength: 40 },
      ],
    )
    expect(checkBundleBudget(stats).totalBytes).toBe(100)
  })

  it('skips imports whose target meta is missing from nodeMetas', (): void => {
    const stats = makeStats(
      [
        ['m1', { id: 'index.js', isEntry: true, imported: [{ uid: 'gone' }] }],
      ],
      [{ uid: 'p1', metaUid: 'm1', gzipLength: 256 }],
    )
    expect(checkBundleBudget(stats).totalBytes).toBe(256)
  })

  it('flags exceedsBudget and emits the spec WARN format when over the budget', (): void => {
    const stats = makeStats(
      [['m1', { id: 'index.js', isEntry: true }]],
      [
        {
          uid: 'p1',
          metaUid: 'm1',
          gzipLength: BUNDLE_BUDGET_BYTES + 1,
        },
      ],
    )
    const result = checkBundleBudget(stats)
    expect(result.exceedsBudget).toBe(true)
    expect(result.warning).toBe(
      'WARN: initial chunk gzip = 100.0 KB exceeds 100 KB advisory budget',
    )
  })

  it('does not flag when totalBytes is exactly the budget (boundary)', (): void => {
    const stats = makeStats(
      [['m1', { id: 'index.js', isEntry: true }]],
      [{ uid: 'p1', metaUid: 'm1', gzipLength: BUNDLE_BUDGET_BYTES }],
    )
    const result = checkBundleBudget(stats)
    expect(result.totalBytes).toBe(BUNDLE_BUDGET_BYTES)
    expect(result.exceedsBudget).toBe(false)
    expect(result.warning).toBe(null)
  })

  it('warning kilobyte total reflects the actual measured bytes (1 decimal)', (): void => {
    const stats = makeStats(
      [['m1', { id: 'index.js', isEntry: true }]],
      [{ uid: 'p1', metaUid: 'm1', gzipLength: 153_600 }],
    )
    const result = checkBundleBudget(stats)
    expect(result.warning).toBe(
      'WARN: initial chunk gzip = 150.0 KB exceeds 100 KB advisory budget',
    )
  })
})
