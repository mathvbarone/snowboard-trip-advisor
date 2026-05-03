import type {
  PublishBody,
  PublishResponse,
  PublishSlugParam,
} from '@snowboard-trip-advisor/schema/api'

import type { HandlerDeps } from './listResorts'

export interface PublishInput {
  readonly params: PublishSlugParam
  readonly body: PublishBody
}

export async function publishHandler(
  input: PublishInput,
  deps: HandlerDeps,
): Promise<PublishResponse> {
  // STUB — real impl in PR 4.5a. Args referenced via `void`; real impl will
  // verify input.params.slug === '__all__' (Phase 1) and call publishDataset.
  void input
  void deps
  await Promise.resolve()
  const err = new Error('publish handler not implemented (lands in PR 4.5a)')
  ;(err as Error & { code?: string }).code = 'not-implemented'
  throw err
}
