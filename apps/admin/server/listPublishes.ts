import type { ListPublishesQuery, ListPublishesResponse } from '@snowboard-trip-advisor/schema/api'

import type { HandlerDeps } from './listResorts'

export interface ListPublishesInput {
  readonly query: ListPublishesQuery
}

export async function listPublishesHandler(
  input: ListPublishesInput,
  deps: HandlerDeps,
): Promise<ListPublishesResponse> {
  // STUB — real impl in PR 4.6a (publish history view). Args referenced via `void`;
  // real impl reads deps.workspaceRoot/data/published/history/.
  void input
  void deps
  await Promise.resolve()
  const err = new Error('listPublishes handler not implemented (lands in PR 4.6a)')
  ;(err as Error & { code?: string }).code = 'not-implemented'
  throw err
}
