import { z } from 'zod'

import { ISODateTimeString } from './branded'

/**
 * Note path — any dot-separated lowercase identifier path.
 *
 * Permits metric paths (`slopes_km`, `altitude_m.min`) AND non-metric Resort
 * paths (`name`, `country`, `region`). Phase 1 accepts that the schema does
 * NOT enforce the path resolves to a real Resort attribute — the UI is the
 * gatekeeper (only renders affordances on rendered rows). Manual JSON edits
 * could create ghost notes; documented as Phase-1 acceptance.
 *
 * Phase 2 may tighten via a path-superset enum (METRIC_FIELDS ∪ non-metric)
 * if a real need arises.
 */
// Prototype-pollution guard: `__proto__`, `constructor`, etc. match the lowercase
// identifier regex above, so without this refine a client could send
// `{"path": "__proto__"}` and the §3.2 PUT step would execute `wf.notes['__proto__'] = …`
// on a plain object — that assignment hits the inherited prototype setter instead
// of creating an own entry, losing the note and corrupting Object.prototype for
// downstream code in the same process. Mirrors the existing hardening at
// `apps/admin/server/dispatch.ts:173-179` (Object.create(null)) and `:193-196`
// (Map instead of Record for the route table). Rejecting at the Zod boundary is
// the simpler fix here because `notes` is persisted as JSON and a Record/object
// representation is the natural storage shape.
const FORBIDDEN_PATH_SEGMENTS: ReadonlySet<string> = new Set([
  '__proto__', 'constructor', 'prototype',
  'toString', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable',
  'valueOf', '__defineGetter__', '__defineSetter__',
  '__lookupGetter__', '__lookupSetter__',
])

export const NotePath = z.string()
  .regex(
    /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)*$/,
    { message: 'note path must be dot-separated lowercase identifiers' },
  )
  .refine(
    (path): boolean => path.split('.').every((seg): boolean => !FORBIDDEN_PATH_SEGMENTS.has(seg)),
    { message: 'note path contains a reserved Object.prototype segment (prototype-pollution guard)' },
  )

export const AnalystNote = z.object({
  schema_version: z.literal(1),
  markdown: z.string()
    .refine(
      (s): boolean => new TextEncoder().encode(s).byteLength <= 10_000,
      { message: 'markdown body exceeds 10 KB (UTF-8)' },
    ),
  created_at: ISODateTimeString,
  updated_at: ISODateTimeString,
})

export const AnalystNotesMap = z.record(NotePath, AnalystNote).default({})

export type AnalystNote = z.infer<typeof AnalystNote>
export type AnalystNotesMap = z.infer<typeof AnalystNotesMap>
