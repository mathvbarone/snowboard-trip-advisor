import { describe, expect, it } from 'vitest'
import type { AdapterError, AdapterResult } from './contract'
import { isRecordAllowed } from './contract'

describe('AdapterError discriminated union', (): void => {
  it('narrows by `code`', (): void => {
    // Hide the literal type behind a function so TS treats `err.code` as the full union
    // rather than the trivially-narrowed `'rate_limited'` literal.
    const buildErr = (): AdapterError => ({ code: 'rate_limited', retry_after_ms: 1000 })
    const err = buildErr()
    if (err.code === 'rate_limited') {
      expect(err.retry_after_ms).toBe(1000)
    } else {
      expect.fail('expected rate_limited discriminator')
    }
  })
})

describe('AdapterResult', (): void => {
  it('is ok | err discriminated by `ok`', (): void => {
    const ok: AdapterResult = {
      ok: true,
      values: {},
      sources: {},
      upstream_hash: 'a'.repeat(64) as never,
    }
    const err: AdapterResult = { ok: false, error: { code: 'timeout' } }
    expect(ok.ok).toBe(true)
    expect(err.ok).toBe(false)
  })
})

describe('isRecordAllowed', (): void => {
  it('returns true only when RECORD_ALLOWED=true', (): void => {
    expect(isRecordAllowed({ RECORD_ALLOWED: 'true' })).toBe(true)
    expect(isRecordAllowed({ RECORD_ALLOWED: '1' })).toBe(false)
    expect(isRecordAllowed({ RECORD_ALLOWED: undefined })).toBe(false)
    expect(isRecordAllowed({})).toBe(false)
  })
})
