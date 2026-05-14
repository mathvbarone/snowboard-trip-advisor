import { describe, expect, it } from 'vitest'

import { AnalystNote, AnalystNotesMap, NotePath } from './analystNote'

describe('NotePath', () => {
  it.each([
    ['slopes_km', true],
    ['altitude_m.min', true],
    ['region', true],
    ['Slopes_KM', false],            // capital — reject
    ['1slopes', false],              // leading digit — reject
    ['', false],                     // empty — reject
    ['.slopes', false],              // leading dot — reject
    ['slopes.', false],              // trailing dot — reject
    ['slopes..km', false],           // double dot — reject
    ['__proto__', false],            // prototype-pollution guard
    ['nested.__proto__', false],     // nested guard
    ['constructor', false],          // prototype-pollution guard
    ['toString', false],             // prototype-pollution guard
  ])('NotePath.safeParse(%s) → %s', (input, ok) => {
    expect(NotePath.safeParse(input).success).toBe(ok)
  })
})

describe('AnalystNote.markdown', () => {
  it('accepts 10,000-byte UTF-8 body', () => {
    const note = {
      schema_version: 1, created_at: '2026-05-13T00:00:00.000Z',
      updated_at: '2026-05-13T00:00:00.000Z', markdown: 'a'.repeat(10_000),
    }
    expect(AnalystNote.safeParse(note).success).toBe(true)
  })

  it('rejects 10,001-byte UTF-8 body', () => {
    const note = {
      schema_version: 1, created_at: '2026-05-13T00:00:00.000Z',
      updated_at: '2026-05-13T00:00:00.000Z', markdown: 'a'.repeat(10_001),
    }
    expect(AnalystNote.safeParse(note).success).toBe(false)
  })

  it('rejects 4-byte emoji that pushes byte length over the cap', () => {
    // '🎿' is 4 UTF-8 bytes; 2_500 copies = 10_000 bytes; 2_501 = 10_004
    const note = {
      schema_version: 1, created_at: '2026-05-13T00:00:00.000Z',
      updated_at: '2026-05-13T00:00:00.000Z', markdown: '🎿'.repeat(2_501),
    }
    expect(AnalystNote.safeParse(note).success).toBe(false)
  })
})

describe('AnalystNotesMap', () => {
  it('defaults to empty object when key missing', () => {
    expect(AnalystNotesMap.parse(undefined)).toStrictEqual({})
  })
})
