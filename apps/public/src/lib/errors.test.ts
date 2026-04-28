import { describe, expect, it } from 'vitest'

import { DatasetFetchError, DatasetValidationError, onDatasetError } from './errors'

describe('DatasetFetchError', (): void => {
  it('carries kind + status + cause', (): void => {
    const cause = new TypeError('boom')
    const err = new DatasetFetchError('Network error', 'fetch', undefined, { cause })
    expect(err.message).toBe('Network error')
    expect(err.kind).toBe('fetch')
    expect(err.status).toBeUndefined()
    expect(err.cause).toBe(cause)
    expect(err).toBeInstanceOf(Error)
  })

  it('models the parse-error variant with status 200', (): void => {
    const err = new DatasetFetchError('Malformed JSON', 'parse', 200)
    expect(err.kind).toBe('parse')
    expect(err.status).toBe(200)
  })
})

describe('DatasetValidationError', (): void => {
  it('carries the issues list', (): void => {
    const err = new DatasetValidationError('Dataset failed validation', [
      { code: 'dataset_empty' },
    ])
    expect(err.issues).toHaveLength(1)
    expect(err.issues[0]).toEqual({ code: 'dataset_empty' })
  })
})

describe('onDatasetError', (): void => {
  it('is a no-op telemetry seam (does not throw)', (): void => {
    expect(() => { onDatasetError(new Error('any')) }).not.toThrow()
  })
})
