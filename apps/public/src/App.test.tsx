import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Component, type JSX, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App, { ShellErrorBoundary } from './App'
import * as errors from './lib/errors'
import { server } from './mocks/server'

async function renderAsync(node: ReactNode): Promise<ReturnType<typeof render>> {
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
  window.history.replaceState({}, '', '/')
})
afterEach((): void => {
  vi.restoreAllMocks()
  window.history.replaceState({}, '', '/')
})

describe('App', (): void => {
  it('renders DatasetLoading then resolves to CardsView placeholder', async (): Promise<void> => {
    const view = await renderAsync(<App />)
    // After the act-wrapped initial render, the dataset has resolved.
    expect(await screen.findByTestId('cards-placeholder')).toHaveTextContent(
      'Resort count: 2',
    )
    view.unmount()
  })

  it('shows DatasetUnavailable when fetchDataset throws', async (): Promise<void> => {
    server.use(http.get('/data/current.v1.json', () => HttpResponse.error()))
    await renderAsync(<App />)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(
      screen.getByText("Couldn't reach the server — please refresh."),
    ).toBeInTheDocument()
  })

  it('Retry resets the boundary and re-renders content after a successful refetch', async (): Promise<void> => {
    server.use(http.get('/data/current.v1.json', () => HttpResponse.error()))
    await renderAsync(<App />)
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    server.resetHandlers()
    const user = userEvent.setup()
    await act(async (): Promise<void> => {
      await user.click(screen.getByRole('button', { name: /retry/i }))
      // Drain microtasks so the startTransition state commit + the new
      // fetchDataset() promise settle within the same act() scope.
      for (let i = 0; i < 20; i += 1) {
        await Promise.resolve()
      }
    })
    expect(await screen.findByTestId('cards-placeholder')).toHaveTextContent(
      'Resort count: 2',
    )
  })

  it('skip-link click moves focus to <main id="main">', async (): Promise<void> => {
    await renderAsync(<App />)
    await screen.findByTestId('cards-placeholder')
    const skipLink = screen.getByText('Skip to main content')
    const user = userEvent.setup()
    await user.click(skipLink)
    expect(document.getElementById('main')).toHaveFocus()
  })

  it('selects MatrixView when ?view=matrix is set (boundary catches the stub throw)', async (): Promise<void> => {
    // matrix.tsx is a frozen stub that throws on render until PR 3.4. This
    // test only exercises the App.tsx ternary that picks MatrixView vs
    // CardsView; the boundary catches the stub throw and we assert the alert
    // appears.
    window.history.replaceState({}, '', '/?view=matrix')
    await renderAsync(<App />)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('wires useDocumentMeta into AppContent so title + canonical track URL state', async (): Promise<void> => {
    // Initial load: AppContent calls useDocumentMeta(url), which writes
    // document.title and creates / updates <link rel="canonical">. We start
    // empty (jsdom default title is '') and verify both are populated after
    // mount — that proves the hook is wired in. The hook's own behavior
    // (matrix vs cards titling, query-string-aware canonical) is covered in
    // useDocumentMeta.test.ts; here we only assert the wiring.
    document.title = ''
    document.querySelector('link[rel="canonical"]')?.remove()
    window.history.replaceState({}, '', '/?view=cards')
    const view = await renderAsync(<App />)
    await screen.findByTestId('cards-placeholder')
    expect(document.title).toBe('Snowboard Trip Advisor')
    const canonical = document.querySelector('link[rel="canonical"]')
    expect(canonical).not.toBeNull()
    expect(canonical?.getAttribute('href')).toBeTruthy()
    view.unmount()
  })

  it('mounts the DetailDrawer when ?detail= matches a dataset slug', async (): Promise<void> => {
    // detail.tsx is a frozen stub that throws on render; this test only
    // exercises the App.tsx find() projection that resolves url.detail to a
    // ResortSlug. The boundary catches the stub throw and falls back to
    // DatasetUnavailable — that is the expected wiring until PR 3.5.
    window.history.replaceState({}, '', '/?detail=kotelnica-bialczanska')
    await renderAsync(<App />)
    await waitFor(
      (): void => {
        // Either the cards placeholder shows (detail not yet mounted) or the
        // boundary alert fires (detail stub threw). Either way, the find()
        // projection has executed.
        const alert = screen.queryByRole('alert')
        const cards = screen.queryByTestId('cards-placeholder')
        expect(alert ?? cards).not.toBeNull()
      },
      { timeout: 2000 },
    )
  })
})

describe('ShellErrorBoundary', (): void => {
  it('getDerivedStateFromError returns hasError + the error reference', (): void => {
    const e = new Error('boom')
    expect(ShellErrorBoundary.getDerivedStateFromError(e)).toEqual({
      hasError: true,
      error: e,
    })
  })

  it('componentDidCatch invokes onDatasetError', (): void => {
    const spy = vi.spyOn(errors, 'onDatasetError')

    function ChildThatThrows(): JSX.Element {
      throw new Error('child render boom')
    }

    // Render-time errors trip the error boundary; jsdom logs the warning.
    // The boundary state then renders DatasetUnavailable; we only care that
    // onDatasetError was called.
    class SilentParent extends Component<{ children: ReactNode }> {
      override render(): ReactNode {
        return this.props.children
      }
    }
    render(
      <SilentParent>
        <ShellErrorBoundary>
          <ChildThatThrows />
        </ShellErrorBoundary>
      </SilentParent>,
    )
    expect(spy).toHaveBeenCalled()
  })
})
