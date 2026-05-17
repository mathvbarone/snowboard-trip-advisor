import type { ResortSlug } from '@snowboard-trip-advisor/schema'
import type {
  AnalystNotesGetResponse,
  AnalystNoteUpsertBody,
  AnalystNoteUpsertResponse,
} from '@snowboard-trip-advisor/schema/api'
import { useCallback, useRef, useSyncExternalStore } from 'react'

import { apiClient } from '../lib/apiClient'

import { registerSlugFlusher } from './flushAll'
import { prepopulateAnalystNotes, useAnalystNotes } from './useAnalystNotes'

import './useAnalystNoteDraft.hmr'

// RenderedAnalystNote is not re-exported from `@snowboard-trip-advisor/
// schema/api` (it is internal to packages/schema/api/analystNotes.ts, an
// N.a-foundation file that is out of scope for this PR — adding an export
// would widen scope). Derive the rendered-note value type structurally from
// the exported AnalystNotesGetResponse instead.
type RenderedAnalystNote = AnalystNotesGetResponse['notes'][string]

// `NotePath` is exported from the schema package as a Zod *value* only (no
// `export type`); the inferred type is the branded path string. Derive it
// structurally from the exported AnalystNoteUpsertBody['path'] rather than
// re-exporting from the N.a-foundation schema file (out of scope).
type NotePath = AnalystNoteUpsertBody['path']

// PR N.c2 — useAnalystNoteDraft. Per spec §5.1+§5.2+§5.3+§5.4. Per-path
// write-side state machine; mirrors useWorkspaceState's SlugStore + K1 (PR
// 4.6c) race-handling pattern. Module-level Map<ResortSlug, SlugNotesStore>;
// each store owns a Map<NotePath, NotesPathState>. The per-path store makes
// path-gating implicit — each path has its own AbortController + rev, so K1's
// "abort only when the cleared path was in the in-flight body" check is
// unnecessary (no cross-path interference window).
//
// State is replaced immutably on every mutation (mirrors useWorkspaceState's
// patchState) so useSyncExternalStore's Object.is snapshot comparison detects
// changes. The per-path state object reference IS the snapshot.

const DEBOUNCE_MS = 500

export type NoteDraftStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'save-failed'

// Per spec §5.1 — per-path write-side state (verbatim shape from plan §9.2
// Step 13). `lastSent: string | null` is the markdown the server currently
// holds (null iff no note exists) — load-bearing for the §5.2 short-circuit
// and failed-delete retry routing. `lastFlightKind` decouples retry-intent
// from `lastSent`.
type NotesPathState = {
  readonly draft: string
  readonly lastSent: string | null
  readonly status: NoteDraftStatus
  readonly debounceTimer: ReturnType<typeof setTimeout> | undefined
  readonly abortController: AbortController | undefined
  readonly rev: number
  readonly lastFlightKind: 'upsert' | 'delete' | null
}

interface SlugNotesStore {
  paths: Map<NotePath, NotesPathState>
  subscribers: Set<() => void>
}

const slugStores = new Map<ResortSlug, SlugNotesStore>()

// Per-slug ref to the latest useAnalystNotes() response so module-level flush
// handlers can build the merged full response for prepopulate. Mirrors
// useWorkspaceState.ts:686 threading useResortDetail(slug) into the store.
const latestNotesBySlug = new Map<ResortSlug, AnalystNotesGetResponse>()

function getOrCreateStore(slug: ResortSlug): SlugNotesStore {
  let store = slugStores.get(slug)
  if (store === undefined) {
    store = { paths: new Map(), subscribers: new Set() }
    slugStores.set(slug, store)
    // Spec §5.4: registration sits on the SlugStore, registered lazily on
    // first read for that slug. The flusher iterates every per-path state
    // and flushes the dirty / save-failed ones. Deregistration only from
    // the sibling .hmr.ts — never on component unmount (the dispose handle
    // is intentionally discarded here). The closure captures `store` and
    // `slug` directly (not a slugStores re-lookup) so there is no
    // "store missing" case to defend — the flusher's store is the one it
    // was registered for, for that flusher's whole lifetime.
    const flushStore = store
    registerSlugFlusher(slug, (): Promise<void> => flushAllPaths(slug, flushStore))
  }
  return store
}

