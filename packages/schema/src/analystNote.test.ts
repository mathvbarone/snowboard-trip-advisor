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

  it('rejects own __proto__ key from JSON.parse (prototype-pollution guard, pre-record check)', () => {
    // JSON.parse returns an object where `__proto__` is an OWN property per
    // ECMA-262; z.record silently drops it and returns success:{} instead of
    // rejecting — this test pins the fix that adds a pre-validation step.
    const malicious: unknown = JSON.parse('{"__proto__":{"schema_version":1,"markdown":"x","created_at":"2026-05-14T00:00:00.000Z","updated_at":"2026-05-14T00:00:00.000Z"}}')
    expect(AnalystNotesMap.safeParse(malicious).success).toBe(false)
  })

  it('rejects own constructor key from JSON.parse', () => {
    const malicious: unknown = JSON.parse('{"constructor":{"schema_version":1,"markdown":"x","created_at":"2026-05-14T00:00:00.000Z","updated_at":"2026-05-14T00:00:00.000Z"}}')
    expect(AnalystNotesMap.safeParse(malicious).success).toBe(false)
  })

  it('rejects array input (passes through preprocess guard; z.record rejects non-object)', () => {
    // Covers the Array.isArray branch of the preprocess guard — arrays bypass
    // the key-scan and fall through to z.record which rejects them.
    expect(AnalystNotesMap.safeParse([]).success).toBe(false)
  })

  it('accepts a valid map with a non-forbidden key (covers the false branch of FORBIDDEN_PATH_SEGMENTS.has)', () => {
    // A key that passes the preprocess for-loop without hitting the
    // forbidden-segment guard exercises the false branch of
    // `if (FORBIDDEN_PATH_SEGMENTS.has(key))` at analystNote.ts:67.
    const valid = {
      'slopes.km': {
        schema_version: 1,
        markdown: 'test',
        created_at: '2026-05-14T00:00:00.000Z',
        updated_at: '2026-05-14T00:00:00.000Z',
      },
    }
    expect(AnalystNotesMap.safeParse(valid).success).toBe(true)
  })
})
