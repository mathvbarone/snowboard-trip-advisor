import { describe, expect, it } from 'vitest'

import { AnalystNoteUpsertBody, AnalystNoteUpsertResponse, AnalystNotesGetResponse } from './analystNotes'

describe('AnalystNotesGetResponse', () => {
  it('accepts valid envelope with rendered notes', () => {
    const payload = {
      slug: 'kotelnica-bialczanska',
      notes: {
        slopes_km: {
          schema_version: 1,
          markdown: 'note',
          html: '<p>note</p>',
          created_at: '2026-05-13T00:00:00.000Z',
          updated_at: '2026-05-13T00:00:00.000Z',
        },
      },
    }
    expect(AnalystNotesGetResponse.safeParse(payload).success).toBe(true)
  })

  it('rejects payload missing html on rendered note', () => {
    const payload = {
      slug: 'kotelnica-bialczanska',
      notes: { slopes_km: { schema_version: 1, markdown: 'x', created_at: '2026-05-13T00:00:00.000Z', updated_at: '2026-05-13T00:00:00.000Z' } },
    }
    expect(AnalystNotesGetResponse.safeParse(payload).success).toBe(false)
  })

  // Prototype-pollution guard (Codex P2): JSON.parse('{"__proto__":{…}}') produces
  // an object where `__proto__` is a real own property (ECMA-262 §24.5.1.1). Without
  // the pre-record scan, z.record iterates own keys but the engine intercepts the
  // `__proto__` key before the NotePath refine fires — safeParse wrongly returns
  // success:true with an empty {} (silent data loss). The guard must reject it.
  it('rejects GET notes map with __proto__ own key (prototype-pollution guard)', () => {
    const raw: unknown = JSON.parse('{"slug":"kotelnica-bialczanska","notes":{"__proto__":{"schema_version":1,"markdown":"x","html":"<p>x</p>","created_at":"2026-05-13T00:00:00.000Z","updated_at":"2026-05-13T00:00:00.000Z"}}}')
    const result = AnalystNotesGetResponse.safeParse(raw)
    expect(result.success).toBe(false)
  })

  it('rejects array notes value (covers non-object branch of preprocess guard)', () => {
    // Covers the Array.isArray guard branch — arrays bypass the key-scan and
    // fall through to z.record which rejects them. Mirrors the same coverage
    // test in AnalystNotesMap (../src/analystNote.test.ts).
    const payload = { slug: 'kotelnica-bialczanska', notes: [] }
    expect(AnalystNotesGetResponse.safeParse(payload).success).toBe(false)
  })

  it('accepts valid notes map (positive regression after guard applied)', () => {
    const payload = {
      slug: 'kotelnica-bialczanska',
      notes: {
        'altitude_m.min': {
          schema_version: 1,
          markdown: 'ok',
          html: '<p>ok</p>',
          created_at: '2026-05-13T00:00:00.000Z',
          updated_at: '2026-05-13T00:00:00.000Z',
        },
        slopes_km: {
          schema_version: 1,
          markdown: 'note',
          html: '<p>note</p>',
          created_at: '2026-05-13T00:00:00.000Z',
          updated_at: '2026-05-13T00:00:00.000Z',
        },
      },
    }
    expect(AnalystNotesGetResponse.safeParse(payload).success).toBe(true)
  })
})

describe('AnalystNoteUpsertBody', () => {
  it('accepts {path, markdown: string} for upsert', () => {
    expect(AnalystNoteUpsertBody.safeParse({ path: 'slopes_km', markdown: 'x' }).success).toBe(true)
  })

  it('accepts {path, markdown: null} for delete', () => {
    expect(AnalystNoteUpsertBody.safeParse({ path: 'slopes_km', markdown: null }).success).toBe(true)
  })

  it('accepts {path, markdown: ""} for upsert-empty (NOT delete)', () => {
    expect(AnalystNoteUpsertBody.safeParse({ path: 'slopes_km', markdown: '' }).success).toBe(true)
  })

  it('rejects 10_001-byte markdown', () => {
    expect(AnalystNoteUpsertBody.safeParse({ path: 'x', markdown: 'a'.repeat(10_001) }).success).toBe(false)
  })

  it('rejects invalid NotePath (capital)', () => {
    expect(AnalystNoteUpsertBody.safeParse({ path: 'Slopes', markdown: 'x' }).success).toBe(false)
  })
})

describe('AnalystNoteUpsertResponse', () => {
  it('accepts response with rendered note on upsert', () => {
    const payload = {
      slug: 'kotelnica-bialczanska',
      path: 'slopes_km',
      note: {
        schema_version: 1,
        markdown: 'note',
        html: '<p>note</p>',
        created_at: '2026-05-13T00:00:00.000Z',
        updated_at: '2026-05-13T00:00:00.000Z',
      },
    }
    expect(AnalystNoteUpsertResponse.safeParse(payload).success).toBe(true)
  })

  it('accepts null note on delete confirmation', () => {
    const payload = {
      slug: 'kotelnica-bialczanska',
      path: 'slopes_km',
      note: null,
    }
    expect(AnalystNoteUpsertResponse.safeParse(payload).success).toBe(true)
  })
})
