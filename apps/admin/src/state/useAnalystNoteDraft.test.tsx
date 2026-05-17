import { ResortSlug } from '@snowboard-trip-advisor/schema'
import {
  AnalystNotesGetResponse,
  type AnalystNoteUpsertBody,
  AnalystNoteUpsertResponse,
} from '@snowboard-trip-advisor/schema/api'
import { act, renderHook } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from '../lib/apiClient'
import { server } from '../mocks/server'

import {
  __resetForTests as resetFlushAll,
  flushAllForSlug,
} from './flushAll'
import {
  __resetForTests as resetAnalystNoteDraft,
  deleteNote as moduleDeleteNote,
  flushNow as moduleFlushNow,
  setDraft as moduleSetDraft,
  useAnalystNoteDraft,
} from './useAnalystNoteDraft'
import {
  __resetForTests as resetAnalystNotes,
  prepopulateAnalystNotes,
} from './useAnalystNotes'

// PR N.c2 — useAnalystNoteDraft per-path write hook. Per spec §5.1+§5.2+
// §5.3+§5.4 + the K1 (PR 4.6c) mirror: per-path SlugStore write-side state
// machine — debounce, rev-counter race guard, controller-identity abort
// guard, structural-equality short-circuit (reverted-draft + post-delete
// baseline disjuncts), failed-delete retry routing, flushAll-on-SlugStore.

const KB = ResortSlug.parse('kotelnica-bialczanska')

// `as never` in the spec snippets is a slug/path branding shortcut; the real
// branded parsers are used here so the fixtures parse against the schema.
const SLOPES = 'slopes_km'

const OBS = '2026-04-26T08:00:00Z'

type UpsertResponse = ReturnType<typeof AnalystNoteUpsertResponse.parse>

function upsertResponse(markdown: string | null): UpsertResponse {
  return AnalystNoteUpsertResponse.parse({
    slug: KB,
    path: SLOPES,
    note: markdown === null
      ? null
      : {
          schema_version: 1,
          markdown,
          html: `<p>${markdown}</p>`,
          created_at: OBS,
          updated_at: OBS,
        },
  })
}

