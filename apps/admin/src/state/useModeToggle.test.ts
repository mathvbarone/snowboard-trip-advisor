import {
  ISODateTimeString,
  ResortSlug,
  UpstreamHash,
  type MetricPath,
} from '@snowboard-trip-advisor/schema'
import { ResortDetailResponse } from '@snowboard-trip-advisor/schema/api'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from '../lib/apiClient'

import { useModeToggle } from './useModeToggle'
import {
  __resetForTests as resetResortDetail,
  prepopulateResortDetail,
} from './useResortDetail'
import { __resetForTests as resetURLState } from './useURLState'
import { __resetForTests as resetWorkspaceState } from './useWorkspaceState'

// PR 4.4d Task 1 — useModeToggle tests.
// Per Decision D7: slug derived from useURLState() — set window.history before
// renderHook. Per Codex round-3 P1-1: canonical-mode fallback so reload-after-
// save renders previously-MANUAL paths correctly. Per Codex round-1 P2-1:
// validPaths is the DURABLE subset (resort.field_sources keys) — live paths
// like snow_depth_cm silently no-op so the cross-key invariant can never be
// violated by a toggle.

const KOTELNICA = ResortSlug.parse('kotelnica-bialczanska')
const HASH = UpstreamHash.parse('a'.repeat(64))
const OBS = ISODateTimeString.parse('2026-04-29T08:00:00Z')

function manualFieldSource(): ReturnType<typeof buildSource> {
  return buildSource('manual')
}

function buildSource(source: 'resort-feed' | 'manual'): {
  source: 'resort-feed' | 'manual'
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

function syntheticResponse(opts: {
  modes?: Partial<Record<MetricPath, 'manual' | 'auto'>>
  slopesState?: 'live' | 'manual'
}): ResortDetailResponse {
  const modes = opts.modes ?? {}
  const slopesState = opts.slopesState ?? 'live'
  return ResortDetailResponse.parse({
    resort: {
      schema_version: 1,
      slug: 'kotelnica-bialczanska',
      name: { en: 'Kotelnica' },
      country: 'PL',
      region: { en: 'Lesser Poland' },
      altitude_m: { min: 770, max: 920 },
      slopes_km: 8,
      lift_count: 7,
      skiable_terrain_ha: 40,
      season: { start_month: 12, end_month: 4 },
      publish_state: 'published',
      field_sources: {
        'altitude_m.min': buildSource('resort-feed'),
        'altitude_m.max': buildSource('resort-feed'),
        'slopes_km': slopesState === 'manual' ? manualFieldSource() : buildSource('resort-feed'),
        'lift_count': buildSource('resort-feed'),
        'skiable_terrain_ha': buildSource('resort-feed'),
        'season.start_month': buildSource('resort-feed'),
        'season.end_month': buildSource('resort-feed'),
      },
    },
    live_signal: null,
    field_states: {
      slopes_km:
        slopesState === 'manual'
          ? { state: 'manual', value: 8, observed_at: OBS }
          : { state: 'live', value: 8, source: 'resort-feed', observed_at: OBS },
      lift_count: { state: 'live', value: 7, source: 'resort-feed', observed_at: OBS },
    },
    ...(Object.keys(modes).length > 0 ? { editor_modes: modes } : {}),
  })
}

beforeEach((): void => {
  vi.useFakeTimers()
  resetURLState()
  resetWorkspaceState()
  resetResortDetail()
  window.history.replaceState({}, '', '/?route=editor&slug=kotelnica-bialczanska')
})

afterEach((): void => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  resetWorkspaceState()
  resetResortDetail()
  resetURLState()
})

