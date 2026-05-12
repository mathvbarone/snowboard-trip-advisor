import {
  ISODateTimeString,
  UpstreamHash,
  type MetricPath,
  type ResortSlug,
} from '@snowboard-trip-advisor/schema'
import type { ResortDetailResponse, ResortUpsertBody } from '@snowboard-trip-advisor/schema/api'
import { useCallback, useSyncExternalStore } from 'react'

import { apiClient } from '../lib/apiClient'

import { prepopulateResortDetail, useResortDetail } from './useResortDetail'
import { useURLState } from './useURLState'

// Per ResortUpsertBody's manual-only constraint (api/resortUpsert.ts:40-43):
// PUT bodies may only carry FieldSource entries with `source: 'manual'`.
// DraftShape mirrors the body shape directly so `setFieldValue`'s manual
// FieldSource + `buildBodyFromDraft`'s passthrough land in the
// ResortUpsertBody-typed PUT without a cast.
type ResortDraft = NonNullable<ResortUpsertBody['resort']>
type LiveDraft = NonNullable<NonNullable<ResortUpsertBody['live_signal']>>
type ManualFieldSource = NonNullable<ResortDraft['field_sources']>[string]

// PR 4.4d Task 3 — useWorkspaceState. Per Decision E1+ + Codex rounds
// 1/2/4-7/16/18: module-scoped per-slug singleton store with
// useSyncExternalStore subscription. 500ms debounce; in-flight token +
// draft-revision counter; concurrent-PUT queue; diff-based PUT body
// (current draft vs lastSentDraft); empty-diff short-circuit; nested-path
// sibling hydration from canonical (D10); manual FieldSource on every
// value edit (D12); draft reset + prepopulate on PUT success (D13).

const DEBOUNCE_MS = 500

export type WorkspaceStatus = 'saved' | 'dirty' | 'saving' | 'save-failed'

// Per D10 + Codex round-4 P2-6: DraftShape mirrors the WorkspaceFile payload
// shape directly. Nested edits write to the nested location after hydrating
// the parent from canonical state. buildBodyFromDraft is trivial — it just
// emits the shape verbatim (server merges shallow per spec §4.3).
export interface DraftShape {
  readonly resort?: ResortDraft
  readonly live_signal?: LiveDraft
  readonly editor_modes: Partial<Record<MetricPath, 'manual' | 'auto'>>
}

interface StoreState {
  readonly draft: DraftShape
  readonly status: Partial<Record<MetricPath, WorkspaceStatus>>
  readonly rev: number
}

interface SlugStore {
  state: StoreState
  canonical: ResortDetailResponse | null
  lastSentDraft: DraftShape | null
  inFlightToken: symbol | null
  // PR 4.6c Decision K1 (+ Codex round-2 P2 fold 2026-05-12): AbortController
  // + the BODY of the in-flight PUT (not the whole draft) let clearFieldValue
  // path-gate the abort only when the cleared path is in the wire-side body.
  // The body is the DIFF emitted by buildBodyFromDraft — after a rev-moved
  // success, the next PUT can carry a subset of the draft's paths (paths
  // that match lastSent are excluded). Gating on the whole draft would
  // false-positive on paths already-persisted by a prior PUT, aborting an
  // unrelated legitimate save. Fields are nulled in flush()'s finally so a
  // stale controller can't be re-aborted after the round-trip completes.
  abortController: AbortController | null
  inFlightBody: ResortUpsertBody | null
  queued: boolean
  timer: ReturnType<typeof setTimeout> | null
  subscribers: Set<() => void>
}

const storesBySlug = new Map<ResortSlug, SlugStore>()

function emptyState(): StoreState {
  return { draft: { editor_modes: {} }, status: {}, rev: 0 }
}

function getOrCreateStore(slug: ResortSlug): SlugStore {
  let store = storesBySlug.get(slug)
  if (store === undefined) {
    store = {
      state: emptyState(),
      canonical: null,
      lastSentDraft: null,
      inFlightToken: null,
      abortController: null,
      inFlightBody: null,
      queued: false,
      timer: null,
      subscribers: new Set(),
    }
    storesBySlug.set(slug, store)
  }
  return store
}