function seedWith(markdown: string): void {
  prepopulateAnalystNotes(
    KB,
    AnalystNotesGetResponse.parse({
      slug: KB,
      notes: {
        [SLOPES]: {
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
  prepopulateAnalystNotes(KB, AnalystNotesGetResponse.parse({ slug: KB, notes: {} }))
}

beforeEach((): void => {
  vi.useFakeTimers()
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

describe('useAnalystNoteDraft — initial seed (spec §5.3)', (): void => {
  it('seeds draft and lastSent from server cache on first mount', (): void => {
    seedWith('existing')
    const { result } = renderHook(() => useAnalystNoteDraft(KB, SLOPES))
    expect(result.current.draft).toBe('existing')
    expect(result.current.lastSent).toBe('existing')
    expect(result.current.status).toBe('saved')
  })

  it('seeds draft="" and lastSent=null when no note exists server-side', (): void => {
    seedEmpty()
    const { result } = renderHook(() => useAnalystNoteDraft(KB, SLOPES))
    expect(result.current.draft).toBe('')
    expect(result.current.lastSent).toBeNull()
    expect(result.current.status).toBe('idle')
  })

  it('re-render does NOT re-seed from cache (stored state wins)', (): void => {
    seedWith('existing')
    const { result, rerender } = renderHook(() => useAnalystNoteDraft(KB, SLOPES))
    act((): void => { result.current.setDraft('typed') })
    rerender()
    expect(result.current.draft).toBe('typed')
  })
})

describe('useAnalystNoteDraft — debounce (spec §5.2 step 1-2)', (): void => {
  it('setDraft debounces 500ms then flushes via apiClient.upsertAnalystNote', async (): Promise<void> => {
    seedEmpty()
    const spy = vi
      .spyOn(apiClient, 'upsertAnalystNote')
      .mockResolvedValue(upsertResponse('x'))
    const { result } = renderHook(() => useAnalystNoteDraft(KB, SLOPES))

    act((): void => { result.current.setDraft('x') })
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(499) })
    expect(spy).not.toHaveBeenCalled()

    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(1) })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]?.[1]).toStrictEqual({ path: SLOPES, markdown: 'x' } satisfies AnalystNoteUpsertBody)
  })

  it('rapid setDraft calls coalesce into one flush carrying the final value', async (): Promise<void> => {
    seedEmpty()
    const spy = vi
      .spyOn(apiClient, 'upsertAnalystNote')
      .mockResolvedValue(upsertResponse('final'))
    const { result } = renderHook(() => useAnalystNoteDraft(KB, SLOPES))

    for (const s of ['a', 'ab', 'abc', 'final']) {
      act((): void => { result.current.setDraft(s) })
    }
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]?.[1]).toStrictEqual({ path: SLOPES, markdown: 'final' } satisfies AnalystNoteUpsertBody)
    expect(result.current.lastSent).toBe('final')
    expect(result.current.status).toBe('saved')
  })

  it('flushNow() flushes immediately, cancelling the pending debounce timer', async (): Promise<void> => {
    seedEmpty()
    const spy = vi
      .spyOn(apiClient, 'upsertAnalystNote')
      .mockResolvedValue(upsertResponse('y'))
    const { result } = renderHook(() => useAnalystNoteDraft(KB, SLOPES))

    act((): void => { result.current.setDraft('y') })
    await act(async (): Promise<void> => { await result.current.flushNow() })
    expect(spy).toHaveBeenCalledTimes(1)
    // The cancelled timer must not fire a second PUT.
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('useAnalystNoteDraft — structural-equality short-circuit (spec §5.2 step 2)', (): void => {
  it('disjunct 1: no pending change short-circuits to saved (draft===lastSent, status dirty)', async (): Promise<void> => {
    seedWith('same')
    const spy = vi.spyOn(apiClient, 'upsertAnalystNote')
    const { result } = renderHook(() => useAnalystNoteDraft(KB, SLOPES))

    // Type then revert to the server value — draft===lastSent, status dirty.
    act((): void => { result.current.setDraft('changed') })
    act((): void => { result.current.setDraft('same') })
    expect(result.current.status).toBe('dirty')
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })

    expect(spy).not.toHaveBeenCalled()
    expect(result.current.status).toBe('saved')
  })

  it('disjunct 1 reverted-draft race: in-flight A; revert to lastSent=B; flush aborts A and PUTs fresh for B', async (): Promise<void> => {
    seedWith('B')
    let resolveA!: (v: AnalystNoteUpsertResponse) => void
    const signals: Array<AbortSignal | undefined> = []
    const spy = vi
      .spyOn(apiClient, 'upsertAnalystNote')
      .mockImplementationOnce(
        (_s, _b, opts): Promise<AnalystNoteUpsertResponse> => {
          signals.push(opts?.signal)
          return new Promise<AnalystNoteUpsertResponse>((res): void => { resolveA = res })
        },
      )
      .mockImplementation(
        (_s, _b, opts): Promise<AnalystNoteUpsertResponse> => {
          signals.push(opts?.signal)
          return Promise.resolve(upsertResponse('B'))
        },
      )
    const { result } = renderHook(() => useAnalystNoteDraft(KB, SLOPES))

    // Flight A: draft='A', flush in-flight.
    act((): void => { result.current.setDraft('A') })
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe('saving')

    // Revert to lastSent='B' while A is in flight, then flush.
    act((): void => { result.current.setDraft('B') })
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })

    // Must NOT short-circuit (status was 'saving'): A is aborted, fresh PUT for B.
    expect(signals[0]?.aborted).toBe(true)
    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy.mock.calls[1]?.[1]).toStrictEqual({ path: SLOPES, markdown: 'B' } satisfies AnalystNoteUpsertBody)

    // Resolve the aborted A late — must not clobber.
    await act(async (): Promise<void> => {
      resolveA(upsertResponse('A'))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.lastSent).toBe('B')
  })

  it('disjunct 2 post-delete baseline: after delete success, next mod+enter sends NO PUT', async (): Promise<void> => {
    seedWith('to-delete')
    const spy = vi
      .spyOn(apiClient, 'upsertAnalystNote')
      .mockResolvedValue(upsertResponse(null))
    const { result } = renderHook(() => useAnalystNoteDraft(KB, SLOPES))

    await act(async (): Promise<void> => { await result.current.deleteNote() })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(result.current.lastSent).toBeNull()
    expect(result.current.draft).toBe('')

    // mod+enter with no further edits: lastSent===null && draft==='' → no PUT.
    await act(async (): Promise<void> => { await result.current.flushNow() })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe('saved')
  })
})

