import { join } from 'node:path'

import {
  projectFieldStates,
  type Resort,
  type ResortLiveSignal,
} from '@snowboard-trip-advisor/schema'
import type { ResortDetailResponse, ResortSlugParam } from '@snowboard-trip-advisor/schema/api'

import type { HandlerDeps } from './listResorts'
import { readPublishedDocOrNull, readWorkspaceFileForSlug } from './workspace'

export interface ResortDetailInput {
  readonly params: ResortSlugParam
}

// Inline class — `code` discriminator is the dispatch.ts contract; existing
// STATUS_FOR_CODE Map already routes 'not-found' → 404, so no dispatch.ts
// modification is required in this PR.
class NotFoundError extends Error {
  public readonly code = 'not-found' as const
  public constructor(message: string) {
    super(message)
    this.name = 'NotFoundError'
  }
}

export async function resortDetailHandler(
  input: ResortDetailInput,
  deps: HandlerDeps,
): Promise<ResortDetailResponse> {
  const { slug } = input.params
  const workspaceDir = join(deps.workspaceRoot, 'data', 'admin-workspace')
  const publishedPath = join(deps.workspaceRoot, 'data', 'published', 'current.v1.json')

  // Workspace branch first — workspace takes precedence per spec §4.1.1.
  // readWorkspaceFileForSlug propagates WorkspaceCorruptError (with
  // `.code = 'workspace-corrupt'`) so dispatch maps it to 500 §10.3.1.
  const wf = await readWorkspaceFileForSlug(workspaceDir, slug)
  if (wf !== null) {
    return buildResponse(wf.resort, wf.live_signal, wf.editor_modes)
  }

  // Fall through to the published doc per §4.2.1.
  const publishedDoc = await readPublishedDocOrNull(publishedPath)
  if (publishedDoc !== null) {
    const resort = publishedDoc.resorts.find((r): boolean => r.slug === slug)
    if (resort !== undefined) {
      const liveSignal: ResortLiveSignal | null =
        publishedDoc.live_signals.find((ls): boolean => ls.resort_slug === slug) ?? null
      return buildResponse(resort, liveSignal, {})
    }
  }

  throw new NotFoundError(`resort "${slug}" not found in workspace or published doc`)
}

function buildResponse(
  resort: Resort,
  liveSignal: ResortLiveSignal | null,
  editorModes: Parameters<typeof projectFieldStates>[2],
): ResortDetailResponse {
  // projectFieldStates returns a TOTAL Record<MetricPath, FieldStateFor<unknown>>:
  // every metric path is keyed (fields with no field_sources entry project to
  // 'failed', not absent). The API contract types `field_states` as
  // `partialRecord` — total → partial is a structural widening, safe for
  // serialization. Pinning the totality at the test layer (see
  // resortDetail.test.ts "field_states is a TOTAL record") prevents a future
  // executor from "optimizing" by dropping failed entries — that would silently
  // break consumers (PR 4.4b's MetricPanel, PR 4.4d's useModeToggle) that
  // assume every path is keyed.
  const field_states = projectFieldStates(resort, liveSignal, editorModes, new Date())
  return {
    resort,
    live_signal: liveSignal,
    field_states,
  }
}
