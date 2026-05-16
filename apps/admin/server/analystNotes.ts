import { join } from 'node:path'

import { ISODateTimeString, WorkspaceFile } from '@snowboard-trip-advisor/schema'
import type { Resort, ResortLiveSignal } from '@snowboard-trip-advisor/schema'
import {
  AnalystNoteUpsertBody,
  type AnalystNotesGetResponse,
  type AnalystNoteUpsertBody as AnalystNoteUpsertBodyType,
  type AnalystNoteUpsertResponse,
  type ResortSlugParam,
} from '@snowboard-trip-advisor/schema/api'
import { renderAnalystNoteMarkdown } from '@snowboard-trip-advisor/schema/markdown'
import type { z } from 'zod'

import type { HandlerDeps } from './listResorts'
import {
  atomicWriteWorkspaceFile,
  readPublishedDocOrNull,
  readWorkspaceFileForSlug,
  withSlugLock,
} from './workspace'

// PR N.b3b §7.2 — GET/PUT /api/analyst-notes/:slug.
//
// Handler signature mirrors the existing apps/admin/server/*.ts pattern
// (`(input, deps) => Promise<...>`). `HandlerDeps` is `{ workspaceRoot }`
// only (per listResorts.ts:16-17); each handler derives its workspace +
// published paths in-line (mirrors resortDetail.ts:33-34) — no extra deps
// fields, no path injection.
//
// Error classes carry BOTH `.status` and `.code`. dispatch.ts maps
// `.code` → HTTP status via STATUS_FOR_CODE (all codes already in
// errorEnvelope.ts — no enum extension per spec §3.3); the redundant
// `.status` field is the direct-call contract the handler-unit tests +
// the cross-handler bridge test assert against (they bypass dispatch).
// `readWorkspaceFileForSlug` throws workspace.ts's `WorkspaceCorruptError`,
// which carries `.code` + `.details` but not `.status`. The direct-call
// unit/bridge tests assert `status: 500`, so we re-wrap into the local
// `RewrappedWorkspaceCorruptError` (distinct name on purpose — it is NOT
// workspace.ts's class; do not swap in an `instanceof` against the imported
// one) that carries both fields, copying `.details` through unchanged for
// the envelope.

class NotFoundError extends Error {
  public readonly status = 404 as const
  public readonly code = 'not-found' as const
  public constructor(message: string) {
    super(message)
    this.name = 'NotFoundError'
  }
}

class InvalidRequestError extends Error {
  public readonly status = 400 as const
  public readonly code = 'invalid-request' as const
  public readonly details: ReadonlyArray<z.core.$ZodIssue>

  public constructor(issues: ReadonlyArray<z.core.$ZodIssue>) {
    super('analyst-note request validation failed')
    this.name = 'InvalidRequestError'
    this.details = issues
  }
}

class RewrappedWorkspaceCorruptError extends Error {
  public readonly status = 500 as const
  public readonly code = 'workspace-corrupt' as const
  public readonly details: unknown

  public constructor(message: string, details: unknown) {
    super(message)
    this.name = 'RewrappedWorkspaceCorruptError'
    this.details = details
  }
}

class InternalError extends Error {
  public readonly status = 500 as const
  public readonly code = 'internal' as const
  public constructor(message: string) {
    super(message)
    this.name = 'InternalError'
  }
}

interface CodedError {
  readonly code?: unknown
}

function isWorkspaceCorrupt(err: unknown): err is { message: string; details?: unknown } {
  return (
    typeof err === 'object'
    && err !== null
    && (err as CodedError).code === 'workspace-corrupt'
  )
}

export interface AnalystNotesGetInput {
  readonly params: ResortSlugParam
}

export interface AnalystNotesPutInput {
  readonly params: ResortSlugParam
  readonly body: unknown
}

function derivePaths(deps: HandlerDeps): { workspaceDir: string; publishedPath: string } {
  // Two-line in-handler path derivation — mirrors resortDetail.ts:33-34 /
  // resortUpsert.ts:97-99. Deterministic, no I/O — stays OUTSIDE any lock.
  const workspaceDir = join(deps.workspaceRoot, 'data', 'admin-workspace')
  const publishedPath = join(deps.workspaceRoot, 'data', 'published', 'current.v1.json')
  return { workspaceDir, publishedPath }
}