describe('useAnalystNoteDraft — deleteNote (spec §5.2 step 3)', (): void => {
  it('deleteNote() PUTs { markdown: null } and clears draft', async (): Promise<void> => {
    seedWith('gone')
    const spy = vi
      .spyOn(apiClient, 'upsertAnalystNote')
      .mockResolvedValue(upsertResponse(null))
    const { result } = renderHook(() => useAnalystNoteDraft(KB, SLOPES))

    await act(async (): Promise<void> => { await result.current.deleteNote() })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]?.[1]).toStrictEqual({ path: SLOPES, markdown: null } satisfies AnalystNoteUpsertBody)
    expect(result.current.draft).toBe('')
    expect(result.current.lastSent).toBeNull()
    expect(result.current.status).toBe('saved')
  })

  it('failed-delete retry routing: deleteNote() fails → flushNow() re-sends PUT { markdown: null }, NOT { markdown: "" }', async (): Promise<void> => {
    seedWith('keepme')
    server.use(
      http.put('/api/analyst-notes/:slug', (): Response =>
        HttpResponse.json({ error: { code: 'internal', message: 'boom' } }, { status: 500 }),
      ),
    )
    const { result } = renderHook(() => useAnalystNoteDraft(KB, SLOPES))

    await act(async (): Promise<void> => { await result.current.deleteNote() })
    expect(result.current.status).toBe('save-failed')
    expect(result.current.draft).toBe('')
    // lastSent must NOT have been pre-cleared (server still holds 'keepme').
    expect(result.current.lastSent).toBe('keepme')

    // Retry via flushNow — must route through deleteNote (PUT null), not upsert "".
    const spy = vi
      .spyOn(apiClient, 'upsertAnalystNote')
      .mockResolvedValue(upsertResponse(null))
    await act(async (): Promise<void> => { await result.current.flushNow() })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]?.[1]).toStrictEqual({ path: SLOPES, markdown: null } satisfies AnalystNoteUpsertBody)
    expect(result.current.lastSent).toBeNull()
  })

  it('deleteNote does NOT mutate lastSent until success (in-flight keeps pre-delete value)', async (): Promise<void> => {
    seedWith('still-here')
    let resolveDel!: (v: AnalystNoteUpsertResponse) => void
    vi.spyOn(apiClient, 'upsertAnalystNote').mockImplementation(
      (): Promise<AnalystNoteUpsertResponse> =>
        new Promise<AnalystNoteUpsertResponse>((res): void => { resolveDel = res }),
    )
    const { result } = renderHook(() => useAnalystNoteDraft(KB, SLOPES))

    let pending!: Promise<void>
    act((): void => { pending = result.current.deleteNote() })
    // In-flight: lastSent still pre-delete value.
    expect(result.current.lastSent).toBe('still-here')
    expect(result.current.status).toBe('saving')

    await act(async (): Promise<void> => {
      resolveDel(upsertResponse(null))
      await pending
    })
    expect(result.current.lastSent).toBeNull()
  })

  it('deleteNote cancels a pending debounce timer first (typing→Delete race in 500ms window)', async (): Promise<void> => {
    seedWith('orig')
    const spy = vi
      .spyOn(apiClient, 'upsertAnalystNote')
      .mockResolvedValue(upsertResponse(null))
    const { result } = renderHook(() => useAnalystNoteDraft(KB, SLOPES))

    act((): void => { result.current.setDraft('x') })          // t=0, timer armed
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(200) })
    await act(async (): Promise<void> => { await result.current.deleteNote() }) // t=200
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) }) // t>500

    // Exactly ONE fetch (the delete PUT null), NOT one + a timer-fired PUT 'x'.
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]?.[1]).toStrictEqual({ path: SLOPES, markdown: null } satisfies AnalystNoteUpsertBody)
  })
})

