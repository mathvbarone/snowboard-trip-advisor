import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { loadResortDataset } from './loadResortDataset'

// Verified: packages/schema/src/loadResortDataset.test.ts
// → ../../.. → worktree root → data/published/current.v1.json
const FIXTURE_PATH = fileURLToPath(
  new URL('../../../data/published/current.v1.json', import.meta.url),
)

describe('loadResortDataset (Node wrapper around loadResortDatasetFromObject)', (): void => {
  it('reads + parses the seed fixture and returns 2 ResortViews', async (): Promise<void> => {
    const result = await loadResortDataset(FIXTURE_PATH, {
      now: new Date('2026-04-26T08:00:00Z'),
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.views.length).toBe(2)
      expect(result.views[0]?.slug).toBe('kotelnica-bialczanska')
      expect(result.views[1]?.slug).toBe('spindleruv-mlyn')
    }
  })

  it('rejects when the path does not exist (ENOENT bubbles)', async (): Promise<void> => {
    // The wrapper does not catch ENOENT — the projection-branch tests live on
    // loadResortDatasetFromObject; the wrapper's only added surface is the
    // node:fs/promises readFile call, which can throw ENOENT.
    await expect(loadResortDataset('/nonexistent/path.json')).rejects.toBeDefined()
  })
})
