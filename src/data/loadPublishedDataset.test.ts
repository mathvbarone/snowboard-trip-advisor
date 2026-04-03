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
        json: vi.fn().mockResolvedValue({
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

  it('rejects payloads that do not satisfy the published dataset schema', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          version: 'not-a-published-version',
          generated_at: '2026-04-03T01:45:00Z',
          scoring: { normalization: 'min-max', boundaries: {} },
          resorts: [],
        }),
      }),
    )

    await expect(loadPublishedDataset()).rejects.toThrow(/version/i)
  })

  it('throws when the response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      }),
    )

    await expect(loadPublishedDataset()).rejects.toThrow(
      'Failed to load published dataset: 404 Not Found',
    )
  })

  it('throws when the response has no status text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: '',
      }),
    )

    await expect(loadPublishedDataset()).rejects.toThrow(
      'Failed to load published dataset: 500',
    )
  })
})
