import { describe, expect, it } from 'vitest'

import { PublishBody, PublishResponse, PublishSlugParam } from './publish'

const OBS_AT = '2026-04-26T08:00:00Z'

describe('PublishSlugParam (PR 4.1a, spec §4.6 — Phase 1 widening)', (): void => {
  it('accepts the __all__ literal (Phase 1 SPA passes this)', (): void => {
    expect(PublishSlugParam.parse({ slug: '__all__' }).slug).toBe('__all__')
  })

  it('accepts a valid ResortSlug (forward-compat for Phase 2 per-resort publish)', (): void => {
    expect(PublishSlugParam.parse({ slug: 'kotelnica-bialczanska' }).slug).toBe('kotelnica-bialczanska')
  })

  it('rejects slug with underscore (Phase-1-divergence assertion — regex enforcement)', (): void => {
    expect(PublishSlugParam.safeParse({ slug: 'has_underscore' }).success).toBe(false)
  })
})

describe('PublishBody (spec §4.6)', (): void => {
  it('accepts { confirm: true }', (): void => {
    expect(PublishBody.parse({ confirm: true }).confirm).toBe(true)
  })

  it('rejects { confirm: false }', (): void => {
    expect(PublishBody.safeParse({ confirm: false }).success).toBe(false)
  })

  it('rejects empty body', (): void => {
    expect(PublishBody.safeParse({}).success).toBe(false)
  })
})

describe('PublishResponse (spec §4.6)', (): void => {
  it('parses with all 4 fields', (): void => {
    const r = PublishResponse.parse({
      version_id: 'v_2026-05-02T10-00-00Z',
      archive_path: 'data/published/history/v_2026-05-02T10-00-00Z.json',
      published_at: OBS_AT,
      resort_count: 2,
    })
    expect(r.resort_count).toBe(2)
  })

  it('rejects negative resort_count', (): void => {
    expect(PublishResponse.safeParse({
      version_id: 'v', archive_path: 'p', published_at: OBS_AT, resort_count: -1,
    }).success).toBe(false)
  })
})
