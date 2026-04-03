import { describe, expect, it, vi } from 'vitest'
import { loadPublishedDataset } from './loadPublishedDataset'

describe('loadPublishedDataset', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads and validates the published dataset', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          version: '2026-04-03T01-45-00Z',
          generated_at: '2026-04-03T01:45:00Z',
          scoring: { normalization: 'min-max', boundaries: {} },
          resorts: [],
        }),
      }),
    )

    const result = await loadPublishedDataset()

    expect(result.version).toBe('2026-04-03T01-45-00Z')
  })
})
