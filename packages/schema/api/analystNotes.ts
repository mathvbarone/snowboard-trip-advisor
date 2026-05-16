import { z } from 'zod'

import { AnalystNote, NotePath } from '../src/analystNote'
import { ResortSlug } from '../src/branded'

import { ResortSlugParam } from './resortDetail' // REUSE — do NOT redefine

// Re-export ResortSlugParam so consumers can import without hitting resortDetail directly
export { ResortSlugParam }

// Server-rendered + sanitized HTML attached to the storage shape
const RenderedAnalystNote = AnalystNote.extend({ html: z.string() })

/** GET /api/analyst-notes/:slug response — full notes map for this slug */
export const AnalystNotesGetResponse = z.object({
  slug: ResortSlug,
  notes: z.record(NotePath, RenderedAnalystNote),
})

/**
 * PUT /api/analyst-notes/:slug request body — single-path delta.
 *
 * Semantics:
 *   markdown: string        → upsert (set markdown; stamp updated_at; preserve created_at if exists)
 *   markdown: null          → delete (key removed from notes map)
 *   markdown: '' (empty)    → upsert with empty body (rare; future-proofing — NOT deletion)
 */
export const AnalystNoteUpsertBody = z.object({
  path: NotePath,
  markdown: z.string()
    .refine(
      (s): boolean => new TextEncoder().encode(s).byteLength <= 10_000,
      { message: 'markdown body exceeds 10 KB (UTF-8)' },
    )
    .nullable(),
})

/**
 * PUT /api/analyst-notes/:slug response — affected path only.
 *
 * Client merges into its slug-keyed cache by path. Smaller bandwidth during
 * autosave than full-map echo; matches the partial-PUT mental model.
 */
export const AnalystNoteUpsertResponse = z.object({
  slug: ResortSlug,
  path: NotePath,
  note: RenderedAnalystNote.nullable(), // null = deletion confirmed
})

export type AnalystNotesGetResponse = z.infer<typeof AnalystNotesGetResponse>
export type AnalystNoteUpsertBody = z.infer<typeof AnalystNoteUpsertBody>
export type AnalystNoteUpsertResponse = z.infer<typeof AnalystNoteUpsertResponse>
