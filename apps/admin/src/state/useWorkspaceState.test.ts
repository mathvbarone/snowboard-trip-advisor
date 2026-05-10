import {
  ISODateTimeString,
  ResortSlug,
  UpstreamHash,
} from '@snowboard-trip-advisor/schema'
import { ResortDetailResponse, type ResortUpsertBody } from '@snowboard-trip-advisor/schema/api'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from '../lib/apiClient'

import {
  __resetForTests as resetResortDetail,
  prepopulateResortDetail,
} from './useResortDetail'
import { __resetForTests as resetURLState } from './useURLState'
import {
  __resetForTests as resetWorkspaceState,
  diffSide,
  setFieldValue as workspaceSetFieldValue,
  useWorkspaceState,
} from './useWorkspaceState'

// PR 4.4d Task 2 — useWorkspaceState tests.
// Per Decision E1+ + Codex rounds 1/2/4-7/16/18: module-scoped per-slug
// singleton store with useSyncExternalStore subscription; 500ms debounce;
// in-flight token + draft-revision counter; concurrent-PUT queue; diff-based
// PUT body (current draft vs lastSentDraft); empty-diff short-circuit;
// nested-path sibling hydration from canonical (D10); manual FieldSource on
// every value edit (D12); draft reset + prepopulate on PUT success (D13).

const KOTELNICA = ResortSlug.parse('kotelnica-bialczanska')
const SPINDLERUV = ResortSlug.parse('spindleruv-mlyn')
const HASH = UpstreamHash.parse('a'.repeat(64))
const OBS = ISODateTimeString.parse('2026-04-29T08:00:00Z')

function buildSource(source: 'resort-feed' | 'opensnow' | 'manual'): {
  source: 'resort-feed' | 'opensnow' | 'manual'
  source_url: string
  observed_at: ISODateTimeString
  fetched_at: ISODateTimeString
  upstream_hash: UpstreamHash
  attribution_block: { en: string }
} {
  return {
    source,
    source_url: 'https://example.local/probe',
    observed_at: OBS,
    fetched_at: OBS,
    upstream_hash: HASH,
    attribution_block: { en: `Source ${source}.` },
  }
}

function syntheticResponse(slug: string): ResortDetailResponse {
  return ResortDetailResponse.parse({
    resort: {
      schema_version: 1,
      slug,
      name: { en: slug },
      country: 'PL',
      region: { en: 'Region' },
      altitude_m: { min: 1500, max: 2000 },
      slopes_km: 8,
      lift_count: 7,
      skiable_terrain_ha: 40,
      season: { start_month: 12, end_month: 4 },
      publish_state: 'published',
      field_sources: {
        'altitude_m.min': buildSource('resort-feed'),
        'altitude_m.max': buildSource('resort-feed'),
        'slopes_km': buildSource('opensnow'),
        'lift_count': buildSource('resort-feed'),
        'skiable_terrain_ha': buildSource('resort-feed'),
        'season.start_month': buildSource('resort-feed'),
        'season.end_month': buildSource('resort-feed'),
      },
    },
    live_signal: {
      schema_version: 1,
      resort_slug: slug,
      observed_at: OBS,
      fetched_at: OBS,
      snow_depth_cm: 145,
      lifts_open: { count: 7, total: 7 },
      field_sources: {
        snow_depth_cm: buildSource('opensnow'),
        'lifts_open.count': buildSource('resort-feed'),
        'lifts_open.total': buildSource('resort-feed'),
      },
    },
    field_states: {
      slopes_km: { state: 'live', value: 8, source: 'opensnow', observed_at: OBS },
      lift_count: { state: 'live', value: 7, source: 'resort-feed', observed_at: OBS },
      'altitude_m.min': { state: 'live', value: 1500, source: 'resort-feed', observed_at: OBS },
      'altitude_m.max': { state: 'live', value: 2000, source: 'resort-feed', observed_at: OBS },
      'season.start_month': { state: 'live', value: 12, source: 'resort-feed', observed_at: OBS },
      'season.end_month': { state: 'live', value: 4, source: 'resort-feed', observed_at: OBS },
    },
  })
}

function setURL(slug: string): void {
  window.history.replaceState({}, '', `/?route=editor&slug=${slug}`)
}

beforeEach((): void => {
  vi.useFakeTimers()
  resetURLState()
  resetWorkspaceState()
  resetResortDetail()
  setURL('kotelnica-bialczanska')
})

afterEach((): void => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  resetWorkspaceState()
  resetResortDetail()
  resetURLState()
})

