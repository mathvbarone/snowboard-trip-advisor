import { describe, expect, it } from 'vitest'

import { ListResortsQuery, ListResortsResponse, ResortSummary } from './listResorts'

const OBS_AT = '2026-04-26T08:00:00Z'

describe('ListResortsQuery (PR 4.1a, spec §4.1)', (): void => {
  it('accepts empty query (all fields optional)', (): void => {
    expect(ListResortsQuery.safeParse({}).success).toBe(true)
  })

  it('accepts filter.country and filter.hasFailures', (): void => {
    const r = ListResortsQuery.parse({ filter: { country: 'PL', hasFailures: true } })
    expect(r.filter?.country).toBe('PL')
    expect(r.filter?.hasFailures).toBe(true)
  })

  it('accepts page with explicit offset/limit', (): void => {
    const r = ListResortsQuery.parse({ page: { offset: 10, limit: 25 } })
    expect(r.page?.offset).toBe(10)
    expect(r.page?.limit).toBe(25)
  })

  it('rejects invalid country (not 2-letter ISO uppercase)', (): void => {
    expect(ListResortsQuery.safeParse({ filter: { country: 'pl' } }).success).toBe(false)
  })
})

describe('ResortSummary', (): void => {
  it('parses with all required fields', (): void => {
    const r = ResortSummary.parse({
      slug: 'kotelnica-bialczanska',
      name: { en: 'Kotelnica' },
      country: 'PL',
      last_updated: OBS_AT,
      stale_field_count: 0,
      failed_field_count: 0,
      publish_state: 'published',
    })
    expect(r.slug).toBe('kotelnica-bialczanska')
  })

  it.each(['draft', 'published'])('accepts publish_state %s', (state: string): void => {
    const result = ResortSummary.safeParse({
      slug: 'a', name: { en: 'a' }, country: 'PL', last_updated: OBS_AT,
      stale_field_count: 0, failed_field_count: 0, publish_state: state,
    })
    expect(result.success).toBe(true)
  })

  it('rejects negative counts', (): void => {
    const r = ResortSummary.safeParse({
      slug: 'a', name: { en: 'a' }, country: 'PL', last_updated: OBS_AT,
      stale_field_count: -1, failed_field_count: 0, publish_state: 'published',
    })
    expect(r.success).toBe(false)
  })
})

describe('ListResortsResponse', (): void => {
  it('parses items + page envelope', (): void => {
    const r = ListResortsResponse.parse({
      items: [],
      page: { offset: 0, limit: 50, total: 0 },
    })
    expect(r.items).toEqual([])
    expect(r.page.total).toBe(0)
  })

  it('rejects when page.total missing', (): void => {
    const r = ListResortsResponse.safeParse({ items: [], page: { offset: 0, limit: 50 } })
    expect(r.success).toBe(false)
  })
})