describe('useAnalystNoteDraft — race guards (spec §5.2 K1 mirror)', (): void => {
  it('rev-counter guard: upsert A resolves after setDraft("b") mid-flight → prepopulate does NOT clobber "b"', async (): Promise<void> => {
    seedEmpty()
    let resolveA!: (v: AnalystNoteUpsertResponse) => void
    vi.spyOn(apiClient, 'upsertAnalystNote')
      .mockImplementationOnce(
        (): Promise<AnalystNoteUpsertResponse> =>
          new Promise<AnalystNoteUpsertResponse>((res): void => { resolveA = res }),
      )
      .mockResolvedValue(upsertResponse('b'))
    const { result } = renderHook(() => useAnalystNoteDraft(KB, SLOPES))

    act((): void => { result.current.setDraft('a') })
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })
    expect(result.current.status).toBe('saving')

    // setDraft('b') mid-flight bumps rev.
    act((): void => { result.current.setDraft('b') })
    expect(result.current.draft).toBe('b')

    // Resolve A — rev moved, so prepopulate must be skipped (would clobber 'b').
    await act(async (): Promise<void> => {
      resolveA(upsertResponse('a'))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.draft).toBe('b')
  })

  it('controller-identity guard: deleteNote aborts an in-flight setDraft flight; the aborted flight does not clear the new controller', async (): Promise<void> => {
    seedWith('seed')
    let resolveA!: (v: AnalystNoteUpsertResponse) => void
    const signals: Array<AbortSignal | undefined> = []
    vi.spyOn(apiClient, 'upsertAnalystNote')
      .mockImplementationOnce(
        (_s, _b, opts): Promise<AnalystNoteUpsertResponse> => {
          signals.push(opts?.signal)
          return new Promise<AnalystNoteUpsertResponse>((res): void => { resolveA = res })
        },
      )
      .mockImplementation(
        (_s, _b, opts): Promise<AnalystNoteUpsertResponse> => {
          signals.push(opts?.signal)
          return Promise.resolve(upsertResponse(null))
        },
      )
    const { result } = renderHook(() => useAnalystNoteDraft(KB, SLOPES))

    act((): void => { result.current.setDraft('a') })
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })
    expect(spy0(signals)).toBe(false) // flight 1 not yet aborted

    // deleteNote aborts flight 1 (controller1) and installs controller2.
    await act(async (): Promise<void> => { await result.current.deleteNote() })
    expect(signals[0]?.aborted).toBe(true)

    // Flight 1's late AbortError must NOT clear controller2 (identity guard).
    await act(async (): Promise<void> => {
      resolveA(upsertResponse('a'))
      await vi.advanceTimersByTimeAsync(0)
    })
    // Delete won: note removed, lastSent null, status saved.
    expect(result.current.lastSent).toBeNull()
    expect(result.current.status).toBe('saved')
  })
})

function spy0(signals: Array<AbortSignal | undefined>): boolean {
  return signals[0]?.aborted ?? false
}

