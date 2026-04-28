import { Component, Suspense, type JSX, type ReactNode } from 'react'

import type { ResortSlug } from '@snowboard-trip-advisor/schema'
import { act, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { server } from '../mocks/server'

import { __resetForTests, invalidateDataset, useDataset } from './useDataset'

function Probe(): JSX.Element {
  const { views, slugs } = useDataset()
  return (
    <div>
      <p data-testid="views-count">{String(views.length)}</p>
      <p data-testid="has-kotelnica">
        {String(slugs.has('kotelnica-bialczanska' as ResortSlug))}
      </p>
    </div>
  )
}

class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }
  override render(): JSX.Element {
    if (this.state.error !== null) {
      return <p data-testid="boundary-error">{this.state.error.name}</p>
    }
    return <>{this.props.children}</>
  }
}

async function renderAsync(node: ReactNode): Promise<ReturnType<typeof render>> {
  // React 19 `use()` + Suspense in jsdom requires wrapping the initial render
  // in act() so the suspended promise can resolve (or reject) before the test
  // reads the DOM. Without this wrap, `findBy*` waits forever on the fallback
  // element. We loop a handful of microtask flushes inside the same act so
  // multi-step pipelines (fetch → json → validate → set state) settle.
  let view!: ReturnType<typeof render>
  await act(async (): Promise<void> => {
    view = render(node)
    for (let i = 0; i < 10; i += 1) {
      await Promise.resolve()
    }
  })
  return view
}

beforeEach((): void => {
  __resetForTests()
})
afterEach((): void => {
  __resetForTests()
})

describe('useDataset', (): void => {
  it('suspends then resolves with the dataset', async (): Promise<void> => {
    await renderAsync(
      <Suspense fallback={<p data-testid="loading">loading</p>}>
        <Probe />
      </Suspense>,
    )
    expect(await screen.findByTestId('views-count')).toHaveTextContent('2')
    expect(screen.getByTestId('has-kotelnica')).toHaveTextContent('true')
  })

  it('after rejection + invalidateDataset, a subsequent render succeeds (contamination regression)', async (): Promise<void> => {
    server.use(http.get('/data/current.v1.json', () => HttpResponse.error()))

    const { unmount } = await renderAsync(
      <Boundary>
        <Suspense fallback={<p data-testid="loading">loading</p>}>
          <Probe />
        </Suspense>
      </Boundary>,
    )
    expect(await screen.findByTestId('boundary-error')).toBeInTheDocument()
    unmount()

    // Production retry path: ShellErrorBoundary calls invalidateDataset()
    // and bumps its `key`, which remounts the Suspense subtree with a fresh
    // loadOnce() invocation. We mirror that here: clear the cache, then
    // re-render against the default success handler.
    server.resetHandlers()
    invalidateDataset()
    await renderAsync(
      <Suspense fallback={<p data-testid="loading-2">loading</p>}>
        <Probe />
      </Suspense>,
    )
    expect(await screen.findByTestId('views-count')).toHaveTextContent('2')
  })

  it('throws DatasetValidationError when the validator rejects the dataset', async (): Promise<void> => {
    server.use(
      http.get('/data/current.v1.json', () => HttpResponse.json({ schema_version: 99 })),
    )
    await renderAsync(
      <Boundary>
        <Suspense fallback={<p data-testid="loading">loading</p>}>
          <Probe />
        </Suspense>
      </Boundary>,
    )
    expect(await screen.findByTestId('boundary-error')).toHaveTextContent(
      'DatasetValidationError',
    )
  })

  it('invalidateDataset triggers a refetch on next render', async (): Promise<void> => {
    const { unmount } = await renderAsync(
      <Suspense fallback={<p data-testid="loading">loading</p>}>
        <Probe />
      </Suspense>,
    )
    expect(await screen.findByTestId('views-count')).toHaveTextContent('2')
    unmount()

    let calls = 0
    server.use(
      http.get('/data/current.v1.json', (): HttpResponse => {
        calls += 1
        return HttpResponse.json({ schema_version: 99 })
      }),
    )
    invalidateDataset()
    await renderAsync(
      <Boundary>
        <Suspense fallback={<p data-testid="loading-2">loading</p>}>
          <Probe />
        </Suspense>
      </Boundary>,
    )
    await waitFor((): void => {
      expect(calls).toBeGreaterThan(0)
    })
  })
})
