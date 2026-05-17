import { ResortSlug } from '@snowboard-trip-advisor/schema'
import { AnalystNotesGetResponse } from '@snowboard-trip-advisor/schema/api'
import type * as SchemaMarkdown from '@snowboard-trip-advisor/schema/markdown'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { Suspense } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { server } from '../../mocks/server'
import * as flushAllModule from '../../state/flushAll'
import {
  __resetForTests as resetFlushAll,
} from '../../state/flushAll'
import {
  __resetForTests as resetAnalystNoteDraft,
} from '../../state/useAnalystNoteDraft'
import {
  __resetForTests as resetAnalystNotes,
  prepopulateAnalystNotes,
} from '../../state/useAnalystNotes'

import AnalystNoteSection from './AnalystNoteSection'

// Codex round-5 P2-B fold harness. Wrap the REAL renderAnalystNoteMarkdown in
// a spy that delegates to the actual unified/sanitize implementation: the
// existing preview / parity tests below keep asserting on real sanitized
// HTML, while the memoization test can assert the renderer is invoked once
// per settled previewSource (debounce) — NOT once per keystroke render.
// vi.mock is hoisted above imports (established repo pattern, see
// packages/schema/src/publishDataset.lockTimeout.test.ts); vi.importActual
// keeps client/server parity intact.
const renderSpy = vi.fn<(markdown: string) => string>()
vi.mock('@snowboard-trip-advisor/schema/markdown', async (): Promise<
  typeof SchemaMarkdown
> => {
  const actual = await vi.importActual<typeof SchemaMarkdown>(
    '@snowboard-trip-advisor/schema/markdown',
  )
  return {
    ...actual,
    renderAnalystNoteMarkdown: (markdown: string): string => {
      renderSpy(markdown)
      return actual.renderAnalystNoteMarkdown(markdown)
    },
  }
})

const KB = ResortSlug.parse('kotelnica-bialczanska')
const PATH = 'slopes_km'
const OBS = '2026-04-26T08:00:00Z'

function seedWith(markdown: string): void {
  prepopulateAnalystNotes(
    KB,
    AnalystNotesGetResponse.parse({
      slug: KB,
      notes: {
        [PATH]: {
          schema_version: 1,
          markdown,
          html: `<p>${markdown}</p>`,
          created_at: OBS,
          updated_at: OBS,
        },
      },
    }),
  )
}

function seedEmpty(): void {
  prepopulateAnalystNotes(
    KB,
    AnalystNotesGetResponse.parse({ slug: KB, notes: {} }),
  )
}

function renderSection(): void {
  render(
    <Suspense fallback={<p>loading</p>}>
      <AnalystNoteSection slug={KB} path={PATH} />
    </Suspense>,
  )
}

beforeEach((): void => {
  vi.useFakeTimers()
  renderSpy.mockClear()
  resetAnalystNotes()
  resetAnalystNoteDraft()
  resetFlushAll()
})

afterEach((): void => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  resetAnalystNotes()
  resetAnalystNoteDraft()
  resetFlushAll()
  server.resetHandlers()
})