// GET /api/analyst-notes/:slug — full notes map for this slug, each note
// re-rendered + sanitized server-side. No lock: atomic rename gives readers
// old-or-new file, never partial (spec §3.2 step 7).
export async function analystNotesGet(
  input: AnalystNotesGetInput,
  deps: HandlerDeps,
): Promise<AnalystNotesGetResponse> {
  const { slug } = input.params
  const { workspaceDir, publishedPath } = derivePaths(deps)

  let workspaceFile: WorkspaceFile | null
  try {
    workspaceFile = await readWorkspaceFileForSlug(workspaceDir, slug)
  } catch (err: unknown) {
    /* v8 ignore next 4 -- readWorkspaceFileForSlug only throws
       WorkspaceCorruptError in practice (ENOENT maps to null; the EACCES/EIO
       and non-SyntaxError rethrows are themselves v8-ignored defensive paths
       in workspace.ts). The non-corrupt rethrow here is the matching
       defensive guard, mirroring the workspace.ts rethrow pattern. */
    if (!isWorkspaceCorrupt(err)) {
      throw err
    }
    throw new RewrappedWorkspaceCorruptError((err as Error).message, (err as { details?: unknown }).details)
  }

  if (workspaceFile === null) {
    // Cold-start: only the published doc may have the slug. Notes never
    // publish (spec §2.6) so a published-only resort has an empty map.
    const publishedDoc = await readPublishedDocOrNull(publishedPath)
    const inPublished =
      publishedDoc !== null && publishedDoc.resorts.some((r): boolean => r.slug === slug)
    if (!inPublished) {
      throw new NotFoundError(`resort "${slug}" not found in workspace or published doc`)
    }
    return { slug, notes: {} }
  }

  const renderedEntries: AnalystNotesGetResponse['notes'] = {}
  for (const [path, note] of Object.entries(workspaceFile.notes)) {
    try {
      renderedEntries[path] = { ...note, html: renderAnalystNoteMarkdown(note.markdown) }
    } catch (err: unknown) {
      // Render exception: the workspace data on disk is untouched and
      // intact; surface 500 `internal` so the analyst sees a banner and
      // can repair the markdown via the same UI (spec §3.2 step 5 + §3.3).
      throw new InternalError(
        `failed to render analyst note at "${path}" for "${slug}": ${(err as Error).message}`,
      )
    }
  }
  return { slug, notes: renderedEntries }
}