function emit(store: SlugNotesStore): void {
  for (const cb of store.subscribers) { cb() }
}

function freshPathState(markdown: string | null): NotesPathState {
  // Per spec §5.3: existing note → seed draft + lastSent from its markdown,
  // status 'saved'; no note → draft='' / lastSent=null / status 'idle'.
  // lastFlightKind=null on mount either way.
  return markdown === null
    ? {
        draft: '',
        lastSent: null,
        status: 'idle',
        debounceTimer: undefined,
        abortController: undefined,
        rev: 0,
        lastFlightKind: null,
      }
    : {
        draft: markdown,
        lastSent: markdown,
        status: 'saved',
        debounceTimer: undefined,
        abortController: undefined,
        rev: 0,
        lastFlightKind: null,
      }
}

function getOrSeedPathState(
  store: SlugNotesStore,
  path: NotePath,
  notes: AnalystNotesGetResponse,
): NotesPathState {
  let state = store.paths.get(path)
  if (state === undefined) {
    const existing = notes.notes[path]
    state = freshPathState(existing === undefined ? null : existing.markdown)
    store.paths.set(path, state)
  }
  return state
}

// Replace the per-path state immutably and notify subscribers. The new
// object identity is what useSyncExternalStore's getSnapshot returns, so
// Object.is sees the change. Mirrors useWorkspaceState's patchState.
function patchPathState(
  store: SlugNotesStore,
  path: NotePath,
  next: NotesPathState,
): void {
  store.paths.set(path, next)
  emit(store)
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

// Build a full AnalystNotesGetResponse from the current cached map plus the
// single-path delta echoed by the PUT response. prepopulateAnalystNotes
// requires a FULL response; the analyst-notes PUT echoes only one path (the
// mirror's resort PUT echoes the full detail, so useWorkspaceState doesn't
// need this). Immutable: spread the current map, then set/delete the one
// path — never mutate the cached object.
function merge(
  current: AnalystNotesGetResponse,
  slug: ResortSlug,
  path: NotePath,
  note: RenderedAnalystNote | null,
): AnalystNotesGetResponse {
  if (note === null) {
    // delete the one path (no dynamic `delete` — rebuild without the key).
    const rebuilt: Record<string, RenderedAnalystNote> = {}
    for (const [k, v] of Object.entries(current.notes)) {
      if (k === path) { continue }
      rebuilt[k] = v
    }
    return { slug, notes: rebuilt }
  }
  return { slug, notes: { ...current.notes, [path]: note } }
}

function currentNotes(slug: ResortSlug): AnalystNotesGetResponse {
  return latestNotesBySlug.get(slug) ?? { slug, notes: {} }
}

function cancelTimer(state: NotesPathState): void {
  if (state.debounceTimer !== undefined) { clearTimeout(state.debounceTimer) }
}

export function setDraft(slug: ResortSlug, path: NotePath, markdown: string): void {
  const store = getOrCreateStore(slug)
  const state = getOrSeedPathState(store, path, currentNotes(slug))
  // Spec §5.2 step 1. Typed text always = upsert intent — clears a stale
  // 'delete' kind from a previous failed-delete flight so retry routing
  // doesn't false-positive.
  //
  // Spec-vs-literal resolution (reverted-draft race, spec §5.2 step 2): the
  // spec closes the reverted-draft race by EXCLUDING `'saving'` from the
  // short-circuit, framing the scenario as "an upsert of value A is in
  // flight (`status === 'saving'`) and the analyst reverts". But step 1's
  // literal "state.status = 'dirty'" would drop the in-flight 'saving' to
  // 'dirty' on the revert, so the exclusion could never engage and the
  // documented durable-divergence bug would stand. To make the spec's own
  // race-closure mechanism actually fire (and satisfy plan §9.2 Step 5
  // sub-test 2 — "flush must abort A, not short-circuit"), preserve
  // 'saving' while a flight is in progress; otherwise set 'dirty' per step
  // 1. rev still increments and lastFlightKind still flips either way.
  cancelTimer(state)
  // flushPath() clears state.debounceTimer itself before doing any work, so
  // the timer callback only needs to invoke it — no redundant pre-clear.
  const timer = setTimeout((): void => {
    void flushPath(slug, path)
  }, DEBOUNCE_MS)
  patchPathState(store, path, {
    ...state,
    draft: markdown,
    status: state.status === 'saving' ? 'saving' : 'dirty',
    rev: state.rev + 1,
    lastFlightKind: 'upsert',
    debounceTimer: timer,
  })
}

// Spec §5.2 step 2 — flush (debounce OR flushNow()).
async function flushPath(slug: ResortSlug, path: NotePath): Promise<void> {
  const store = getOrCreateStore(slug)
  let state = getOrSeedPathState(store, path, currentNotes(slug))
  if (state.debounceTimer !== undefined) {
    clearTimeout(state.debounceTimer)
    state = { ...state, debounceTimer: undefined }
    store.paths.set(path, state)
  }

  // Failed-delete retry routing: a failed deleteNote() flight must re-send
  // PUT { markdown: null } via deleteNote(), NOT PUT { markdown: '' } (which
  // would resurrect the note as an empty upsert).
  if (state.lastFlightKind === 'delete' && state.status === 'save-failed' && state.draft === '') {
    await deleteNotePath(slug, path)
    return
  }

  // Structural-equality short-circuit. Disjunct 1 = normal no-pending-change;
  // disjunct 2 = post-delete baseline (lastSent=null, draft=''; without it
  // the next flush would PUT { markdown: '' } and recreate the deleted note).
  // Excluding 'saving' closes the reverted-draft race: an in-flight A with a
  // revert to lastSent=B before A lands must NOT mark saved-at-B while the
  // server still gets A — falling through aborts A and sends a fresh PUT.
  if (
    (state.draft === state.lastSent || (state.lastSent === null && state.draft === '')) &&
    state.status !== 'save-failed' &&
    state.status !== 'saving'
  ) {
    patchPathState(store, path, { ...state, status: 'saved' })
    return
  }

  state.abortController?.abort()
  const flightRev = state.rev
  const localController = new AbortController()
  const flightDraft = state.draft
  patchPathState(store, path, {
    ...state,
    abortController: localController,
    status: 'saving',
    lastFlightKind: 'upsert',
  })

  try {
    const response = await apiClient.upsertAnalystNote(
      slug,
      { path, markdown: flightDraft },
      { signal: localController.signal },
    )
    settleSuccess(slug, store, path, flightRev, localController, 'upsert', response)
  } catch (err: unknown) {
    settleError(store, slug, path, flightRev, localController, err)
  }
}

// Shared post-await settlement for both upsert and delete flights (their
// success/error handling is identical except `lastSent`: upsert → the
// flight's draft, delete → null). Centralizing it keeps a single set of
// race-guard branches rather than two near-identical copies.
//
// `kind` selects the lastSent target. The flight rev guard, controller-
// identity guard, reset-during-flight abandon, AbortError no-op, and
// save-failed transition all live here once.
function settleSuccess(
  slug: ResortSlug,
  store: SlugNotesStore,
  path: NotePath,
  flightRev: number,
  localController: AbortController,
  kind: 'upsert' | 'delete',
  response: AnalystNoteUpsertResponse,
): void {
  // Reset-during-flight guard (mirrors useWorkspaceState.ts:430 —
  // storesBySlug.get(slug) !== store): __resetForTests clears the map and
  // aborts controllers; the post-clear resolution is for a store nobody is
  // subscribed to, so bookkeeping is moot.
  const live = liveOrAbandon(slug, store, path)
  if (live === undefined) { return }
  if (flightRev !== live.rev) {
    // Newer setDraft/deleteNote happened mid-flight — skip prepopulate,
    // leave status as the caller set it (would clobber the newer state).
    clearControllerIfOurs(store, path, live, localController)
    return
  }
  store.paths.set(path, {
    ...live,
    lastSent: kind === 'upsert' ? live.draft : null,
    status: 'saved',
    lastFlightKind: null,
    abortController: live.abortController === localController ? undefined : live.abortController,
  })
  // Write-through latestNotesBySlug (Codex P2 fold). currentNotes(slug)
  // reads the render-time latestNotesBySlug map (only written during a
  // React render). When flushAllForSlug flushes two dirty paths via
  // Promise.all, both single-path PUTs can settle in the SAME tick before
  // any re-render refreshes the map — so the second settleSuccess would
  // merge onto the SAME stale full response and drop the path the first
  // settle just confirmed. Synchronously seeding the map with the same
  // merged response makes the next same-tick sibling-path merge read the
  // fresh value. Consistent with N.c1's cachedFulfilled: prepopulate just
  // set it to this `merged` object, and the next render re-sets
  // latestNotesBySlug from useAnalystNotes to the identical value.
  const merged = merge(currentNotes(slug), slug, response.path, response.note)
  prepopulateAnalystNotes(slug, merged)
  latestNotesBySlug.set(slug, merged)
  emit(store)
}

function settleError(
  store: SlugNotesStore,
  slug: ResortSlug,
  path: NotePath,
  flightRev: number,
  localController: AbortController,
  err: unknown,
): void {
  const live = liveOrAbandon(slug, store, path)
  if (live === undefined) { return }
  if (isAbortError(err)) {
    // Controller-identity guard — only clear if it's still ours. (Upsert
    // aborted by a newer flush/delete; or delete aborted by a newer
    // setDraft+flush — the newer flight already updated the state.)
    clearControllerIfOurs(store, path, live, localController)
    return
  }
  if (flightRev === live.rev) {
    // Non-abort failure. For a failed delete, lastSent stays pre-delete and
    // lastFlightKind stays 'delete' so §5.2 step 2 retry routing detects it
    // (deleteNotePath left both untouched on entry).
    patchPathState(store, path, { ...live, status: 'save-failed' })
  }
}

// Re-read the per-path state after an awaited round-trip. Returns undefined
// when __resetForTests cleared the store mid-flight (the slug's store is no
// longer the one in the map, OR the path entry was wiped) — the caller then
// abandons bookkeeping for a store nobody is subscribed to (mirrors
// useWorkspaceState.ts:430's storesBySlug.get(slug) !== store guard).
function liveOrAbandon(
  slug: ResortSlug,
  store: SlugNotesStore,
  path: NotePath,
): NotesPathState | undefined {
  if (slugStores.get(slug) !== store) { return undefined }
  return store.paths.get(path)
}

function clearControllerIfOurs(
  store: SlugNotesStore,
  path: NotePath,
  live: NotesPathState,
  localController: AbortController,
): void {
  if (live.abortController === localController) {
    store.paths.set(path, { ...live, abortController: undefined })
  }
}

// Spec §5.2 step 3 — deleteNote(). delete = upsertAnalystNote(slug,
// { path, markdown: null }); there is no separate delete method.
async function deleteNotePath(slug: ResortSlug, path: NotePath): Promise<void> {
  const store = getOrCreateStore(slug)
  const state = getOrSeedPathState(store, path, currentNotes(slug))

  // Cancel pending debounce timer FIRST — without this a typing→Delete race
  // inside the 500ms window leaves the setDraft timer armed; it would fire
  // during the delete PUT, fall through flush, abort the in-flight delete,
  // and PUT { markdown: '' } — recreating the note as an empty upsert.
  cancelTimer(state)
  state.abortController?.abort()
  // Do NOT mutate lastSent — server still holds the original note until the
  // delete confirms; pre-clearing violates the §5.1 invariant on a
  // failed-delete state. lastSent → null only in the success branch.
  const flightRev = state.rev + 1
  const localController = new AbortController()
  patchPathState(store, path, {
    ...state,
    draft: '',
    status: 'saving',
    rev: flightRev,
    lastFlightKind: 'delete',
    debounceTimer: undefined,
    abortController: localController,
  })

  try {
    const response = await apiClient.upsertAnalystNote(
      slug,
      { path, markdown: null },
      { signal: localController.signal },
    )
    settleSuccess(slug, store, path, flightRev, localController, 'delete', response)
  } catch (err: unknown) {
    // Same settlement as upsert. On a delete AbortError (a newer
    // setDraft+flush aborted this delete) clearControllerIfOurs is a no-op —
    // the newer flight already installed its own controller, so
    // live.abortController !== this localController; status / lastSent /
    // lastFlightKind are left to the newer flight. On a non-abort failure
    // lastSent stays pre-delete and lastFlightKind stays 'delete' (deleteNote
    // never mutated them on entry) so §5.2 step 2 retry routing detects it.
    settleError(store, slug, path, flightRev, localController, err)
  }
}

export function flushNow(slug: ResortSlug, path: NotePath): Promise<void> {
  return flushPath(slug, path)
}

export function deleteNote(slug: ResortSlug, path: NotePath): Promise<void> {
  return deleteNotePath(slug, path)
}

// Spec §5.4 — the SlugStore's flushAll iterates every per-path state it owns
// and flushes the dirty / save-failed ones. Registered lazily on first read;
// the SlugStore is passed in (captured by the registered flusher closure) so
// there is no missing-store branch to defend.
async function flushAllPaths(slug: ResortSlug, store: SlugNotesStore): Promise<void> {
  const pending: Array<Promise<void>> = []
  for (const [path, state] of store.paths) {
    if (
      state.status === 'dirty' ||
      state.status === 'save-failed' ||
      state.debounceTimer !== undefined
    ) {
      pending.push(flushPath(slug, path))
    }
  }
  await Promise.all(pending)
}

export interface AnalystNoteDraftHandle {
  readonly draft: string
  readonly lastSent: string | null
  readonly status: NoteDraftStatus
  readonly setDraft: (markdown: string) => void
  readonly flushNow: () => Promise<void>
  readonly deleteNote: () => Promise<void>
}

export function useAnalystNoteDraft(slug: ResortSlug, path: NotePath): AnalystNoteDraftHandle {
  const store = getOrCreateStore(slug)

  // Thread the read-hook data into the store so module-level flush handlers
  // can build the merged full response for prepopulate. Mirrors
  // useWorkspaceState.ts:686 (store.canonical = useResortDetail(slug)).
  const notes = useAnalystNotes(slug)
  const latestNotesRef = useRef(notes)
  latestNotesRef.current = notes
  latestNotesBySlug.set(slug, notes)

  // Seed on first read (no-op on re-render — stored state wins per §5.3).
  getOrSeedPathState(store, path, notes)

  const subscribe = useCallback(
    (cb: () => void): (() => void) => {
      store.subscribers.add(cb)
      return (): void => { store.subscribers.delete(cb) }
    },
    [store],
  )

  const getSnapshot = useCallback(
    (): NotesPathState => getOrSeedPathState(store, path, latestNotesRef.current),
    [store, path],
  )
  const state = useSyncExternalStore(subscribe, getSnapshot)

  return {
    draft: state.draft,
    lastSent: state.lastSent,
    status: state.status,
    setDraft: (markdown: string): void => { setDraft(slug, path, markdown) },
    flushNow: (): Promise<void> => flushNow(slug, path),
    deleteNote: (): Promise<void> => deleteNote(slug, path),
  }
}

/** Test-only: clear all module-level state between tests. */
export function __resetForTests(): void {
  for (const store of slugStores.values()) {
    for (const state of store.paths.values()) {
      if (state.debounceTimer !== undefined) { clearTimeout(state.debounceTimer) }
      state.abortController?.abort()
    }
  }
  slugStores.clear()
  latestNotesBySlug.clear()
}