describe('useWorkspaceState — debounce + diff PUT (PR 4.4d Task 2)', (): void => {
  it('coalesces 5 rapid setFieldValue calls into 1 PUT carrying the final value (500ms debounce)', async (): Promise<void> => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse('kotelnica-bialczanska'))
    const spy = vi
      .spyOn(apiClient, 'upsertResort')
      .mockResolvedValue(syntheticResponse('kotelnica-bialczanska'))

    const { result } = renderHook(() => useWorkspaceState())
    for (const n of [1, 2, 3, 4, 5]) {
      act((): void => { result.current.setFieldValue('slopes_km', n) })
    }
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })

    expect(spy).toHaveBeenCalledTimes(1)
    const body = spy.mock.calls[0]?.[1] as ResortUpsertBody
    expect(body.resort?.slopes_km).toBe(5)
  })

  it('shared store across consumers (Codex round-2 P1-1): two useWorkspaceState() call sites share one draft / one debounce / one PUT', async (): Promise<void> => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse('kotelnica-bialczanska'))
    const spy = vi
      .spyOn(apiClient, 'upsertResort')
      .mockResolvedValue(syntheticResponse('kotelnica-bialczanska'))

    const hookA = renderHook(() => useWorkspaceState())
    const hookB = renderHook(() => useWorkspaceState())
    act((): void => { hookA.result.current.setFieldValue('slopes_km', 5) })
    act((): void => { hookB.result.current.setFieldValue('lift_count', 7) })
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })

    expect(spy).toHaveBeenCalledTimes(1)
    const body = spy.mock.calls[0]?.[1] as ResortUpsertBody
    expect(body.resort?.slopes_km).toBe(5)
    expect(body.resort?.lift_count).toBe(7)
  })

  it('per-slug isolation: switching slug between unmount/remount yields a fresh draft', async (): Promise<void> => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse('kotelnica-bialczanska'))
    const spy = vi
      .spyOn(apiClient, 'upsertResort')
      .mockResolvedValue(syntheticResponse('kotelnica-bialczanska'))

    const a = renderHook(() => useWorkspaceState())
    act((): void => { a.result.current.setFieldValue('slopes_km', 99) })
    expect(a.result.current.draft.resort?.slopes_km).toBe(99)
    a.unmount()

    // Switch to the OTHER slug — fresh URL.
    prepopulateResortDetail(SPINDLERUV, syntheticResponse('spindleruv-mlyn'))
    setURL('spindleruv-mlyn')

    const b = renderHook(() => useWorkspaceState())
    expect(b.result.current.draft.resort?.slopes_km).toBeUndefined()
    expect(b.result.current.draft.editor_modes).toEqual({})

    // The original slug's pending debounce was cancelled-or-not, but assert
    // no cross-contamination: the new slug never sees slopes_km=99.
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })
    for (const call of spy.mock.calls) {
      if (call[0] === SPINDLERUV) {
        const body = call[1]
        expect(body.resort?.slopes_km).toBeUndefined()
      }
    }
  })

  it('in-flight token: second debounce flush is queued, not fired, while a PUT is in flight', async (): Promise<void> => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse('kotelnica-bialczanska'))
    let resolveFirst!: (v: ResortDetailResponse) => void
    const spy = vi.spyOn(apiClient, 'upsertResort').mockImplementationOnce(
      (): Promise<ResortDetailResponse> =>
        new Promise<ResortDetailResponse>((resolve): void => { resolveFirst = resolve }),
    ).mockResolvedValue(syntheticResponse('kotelnica-bialczanska'))

    const { result } = renderHook(() => useWorkspaceState())

    act((): void => { result.current.setFieldValue('slopes_km', 5) })
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })
    expect(spy).toHaveBeenCalledTimes(1)

    // Second edit while first PUT is still in-flight — should NOT fire a
    // second PUT.
    act((): void => { result.current.setFieldValue('lift_count', 9) })
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })
    expect(spy).toHaveBeenCalledTimes(1)

    // Resolve the first PUT. The queued flush should fire next.
    await act(async (): Promise<void> => {
      resolveFirst(syntheticResponse('kotelnica-bialczanska'))
      await vi.advanceTimersByTimeAsync(600)
    })
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('draft-revision counter (Codex round-1 P2-2): user edits during round-trip → response does NOT mark saved + new edit value preserved', async (): Promise<void> => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse('kotelnica-bialczanska'))
    let resolveFirst!: (v: ResortDetailResponse) => void
    vi.spyOn(apiClient, 'upsertResort')
      .mockImplementationOnce(
        (): Promise<ResortDetailResponse> =>
          new Promise<ResortDetailResponse>((resolve): void => { resolveFirst = resolve }),
      )
      .mockResolvedValue(syntheticResponse('kotelnica-bialczanska'))

    const { result } = renderHook(() => useWorkspaceState())
    act((): void => { result.current.setFieldValue('slopes_km', 50) })
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })
    // PUT is in flight. User edits same path BEFORE response.
    act((): void => { result.current.setFieldValue('slopes_km', 500) })
    expect(result.current.draft.resort?.slopes_km).toBe(500)
    expect(result.current.status['slopes_km']).toBe('dirty')

    // Resolve in-flight PUT.
    await act(async (): Promise<void> => {
      resolveFirst(syntheticResponse('kotelnica-bialczanska'))
      await Promise.resolve()
    })

    // Draft still has the newer value; status NOT 'saved' (rev moved).
    expect(result.current.draft.resort?.slopes_km).toBe(500)
    expect(result.current.status['slopes_km']).not.toBe('saved')
  })

  it('4-state indicator: setFieldValue → dirty; after debounce flush success → saved', async (): Promise<void> => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse('kotelnica-bialczanska'))
    vi.spyOn(apiClient, 'upsertResort').mockResolvedValue(syntheticResponse('kotelnica-bialczanska'))

    const { result } = renderHook(() => useWorkspaceState())
    act((): void => { result.current.setFieldValue('slopes_km', 5) })
    expect(result.current.status['slopes_km']).toBe('dirty')

    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })
    expect(result.current.status['slopes_km']).toBe('saved')
  })

  it('save-failed indicator: PUT rejects (rev unchanged) → status save-failed', async (): Promise<void> => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse('kotelnica-bialczanska'))
    vi.spyOn(apiClient, 'upsertResort').mockRejectedValue(new Error('network'))

    const { result } = renderHook(() => useWorkspaceState())
    act((): void => { result.current.setFieldValue('slopes_km', 5) })
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })

    expect(result.current.status['slopes_km']).toBe('save-failed')
  })

  it('save-failed during rev-moved round-trip: failure does NOT clobber the in-flight rev (catch rev-moved branch)', async (): Promise<void> => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse('kotelnica-bialczanska'))
    let rejectFirst!: (e: Error) => void
    vi.spyOn(apiClient, 'upsertResort')
      .mockImplementationOnce(
        (): Promise<ResortDetailResponse> =>
          new Promise<ResortDetailResponse>((_, reject): void => { rejectFirst = reject }),
      )
      .mockResolvedValue(syntheticResponse('kotelnica-bialczanska'))

    const { result } = renderHook(() => useWorkspaceState())
    act((): void => { result.current.setFieldValue('slopes_km', 5) })
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })

    // PUT 1 in-flight; user edits mid-flight → rev advances.
    act((): void => { result.current.setFieldValue('slopes_km', 50) })

    await act(async (): Promise<void> => {
      rejectFirst(new Error('network'))
      await Promise.resolve()
    })

    // Status is NOT save-failed because rev moved during the round-trip
    // (the user's later edit is the canonical intent now).
    expect(result.current.status['slopes_km']).toBe('dirty')
  })

  it('save-failed retry-by-edit: next setFieldValue triggers a fresh debounced PUT → saved', async (): Promise<void> => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse('kotelnica-bialczanska'))
    vi.spyOn(apiClient, 'upsertResort')
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue(syntheticResponse('kotelnica-bialczanska'))

    const { result } = renderHook(() => useWorkspaceState())
    act((): void => { result.current.setFieldValue('slopes_km', 5) })
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })
    expect(result.current.status['slopes_km']).toBe('save-failed')

    act((): void => { result.current.setFieldValue('slopes_km', 6) })
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })
    expect(result.current.status['slopes_km']).toBe('saved')
  })

  it('cache isolation (observable spy): writes do NOT call apiClient.getResort', async (): Promise<void> => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse('kotelnica-bialczanska'))
    vi.spyOn(apiClient, 'upsertResort').mockResolvedValue(syntheticResponse('kotelnica-bialczanska'))
    const getSpy = vi.spyOn(apiClient, 'getResort')

    const { result } = renderHook(() => useWorkspaceState())
    act((): void => { result.current.setFieldValue('slopes_km', 5) })
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })

    expect(getSpy).not.toHaveBeenCalled()
  })

  it('__resetForTests clears the singleton stores', (): void => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse('kotelnica-bialczanska'))
    const { result, unmount } = renderHook(() => useWorkspaceState())
    act((): void => { result.current.setFieldValue('slopes_km', 5) })
    expect(result.current.draft.resort?.slopes_km).toBe(5)
    unmount()

    resetWorkspaceState()
    prepopulateResortDetail(KOTELNICA, syntheticResponse('kotelnica-bialczanska'))
    const { result: r2 } = renderHook(() => useWorkspaceState())
    expect(r2.current.draft.resort?.slopes_km).toBeUndefined()
  })
})