type Side = 'resort' | 'live_signal'

const LIVE_PATH_PREFIXES: ReadonlySet<string> = new Set([
  'snow_depth_cm', 'lifts_open', 'lift_pass_day', 'lodging_sample',
])

function sideFor(path: MetricPath): Side {
  const dotIdx = path.indexOf('.')
  const top = dotIdx === -1 ? path : path.slice(0, dotIdx)
  return LIVE_PATH_PREFIXES.has(top) ? 'live_signal' : 'resort'
}

// Reads the canonical parent value for a nested-path edit so the unmodified
// sibling leaves survive when the server shallow-merges the patched parent.
// Returns an empty object when canonical isn't yet loaded or the parent
// isn't a structured value (e.g., the path's parent is missing on cold-start).
function hydrateParentFromCanonical(
  canonical: ResortDetailResponse | null,
  side: Side,
  parent: string,
): Record<string, unknown> {
  if (canonical === null) { return {} }
  const canonicalSide = side === 'resort' ? canonical.resort : canonical.live_signal
  if (canonicalSide === null) { return {} }
  const canonicalParent = (canonicalSide as Record<string, unknown>)[parent]
  // Per the Resort / ResortLiveSignal schemas, every 2-segment MetricPath
  // parent is a structured object when present (altitude_m, season,
  // lifts_open, lodging_sample) — only its absence is a runtime case worth
  // handling (cold canonical / never-fetched live path).
  if (canonicalParent === undefined) { return {} }
  return { ...(canonicalParent as Record<string, unknown>) }
}

// Walk a dotted path into draft. On first edit of a nested parent, hydrate
// the parent from canonical so the sibling values survive the server's
// shallow merge of top-level Resort / ResortLiveSignal fields.
function patchDraftLeaf(
  draft: DraftShape,
  side: Side,
  path: MetricPath,
  value: unknown,
  canonical: ResortDetailResponse | null,
): DraftShape {
  // Use indexOf rather than .split() so the segments are statically typed as
  // strings (split's tuple typing under noUncheckedIndexedAccess forces
  // `string | undefined` slots, requiring defensive narrowing that is
  // unreachable in practice — MetricPath is closed-enum non-empty).
  const dotIdx = path.indexOf('.')
  const sideRoot = side === 'resort'
    ? (draft.resort ?? {}) as Record<string, unknown>
    : (draft.live_signal ?? {}) as Record<string, unknown>
  const nextSideRoot: Record<string, unknown> = { ...sideRoot }

  if (dotIdx === -1) {
    nextSideRoot[path] = value
  } else {
    const parent = path.slice(0, dotIdx)
    const leaf = path.slice(dotIdx + 1)
    const existingParent = nextSideRoot[parent]
    const parentObj = isStructuralObject(existingParent)
      ? { ...(existingParent as Record<string, unknown>) }
      : hydrateParentFromCanonical(canonical, side, parent)
    parentObj[leaf] = value
    nextSideRoot[parent] = parentObj
  }

  if (side === 'resort') {
    return { ...draft, resort: nextSideRoot }
  }
  return { ...draft, live_signal: nextSideRoot }
}

function isStructuralObject(v: unknown): boolean {
  return typeof v === 'object' && v !== null
}

