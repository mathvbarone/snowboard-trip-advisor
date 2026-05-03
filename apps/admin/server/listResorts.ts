import type { ListResortsQuery, ListResortsResponse } from '@snowboard-trip-advisor/schema/api'

export interface HandlerDeps {
  readonly workspaceRoot: string
}

export interface ListResortsInput {
  readonly query: ListResortsQuery
}

export async function listResortsHandler(
  input: ListResortsInput,
  deps: HandlerDeps,
): Promise<ListResortsResponse> {
  // STUB — real impl in PR 4.3. Args referenced via `void` so the unused-args
  // lint rule passes; real impl will read from deps.workspaceRoot + input.query.
  void input
  void deps
  await Promise.resolve()
  const err = new Error('listResorts handler not implemented (lands in PR 4.3)')
  ;(err as Error & { code?: string }).code = 'not-implemented'
  throw err
}