// PUT /api/analyst-notes/:slug — single-path delta. Wrapped in the SAME
// per-slug withSlugLock as resortUpsert so a concurrent resort PUT for the
// same slug cannot interleave its read between this handler's read and
// atomic write (spec §3.2 PUT step 3 + the N.b3b cross-handler bridge).
export async function analystNotesPut(
  input: AnalystNotesPutInput,
  deps: HandlerDeps,
): Promise<AnalystNoteUpsertResponse> {
  const { slug } = input.params

  // 1. Validate body (safeParse → .success → .data — never .parse(),
  //    which has no .data wrapper; mirrors resortUpsert.ts:161-164).
  const bodyParsed = AnalystNoteUpsertBody.safeParse(input.body)
  if (!bodyParsed.success) {
    throw new InvalidRequestError(bodyParsed.error.issues)
  }
  const body: AnalystNoteUpsertBodyType = bodyParsed.data

  // 2. Derive paths (deterministic, outside the lock).
  const { workspaceDir, publishedPath } = derivePaths(deps)
  const targetPath = join(workspaceDir, `${slug}.json`)

  // 3. Lock-wrapped read → merge → validate → render → write.
  return withSlugLock(slug, async (): Promise<AnalystNoteUpsertResponse> => {
    let workspaceFile: WorkspaceFile | null
    let publishedDoc: Awaited<ReturnType<typeof readPublishedDocOrNull>>
    try {
      ;[workspaceFile, publishedDoc] = await Promise.all([
        readWorkspaceFileForSlug(workspaceDir, slug),
        readPublishedDocOrNull(publishedPath),
      ])
    } catch (err: unknown) {
      /* v8 ignore next 3 -- non-corrupt read errors are defensive rethrows;
         readWorkspaceFileForSlug only throws WorkspaceCorruptError in
         practice (mirrors the GET handler + workspace.ts rethrow pattern). */
      if (!isWorkspaceCorrupt(err)) {
        throw err
      }
      throw new RewrappedWorkspaceCorruptError(
        (err as Error).message,
        (err as { details?: unknown }).details,
      )
    }

    // Resolve the published resort + its (optional) live signal once, as a
    // single non-null bundle. Keeping the resort and the doc it came from
    // together lets TS narrow the cold-start path without re-find /
    // optional-chain defensive branches.
    let published: { resort: Resort; liveSignal: ResortLiveSignal | null } | null = null
    if (publishedDoc !== null) {
      const r = publishedDoc.resorts.find((x): boolean => x.slug === slug)
      if (r !== undefined) {
        published = {
          resort: r,
          liveSignal:
            publishedDoc.live_signals.find((ls): boolean => ls.resort_slug === slug) ?? null,
        }
      }
    }
    if (workspaceFile === null && published === null) {
      throw new NotFoundError(`resort "${slug}" not found in workspace or published doc`)
    }

    // No-op delete short-circuit — BEFORE cold-start construction. A delete
    // against a published-only resort with no workspace file has no note to
    // remove; materializing a fresh empty-notes workspace snapshot here
    // would shadow future publish-dataset updates for an untouched resort
    // (spec §3.2 PUT step 3). Treat the absent-note delete as the no-op it
    // is and leave the resort published-only.
    if (body.markdown === null && workspaceFile === null) {
      return { slug, path: body.path, note: null }
    }

    let wf: WorkspaceFile
    if (workspaceFile !== null) {
      // Hot path. AnalystNotesMap.default({}) guarantees wf.notes is an
      // object even for Epic-4-era fixtures that pre-date `notes`.
      wf = workspaceFile
    } else {
      // Cold-start: hydrate from the published doc. `workspaceFile === null`
      // with `published === null` already threw above, so `published` is the
      // non-null bundle here. The WorkspaceFile.parse round-trip is the
      // canonical way to apply §2.3's AnalystNotesMap default — a hand-built
      // object would leave `notes` undefined and the patch step would throw
      // on `wf.notes[path] = …`.
      /* v8 ignore next 4 -- structurally unreachable: the
         `workspaceFile === null && published === null` guard above already
         threw NotFoundError, so `published` is non-null in this branch. The
         narrowing check is required for the type system, not for runtime. */
      if (published === null) {
        throw new NotFoundError(`resort "${slug}" not found in workspace or published doc`)
      }
      wf = WorkspaceFile.parse({
        schema_version: 1,
        slug,
        resort: published.resort,
        live_signal: published.liveSignal,
        modified_at: ISODateTimeString.parse(new Date().toISOString()),
        editor_modes: {},
        // omit `notes` — let WorkspaceFile.parse apply AnalystNotesMap.default({})
      })
    }

    const now = ISODateTimeString.parse(new Date().toISOString())

    // Apply patch + (on upsert) render BEFORE write — recovery-preserving
    // order per spec §3.2 PUT step 6. The single `upsertedNote` object is
    // both stored in `wf.notes` and the source of the rendered response, so
    // there is no post-validation index re-lookup (which would carry an
    // unreachable `undefined` branch under noUncheckedIndexedAccess).
    let rendered: AnalystNoteUpsertResponse['note'] = null
    if (body.markdown === null) {
      // `delete wf.notes[dynamicKey]` trips no-dynamic-delete; rebuild the
      // map without the key. `body.path` is a validated NotePath
      // (prototype-pollution guarded by AnalystNoteUpsertBody).
      const next: Record<string, (typeof wf.notes)[string]> = {}
      for (const [key, value] of Object.entries(wf.notes)) {
        if (key !== body.path) {
          next[key] = value
        }
      }
      wf.notes = next
    } else {
      const existing = wf.notes[body.path]
      const upsertedNote: (typeof wf.notes)[string] = {
        schema_version: 1,
        markdown: body.markdown,
        created_at: existing?.created_at ?? now,
        updated_at: now,
      }
      // Render BEFORE write: on a render exception throw 500 `internal`
      // BEFORE atomicWriteWorkspaceFile so no corrupt note lands on disk and
      // the analyst can edit + retry through the same UI. `rendered` pairs
      // the stored note with its html in one object so the response carries
      // a definite string (no `?? ''` fallback / undefined branch).
      try {
        rendered = { ...upsertedNote, html: renderAnalystNoteMarkdown(upsertedNote.markdown) }
      } catch (err: unknown) {
        throw new InternalError(
          `failed to render analyst note at "${body.path}" for "${slug}": ${(err as Error).message}`,
        )
      }
      wf.notes[body.path] = upsertedNote
    }
    wf.modified_at = now

    // Validate the FULL merged WorkspaceFile (atomic semantics; existing
    // superRefine invariants stay enforced). safeParse → .success → .data —
    // spec §3.2 PUT mandates this guard, mirroring resortUpsert.ts:161-164.
    const parsed = WorkspaceFile.safeParse(wf)
    /* v8 ignore next 6 -- spec-mandated atomic-validation guard that is
       structurally unreachable HERE (unlike resortUpsert, whose merge CAN
       produce an invalid file): on the hot path `wf` was already
       WorkspaceFile.safeParse-validated by readWorkspaceFileForSlug and our
       only mutations are a schema-valid AnalystNote (body passed
       AnalystNoteUpsertBody) + ISODateTimeString modified_at; on cold-start
       WorkspaceFile.parse throws BEFORE this point. Kept (not removed)
       because the spec requires the post-merge atomic re-validation and a
       Phase-2 schema change could make it reachable. */
    if (!parsed.success) {
      throw new RewrappedWorkspaceCorruptError(
        `merged workspace file for "${slug}" failed schema validation`,
        { slug, issues: parsed.error.issues },
      )
    }

    await atomicWriteWorkspaceFile(targetPath, JSON.stringify(parsed.data, null, 2))

    return { slug, path: body.path, note: rendered }
  })
}
