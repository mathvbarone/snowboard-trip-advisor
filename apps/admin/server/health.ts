import type { HealthQuery, HealthResponse } from '@snowboard-trip-advisor/schema/api'

import type { HandlerDeps } from './listResorts'

export interface HealthInput {
  readonly query: HealthQuery
}

export async function healthHandler(
  input: HealthInput,
  deps: HandlerDeps,
): Promise<HealthResponse> {
  // STUB — real impl in PR 4.4a (health view). Args referenced via `void`;
  // real impl walks deps.workspaceRoot/data/admin-workspace/.
  void input
  void deps
  await Promise.resolve()
  const err = new Error('health handler not implemented (lands in PR 4.4a)')
  ;(err as Error & { code?: string }).code = 'not-implemented'
  throw err
}
