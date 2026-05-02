import { describe, expect, it } from 'vitest'

import { ListPublishesQuery, ListPublishesResponse, PublishMetadata } from './listPublishes'

const OBS_AT = '2026-04-26T08:00:00Z'

describe('ListPublishesQuery (PR 4.1a, spec §4.7)', (): void => {
  it('accepts empty query', (): void => {
    expect(ListPublishesQuery.safeParse({}).success).toBe(true)
  })

  it('accepts page with offset/limit', (): void => {
    const r = ListPublishesQuery.parse({ page: { offset: 0, limit: 20 } })
    expect(r.page?.limit).toBe(20)
  })
})

describe('PublishMetadata (spec §4.7)', (): void => {
  it('parses with all required fields including published_by hostname', (): void => {
    const r = PublishMetadata.parse({
      version_id: 'v_2026-05-02T10-00-00Z',
      published_at: OBS_AT,
      archive_path: 'data/published/history/v_2026-05-02T10-00-00Z.json',
      resort_count: 2,
      published_by: 'snowboard-host-abc123',
    })
    expect(r.published_by).toBe('snowboard-host-abc123')
  })

  it('rejects missing published_by', (): void => {
    const r = PublishMetadata.safeParse({
      version_id: 'v', published_at: OBS_AT, archive_path: 'p', resort_count: 1,
    })
    expect(r.success).toBe(false)
  })
})

describe('ListPublishesResponse', (): void => {
  it('parses items + page envelope', (): void => {
    const r = ListPublishesResponse.parse({
      items: [],
      page: { offset: 0, limit: 20, total: 0 },
    })
    expect(r.items).toEqual([])
  })
})
