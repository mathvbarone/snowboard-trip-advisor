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