describe('useWorkspaceState — hydration edge cases (Codex round-4 P2-6 + cold-canonical)', (): void => {
  it('module-level setFieldValue on a nested path without canonical loaded leaves the parent un-hydrated (cold canonical)', (): void => {
    // Direct module-level call — no useResortDetail call has happened yet,
    // so store.canonical is still null. hydrateParentFromCanonical takes the
    // canonical=null branch and returns an empty parent — the draft carries
    // only the edited leaf with no siblings.
    workspaceSetFieldValue(KOTELNICA, 'altitude_m.min', 1600)

    // We can't read the draft via the hook (the hook requires the editor
    // route + prepopulate to render synchronously). Instead, mount the hook
    // AFTER the module-level edit. The hook reads the existing store.
    prepopulateResortDetail(KOTELNICA, syntheticResponse('kotelnica-bialczanska'))
    const { result } = renderHook(() => useWorkspaceState())
    const altitudeDraft = result.current.draft.resort?.altitude_m as { min?: number; max?: number } | undefined
    expect(altitudeDraft?.min).toBe(1600)
    expect(altitudeDraft?.max).toBeUndefined()
  })

  it('nested live-path edit when canonical.live_signal is missing the parent field: hydration returns empty (canonicalParent-undefined branch)', (): void => {
    // Craft a canonical where live_signal exists but lifts_open is omitted —
    // ResortLiveSignal's lifts_open is optional, so this is a real wire shape
    // for a resort whose adapter hasn't fetched the lift status yet.
    const baseSyn = syntheticResponse('kotelnica-bialczanska')
    const liveWithoutLifts = baseSyn.live_signal === null
      ? null
      : { ...baseSyn.live_signal, lifts_open: undefined }
    const slimCanonical = ResortDetailResponse.parse({
      ...JSON.parse(JSON.stringify(baseSyn)),
      live_signal: liveWithoutLifts,
    } as Parameters<typeof ResortDetailResponse.parse>[0])
    prepopulateResortDetail(KOTELNICA, slimCanonical)

    const { result } = renderHook(() => useWorkspaceState())
    act((): void => { result.current.setFieldValue('lifts_open.count', 9) })

    const liveDraft = result.current.draft.live_signal as { lifts_open?: { count?: number; total?: number } } | undefined
    expect(liveDraft?.lifts_open?.count).toBe(9)
    // canonicalParent (lifts_open) was undefined → hydrate returned {} → no sibling.
    expect(liveDraft?.lifts_open?.total).toBeUndefined()
  })

  it('diffSide handles a current value without field_sources (generic Partial<T> contract; unreachable via public API)', (): void => {
    // The setFieldValue chain always pairs value+provenance, but diffSide's
    // Partial<T> generic contract allows a current without field_sources.
    // Direct call exercises the field_sources-undefined arm of `?? {}`.
    const out = diffSide<{ slopes_km?: number; field_sources?: Record<string, never> }>(
      { slopes_km: 100 },
      { slopes_km: 50 },
    )
    expect(out).toEqual({ slopes_km: 100 })
  })

  it('diffSide includes a 2-segment field_sources entry when `sent` is undefined entirely (cParent defined, sParent absent — Codex P2-D edge)', (): void => {
    // sent === undefined arm of valueAtPathDiffersFromSent's 2-segment branch.
    // Reached in production when lastSent has no patch for the side (e.g., a
    // mode-only PUT) and the queued flush carries a fresh nested-leaf edit.
    const fs: Record<string, never> = {}
    const out = diffSide<{
      altitude_m?: { min: number; max: number }
      field_sources?: Record<string, Record<string, never>>
    }>(
      { altitude_m: { min: 1600, max: 920 }, field_sources: { 'altitude_m.min': fs } },
      undefined,
    )
    expect(out?.altitude_m).toEqual({ min: 1600, max: 920 })
    expect(out?.field_sources?.['altitude_m.min']).toBe(fs)
  })

  it('diffSide skips a 2-segment field_sources entry whose leaf value matches sent (cParent + sParent both objects, leaves equal)', (): void => {
    const fs: Record<string, never> = {}
    const out = diffSide<{
      altitude_m?: { min: number; max: number }
      field_sources?: Record<string, Record<string, never>>
    }>(
      { altitude_m: { min: 1600, max: 920 }, field_sources: { 'altitude_m.min': fs } },
      { altitude_m: { min: 1600, max: 920 } },
    )
    // Pass 1 finds altitude_m identical → no top-level diff.
    // Pass 2 sees altitude_m.min unchanged → field_sources entry skipped.
    expect(out).toBeNull()
  })

  it('diffSide treats a non-object current parent as a missing leaf (defensive shape; cParent FALSE arm)', (): void => {
    // Generic Partial<T> contract allows `current[parent]` to be a primitive.
    // Public API never produces this shape, but the function's signature
    // accepts it. Cast loosely so TypeScript permits the malformed input.
    const fs: Record<string, never> = {}
    type Loose = { altitude_m?: unknown; field_sources?: Record<string, Record<string, never>> }
    const out = diffSide<Loose>(
      { altitude_m: 'not-an-object', field_sources: { 'altitude_m.min': fs } },
      { altitude_m: { min: 1600, max: 920 } },
    )
    // cLeaf=undefined (cParent is a string, not structural), sLeaf=1600 → differ → include.
    expect(out?.field_sources?.['altitude_m.min']).toBe(fs)
  })

  it('nested live-path edit when canonical.live_signal is null (draft resort): hydration returns empty (canonicalSide-null branch)', (): void => {
    const draftCanonical = ResortDetailResponse.parse({
      ...JSON.parse(JSON.stringify(syntheticResponse('kotelnica-bialczanska'))),
      live_signal: null,
    })
    prepopulateResortDetail(KOTELNICA, draftCanonical)

    const { result } = renderHook(() => useWorkspaceState())
    act((): void => { result.current.setFieldValue('lifts_open.count', 9) })

    const liveDraft = result.current.draft.live_signal as { lifts_open?: { count?: number; total?: number } } | undefined
    // canonicalSide was null → hydrate returned {} → parent has only the
    // edited leaf, no siblings.
    expect(liveDraft?.lifts_open?.count).toBe(9)
    expect(liveDraft?.lifts_open?.total).toBeUndefined()
  })
})