// Per D12 + Codex round-6 P1-1: patch only the edited path's field_sources
// entry. NO canonical hydration — spec §4.3 deep-merges field_sources on
// the server, so a sparse PUT entry is correct. Including the canonical
// siblings would risk overwriting concurrent server-side adapter updates
// to other paths.
//
// Precondition: `sideRoot` is the post-patchDraftLeaf side value (always
// defined — patchDraftLeaf guarantees the side exists on its returned
// draft). Taking it as a parameter lets the caller narrow once and avoids
// a `draft.resort ?? {}` defensive shim here whose nullish arm would be
// structurally unreachable through the setFieldValue → patchDraftLeaf →
// patchFieldSourceOnSide chain.
function patchFieldSourceOnSide(
  draft: DraftShape,
  side: Side,
  sideRoot: ResortDraft | LiveDraft,
  path: MetricPath,
  fs: ManualFieldSource,
): DraftShape {
  const existing = (sideRoot as { field_sources?: Record<string, ManualFieldSource> }).field_sources ?? {}
  const nextSide = { ...sideRoot, field_sources: { ...existing, [path]: fs } }
  if (side === 'resort') {
    return { ...draft, resort: nextSide }
  }
  return { ...draft, live_signal: nextSide }
}

// Per D12 + Codex round-5 P1-1: every value edit pairs with a fresh manual
// FieldSource so the merged WorkspaceFile reflects the override. The 64-char
// hex upstream_hash is generated from 32 random bytes — each manual edit
// gets a distinct hash so the server's round-7 stale-hash reject doesn't
// fire on the SPA's own writes.
function manualFieldSource(): ManualFieldSource {
  const now = new Date().toISOString()
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes).map((b): string => b.toString(16).padStart(2, '0')).join('')
  return {
    source: 'manual',
    source_url: 'https://admin.local/manual',
    observed_at: ISODateTimeString.parse(now),
    fetched_at: ISODateTimeString.parse(now),
    upstream_hash: UpstreamHash.parse(hex),
    attribution_block: { en: 'Manual entry by analyst.' },
  }
}

function emit(store: SlugStore): void {
  for (const cb of store.subscribers) { cb() }
}

function patchState(store: SlugStore, fn: (s: StoreState) => StoreState): void {
  store.state = fn(store.state)
  emit(store)
}

function markStatuses(
  status: Partial<Record<MetricPath, WorkspaceStatus>>,
  target: WorkspaceStatus,
): Partial<Record<MetricPath, WorkspaceStatus>> {
  const next: Partial<Record<MetricPath, WorkspaceStatus>> = { ...status }
  for (const [path, current] of Object.entries(status)) {
    if (current === 'dirty' || current === 'saving') {
      next[path as MetricPath] = target
    }
  }
  return next
}

function scheduleFlush(slug: ResortSlug): void {
  const store = getOrCreateStore(slug)
  if (store.timer !== null) { clearTimeout(store.timer) }
  store.timer = setTimeout((): void => {
    store.timer = null
    void flush(slug)
  }, DEBOUNCE_MS)
}

// Per D10 + Codex round-16 P2-22: PUT body is the diff between the current
// draft and `lastSent`. First flush (lastSent === null) emits the full
// draft. Subsequent flushes after a rev-moved success diff so the queued
// flush only resends paths the user changed in the meantime.
function buildBodyFromDraft(draft: DraftShape, lastSent: DraftShape | null): ResortUpsertBody {
  if (lastSent === null) {
    const body: ResortUpsertBody = {}
    if (draft.resort !== undefined && Object.keys(draft.resort).length > 0) { body.resort = draft.resort }
    if (draft.live_signal !== undefined && Object.keys(draft.live_signal).length > 0) {
      body.live_signal = draft.live_signal
    }
    if (Object.keys(draft.editor_modes).length > 0) { body.editor_modes = draft.editor_modes }
    return body
  }
  const diffedResort = diffSide<ResortDraft>(draft.resort, lastSent.resort)
  const diffedLive = diffSide<LiveDraft>(draft.live_signal, lastSent.live_signal)
  const diffedModes: Partial<Record<MetricPath, 'manual' | 'auto'>> = {}
  for (const [path, mode] of Object.entries(draft.editor_modes)) {
    if (lastSent.editor_modes[path as MetricPath] !== mode) {
      diffedModes[path as MetricPath] = mode
    }
  }
  const body: ResortUpsertBody = {}
  if (diffedResort !== null) { body.resort = diffedResort }
  if (diffedLive !== null) { body.live_signal = diffedLive }
  if (Object.keys(diffedModes).length > 0) { body.editor_modes = diffedModes }
  return body
}

