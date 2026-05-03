import type {
  ResortDetailResponse,
  ResortSlugParam,
  ResortUpsertBody,
} from '@snowboard-trip-advisor/schema/api'

import type { HandlerDeps } from './listResorts'

export interface ResortUpsertInput {
  readonly params: ResortSlugParam
  readonly body: ResortUpsertBody
}

export async function resortUpsertHandler(
  input: ResortUpsertInput,
  deps: HandlerDeps,
): Promise<ResortDetailResponse> {
  // STUB — real impl in PR 4.4c. Args referenced via `void`; real impl will
  // merge input.body into the workspace file at
  // deps.workspaceRoot/data/admin-workspace/<slug>.json.
  void input
  void deps
  await Promise.resolve()
  const err = new Error('resortUpsert handler not implemented (lands in PR 4.4c)')
  ;(err as Error & { code?: string }).code = 'not-implemented'
  throw err
}
