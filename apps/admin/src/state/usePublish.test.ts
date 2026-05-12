import { PublishResponse } from '@snowboard-trip-advisor/schema/api'
import { act, renderHook } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from '../lib/apiClient'
import { server } from '../mocks/server'

import * as listPublishesModule from './useListPublishes'
import { __resetForTests, usePublish, type UsePublishResult } from './usePublish'

beforeEach((): void => {
  __resetForTests()
  listPublishesModule.__resetForTests()
})
afterEach((): void => {
  __resetForTests()
  listPublishesModule.__resetForTests()
  server.resetHandlers()
  vi.restoreAllMocks()
})

const SUCCESS_RESPONSE: PublishResponse = PublishResponse.parse({
  version_id: '1-2026-05-12T08-30-15-247Z',
  archive_path: 'data/published/history/1-2026-05-12T08-30-15-247Z.json',
  published_at: '2026-05-12T08:30:15.247Z',
  resort_count: 2,
})

describe('usePublish (PR 4.5c)', (): void => {
  it('starts idle', (): void => {
    const { result } = renderHook((): UsePublishResult => usePublish())
    expect(result.current.status).toBe('idle')
    expect(result.current.response).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('happy path: idle → submitting → success; calls invalidateListPublishes (Decision D2)', async (): Promise<void> => {
    server.use(
      http.post('/api/resorts/__all__/publish', (): Response =>
        HttpResponse.json(SUCCESS_RESPONSE),
      ),
    )
    const invalidateSpy = vi.spyOn(listPublishesModule, 'invalidateListPublishes')
    const { result } = renderHook((): UsePublishResult => usePublish())

    await act(async (): Promise<void> => {
      await result.current.submit()
    })
    expect(result.current.status).toBe('success')
    expect(result.current.response).toMatchObject({
      version_id: '1-2026-05-12T08-30-15-247Z',
      resort_count: 2,
    })
    expect(result.current.error).toBeNull()
    expect(invalidateSpy).toHaveBeenCalledOnce()
  })

  it('failure path: idle → submitting → error; error carries message', async (): Promise<void> => {
    server.use(
      http.post('/api/resorts/__all__/publish', (): Response =>
        HttpResponse.json(
          { error: { code: 'publish-validation-failed', message: 'dataset_empty' } },
          { status: 400 },
        ),
      ),
    )
    const { result } = renderHook((): UsePublishResult => usePublish())

    await act(async (): Promise<void> => {
      await result.current.submit()
    })
    expect(result.current.status).toBe('error')
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe('dataset_empty')
    expect(result.current.response).toBeNull()
  })

  it('wraps non-Error rejections in Error (catch-branch fallback)', async (): Promise<void> => {
    vi.spyOn(apiClient, 'publish').mockRejectedValueOnce('string rejection')
    const { result } = renderHook((): UsePublishResult => usePublish())

    await act(async (): Promise<void> => {
      await result.current.submit()
    })
    expect(result.current.status).toBe('error')
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe('string rejection')
  })

  it('reset() returns to idle from error state', async (): Promise<void> => {
    server.use(
      http.post('/api/resorts/__all__/publish', (): Response =>
        HttpResponse.json(
          { error: { code: 'publish-validation-failed', message: 'dataset_empty' } },
          { status: 400 },
        ),
      ),
    )
    const { result } = renderHook((): UsePublishResult => usePublish())
    await act(async (): Promise<void> => {
      await result.current.submit()
    })
    expect(result.current.status).toBe('error')

    act((): void => {
      result.current.reset()
    })
    expect(result.current.status).toBe('idle')
    expect(result.current.error).toBeNull()
    expect(result.current.response).toBeNull()
  })

  it('reset() returns to idle from success state', async (): Promise<void> => {
    server.use(
      http.post('/api/resorts/__all__/publish', (): Response =>
        HttpResponse.json(SUCCESS_RESPONSE),
      ),
    )
    const { result } = renderHook((): UsePublishResult => usePublish())
    await act(async (): Promise<void> => {
      await result.current.submit()
    })
    expect(result.current.status).toBe('success')

    act((): void => {
      result.current.reset()
    })
    expect(result.current.status).toBe('idle')
    expect(result.current.response).toBeNull()
  })

  it('synchronous in-flight guard: a second submit() while one is pending is a no-op (round-8 fold)', async (): Promise<void> => {
    server.use(
      http.post('/api/resorts/__all__/publish', (): Response =>
        HttpResponse.json(SUCCESS_RESPONSE),
      ),
    )
    const apiSpy = vi.spyOn(apiClient, 'publish')
    const { result } = renderHook((): UsePublishResult => usePublish())

    await act(async (): Promise<void> => {
      const p1 = result.current.submit()
      const p2 = result.current.submit()
      await Promise.all([p1, p2])
    })
    expect(apiSpy).toHaveBeenCalledOnce()
    expect(result.current.status).toBe('success')
  })

  it('exposes __resetForTests as a no-op for symmetry', (): void => {
    expect((): void => {
      __resetForTests()
    }).not.toThrow()
  })
})