// Exported for direct unit-coverage of the generic Partial<T> defensive arm
// where `current` has no `field_sources` key — unreachable through the
// setFieldValue / clearFieldValue chain (those always pair value+provenance),
// but reachable for callers using diffSide as a general structural diff.
export function diffSide<T extends object>(
  current: Partial<T> | undefined,
  sent: Partial<T> | undefined,
): Partial<T> | null {
  if (current === undefined) { return null }
  // Pass 1: top-level value diffs (everything except field_sources). Compared
  // via JSON.stringify because metric values include small structural shapes
  // (altitude_m, season, lifts_open, lift_pass_day Money) whose key insertion
  // order is consistent across Zod-parsed objects.
  const out: Partial<T> = {}
  let hasChanges = false
  for (const [key, currentValue] of Object.entries(current)) {
    if (key === 'field_sources') { continue }
    const sentValue = (sent as Record<string, unknown> | undefined)?.[key]
    if (JSON.stringify(sentValue) !== JSON.stringify(currentValue)) {
      ;(out as Record<string, unknown>)[key] = currentValue
      hasChanges = true
    }
  }
  // Pass 2: field_sources entries — include only those whose corresponding
  // LEAF value differs from `sent` (not just whose PARENT differs).
  // Codex round-3 P2-D fold: when a sibling leaf is edited mid-flight the
  // diff emits the whole parent in Pass 1, but the unchanged sibling's
  // field_sources entry must NOT ride along — `assertProvenancePairing`
  // rejects a provenance-only patch for a leaf whose value didn't change
  // (apps/admin/server/resortUpsert.ts §371-384).
  // Codex round-6 P1-1 + round-18 P2-25 invariants are preserved: each
  // manual edit writes a fresh upstream_hash, so an unchanged hash alone
  // would still mis-include reverted edits — the leaf-VALUE check is the
  // necessary criterion.
  const currentFs = (current as Record<string, unknown>)['field_sources'] as Record<string, ManualFieldSource> | undefined
  // The `?? {}` keeps the loop a single uncontested code path — current.field_sources
  // is always present after a setFieldValue (which writes paired provenance per
  // D12), so the undefined branch is unreachable through the public API; the
  // fallback exists for diffSide's broader generic contract.
  const diffedFs: Record<string, ManualFieldSource> = {}
  let fsChanged = false
  for (const [path, fs] of Object.entries(currentFs ?? {})) {
    if (valueAtPathDiffersFromSent(current, sent, path)) {
      diffedFs[path] = fs
      fsChanged = true
    }
  }
  if (fsChanged) {
    ;(out as Record<string, unknown>)['field_sources'] = diffedFs
    hasChanges = true
  }
  return hasChanges ? out : null
}