describe('useWorkspaceState — nested-path hydration (D10, Codex round-4 P2-6)', (): void => {
  it('nested-path edit preserves sibling: setFieldValue("altitude_m.min", 1600) yields draft.resort.altitude_m === { min: 1600, max: 2000 }', (): void => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse('kotelnica-bialczanska'))
    vi.spyOn(apiClient, 'upsertResort').mockResolvedValue(syntheticResponse('kotelnica-bialczanska'))

    const { result } = renderHook(() => useWorkspaceState())
    act((): void => { result.current.setFieldValue('altitude_m.min', 1600) })

    expect(result.current.draft.resort?.altitude_m).toEqual({ min: 1600, max: 2000 })
  })

  it('nested-path edit preserves sibling for season.{start,end}_month and lifts_open.{count,total}', (): void => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse('kotelnica-bialczanska'))
    const { result } = renderHook(() => useWorkspaceState())

    act((): void => { result.current.setFieldValue('season.start_month', 11) })
    expect(result.current.draft.resort?.season).toEqual({ start_month: 11, end_month: 4 })

    act((): void => { result.current.setFieldValue('lifts_open.count', 5) })
    expect(result.current.draft.live_signal?.lifts_open).toEqual({ count: 5, total: 7 })
  })

  it('canonical sync on render: prepopulating fresh canonical state means subsequent setFieldValue hydrates from the new canonical', (): void => {
    const initial = syntheticResponse('kotelnica-bialczanska')
    prepopulateResortDetail(KOTELNICA, initial)
    const { result, rerender } = renderHook(() => useWorkspaceState())

    // Replace canonical with a different altitude_m payload.
    const updatedRaw = {
      ...initial,
      resort: {
        ...initial.resort,
        altitude_m: { min: 800, max: 900 },
      },
    }
    prepopulateResortDetail(KOTELNICA, ResortDetailResponse.parse(updatedRaw))
    rerender()

    act((): void => { result.current.setFieldValue('altitude_m.min', 850) })
    expect(result.current.draft.resort?.altitude_m).toEqual({ min: 850, max: 900 })
  })
})