describe('AnalystNoteSection (spec §6.2 / §6.3)', (): void => {
  it('reads the existing note and shows it in the source pane', (): void => {
    seedWith('# Heading\n\nbody text')
    renderSection()
    const source = screen.getByRole('textbox', { name: /note source/i })
    expect(source).toHaveValue('# Heading\n\nbody text')
  })

  it('typing in the source pane debounces 500ms then flushes a PUT', async (): Promise<void> => {
    seedEmpty()
    const seen: Array<{ path: string; markdown: string | null }> = []
    server.use(
      http.put(
        '/api/analyst-notes/:slug',
        async ({ params, request }): Promise<Response> => {
          const slug = params.slug as string
          const body = (await request.json()) as {
            path: string
            markdown: string | null
          }
          seen.push(body)
          return HttpResponse.json({
            slug,
            path: body.path,
            note:
              body.markdown === null
                ? null
                : {
                    schema_version: 1 as const,
                    markdown: body.markdown,
                    html: `<p>${body.markdown}</p>`,
                    created_at: OBS,
                    updated_at: OBS,
                  },
          })
        },
      ),
    )
    renderSection()
    const source = screen.getByRole('textbox', { name: /note source/i })
    fireEvent.change(source, { target: { value: 'hello world' } })
    expect(seen).toHaveLength(0)
    await act(async (): Promise<void> => {
      await vi.advanceTimersByTimeAsync(499)
    })
    expect(seen).toHaveLength(0)
    await act(async (): Promise<void> => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(seen).toEqual([{ path: PATH, markdown: 'hello world' }])
  })

  it('renders the client-side preview ~150ms after a keystroke', async (): Promise<void> => {
    seedEmpty()
    renderSection()
    const source = screen.getByRole('textbox', { name: /note source/i })
    fireEvent.change(source, { target: { value: '**bold**' } })
    const preview = screen.getByLabelText(
      'sanitized preview of the note above',
    )
    // Preview is debounced ~150ms — not yet updated.
    expect(preview.innerHTML).not.toContain('<strong>')
    await act(async (): Promise<void> => {
      await vi.advanceTimersByTimeAsync(150)
    })
    expect(preview.innerHTML).toContain('<strong>bold</strong>')
  })

  // Codex round-5 P2-B fold — memoize the debounced preview render. The
  // Textarea re-renders the component on EVERY keystroke (draft changes), but
  // previewSource only changes once per debounce window (~150ms). With the
  // renderer called inline in JSX, the expensive unified/sanitize pipeline
  // ran on every keystroke (defeating the debounce → typing lag on long
  // notes). useMemo keyed by previewSource makes it run only when the settled
  // previewSource changes.
  it('does NOT re-run renderAnalystNoteMarkdown per keystroke (memoized by previewSource)', async (): Promise<void> => {
    seedEmpty()
    renderSection()
    const source = screen.getByRole('textbox', { name: /note source/i })

    // Mount rendered the (empty) previewSource exactly once.
    expect(renderSpy).toHaveBeenCalledTimes(1)

    // Type several characters within ONE debounce window. Each keystroke
    // re-renders the component (draft changes), but previewSource has NOT
    // settled yet → the memo must NOT re-invoke the renderer.
    fireEvent.change(source, { target: { value: 'a' } })
    fireEvent.change(source, { target: { value: 'ab' } })
    fireEvent.change(source, { target: { value: 'abc' } })
    fireEvent.change(source, { target: { value: 'abcd' } })
    expect(renderSpy).toHaveBeenCalledTimes(1)

    // Advance past the debounce ONCE: previewSource settles to the final
    // value → exactly ONE additional render-pipeline run (not one per
    // keystroke).
    await act(async (): Promise<void> => {
      await vi.advanceTimersByTimeAsync(150)
    })
    expect(renderSpy).toHaveBeenCalledTimes(2)
    expect(renderSpy).toHaveBeenLastCalledWith('abcd')
  })

  // Codex P2 fold (Codex round-8 P2). Shell's global keydown listener
  // (lib/shortcuts.ts fires mod+enter from a focused TEXTAREA per spec §3.10)
  // is the SINGLE flush owner: on the editor route Shell.tsx's onModEnter
  // calls flushAllForSlug(route.slug), whose registry fan-out (spec §5.4)
  // reaches this note's SlugStore flusher. The local mod+enter branch here
  // must therefore NOT call any flush (a local flushAllForSlug would
  // double-flush the slug — the second aborts/duplicates the first's
  // in-flight PUT, Codex round-6). But it MUST call e.preventDefault():
  // Ctrl/Cmd modifiers do NOT suppress a <textarea>'s Enter default action
  // (newline insertion) — "Cmd+Enter submits without a newline" is an app
  // convention implemented via preventDefault, not a browser default. Without
  // it the save shortcut injects a stray "\n" into the draft the analyst
  // never typed (the bug Codex round-8 P2 caught; the prior fold's removal of
  // this preventDefault and its `\n?` test tolerance masked it). The branch
  // must NOT stopPropagation — the event still bubbles to Shell's
  // document-level listener for the (single) flush. End-to-end "mod+enter
  // SAVES exactly the typed text, single flush" is covered by the bridge test
  // (AnalystNoteSection.bridge.test.tsx — Shell-wrapped) and Shell.test.tsx.
  it('preventDefaults mod+enter (suppresses textarea newline) but does NOT flush locally — bubbles to Shell (single owner)', async (): Promise<void> => {
    seedEmpty()
    const flushSpy = vi.spyOn(flushAllModule, 'flushAllForSlug')
    renderSection()
    const source = screen.getByRole('textbox', { name: /note source/i })
    fireEvent.change(source, { target: { value: 'urgent' } })

    const evt = new KeyboardEvent('keydown', {
      key: 'Enter',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    })
    await act(async (): Promise<void> => {
      source.dispatchEvent(evt)
      await vi.advanceTimersByTimeAsync(0)
    })

    // The local handler cancels the textarea's Enter default (no stray
    // newline) but does NOT flush — Shell's document-level listener owns the
    // single flushAllForSlug. preventDefault does not stop propagation, so
    // the event still reaches Shell.
    expect(flushSpy).not.toHaveBeenCalled()
    expect(evt.defaultPrevented).toBe(true)

    // Ctrl variant (Linux/Windows) takes the same path.
    const evtCtrl = new KeyboardEvent('keydown', {
      key: 'Enter',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    await act(async (): Promise<void> => {
      source.dispatchEvent(evtCtrl)
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(flushSpy).not.toHaveBeenCalled()
    expect(evtCtrl.defaultPrevented).toBe(true)

    flushSpy.mockRestore()
  })

  it('Escape collapses the row without an explicit discard', async (): Promise<void> => {
    seedWith('keep me')
    const onCollapse = vi.fn()
    render(
      <Suspense fallback={<p>loading</p>}>
        <AnalystNoteSection slug={KB} path={PATH} onCollapse={onCollapse} />
      </Suspense>,
    )
    const source = screen.getByRole('textbox', { name: /note source/i })
    await act(async (): Promise<void> => {
      source.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      )
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(onCollapse).toHaveBeenCalledTimes(1)
  })

  it('Delete button sends PUT { markdown: null }', async (): Promise<void> => {
    seedWith('to be deleted')
    const seen: Array<{ path: string; markdown: string | null }> = []
    server.use(
      http.put(
        '/api/analyst-notes/:slug',
        async ({ params, request }): Promise<Response> => {
          const slug = params.slug as string
          const body = (await request.json()) as {
            path: string
            markdown: string | null
          }
          seen.push(body)
          return HttpResponse.json({ slug, path: body.path, note: null })
        },
      ),
    )
    renderSection()
    const del = screen.getByRole('button', { name: 'Delete note' })
    await act(async (): Promise<void> => {
      del.click()
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(seen).toEqual([{ path: PATH, markdown: null }])
  })

  it('mod+backspace also triggers delete', async (): Promise<void> => {
    seedWith('zap')
    const seen: Array<{ path: string; markdown: string | null }> = []
    server.use(
      http.put(
        '/api/analyst-notes/:slug',
        async ({ params, request }): Promise<Response> => {
          const slug = params.slug as string
          const body = (await request.json()) as {
            path: string
            markdown: string | null
          }
          seen.push(body)
          return HttpResponse.json({ slug, path: body.path, note: null })
        },
      ),
    )
    renderSection()
    const source = screen.getByRole('textbox', { name: /note source/i })
    await act(async (): Promise<void> => {
      source.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Backspace',
          metaKey: true,
          bubbles: true,
        }),
      )
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(seen).toEqual([{ path: PATH, markdown: null }])
  })

  it('labels the sanitized preview region for screen readers', (): void => {
    seedWith('hello')
    renderSection()
    expect(
      screen.getByLabelText('sanitized preview of the note above'),
    ).toBeInTheDocument()
  })

  // Codex P2 fold (spec §6.2): the save-status indicator moved OUT of
  // AnalystNoteSection to FieldRow level (next to the 📝 affordance, always
  // mounted) so a flush that fails after this collapsible section unmounts
  // stays visible. The saving/saved/save-failed assertions that used to live
  // here now live in FieldRow.test.tsx (single source of truth, spec §6.2).
  // The PUT flush behaviour itself is still covered by the debounce / mod+
  // enter / delete tests above.

  it('renders the markdown preview with the SAME renderer as the server (parity)', (): void => {
    seedWith('[x](javascript:alert(1))')
    renderSection()
    const preview = screen.getByLabelText(
      'sanitized preview of the note above',
    )
    // The shared sanitizer strips the javascript: protocol — client/server parity.
    expect(preview.innerHTML).not.toContain('javascript:')
  })
})