// Compares the leaf value at `path` in `current` vs `sent`. Top-level paths
// (`slopes_km`) compare directly; 2-segment paths (`altitude_m.min`) walk
// into the parent and compare the leaf. JSON.stringify is the structural
// equality check used elsewhere in diffSide. When `sent` is undefined or
// the parent is missing, the corresponding leaf is treated as undefined
// (so a fresh edit always counts as differing).
function valueAtPathDiffersFromSent(
  current: Record<string, unknown>,
  sent: Record<string, unknown> | undefined,
  path: string,
): boolean {
  const dotIdx = path.indexOf('.')
  if (dotIdx === -1) {
    return JSON.stringify(current[path]) !== JSON.stringify(sent === undefined ? undefined : sent[path])
  }
  const parent = path.slice(0, dotIdx)
  const leaf = path.slice(dotIdx + 1)
  const cParent = current[parent]
  const sParent = sent === undefined ? undefined : sent[parent]
  const cLeaf = isStructuralObject(cParent) ? (cParent as Record<string, unknown>)[leaf] : undefined
  const sLeaf = isStructuralObject(sParent) ? (sParent as Record<string, unknown>)[leaf] : undefined
  return JSON.stringify(cLeaf) !== JSON.stringify(sLeaf)
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

async function flush(slug: ResortSlug): Promise<void> {
  const store = getOrCreateStore(slug)
  if (store.inFlightToken !== null) {
    store.queued = true
    return
  }
  const token = Symbol('flush')
  const inFlightRev = store.state.rev
  const inFlightDraft = store.state.draft
  store.inFlightToken = token
  // PR 4.6c Decision K1: fresh AbortController so clearFieldValue can
  // path-gate its abort. The inFlightBody field is set BELOW (after the
  // empty-diff short-circuit), once the actual PUT body is known — per
  // Codex round-2 P2 fold, we gate on the body diff, not the whole draft
  // (a rev-moved success means the next PUT may carry only a subset of
  // the draft's paths; gating on the whole draft would abort unrelated
  // legitimate saves). Both fields are nulled in `finally` so a stale
  // controller can't be aborted after the round-trip resolves.
  const abortController = new AbortController()
  store.abortController = abortController
  patchState(store, (s) => ({ ...s, status: markStatuses(s.status, 'saving') }))
  try {
    const body = buildBodyFromDraft(inFlightDraft, store.lastSentDraft)
    if (Object.keys(body).length === 0) {
      // Per Codex round-18 P2-25: empty-diff short-circuit. Workspace already
      // matches the current draft (user edit-then-reverted, or queued flush
      // saw no remaining changes). Mark statuses saved and exit; no PUT.
      // inFlightBody stays null since no body is in flight.
      patchState(store, (s) => ({ ...s, status: markStatuses(s.status, 'saved') }))
      return
    }
    store.inFlightBody = body
    const response = await apiClient.upsertResort(slug, body, { signal: abortController.signal })
    // No race-on-token check needed: the flush early-returns when a PUT is
    // already in-flight, so `store.inFlightToken` cannot change between the
    // try-entry assignment and here. Distinguish rev-unchanged vs rev-moved
    // (the user edited mid-flight).
    if (store.state.rev === inFlightRev) {
      // Rev unchanged — clean success. Reset draft per D13; mark saved;
      // prepopulate canonical so FieldRow reads the freshly-persisted state
      // without a Suspense flicker.
      patchState(store, (s) => ({
        rev: s.rev,
        status: markStatuses(s.status, 'saved'),
        draft: { editor_modes: {} },
      }))
      store.lastSentDraft = null
      prepopulateResortDetail(slug, response)
    } else {
      // Rev moved during round-trip — user edited mid-flight. KEEP the draft
      // (newer edits live there) but record what was successfully sent so
      // the next flush diffs against this baseline (Codex round-16 P2-22).
      store.lastSentDraft = inFlightDraft
      prepopulateResortDetail(slug, response)
    }
  } catch (err: unknown) {
    // PR 4.6c Decision K1: distinguish intentional abort from generic save
    // failure. AbortError fires when clearFieldValue's path-gated abort
    // cancels the in-flight PUT — the user's clear is the canonical intent
    // now, so revert in-flight-draft paths from `saving` → `dirty` and
    // skip the prepopulate + lastSentDraft updates that would otherwise
    // surface the soon-to-be-cleared value into canonical. The
    // storesBySlug guard handles `__resetForTests` aborting mid-flight:
    // when the store has been removed from the map, this catch is for a
    // store nobody is subscribed to — patching it would notify no one and
    // bookkeeping would be moot.
    if (isAbortError(err)) {
      if (storesBySlug.get(slug) !== store) {
        return
      }
      patchState(store, (s) => ({ ...s, status: markStatuses(s.status, 'dirty') }))
      return
    }
    if (store.state.rev === inFlightRev) {
      patchState(store, (s) => ({ ...s, status: markStatuses(s.status, 'save-failed') }))
    }
  } finally {
    store.inFlightToken = null
    store.abortController = null
    store.inFlightBody = null
    // PR 4.6c Codex inline review fold (P2, 2026-05-12): when
    // __resetForTests aborted mid-flight and the rev had moved (or queued
    // was true), the original code would call scheduleFlush(slug). That
    // call's getOrCreateStore would create a FRESH store + new timer in
    // the just-cleared map — autosave work leaking into the next test.
    // Same guard as the AbortError catch above: only reschedule when the
    // store still owns its slug in the map.
    if (storesBySlug.get(slug) === store && (store.queued || store.state.rev !== inFlightRev)) {
      store.queued = false
      scheduleFlush(slug)
    }
  }
}

export function setFieldValue(slug: ResortSlug, path: MetricPath, value: unknown): void {
  const store = getOrCreateStore(slug)
  const side = sideFor(path)
  const fs = manualFieldSource()
  patchState(store, (s) => {
    const withValue = patchDraftLeaf(s.draft, side, path, value, store.canonical)
    // patchDraftLeaf guarantees the side is defined on its returned draft.
    // The `as` narrows from `ResortDraft | undefined` to `ResortDraft` (and
    // similarly for live_signal) without introducing a runtime check whose
    // unreachable arm couldn't be exercised through the public API.
    const sideRoot = side === 'resort'
      ? (withValue.resort as ResortDraft)
      : (withValue.live_signal as LiveDraft)
    const withFs = patchFieldSourceOnSide(withValue, side, sideRoot, path, fs)
    return {
      rev: s.rev + 1,
      draft: withFs,
      status: { ...s.status, [path]: 'dirty' },
    }
  })
  scheduleFlush(slug)
}

export function setMode(slug: ResortSlug, path: MetricPath, mode: 'manual' | 'auto'): void {
  const store = getOrCreateStore(slug)
  patchState(store, (s) => ({
    rev: s.rev + 1,
    draft: { ...s.draft, editor_modes: { ...s.draft.editor_modes, [path]: mode } },
    status: { ...s.status, [path]: 'dirty' },
  }))
  scheduleFlush(slug)
}

function statusMatchesCleared(
  statusPath: string,
  clearedPath: string,
  parentPrefix: string | null,
): boolean {
  if (statusPath === clearedPath) { return true }
  return parentPrefix !== null && statusPath.startsWith(parentPrefix)
}

function isPendingStatus(s: WorkspaceStatus): boolean {
  return s === 'dirty' || s === 'saving'
}

// Per Codex round-20 P2-28 + round-21 P2-29 + round-24 P1-34: when an
// in-progress edit becomes transient (cleared / invalid / out-of-range),
// drop the draft entry for `path` (value AND field_sources). For nested
// paths, drop the WHOLE parent so the next flush doesn't emit an
// incomplete-parent body that the server's shallow merge would reject.
// Sibling field_sources entries under the same parent are also dropped
// (round-24) to avoid orphaned manual provenance attached to canonical
// (unchanged) values. editor_modes[path] is preserved — clearing the
// value doesn't revert the analyst's MANUAL flag.
//
// PR 4.6c Decision K1: path-gated abort. When the cleared path is carried
// in the current in-flight PUT body, abort the controller so the response
// doesn't prepopulate canonical with the soon-to-be-cleared value. Path-
// gated (not always) — clearing an unrelated path while a different path's
// PUT is in flight does NOT abort that legitimate write. For nested-leaf
// clears (e.g. `altitude_m.min`), the gate triggers when the PARENT
// (`altitude_m`) is present in the in-flight side — the response would
// otherwise re-prepopulate the parent and re-introduce the now-cleared min.
//
// Codex round-2 P2 fold (PR #105, 2026-05-12): the gate reads the in-flight
// PUT BODY (the diff emitted by buildBodyFromDraft), not the whole draft.
// After a rev-moved success the next PUT's body can be a subset of the
// draft (paths matching lastSent are excluded); gating on the whole draft
// would false-positive on paths already-persisted by a prior PUT, aborting
// an unrelated legitimate save.
export function clearFieldValue(slug: ResortSlug, path: MetricPath): void {
  const store = getOrCreateStore(slug)
  const side = sideFor(path)
  const dotIdx = path.indexOf('.')
  const parentPrefix = dotIdx === -1 ? null : `${path.slice(0, dotIdx)}.`
  // Decision K1 path-gated abort — read inFlightBody via the side root and
  // walk for the cleared path (top-level or nested parent). When the
  // controller has no in-flight PUT (`inFlightBody === null`), the gate is
  // a no-op; existing clear semantics run unchanged.
  if (store.abortController !== null && store.inFlightBody !== null) {
    if (isPathInBody(store.inFlightBody, side, path)) {
      store.abortController.abort()
    }
  }
  patchState(store, (s) => {
    const draft = clearDraftLeaf(s.draft, side, path)
    const status: Partial<Record<MetricPath, WorkspaceStatus>> = {}
    for (const [statusPath, statusValue] of Object.entries(s.status)) {
      if (statusMatchesCleared(statusPath, path, parentPrefix) && isPendingStatus(statusValue)) {
        continue
      }
      status[statusPath as MetricPath] = statusValue
    }
    return { rev: s.rev + 1, draft, status }
  })
  scheduleFlush(slug)
}

// Decision K1 path-walker — returns true when the cleared path is present
// in the in-flight PUT body. Top-level paths (`slopes_km`) check direct
// presence; 2-segment paths (`altitude_m.min`) check parent presence
// (because the in-flight body carries the WHOLE parent — a shallow merge
// on the server would re-introduce the cleared leaf).
//
// Reads from the BODY (the diff emitted by buildBodyFromDraft) per Codex
// round-2 P2 fold — gating on the whole draft would false-positive on
// paths already-persisted by a prior PUT (the rev-moved success path
// updates lastSent so subsequent diffs exclude those paths from the body).
function isPathInBody(body: ResortUpsertBody, side: Side, path: MetricPath): boolean {
  const sideBody = side === 'resort' ? body.resort : body.live_signal
  if (sideBody === undefined) { return false }
  const dotIdx = path.indexOf('.')
  const key = dotIdx === -1 ? path : path.slice(0, dotIdx)
  return Object.prototype.hasOwnProperty.call(sideBody, key)
}

// Decision K1 (PR 4.6c): synchronous save-shortcut consumed by Shell's
// `mod+enter` wiring. Clears the pending debounce timer and triggers an
// immediate flush. Returns void — does NOT await the PUT round-trip.
// When a flush is already in flight, the inner flush() short-circuits to
// the queued path (existing inFlightToken contract), so flushNow during
// in-flight is effectively a no-op until the in-flight completes; this
// matches the "kick off the PUT this instant" UX the keyboard shortcut
// implies rather than "block until the response."
export function flushNow(slug: ResortSlug): void {
  const store = getOrCreateStore(slug)
  if (store.timer !== null) {
    clearTimeout(store.timer)
    store.timer = null
  }
  void flush(slug)
}

// Codex round-21 P2-29 + round-24 P1-34: for NESTED paths the WHOLE parent
// is dropped (a partial-parent body fails the server's shallow merge of
// top-level Resort fields — e.g. `season: { end_month: 4 }` missing
// start_month would fail Resort.parse). field_sources entries for the
// cleared path AND any sibling under the same dropped parent are also
// removed so orphaned manual provenance doesn't attach to canonical
// (unchanged) values on the server's deep-merge for field_sources.
function clearDraftLeaf(draft: DraftShape, side: Side, path: MetricPath): DraftShape {
  const sideRoot = side === 'resort' ? draft.resort : draft.live_signal
  if (sideRoot === undefined) { return draft }
  // indexOf keeps the segment names statically typed as strings — see the
  // matching note in patchDraftLeaf.
  const dotIdx = path.indexOf('.')
  const droppedKey = dotIdx === -1 ? path : path.slice(0, dotIdx)
  const parentPrefix = dotIdx === -1 ? null : `${droppedKey}.`

  // Rebuild side without the dropped key (whole parent for nested paths)
  // and with field_sources filtered. No mutation; no dynamic delete.
  const next: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(sideRoot)) {
    if (k === droppedKey) { continue }
    if (k === 'field_sources') {
      const nextFs = filterFieldSources(v as Record<string, unknown>, path, parentPrefix)
      if (Object.keys(nextFs).length > 0) { next[k] = nextFs }
      continue
    }
    next[k] = v
  }
  return finishSide(draft, side, next)
}

