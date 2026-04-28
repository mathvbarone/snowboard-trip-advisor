import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { server } from '../mocks/server'

import { fetchDataset } from './datasetFetch'
import { DatasetFetchError } from './errors'

describe('fetchDataset', (): void => {
  it('returns a successful LoadResult for the seed dataset (default MSW handler)', async (): Promise<void> => {
    const result = await fetchDataset(new Date('2026-04-26T08:00:00Z'))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.views.length).toBe(2)
    }
  })

  it('returns { ok: false } when the validator rejects the response', async (): Promise<void> => {
    server.use(
      http.get('/data/current.v1.json', () => HttpResponse.json({ schema_version: 99 })),
    )
    const result = await fetchDataset()
    expect(result.ok).toBe(false)
  })

  it('throws DatasetFetchError(kind="fetch") on network failure', async (): Promise<void> => {
    server.use(
      http.get('/data/current.v1.json', () => HttpResponse.error()),
    )
    await expect(fetchDataset()).rejects.toMatchObject({
      name: 'DatasetFetchError',
      kind: 'fetch',
    })
  })

  it('throws DatasetFetchError(kind="fetch", status) on non-2xx', async (): Promise<void> => {
    server.use(
      http.get('/data/current.v1.json', () => new HttpResponse(null, { status: 503 })),
    )
    const promise = fetchDataset()
    await expect(promise).rejects.toBeInstanceOf(DatasetFetchError)
    await expect(promise).rejects.toMatchObject({ kind: 'fetch', status: 503 })
  })

  it('throws DatasetFetchError(kind="parse") on malformed JSON', async (): Promise<void> => {
    server.use(
      http.get('/data/current.v1.json', () =>
        new HttpResponse('not json{', {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        }),
      ),
    )
    await expect(fetchDataset()).rejects.toMatchObject({
      name: 'DatasetFetchError',
      kind: 'parse',
    })
  })

  it('passes referrerPolicy: "no-referrer" on the underlying fetch (spec §4.2)', async (): Promise<void> => {
    const captured: { referrerPolicy?: string } = {}
    server.use(
      http.get('/data/current.v1.json', ({ request }) => {
        captured.referrerPolicy = request.referrerPolicy
        return HttpResponse.json({ schema_version: 99 })          // cheap validator-fail path
      }),
    )
    await fetchDataset()
    expect(captured.referrerPolicy).toBe('no-referrer')
  })
})
