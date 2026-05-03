import type { ResortDetailResponse, ResortSlugParam } from '@snowboard-trip-advisor/schema/api'

import type { HandlerDeps } from './listResorts'

export interface ResortDetailInput {
  readonly params: ResortSlugParam
}

export async function resortDetailHandler(
  input: ResortDetailInput,
  deps: HandlerDeps,
): Promise<ResortDetailResponse> {
  // STUB — real impl in PR 4.2. Args referenced via `void` for the unused-args
  // lint rule; real impl reads workspace file at deps.workspaceRoot/input.params.slug.
  void input
  void deps
  await Promise.resolve()
  const err = new Error('resortDetail handler not implemented (lands in PR 4.2)')
  ;(err as Error & { code?: string }).code = 'not-implemented'
  throw err
}