function filterFieldSources(
  fs: Record<string, unknown>,
  clearedPath: string,
  parentPrefix: string | null,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [fsPath, fsEntry] of Object.entries(fs)) {
    if (fsPath === clearedPath) { continue }
    if (parentPrefix !== null && fsPath.startsWith(parentPrefix)) { continue }
    out[fsPath] = fsEntry
  }
  return out
}

function finishSide(draft: DraftShape, side: Side, next: Record<string, unknown>): DraftShape {
  if (Object.keys(next).length === 0) {
    // The whole side is empty — drop it from the draft so buildBodyFromDraft
    // doesn't emit an empty `resort: {}` / `live_signal: {}` placeholder.
    if (side === 'resort') {
      return draft.live_signal === undefined
        ? { editor_modes: draft.editor_modes }
        : { editor_modes: draft.editor_modes, live_signal: draft.live_signal }
    }
    return draft.resort === undefined
      ? { editor_modes: draft.editor_modes }
      : { editor_modes: draft.editor_modes, resort: draft.resort }
  }
  if (side === 'resort') { return { ...draft, resort: next } }
  return { ...draft, live_signal: next }
}

export interface WorkspaceStateHandle {
  readonly draft: DraftShape
  readonly status: Partial<Record<MetricPath, WorkspaceStatus>>
  readonly setFieldValue: (path: MetricPath, value: unknown) => void
  readonly setMode: (path: MetricPath, mode: 'manual' | 'auto') => void
  readonly clearFieldValue: (path: MetricPath) => void
}