describe('useModeToggle (PR 4.4d Task 1, decisions log D7 + Codex rounds 1/3)', (): void => {
  it('toggleMode on a durable path emits a single PUT body with { editor_modes: { slopes_km: "manual" } } after debounce', async (): Promise<void> => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse({ slopesState: 'live' }))
    const spy = vi
      .spyOn(apiClient, 'upsertResort')
      .mockResolvedValue(syntheticResponse({ slopesState: 'manual' }))

    const { result } = renderHook(() => useModeToggle())
    act((): void => {
      result.current.toggleMode('slopes_km')
    })
    await act(async (): Promise<void> => {
      await vi.advanceTimersByTimeAsync(600)
    })

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(KOTELNICA, { editor_modes: { slopes_km: 'manual' } })
  })

  it('a second toggleMode("slopes_km") after the first PUT settles emits { editor_modes: { slopes_km: "auto" } }', async (): Promise<void> => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse({ slopesState: 'live' }))
    const spy = vi.spyOn(apiClient, 'upsertResort').mockImplementation(
      (_slug, body): Promise<ResortDetailResponse> => {
        const mode = body.editor_modes?.['slopes_km']
        return Promise.resolve(syntheticResponse({ slopesState: mode === 'manual' ? 'manual' : 'live' }))
      },
    )

    const { result } = renderHook(() => useModeToggle())
    act((): void => { result.current.toggleMode('slopes_km') })
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })

    act((): void => { result.current.toggleMode('slopes_km') })
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })

    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy.mock.calls[1]?.[1]).toEqual({ editor_modes: { slopes_km: 'auto' } })
  })

  it('validPaths guard: toggleMode("ghost" — not a real MetricPath) is a silent no-op (no PUT, no console.warn, no throw)', async (): Promise<void> => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse({ slopesState: 'live' }))
    const upsertSpy = vi.spyOn(apiClient, 'upsertResort')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation((): void => {})

    const { result } = renderHook(() => useModeToggle())
    expect((): void => {
      act((): void => {
        result.current.toggleMode('ghost' as unknown as MetricPath)
      })
    }).not.toThrow()
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })

    expect(upsertSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('validPaths guard (Codex round-1 P2-1): toggleMode on a live-only path (snow_depth_cm) is a silent no-op', async (): Promise<void> => {
    // snow_depth_cm is in METRIC_FIELDS (passes Zod) but NOT in
    // resort.field_sources — toggling it would 400 as invalid-resort from
    // the server's cross-key refinement. validPaths derives from
    // resort.field_sources, so this is a silent no-op.
    prepopulateResortDetail(KOTELNICA, syntheticResponse({ slopesState: 'live' }))
    const upsertSpy = vi.spyOn(apiClient, 'upsertResort')

    const { result } = renderHook(() => useModeToggle())
    act((): void => {
      result.current.toggleMode('snow_depth_cm')
    })
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })

    expect(upsertSpy).not.toHaveBeenCalled()
  })

  it('modeFor default: no draft override AND canonical projection is not manual → "auto"', (): void => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse({ slopesState: 'live' }))
    const { result } = renderHook(() => useModeToggle())
    expect(result.current.modeFor('slopes_km')).toBe('auto')
  })

  it('canonical-mode reload preservation (Codex round-3 P1-1): canonical field_states[path].state === "manual" + empty draft → modeFor returns "manual"', (): void => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse({ slopesState: 'manual' }))
    const { result } = renderHook(() => useModeToggle())
    expect(result.current.modeFor('slopes_km')).toBe('manual')
  })

  it('first toggleMode after a canonical "manual" reload inverts to "auto" (Codex round-3 P1-1 follow-through)', async (): Promise<void> => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse({ slopesState: 'manual' }))
    const spy = vi
      .spyOn(apiClient, 'upsertResort')
      .mockResolvedValue(syntheticResponse({ slopesState: 'live' }))

    const { result } = renderHook(() => useModeToggle())
    act((): void => { result.current.toggleMode('slopes_km') })
    await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(KOTELNICA, { editor_modes: { slopes_km: 'auto' } })
  })

  it('draft override wins over canonical: server projection is manual but draft.editor_modes.slopes_km === "auto" → modeFor returns "auto"', (): void => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse({ slopesState: 'manual' }))
    // Block the PUT promise so we read the post-toggle draft override before
    // the server response races ahead and clears it (Decision D13).
    vi.spyOn(apiClient, 'upsertResort').mockImplementation(
      (): Promise<ResortDetailResponse> => new Promise<ResortDetailResponse>((): void => {}),
    )

    const { result } = renderHook(() => useModeToggle())
    act((): void => { result.current.toggleMode('slopes_km') })
    // Read mode WITHOUT advancing time — debounce hasn't fired yet so the
    // draft override is intact and the PUT hasn't been queued.
    expect(result.current.modeFor('slopes_km')).toBe('auto')
  })

  it('throws when called outside the editor route (programming error guard)', (): void => {
    window.history.replaceState({}, '', '/?route=dashboard')
    // Swallow React's error logging so the test output stays clean.
    const errSpy = vi.spyOn(console, 'error').mockImplementation((): void => {})
    expect((): void => {
      renderHook(() => useModeToggle())
    }).toThrow(/useModeToggle called outside the editor route/)
    errSpy.mockRestore()
  })
})