describe('useWorkspaceState — manual provenance (D12, Codex rounds 5/6/7)', (): void => {
  it('setFieldValue writes a manual FieldSource for the edited path with a fresh upstream_hash', (): void => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse('kotelnica-bialczanska'))
    const { result } = renderHook(() => useWorkspaceState())
    act((): void => { result.current.setFieldValue('slopes_km', 150) })

    const fs = result.current.draft.resort?.field_sources?.['slopes_km']
    expect(fs?.source).toBe('manual')
    expect(fs?.source_url).toBe('https://admin.local/manual')
    expect(fs?.upstream_hash).toMatch(/^[a-f0-9]{64}$/)
    expect(fs?.attribution_block.en).toMatch(/Manual entry/)
    // observed_at must be a recent ISO datetime; check it parses + is within
    // a wide window so the test isn't flaky on slow CI.
    expect(typeof fs?.observed_at).toBe('string')
    expect(new Date(fs?.observed_at ?? '').toString()).not.toBe('Invalid Date')
  })

  it('field_sources is sparse: only the edited path is present (Codex round-6 P1-1, round-7 P2-10)', (): void => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse('kotelnica-bialczanska'))
    const { result } = renderHook(() => useWorkspaceState())
    act((): void => { result.current.setFieldValue('slopes_km', 150) })

    expect(Object.keys(result.current.draft.resort?.field_sources ?? {})).toEqual(['slopes_km'])
  })

  it('setMode does NOT touch field_sources (D12)', (): void => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse('kotelnica-bialczanska'))
    const { result } = renderHook(() => useWorkspaceState())
    act((): void => { result.current.setMode('slopes_km', 'manual') })

    expect(result.current.draft.resort?.field_sources).toBeUndefined()
    expect(result.current.draft.editor_modes['slopes_km']).toBe('manual')
  })

  it('two distinct manual edits generate distinct upstream_hash values', async (): Promise<void> => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse('kotelnica-bialczanska'))
    vi.spyOn(apiClient, 'upsertResort').mockResolvedValue(syntheticResponse('kotelnica-bialczanska'))
    const { result } = renderHook(() => useWorkspaceState())

    act((): void => { result.current.setFieldValue('slopes_km', 150) })
    const firstHash = result.current.draft.resort?.field_sources?.['slopes_km']?.upstream_hash
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })

    act((): void => { result.current.setFieldValue('slopes_km', 250) })
    const secondHash = result.current.draft.resort?.field_sources?.['slopes_km']?.upstream_hash

    expect(firstHash).toMatch(/^[a-f0-9]{64}$/)
    expect(secondHash).toMatch(/^[a-f0-9]{64}$/)
    expect(secondHash).not.toBe(firstHash)
  })
})

