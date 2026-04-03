import { describe, expect, it } from 'vitest'
import { parseCompareIds, serializeCompareIds } from './queryState'

describe('queryState', () => {
  it('round-trips compare ids through URL params', () => {
    expect(parseCompareIds('?compare=verbier,st-anton')).toEqual([
      'verbier',
      'st-anton',
    ])
    expect(serializeCompareIds(['verbier', 'st-anton'])).toBe(
      '?compare=verbier,st-anton',
    )
  })

  it('deduplicates before applying the four-resort cap', () => {
    expect(
      parseCompareIds('?compare=verbier,verbier,st-anton,tignes,zermatt'),
    ).toEqual(['verbier', 'st-anton', 'tignes', 'zermatt'])
  })

  it('serializes an empty compare list as an empty query string', () => {
    expect(serializeCompareIds([])).toBe('')
    expect(parseCompareIds('')).toEqual([])
    expect(parseCompareIds('?other=value')).toEqual([])
    expect(parseCompareIds('?compare=a,b,a,c,d,e')).toEqual(['a', 'b', 'c', 'd'])
  })
})
