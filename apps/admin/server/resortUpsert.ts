import { join } from 'node:path'

import {
  ISODateTimeString,
  WorkspaceFile,
  projectFieldStates,
  type Resort,
  type ResortLiveSignal,
} from '@snowboard-trip-advisor/schema'
import type {
  ResortDetailResponse,
  ResortSlugParam,
  ResortUpsertBody,
} from '@snowboard-trip-advisor/schema/api'
import type { z } from 'zod'

import type { HandlerDeps } from './listResorts'
import {
  atomicWriteWorkspaceFile,
  readPublishedDocOrNull,
  readWorkspaceFileForSlug,
} from './workspace'

// PR 4.4c §7.12 — PUT /api/resorts/:slug end-to-end.
//
// Wire-layer rejects (empty body / unknown keys / non-MetricPath editor_modes)
// are enforced by ResortUpsertBody.parse() in dispatch.ts before the handler
// runs. Per AGENTS.md "no defensive code for impossible cases", the handler
// only protects invariants the request schema cannot express:
//
//   - cross-key invariant: editor_modes paths must be in resort.field_sources
//     (durable subset only). Sending `editor_modes: { snow_depth_cm: 'manual' }`
//     is wire-valid (snow_depth_cm is in METRIC_FIELDS) but post-merge fails
//     WorkspaceFile.parse — handler throws InvalidResortError per Codex
//     round-10 P2-14 fold.
//   - slug must exist in workspace OR published doc — else NotFoundError.
//   - target file already on disk MUST be parseable; corrupt state propagates
//     WorkspaceCorruptError (read-side) without overwriting (the read happens
//     before the write).

class NotFoundError extends Error {
  public readonly code = 'not-found' as const
  public constructor(message: string) {
    super(message)
    this.name = 'NotFoundError'
  }
}

class InvalidResortError extends Error {
  public readonly code = 'invalid-resort' as const
  public readonly issues: ReadonlyArray<z.core.$ZodIssue>

  public constructor(issues: ReadonlyArray<z.core.$ZodIssue>) {
    super('resort validation failed')
    this.name = 'InvalidResortError'
    this.issues = issues
  }

  // dispatch.ts (PR 4.4a-2 round-4 P2 fold) reads `.details` from thrown
  // errors and forwards it through the error envelope per spec §4.10.
  public get details(): ReadonlyArray<z.core.$ZodIssue> {
    return this.issues
  }
}

export interface ResortUpsertInput {
  readonly params: ResortSlugParam
  readonly body: ResortUpsertBody
}

export async function resortUpsertHandler(
  input: ResortUpsertInput,
  deps: HandlerDeps,
): Promise<ResortDetailResponse> {
  const { slug } = input.params
  const workspaceDir = join(deps.workspaceRoot, 'data', 'admin-workspace')
  const publishedPath = join(deps.workspaceRoot, 'data', 'published', 'current.v1.json')
  const targetPath = join(workspaceDir, `${slug}.json`)

  // Read base state — workspace takes precedence per spec §4.1.1; fall through
  // to the published doc on cold-start; throw NotFoundError if neither carries
  // the slug. WorkspaceCorruptError from readWorkspaceFileForSlug propagates
  // unchanged BEFORE the write — the corrupt file on disk is not touched.
  const [existing, publishedDoc] = await Promise.all([
    readWorkspaceFileForSlug(workspaceDir, slug),
    readPublishedDocOrNull(publishedPath),
  ])

  let baseResort: Resort
  let baseLive: ResortLiveSignal | null
  let baseModes: Partial<Record<string, 'manual' | 'auto'>>
  if (existing !== null) {
    baseResort = existing.resort
    baseLive = existing.live_signal
    baseModes = existing.editor_modes
  } else {
    const fromPublished = publishedDoc?.resorts.find((r): boolean => r.slug === slug)
    if (fromPublished === undefined) {
      throw new NotFoundError(
        `resort "${slug}" not found in workspace or published doc`,
      )
    }
    baseResort = fromPublished
    baseLive = publishedDoc?.live_signals.find((ls): boolean => ls.resort_slug === slug) ?? null
    baseModes = {}
  }

  // Apply merge per spec §4.3:
  //   - resort: shallow top-level merge, deep field_sources merge per-path
  //   - live_signal: shallow merge OR explicit-null clear OR cold-start replace
  //   - editor_modes: shallow per-key override
  const mergedResort = mergeResort(baseResort, input.body.resort)
  const mergedLive = mergeLiveSignal(baseLive, input.body.live_signal)
  const mergedModes = { ...baseModes, ...(input.body.editor_modes ?? {}) }

  const candidate: unknown = {
    schema_version: 1,
    slug,
    resort: mergedResort,
    live_signal: mergedLive,
    modified_at: ISODateTimeString.parse(new Date().toISOString()),
    editor_modes: mergedModes,
  }
  const parsed = WorkspaceFile.safeParse(candidate)
  if (!parsed.success) {
    throw new InvalidResortError(parsed.error.issues)
  }

  await atomicWriteWorkspaceFile(targetPath, JSON.stringify(parsed.data, null, 2))

  return {
    resort: parsed.data.resort,
    live_signal: parsed.data.live_signal,
    field_states: projectFieldStates(
      parsed.data.resort,
      parsed.data.live_signal,
      parsed.data.editor_modes,
      new Date(),
    ),
  }
}

function mergeResort(base: Resort, patch: ResortUpsertBody['resort']): unknown {
  if (patch === undefined) {
    return base
  }
  const patchFs = patch.field_sources ?? {}
  return {
    ...base,
    ...patch,
    field_sources: { ...base.field_sources, ...patchFs },
  }
}

function mergeLiveSignal(
  base: ResortLiveSignal | null,
  patch: ResortUpsertBody['live_signal'],
): unknown {
  if (patch === undefined) {
    return base
  }
  if (patch === null) {
    return null
  }
  if (base === null) {
    // Cold-start live_signal — patch must satisfy ResortLiveSignal in full.
    // WorkspaceFile.safeParse below will reject if not (→ InvalidResortError).
    return patch
  }
  const patchFs = patch.field_sources ?? {}
  return {
    ...base,
    ...patch,
    field_sources: { ...base.field_sources, ...patchFs },
  }
}
