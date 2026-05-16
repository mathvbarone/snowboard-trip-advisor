import { z } from 'zod'

import { AnalystNote, NotePath } from '../src/analystNote'
import { ResortSlug } from '../src/branded'

// Server-rendered + sanitized HTML attached to the storage shape
const RenderedAnalystNote = AnalystNote.extend({ html: z.string() })

// SYNC NOTE: This set must stay in lockstep with FORBIDDEN_PATH_SEGMENTS in
// ../src/analystNote.ts (AnalystNotesMap). FORBIDDEN_PATH_SEGMENTS is not
// exported from analystNote.ts (N.a-foundation file — do NOT modify it to add
// an export; that would widen this PR's scope). Replicated here following the
// same pattern as the 10 KB SYNC NOTE in AnalystNoteUpsertBody below. If the
// canonical set ever changes, this copy must change in the same commit.
const FORBIDDEN_GET_NOTE_KEYS: ReadonlySet<string> = new Set([
  '__proto__', 'constructor', 'prototype',
  'toString', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable',
  'valueOf', '__defineGetter__', '__defineSetter__',
  '__lookupGetter__', '__lookupSetter__',
])

// Pre-record guard for the GET notes map. Mirrors AnalystNotesMap in
// ../src/analystNote.ts: JSON.parse('{"__proto__":{…}}') produces an object
// where `__proto__` is a real own property (ECMA-262 §24.5.1.1). Without this
// scan, z.record iterates own keys but the engine intercepts `__proto__` before
// the NotePath refine fires — safeParse returns success:true with an empty {}
// (silent data loss). The preprocess step inspects Object.keys() BEFORE
// z.record runs, catching the own `__proto__` case and rejecting it clearly.
// Uses RenderedAnalystNote values (= AnalystNote.extend({html})) not AnalystNote,
// so AnalystNotesMap cannot be reused directly.
const RenderedAnalystNotesMap = z.preprocess(
  (input, ctx): unknown => {
    if (input !== null && typeof input === 'object' && !Array.isArray(input)) {
      for (const key of Object.keys(input)) {
        if (FORBIDDEN_GET_NOTE_KEYS.has(key)) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'note key contains a reserved Object.prototype segment (prototype-pollution guard)',
          })
          return z.NEVER
        }
      }
    }
    return input
  },
  z.record(NotePath, RenderedAnalystNote),
)

/** GET /api/analyst-notes/:slug response — full notes map for this slug */
export const AnalystNotesGetResponse = z.object({
  slug: ResortSlug,
  notes: RenderedAnalystNotesMap,
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
  // SYNC NOTE: The 10 KB byte-limit below is intentionally kept in sync with
  // AnalystNote.markdown in ../src/analystNote.ts (~line 47-50). Both refines
  // must change together if the limit ever changes. Do NOT extract a shared
  // constant — analystNote.ts is an N.a-foundation file; cross-package coupling
  // would widen this PR's scope beyond its atomic boundary.
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