export function useWorkspaceState(): WorkspaceStateHandle {
  const route = useURLState()
  if (route.route !== 'editor') {
    throw new Error('useWorkspaceState called outside the editor route')
  }
  const slug = route.slug
  const store = getOrCreateStore(slug)

  // Per D10: sync canonical on every render so module-level setFieldValue
  // hydrates nested parents from the freshest server state. Reference-
  // equality assignment; useResortDetail returns the same cached object
  // until invalidate/prepopulate.
  const detail = useResortDetail(slug)
  store.canonical = detail

  const subscribe = useCallback(
    (cb: () => void): (() => void) => {
      store.subscribers.add(cb)
      return (): void => { store.subscribers.delete(cb) }
    },
    [store],
  )

  const getSnapshot = useCallback((): StoreState => store.state, [store])
  const state = useSyncExternalStore(subscribe, getSnapshot)

  return {
    draft: state.draft,
    status: state.status,
    setFieldValue: (path: MetricPath, value: unknown): void => { setFieldValue(slug, path, value) },
    setMode: (path: MetricPath, mode: 'manual' | 'auto'): void => { setMode(slug, path, mode) },
    clearFieldValue: (path: MetricPath): void => { clearFieldValue(slug, path) },
  }
}

export function __resetForTests(): void {
  for (const store of storesBySlug.values()) {
    if (store.timer !== null) { clearTimeout(store.timer) }
    // PR 4.6c Decision K1: abort any in-flight controllers so the rejected
    // promise (with AbortError) doesn't leak into the next test. The
    // AbortError catch arm in flush() guards on `storesBySlug.get(slug) !==
    // store`, so the post-clear rejection is silently swallowed (subscribers
    // are gone; bookkeeping is moot).
    if (store.abortController !== null) { store.abortController.abort() }
  }
  storesBySlug.clear()
}