describe('useAnalystNoteDraft — flushAll on the SlugStore (spec §5.4)', (): void => {
  it('flushAllForSlug flushes a dirty path even after the component unmounted', async (): Promise<void> => {
    seedEmpty()
    const spy = vi
      .spyOn(apiClient, 'upsertAnalystNote')
      .mockResolvedValue(upsertResponse('x'))
    const { result, unmount } = renderHook(() => useAnalystNoteDraft(KB, SLOPES))

    act((): void => { result.current.setDraft('x') })   // timer armed, not yet flushed
    unmount()                                             // unmount BEFORE debounce
    expect(spy).not.toHaveBeenCalled()

    // SlugStore-anchored flusher still works post-unmount.
    await act(async (): Promise<void> => { await flushAllForSlug(KB) })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]?.[1]).toStrictEqual({ path: SLOPES, markdown: 'x' } satisfies AnalystNoteUpsertBody)
  })
})

describe('useAnalystNoteDraft — unmount convention (spec §5.2 step 4)', (): void => {
  it('unmount does NOT abort in-flight saves (analyst-walks-away)', async (): Promise<void> => {
    seedEmpty()
    let resolve!: (v: AnalystNoteUpsertResponse) => void
    const signals: Array<AbortSignal | undefined> = []
    vi.spyOn(apiClient, 'upsertAnalystNote').mockImplementation(
      (_s, _b, opts): Promise<AnalystNoteUpsertResponse> => {
        signals.push(opts?.signal)
        return new Promise<AnalystNoteUpsertResponse>((res): void => { resolve = res })
      },
    )
    const { result, unmount } = renderHook(() => useAnalystNoteDraft(KB, SLOPES))

    act((): void => { result.current.setDraft('x') })
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })
    expect(signals).toHaveLength(1)

    unmount()
    expect(signals[0]?.aborted).toBe(false)

    // Resolve post-unmount — the in-flight save still completes.
    await act(async (): Promise<void> => {
      resolve(upsertResponse('x'))
      await vi.advanceTimersByTimeAsync(0)
    })
  })

  it('__resetForTests clears the singleton SlugStores', (): void => {
    seedWith('one')
    const { result, unmount } = renderHook(() => useAnalystNoteDraft(KB, SLOPES))
    act((): void => { result.current.setDraft('two') })
    expect(result.current.draft).toBe('two')
    unmount()

    resetAnalystNoteDraft()
    seedWith('one')
    const { result: r2 } = renderHook(() => useAnalystNoteDraft(KB, SLOPES))
    expect(r2.current.draft).toBe('one')
  })
})

// Branch/line coverage completeness for the genuinely-reachable defensive
// arms the state machine carries (merge sibling-preserve, currentNotes
// module-level fallback, plain-upsert save-failed, delete rev-moved skip,
// delete aborted-by-setDraft, controller-identity false-arm, reset-mid-flight
// abandon, flushAllForSlug no-op). Each maps to a real call sequence.
const REGION = 'region'