describe('useWorkspaceState — draft reset + diff PUT (D13, Codex rounds 7/16/18)', (): void => {
  it('save → later edit clears prior draft + next PUT contains only the new field (D13)', async (): Promise<void> => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse('kotelnica-bialczanska'))
    const spy = vi
      .spyOn(apiClient, 'upsertResort')
      .mockResolvedValue(syntheticResponse('kotelnica-bialczanska'))

    const { result } = renderHook(() => useWorkspaceState())
    act((): void => { result.current.setFieldValue('slopes_km', 150) })
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(result.current.draft.resort).toBeUndefined()

    act((): void => { result.current.setFieldValue('lift_count', 7) })
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })
    expect(spy).toHaveBeenCalledTimes(2)
    const body = spy.mock.calls[1]?.[1] as ResortUpsertBody
    expect(body.resort?.lift_count).toBe(7)
    expect(body.resort?.slopes_km).toBeUndefined()
  })

  it('edit during round-trip → queued flush diffs against lastSentDraft (round-16 P2-22): second PUT excludes the first PUT slopes_km', async (): Promise<void> => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse('kotelnica-bialczanska'))
    let resolveFirst!: (v: ResortDetailResponse) => void
    const spy = vi
      .spyOn(apiClient, 'upsertResort')
      .mockImplementationOnce(
        (): Promise<ResortDetailResponse> =>
          new Promise<ResortDetailResponse>((resolve): void => { resolveFirst = resolve }),
      )
      .mockResolvedValue(syntheticResponse('kotelnica-bialczanska'))

    const { result } = renderHook(() => useWorkspaceState())
    act((): void => { result.current.setFieldValue('slopes_km', 150) })
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })
    // PUT 1 in-flight; user edits another path.
    act((): void => { result.current.setFieldValue('lift_count', 9) })

    // Resolve PUT 1 → rev-moved path: lastSentDraft = first draft.
    await act(async (): Promise<void> => {
      resolveFirst(syntheticResponse('kotelnica-bialczanska'))
      await vi.advanceTimersByTimeAsync(600)
    })

    expect(spy).toHaveBeenCalledTimes(2)
    const body = spy.mock.calls[1]?.[1] as ResortUpsertBody
    expect(body.resort?.lift_count).toBe(9)
    expect(body.resort?.slopes_km).toBeUndefined()
  })

  it('throws when called outside the editor route (programming error guard)', (): void => {
    window.history.replaceState({}, '', '/?route=dashboard')
    const errSpy = vi.spyOn(console, 'error').mockImplementation((): void => {})
    expect((): void => {
      renderHook(() => useWorkspaceState())
    }).toThrow(/useWorkspaceState called outside the editor route/)
    errSpy.mockRestore()
  })

  it('clearFieldValue on a live path with no other live edits leaves draft.live_signal undefined (finishSide drops empty side)', (): void => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse('kotelnica-bialczanska'))
    const { result } = renderHook(() => useWorkspaceState())

    // Seed a live edit so live_signal is populated.
    act((): void => { result.current.setFieldValue('snow_depth_cm', 200) })
    expect(result.current.draft.live_signal).toBeDefined()

    // Clear the only live entry → live_signal side is empty → finishSide drops it.
    act((): void => { result.current.clearFieldValue('snow_depth_cm') })
    expect(result.current.draft.live_signal).toBeUndefined()
  })

  it('clearFieldValue on a top-level resort path with no other resort edits leaves draft.resort undefined', (): void => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse('kotelnica-bialczanska'))
    const { result } = renderHook(() => useWorkspaceState())

    act((): void => { result.current.setFieldValue('slopes_km', 150) })
    expect(result.current.draft.resort).toBeDefined()

    act((): void => { result.current.clearFieldValue('slopes_km') })
    expect(result.current.draft.resort).toBeUndefined()
  })

  it('clearFieldValue on one resort field preserves OTHER resort fields and their field_sources (finishSide non-empty branch)', (): void => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse('kotelnica-bialczanska'))
    const { result } = renderHook(() => useWorkspaceState())

    act((): void => { result.current.setFieldValue('slopes_km', 150) })
    act((): void => { result.current.setFieldValue('lift_count', 9) })
    act((): void => { result.current.clearFieldValue('slopes_km') })

    expect(result.current.draft.resort?.lift_count).toBe(9)
    expect(result.current.draft.resort?.field_sources?.['lift_count']).toBeDefined()
    expect(result.current.draft.resort?.slopes_km).toBeUndefined()
    expect(result.current.draft.resort?.field_sources?.['slopes_km']).toBeUndefined()
  })

  it('clearFieldValue on a nested-path leaf drops sibling field_sources entries under the same parent (Codex round-24 P1-34)', (): void => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse('kotelnica-bialczanska'))
    const { result } = renderHook(() => useWorkspaceState())

    // Set BOTH leaves of altitude_m so the parent has two manual entries.
    act((): void => { result.current.setFieldValue('altitude_m.min', 1600) })
    act((): void => { result.current.setFieldValue('altitude_m.max', 2200) })
    expect(result.current.draft.resort?.field_sources?.['altitude_m.min']).toBeDefined()
    expect(result.current.draft.resort?.field_sources?.['altitude_m.max']).toBeDefined()

    // Clear one leaf — the WHOLE parent is dropped AND both sibling
    // field_sources entries are removed (orphan-protection per round-24).
    act((): void => { result.current.clearFieldValue('altitude_m.min') })
    expect(result.current.draft.resort?.altitude_m).toBeUndefined()
    expect(result.current.draft.resort?.field_sources?.['altitude_m.min']).toBeUndefined()
    expect(result.current.draft.resort?.field_sources?.['altitude_m.max']).toBeUndefined()
  })

  it('clearFieldValue on a nested-path leaf preserves UNRELATED field_sources entries (filterFieldSources retain branch)', (): void => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse('kotelnica-bialczanska'))
    const { result } = renderHook(() => useWorkspaceState())

    act((): void => { result.current.setFieldValue('slopes_km', 150) })
    act((): void => { result.current.setFieldValue('altitude_m.min', 1600) })
    // Both: slopes_km + altitude_m.min in field_sources.
    expect(result.current.draft.resort?.field_sources?.['slopes_km']).toBeDefined()

    // Clear altitude_m.min — unrelated slopes_km field_sources survive.
    act((): void => { result.current.clearFieldValue('altitude_m.min') })
    expect(result.current.draft.resort?.altitude_m).toBeUndefined()
    expect(result.current.draft.resort?.slopes_km).toBe(150)
    expect(result.current.draft.resort?.field_sources?.['slopes_km']).toBeDefined()
  })

  it('live-path setFieldValue → flush emits body.live_signal (first-flush live_signal branch)', async (): Promise<void> => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse('kotelnica-bialczanska'))
    const spy = vi
      .spyOn(apiClient, 'upsertResort')
      .mockResolvedValue(syntheticResponse('kotelnica-bialczanska'))

    const { result } = renderHook(() => useWorkspaceState())
    act((): void => { result.current.setFieldValue('snow_depth_cm', 200) })
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })

    expect(spy).toHaveBeenCalledTimes(1)
    const body = spy.mock.calls[0]?.[1] as ResortUpsertBody
    expect(body.live_signal?.snow_depth_cm).toBe(200)
    expect(body.live_signal?.field_sources?.['snow_depth_cm']?.source).toBe('manual')
  })

  it('editor_modes diff during rev-moved round-trip: queued flush body carries the LATER mode (Codex round-16 follow-on)', async (): Promise<void> => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse('kotelnica-bialczanska'))
    let resolveFirst!: (v: ResortDetailResponse) => void
    const spy = vi
      .spyOn(apiClient, 'upsertResort')
      .mockImplementationOnce(
        (): Promise<ResortDetailResponse> =>
          new Promise<ResortDetailResponse>((resolve): void => { resolveFirst = resolve }),
      )
      .mockResolvedValue(syntheticResponse('kotelnica-bialczanska'))

    const { result } = renderHook(() => useWorkspaceState())
    act((): void => { result.current.setMode('slopes_km', 'manual') })
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })
    expect(spy).toHaveBeenCalledTimes(1)

    // PUT 1 in-flight; user flips MANUAL → AUTO before the response arrives.
    act((): void => { result.current.setMode('slopes_km', 'auto') })

    await act(async (): Promise<void> => {
      resolveFirst(syntheticResponse('kotelnica-bialczanska'))
      await vi.advanceTimersByTimeAsync(600)
    })

    expect(spy).toHaveBeenCalledTimes(2)
    const body = spy.mock.calls[1]?.[1] as ResortUpsertBody
    expect(body.editor_modes?.['slopes_km']).toBe('auto')
  })

  it('clearFieldValue on a live path preserves OTHER live edits (finishSide live_signal non-empty branch)', (): void => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse('kotelnica-bialczanska'))
    const { result } = renderHook(() => useWorkspaceState())

    act((): void => { result.current.setFieldValue('snow_depth_cm', 200) })
    act((): void => { result.current.setFieldValue('lifts_open.count', 5) })
    act((): void => { result.current.clearFieldValue('snow_depth_cm') })

    expect(result.current.draft.live_signal).toBeDefined()
    const liveSignal = result.current.draft.live_signal as { lifts_open?: { count?: number } } | undefined
    expect(liveSignal?.lifts_open?.count).toBe(5)
  })

  it('clearing the last resort field while live_signal is populated preserves the live edits (finishSide cross-side branch)', (): void => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse('kotelnica-bialczanska'))
    const { result } = renderHook(() => useWorkspaceState())

    act((): void => { result.current.setFieldValue('snow_depth_cm', 200) })
    act((): void => { result.current.setFieldValue('slopes_km', 150) })
    expect(result.current.draft.resort).toBeDefined()
    expect(result.current.draft.live_signal).toBeDefined()

    // Clear the only resort field → resort side becomes empty → finishSide
    // drops it but preserves live_signal.
    act((): void => { result.current.clearFieldValue('slopes_km') })
    expect(result.current.draft.resort).toBeUndefined()
    expect(result.current.draft.live_signal).toBeDefined()
  })

  it('clearFieldValue while flush is in-flight (status === saving) drops the saving status', async (): Promise<void> => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse('kotelnica-bialczanska'))
    vi.spyOn(apiClient, 'upsertResort').mockImplementation(
      (): Promise<ResortDetailResponse> => new Promise<ResortDetailResponse>((): void => {}),
    )

    const { result } = renderHook(() => useWorkspaceState())
    act((): void => { result.current.setFieldValue('slopes_km', 100) })
    expect(result.current.status['slopes_km']).toBe('dirty')

    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })
    expect(result.current.status['slopes_km']).toBe('saving')

    act((): void => { result.current.clearFieldValue('slopes_km') })
    expect(result.current.status['slopes_km']).toBeUndefined()
  })

  it('edit-then-restore-canonical mid-flight: queued diff drops field_sources whose parent value reverted (valueAtPathChanged parent-not-in-diffed branch)', async (): Promise<void> => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse('kotelnica-bialczanska'))
    let resolveFirst!: (v: ResortDetailResponse) => void
    const spy = vi
      .spyOn(apiClient, 'upsertResort')
      .mockImplementationOnce(
        (): Promise<ResortDetailResponse> =>
          new Promise<ResortDetailResponse>((resolve): void => { resolveFirst = resolve }),
      )
      .mockResolvedValue(syntheticResponse('kotelnica-bialczanska'))

    const { result } = renderHook(() => useWorkspaceState())
    act((): void => { result.current.setFieldValue('altitude_m.min', 1600) })
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })
    // PUT 1 in-flight (carries altitude_m={min:1600,max:2000}).

    // While in-flight, write the SAME value again — fresh hash but no value change.
    act((): void => { result.current.setFieldValue('altitude_m.min', 1600) })

    await act(async (): Promise<void> => {
      resolveFirst(syntheticResponse('kotelnica-bialczanska'))
      await vi.advanceTimersByTimeAsync(600)
    })

    // Queued diff: value matches lastSent → drop top-level altitude_m. The
    // field_sources entry for altitude_m.min would be the fresh hash, but
    // valueAtPathChanged sees parent NOT in diffed (we dropped it) → drop too.
    // Empty diff → short-circuit; no second PUT fires.
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('nested-sibling mid-flight edit: queued diff body excludes field_sources entries for unchanged leaves (Codex round-3 P2-D)', async (): Promise<void> => {
    // Edit altitude_m.min, PUT 1 fires, edit altitude_m.max mid-flight,
    // resolve PUT 1 (rev moved). The queued diff body emits the WHOLE
    // altitude_m parent (Pass 1 — max changed) but must NOT include the
    // unchanged altitude_m.min field_sources entry: the server's
    // assertProvenancePairing rejects a field_sources entry without a
    // paired value change as a provenance-only patch (apps/admin/server/
    // resortUpsert.ts §371-384), and the value at altitude_m.min didn't
    // change between PUT 1 (post-merge base for PUT 2) and the current
    // draft. Without the leaf-aware diff, PUT 2 would 400 invalid-request.
    prepopulateResortDetail(KOTELNICA, syntheticResponse('kotelnica-bialczanska'))
    let resolveFirst!: (v: ResortDetailResponse) => void
    const spy = vi
      .spyOn(apiClient, 'upsertResort')
      .mockImplementationOnce(
        (): Promise<ResortDetailResponse> =>
          new Promise<ResortDetailResponse>((resolve): void => { resolveFirst = resolve }),
      )
      .mockResolvedValue(syntheticResponse('kotelnica-bialczanska'))

    const { result } = renderHook(() => useWorkspaceState())
    act((): void => { result.current.setFieldValue('altitude_m.min', 1600) })
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })
    // PUT 1 in-flight; edit the SIBLING leaf.
    act((): void => { result.current.setFieldValue('altitude_m.max', 2200) })

    await act(async (): Promise<void> => {
      resolveFirst(syntheticResponse('kotelnica-bialczanska'))
      await vi.advanceTimersByTimeAsync(600)
    })

    expect(spy).toHaveBeenCalledTimes(2)
    const body = spy.mock.calls[1]?.[1] as ResortUpsertBody
    // Whole parent emitted (server shallow-merges top-level Resort fields).
    expect(body.resort?.altitude_m).toEqual({ min: 1600, max: 2200 })
    // Only the changed leaf's field_sources entry — sibling skipped.
    expect(body.resort?.field_sources?.['altitude_m.max']?.source).toBe('manual')
    expect(body.resort?.field_sources?.['altitude_m.min']).toBeUndefined()
  })

  it('clearing the last live field while resort is populated preserves the resort edits (finishSide cross-side branch, live → resort kept)', (): void => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse('kotelnica-bialczanska'))
    const { result } = renderHook(() => useWorkspaceState())

    act((): void => { result.current.setFieldValue('slopes_km', 150) })
    act((): void => { result.current.setFieldValue('snow_depth_cm', 200) })
    expect(result.current.draft.resort).toBeDefined()
    expect(result.current.draft.live_signal).toBeDefined()

    act((): void => { result.current.clearFieldValue('snow_depth_cm') })
    expect(result.current.draft.live_signal).toBeUndefined()
    expect(result.current.draft.resort).toBeDefined()
  })

  it('editor_modes match between draft and lastSent: diff skips the matching mode (line 253 false branch)', async (): Promise<void> => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse('kotelnica-bialczanska'))
    let resolveFirst!: (v: ResortDetailResponse) => void
    const spy = vi
      .spyOn(apiClient, 'upsertResort')
      .mockImplementationOnce(
        (): Promise<ResortDetailResponse> =>
          new Promise<ResortDetailResponse>((resolve): void => { resolveFirst = resolve }),
      )
      .mockResolvedValue(syntheticResponse('kotelnica-bialczanska'))

    const { result } = renderHook(() => useWorkspaceState())
    act((): void => { result.current.setMode('slopes_km', 'manual') })
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })

    // Mid-flight: same mode again (rev advances but value matches).
    act((): void => { result.current.setMode('slopes_km', 'manual') })

    await act(async (): Promise<void> => {
      resolveFirst(syntheticResponse('kotelnica-bialczanska'))
      await vi.advanceTimersByTimeAsync(600)
    })

    // Queued flush: diff sees draft.editor_modes.slopes_km === lastSent's →
    // skip → diffedModes empty. Body empty → short-circuit, no second PUT.
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('live edit during in-flight round-trip: queued flush body.live_signal carries the new live diff (line 259 true branch)', async (): Promise<void> => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse('kotelnica-bialczanska'))
    let resolveFirst!: (v: ResortDetailResponse) => void
    const spy = vi
      .spyOn(apiClient, 'upsertResort')
      .mockImplementationOnce(
        (): Promise<ResortDetailResponse> =>
          new Promise<ResortDetailResponse>((resolve): void => { resolveFirst = resolve }),
      )
      .mockResolvedValue(syntheticResponse('kotelnica-bialczanska'))

    const { result } = renderHook(() => useWorkspaceState())
    act((): void => { result.current.setFieldValue('slopes_km', 100) })
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })

    // Mid-flight: live edit.
    act((): void => { result.current.setFieldValue('snow_depth_cm', 220) })

    await act(async (): Promise<void> => {
      resolveFirst(syntheticResponse('kotelnica-bialczanska'))
      await vi.advanceTimersByTimeAsync(600)
    })

    expect(spy).toHaveBeenCalledTimes(2)
    const body = spy.mock.calls[1]?.[1] as ResortUpsertBody
    expect(body.live_signal?.snow_depth_cm).toBe(220)
  })

  it('edit-during-round-trip with a 2-segment path: queued flush diff carries the nested field_sources entry', async (): Promise<void> => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse('kotelnica-bialczanska'))
    let resolveFirst!: (v: ResortDetailResponse) => void
    const spy = vi
      .spyOn(apiClient, 'upsertResort')
      .mockImplementationOnce(
        (): Promise<ResortDetailResponse> =>
          new Promise<ResortDetailResponse>((resolve): void => { resolveFirst = resolve }),
      )
      .mockResolvedValue(syntheticResponse('kotelnica-bialczanska'))

    const { result } = renderHook(() => useWorkspaceState())
    act((): void => { result.current.setFieldValue('slopes_km', 150) })
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })

    // PUT 1 in-flight; edit a NESTED path mid-flight.
    act((): void => { result.current.setFieldValue('altitude_m.min', 1600) })

    await act(async (): Promise<void> => {
      resolveFirst(syntheticResponse('kotelnica-bialczanska'))
      await vi.advanceTimersByTimeAsync(600)
    })

    expect(spy).toHaveBeenCalledTimes(2)
    const body = spy.mock.calls[1]?.[1] as ResortUpsertBody
    expect(body.resort?.altitude_m).toEqual({ min: 1600, max: 2000 })
    expect(body.resort?.field_sources?.['altitude_m.min']?.source).toBe('manual')
    // slopes_km value and field_sources entry are excluded from the diff body
    // (already persisted by PUT 1).
    expect(body.resort?.slopes_km).toBeUndefined()
    expect(body.resort?.field_sources?.['slopes_km']).toBeUndefined()
  })

  it('empty-diff queued flush short-circuits (round-18 P2-25): edit-then-revert → no second PUT', async (): Promise<void> => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse('kotelnica-bialczanska'))
    let resolveFirst!: (v: ResortDetailResponse) => void
    const spy = vi
      .spyOn(apiClient, 'upsertResort')
      .mockImplementationOnce(
        (): Promise<ResortDetailResponse> =>
          new Promise<ResortDetailResponse>((resolve): void => { resolveFirst = resolve }),
      )
      .mockResolvedValue(syntheticResponse('kotelnica-bialczanska'))

    const { result } = renderHook(() => useWorkspaceState())
    act((): void => { result.current.setFieldValue('slopes_km', 150) })
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })
    // PUT 1 in-flight; user edits same path to a different value, then back.
    act((): void => { result.current.setFieldValue('slopes_km', 200) })

    await act(async (): Promise<void> => {
      resolveFirst(syntheticResponse('kotelnica-bialczanska'))
      await Promise.resolve()
    })

    // Revert to the already-sent value BEFORE the queued flush fires.
    act((): void => { result.current.setFieldValue('slopes_km', 150) })
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })

    expect(spy).toHaveBeenCalledTimes(1) // empty-diff short-circuit
    expect(result.current.status['slopes_km']).toBe('saved')
  })
})
