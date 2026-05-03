import { describe, expect, it } from 'vitest'

import { ErrorEnvelope } from './errorEnvelope'

describe('ErrorEnvelope (PR 4.1a, spec §4.10)', (): void => {
  it.each([
    'invalid-request', 'invalid-resort', 'not-found',
    'not-implemented', 'publish-validation-failed',
    'workspace-corrupt', 'internal',
  ])('accepts code %s', (code: string): void => {
    const r = ErrorEnvelope.safeParse({ error: { code, message: 'x' } })
    expect(r.success).toBe(true)
  })

  it('rejects unknown codes', (): void => {
    const r = ErrorEnvelope.safeParse({ error: { code: 'gibberish', message: 'x' } })
    expect(r.success).toBe(false)
  })

  it('permits optional details payload', (): void => {
    const r = ErrorEnvelope.parse({
      error: { code: 'invalid-request', message: 'x', details: [{ path: ['a'], message: 'y' }] },
    })
    expect(r.error.details).toBeDefined()
  })

  it('rejects missing required code', (): void => {
    const r = ErrorEnvelope.safeParse({ error: { message: 'x' } })
    expect(r.success).toBe(false)
  })

  it('rejects missing required message', (): void => {
    const r = ErrorEnvelope.safeParse({ error: { code: 'internal' } })
    expect(r.success).toBe(false)
  })
})