describe('useAnalystNoteDraft — coverage completeness', (): void => {
  it('merge preserves sibling notes when deleting one path', async (): Promise<void> => {
    prepopulateAnalystNotes(
      KB,
      AnalystNotesGetResponse.parse({
        slug: KB,
        notes: {
          [SLOPES]: {
            schema_version: 1, markdown: 'keep-me', html: '<p>keep-me</p>',
            created_at: OBS, updated_at: OBS,
          },
          [REGION]: {
            schema_version: 1, markdown: 'delete-me', html: '<p>delete-me</p>',
            created_at: OBS, updated_at: OBS,
          },
        },
      }),
    )
    const spy = vi
      .spyOn(apiClient, 'upsertAnalystNote')
      .mockResolvedValue(upsertResponse(null))
    // Two paths mounted from the same slug store.
    renderHook(() => useAnalystNoteDraft(KB, SLOPES))
    const { result } = renderHook(() => useAnalystNoteDraft(KB, REGION))

    await act(async (): Promise<void> => { await result.current.deleteNote() })
    expect(spy).toHaveBeenCalledTimes(1)
    // The surviving sibling (SLOPES) must remain in the prepopulated map.
    const sibling = renderHook(() => useAnalystNoteDraft(KB, SLOPES))
    expect(sibling.result.current.draft).toBe('keep-me')
    expect(sibling.result.current.lastSent).toBe('keep-me')
  })

  it('module-level setDraft+flushNow with no prior render uses the currentNotes empty fallback', async (): Promise<void> => {
    const spy = vi
      .spyOn(apiClient, 'upsertAnalystNote')
      .mockResolvedValue(upsertResponse('z'))
    // No renderHook → latestNotesBySlug has no entry → currentNotes() falls
    // back to { slug, notes: {} }; seeded state is draft=''/lastSent=null.
    moduleSetDraft(KB, SLOPES, 'z')
    await act(async (): Promise<void> => { await moduleFlushNow(KB, SLOPES) })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]?.[1]).toStrictEqual({ path: SLOPES, markdown: 'z' } satisfies AnalystNoteUpsertBody)
  })

  it('plain upsert failure (non-abort) transitions status to save-failed', async (): Promise<void> => {
    seedEmpty()
    server.use(
      http.put('/api/analyst-notes/:slug', (): Response =>
        HttpResponse.json({ error: { code: 'internal', message: 'boom' } }, { status: 500 }),
      ),
    )
    const { result } = renderHook(() => useAnalystNoteDraft(KB, SLOPES))
    act((): void => { result.current.setDraft('will-fail') })
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })
    expect(result.current.status).toBe('save-failed')
  })

  it('delete rev-moved: setDraft mid-delete-flight → delete success skips prepopulate and leaves the newer draft', async (): Promise<void> => {
    seedWith('orig')
    let resolveDel!: (v: AnalystNoteUpsertResponse) => void
    vi.spyOn(apiClient, 'upsertAnalystNote')
      .mockImplementationOnce(
        (): Promise<AnalystNoteUpsertResponse> =>
          new Promise<AnalystNoteUpsertResponse>((res): void => { resolveDel = res }),
      )
      .mockResolvedValue(upsertResponse('typed-after'))
    const { result } = renderHook(() => useAnalystNoteDraft(KB, SLOPES))

    let pending!: Promise<void>
    act((): void => { pending = result.current.deleteNote() })   // delete in flight
    act((): void => { result.current.setDraft('typed-after') })  // rev bumped mid-flight
    await act(async (): Promise<void> => {
      resolveDel(upsertResponse(null))
      await pending
    })
    // rev moved → delete success skipped prepopulate; newer draft preserved.
    expect(result.current.draft).toBe('typed-after')
  })

  it('delete aborted by a newer setDraft+flush leaves the setDraft state intact', async (): Promise<void> => {
    seedWith('seed')
    let rejectDel!: (e: unknown) => void
    const signals: Array<AbortSignal | undefined> = []
    vi.spyOn(apiClient, 'upsertAnalystNote')
      .mockImplementationOnce(
        (_s, _b, opts): Promise<AnalystNoteUpsertResponse> => {
          signals.push(opts?.signal)
          // Reject with AbortError when the signal aborts (mimics fetch).
          return new Promise<AnalystNoteUpsertResponse>((_res, rej): void => {
            rejectDel = rej
            opts?.signal?.addEventListener('abort', (): void => {
              rej(new DOMException('aborted', 'AbortError'))
            })
          })
        },
      )
      .mockImplementation(
        (_s, _b, opts): Promise<AnalystNoteUpsertResponse> => {
          signals.push(opts?.signal)
          return Promise.resolve(upsertResponse('after-delete'))
        },
      )
    const { result } = renderHook(() => useAnalystNoteDraft(KB, SLOPES))

    let pending!: Promise<void>
    act((): void => { pending = result.current.deleteNote() })       // delete flight
    act((): void => { result.current.setDraft('after-delete') })     // arms debounce
    // The setDraft's debounce flush aborts the in-flight delete, then PUTs
    // the new draft. The delete's AbortError handler must leave the
    // setDraft-installed state alone.
    await act(async (): Promise<void> => {
      await vi.advanceTimersByTimeAsync(600)
      await pending
    })
    expect(signals[0]?.aborted).toBe(true)
    expect(result.current.draft).toBe('after-delete')
    expect(result.current.status).toBe('saved')
    // Silence the unused-rejector (only used if abort listener didn't fire).
    void rejectDel
  })

  it('reset mid-flight: __resetForTests during an in-flight PUT abandons bookkeeping safely', async (): Promise<void> => {
    seedEmpty()
    let resolve!: (v: AnalystNoteUpsertResponse) => void
    vi.spyOn(apiClient, 'upsertAnalystNote').mockImplementation(
      (): Promise<AnalystNoteUpsertResponse> =>
        new Promise<AnalystNoteUpsertResponse>((res): void => { resolve = res }),
    )
    const { result } = renderHook(() => useAnalystNoteDraft(KB, SLOPES))
    act((): void => { result.current.setDraft('mid') })
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })

    // Reset clears the store + aborts the controller; the resolution that
    // follows must hit liveOrAbandon's undefined return (no throw).
    resetAnalystNoteDraft()
    await act(async (): Promise<void> => {
      resolve(upsertResponse('mid'))
      await vi.advanceTimersByTimeAsync(0)
    })
    // No assertion on state — the store is gone; the guard must not throw.
    expect(true).toBe(true)
  })

  it('flushAllForSlug is a no-op when no SlugStore exists for the slug', async (): Promise<void> => {
    const spy = vi.spyOn(apiClient, 'upsertAnalystNote')
    await act(async (): Promise<void> => { await flushAllForSlug(KB) })
    expect(spy).not.toHaveBeenCalled()
  })

  it('flushAllForSlug is a no-op when the store has no dirty/failed/armed paths', async (): Promise<void> => {
    seedWith('clean')
    renderHook(() => useAnalystNoteDraft(KB, SLOPES))   // status 'saved', no timer
    const spy = vi.spyOn(apiClient, 'upsertAnalystNote')
    await act(async (): Promise<void> => { await flushAllForSlug(KB) })
    expect(spy).not.toHaveBeenCalled()
  })

  it('in-flight upsert that rejects with AbortError hits the upsert AbortError handler', async (): Promise<void> => {
    seedWith('B')
    const signals: Array<AbortSignal | undefined> = []
    vi.spyOn(apiClient, 'upsertAnalystNote')
      .mockImplementationOnce(
        (_s, _b, opts): Promise<AnalystNoteUpsertResponse> => {
          signals.push(opts?.signal)
          return new Promise<AnalystNoteUpsertResponse>((_res, rej): void => {
            opts?.signal?.addEventListener('abort', (): void => {
              rej(new DOMException('aborted', 'AbortError'))
            })
          })
        },
      )
      .mockImplementation(
        (_s, _b, opts): Promise<AnalystNoteUpsertResponse> => {
          signals.push(opts?.signal)
          return Promise.resolve(upsertResponse('B'))
        },
      )
    const { result } = renderHook(() => useAnalystNoteDraft(KB, SLOPES))

    // Flight A (upsert 'A') in-flight; revert to lastSent 'B' → next flush
    // aborts A. A's promise rejects AbortError → the upsert catch's
    // isAbortError arm runs (clearControllerIfOurs + return).
    act((): void => { result.current.setDraft('A') })
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })
    act((): void => { result.current.setDraft('B') })
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })

    expect(signals[0]?.aborted).toBe(true)
    expect(result.current.lastSent).toBe('B')
    expect(result.current.status).toBe('saved')
  })

  it('module-level deleteNote success branch clears controller (identity guard true-arm)', async (): Promise<void> => {
    seedWith('m')
    const spy = vi
      .spyOn(apiClient, 'upsertAnalystNote')
      .mockResolvedValue(upsertResponse(null))
    await act(async (): Promise<void> => { await moduleDeleteNote(KB, SLOPES) })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]?.[1]).toStrictEqual({ path: SLOPES, markdown: null } satisfies AnalystNoteUpsertBody)
  })

  it('concurrent flush replaces the controller; the first flight succeeds against a foreign controller (identity false-arm)', async (): Promise<void> => {
    seedEmpty()
    let resolveA!: (v: AnalystNoteUpsertResponse) => void
    const controllers: Array<AbortSignal | undefined> = []
    vi.spyOn(apiClient, 'upsertAnalystNote')
      .mockImplementationOnce(
        (_s, _b, opts): Promise<AnalystNoteUpsertResponse> => {
          controllers.push(opts?.signal)
          return new Promise<AnalystNoteUpsertResponse>((res): void => { resolveA = res })
        },
      )
      .mockImplementation(
        (_s, _b, opts): Promise<AnalystNoteUpsertResponse> => {
          controllers.push(opts?.signal)
          return new Promise<AnalystNoteUpsertResponse>((): void => { /* second flight hangs */ })
        },
      )
    const { result } = renderHook(() => useAnalystNoteDraft(KB, SLOPES))

    act((): void => { result.current.setDraft('A') })
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) }) // flight A
    // A concurrent flushNow() (e.g. mod+enter) while A is in flight: flush
    // does NOT short-circuit (status 'saving'), aborts A, installs a fresh
    // controller WITHOUT bumping rev (flush never bumps rev). So when A
    // resolves, flightRev === live.rev but live.abortController is the
    // SECOND controller → settleSuccess's identity ternary false-arm.
    await act(async (): Promise<void> => {
      void result.current.flushNow()
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(controllers).toHaveLength(2)
    await act(async (): Promise<void> => {
      resolveA(upsertResponse('A'))
      await vi.advanceTimersByTimeAsync(0)
    })
    // No throw; the second flight's controller was preserved (not cleared).
    expect(result.current.draft).toBe('A')
  })

  it('reset mid-flight then the PUT REJECTS: settleError abandons safely (live-undefined true-arm)', async (): Promise<void> => {
    seedEmpty()
    let rejectIt!: (e: unknown) => void
    vi.spyOn(apiClient, 'upsertAnalystNote').mockImplementation(
      (): Promise<AnalystNoteUpsertResponse> =>
        new Promise<AnalystNoteUpsertResponse>((_res, rej): void => { rejectIt = rej }),
    )
    const { result } = renderHook(() => useAnalystNoteDraft(KB, SLOPES))
    act((): void => { result.current.setDraft('x') })
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })

    resetAnalystNoteDraft()
    await act(async (): Promise<void> => {
      rejectIt(new Error('network'))   // non-abort rejection after reset
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(true).toBe(true)   // settleError's liveOrAbandon undefined arm — no throw
  })

  it('non-abort failure with rev moved mid-flight does NOT set save-failed (settleError rev false-arm)', async (): Promise<void> => {
    seedEmpty()
    let rejectFirst!: (e: unknown) => void
    vi.spyOn(apiClient, 'upsertAnalystNote')
      .mockImplementationOnce(
        (): Promise<AnalystNoteUpsertResponse> =>
          new Promise<AnalystNoteUpsertResponse>((_res, rej): void => { rejectFirst = rej }),
      )
      .mockResolvedValue(upsertResponse('b'))
    const { result } = renderHook(() => useAnalystNoteDraft(KB, SLOPES))

    act((): void => { result.current.setDraft('a') })
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) }) // flight a
    act((): void => { result.current.setDraft('b') })   // rev bumped mid-flight
    await act(async (): Promise<void> => {
      rejectFirst(new Error('500'))                      // non-abort error, rev moved
      await vi.advanceTimersByTimeAsync(0)
    })
    // rev moved → status NOT forced to save-failed (newer 'b' edit pending).
    expect(result.current.status).not.toBe('save-failed')
    expect(result.current.draft).toBe('b')
  })
})
