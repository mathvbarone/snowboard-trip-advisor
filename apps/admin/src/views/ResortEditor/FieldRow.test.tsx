import {
  ISODateTimeString,
  ResortSlug,
  UpstreamHash,
  type FieldStateFor,
} from '@snowboard-trip-advisor/schema'
import {
  AnalystNotesGetResponse,
  ResortDetailResponse,
  type ResortUpsertBody,
} from '@snowboard-trip-advisor/schema/api'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { axe } from 'jest-axe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from '../../lib/apiClient'
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
import {
  __resetForTests as resetResortDetail,
  prepopulateResortDetail,
} from '../../state/useResortDetail'
import { __resetForTests as resetURLState } from '../../state/useURLState'
import {
  __resetForTests as resetWorkspaceState,
  setFieldValue as workspaceSetFieldValue,
} from '../../state/useWorkspaceState'

import {
  editorSlug,
  FieldRow,
  formatMetricValue,
  labelForPath,
  noteSaveStatusLabel,
} from './FieldRow'

const OBS_AT = ISODateTimeString.parse('2026-04-29T08:00:00Z')
const KOTELNICA = ResortSlug.parse('kotelnica-bialczanska')
const HASH = UpstreamHash.parse('1'.repeat(64))

function liveState(value: unknown): FieldStateFor<unknown> {
  return { state: 'live', value, source: 'resort-feed', observed_at: OBS_AT }
}

function staleState(value: unknown): FieldStateFor<unknown> {
  return { state: 'stale', value, source: 'opensnow', observed_at: OBS_AT, age_days: 12 }
}

function failedState(): FieldStateFor<unknown> {
  return { state: 'failed', reason: 'never_fetched', observed_at: OBS_AT }
}

function manualState(value: unknown): FieldStateFor<unknown> {
  return { state: 'manual', value, observed_at: OBS_AT }
}

function fs(source: 'resort-feed' | 'manual' | 'opensnow'): {
  source: 'resort-feed' | 'manual' | 'opensnow'
  source_url: string
  observed_at: ISODateTimeString
  fetched_at: ISODateTimeString
  upstream_hash: UpstreamHash
  attribution_block: { en: string }
} {
  return {
    source,
    source_url: 'https://example.local/probe',
    observed_at: OBS_AT,
    fetched_at: OBS_AT,
    upstream_hash: HASH,
    attribution_block: { en: `Source ${source}.` },
  }
}

function syntheticResponse(opts?: {
  slopesState?: 'live' | 'manual'
  liftCountState?: 'live' | 'manual'
}): ResortDetailResponse {
  const slopesState = opts?.slopesState ?? 'live'
  const liftCountState = opts?.liftCountState ?? 'live'
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
        'altitude_m.min': fs('resort-feed'),
        'altitude_m.max': fs('resort-feed'),
        'slopes_km': slopesState === 'manual' ? fs('manual') : fs('resort-feed'),
        'lift_count': liftCountState === 'manual' ? fs('manual') : fs('resort-feed'),
        'skiable_terrain_ha': fs('resort-feed'),
        'season.start_month': fs('resort-feed'),
        'season.end_month': fs('resort-feed'),
      },
    },
    live_signal: {
      schema_version: 1,
      resort_slug: 'kotelnica-bialczanska',
      observed_at: OBS_AT,
      fetched_at: OBS_AT,
      snow_depth_cm: 145,
      lifts_open: { count: 7, total: 7 },
      field_sources: {
        snow_depth_cm: fs('opensnow'),
        'lifts_open.count': fs('resort-feed'),
        'lifts_open.total': fs('resort-feed'),
      },
    },
    field_states: {
      slopes_km:
        slopesState === 'manual'
          ? { state: 'manual', value: 8, observed_at: OBS_AT }
          : { state: 'live', value: 8, source: 'resort-feed', observed_at: OBS_AT },
      lift_count:
        liftCountState === 'manual'
          ? { state: 'manual', value: 7, observed_at: OBS_AT }
          : { state: 'live', value: 7, source: 'resort-feed', observed_at: OBS_AT },
      'altitude_m.min': { state: 'live', value: 770, source: 'resort-feed', observed_at: OBS_AT },
      'altitude_m.max': { state: 'live', value: 920, source: 'resort-feed', observed_at: OBS_AT },
      'season.start_month': { state: 'live', value: 12, source: 'resort-feed', observed_at: OBS_AT },
      'season.end_month': { state: 'live', value: 4, source: 'resort-feed', observed_at: OBS_AT },
    },
  })
}

// Per Codex round-6 P2-8: jsdom doesn't implement window.matchMedia so
// useIsAboveMd() throws TypeError without this stub. Each test calls it
// with the appropriate viewport intent (or relies on the default below).
function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
}

beforeEach((): void => {
  resetURLState()
  resetWorkspaceState()
  resetResortDetail()
  resetAnalystNotes()
  resetAnalystNoteDraft()
  resetFlushAll()
  window.history.replaceState({}, '', '/?route=editor&slug=kotelnica-bialczanska')
  prepopulateResortDetail(KOTELNICA, syntheticResponse())
  // Seed an empty analyst-notes cache so the affordance's useAnalystNotes
  // read returns synchronously (cachedFulfilled fast path) and the row never
  // suspends in the bare-<FieldRow> render tests above. Per-test overrides
  // re-seed with notes via prepopulateAnalystNotes.
  prepopulateAnalystNotes(
    KOTELNICA,
    AnalystNotesGetResponse.parse({ slug: KOTELNICA, notes: {} }),
  )
  stubMatchMedia(true)
})

afterEach((): void => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
  resetWorkspaceState()
  resetResortDetail()
  resetURLState()
  resetAnalystNotes()
  resetAnalystNoteDraft()
  resetFlushAll()
})

describe('formatMetricValue (PR 4.4b §D2)', (): void => {
  it('formats slopes_km with the km unit', (): void => {
    expect(formatMetricValue('slopes_km', 142)).toBe('142 km')
  })

  it('formats lift_count as a plain integer', (): void => {
    expect(formatMetricValue('lift_count', 24)).toBe('24')
  })

  it('formats altitude_m.min with the m unit', (): void => {
    expect(formatMetricValue('altitude_m.min', 800)).toBe('800 m')
  })

  it('formats altitude_m.max with the m unit', (): void => {
    expect(formatMetricValue('altitude_m.max', 2300)).toBe('2300 m')
  })

  it('formats skiable_terrain_ha with the ha unit', (): void => {
    expect(formatMetricValue('skiable_terrain_ha', 50)).toBe('50 ha')
  })

  it('formats season.start_month 12 → English long month name', (): void => {
    expect(formatMetricValue('season.start_month', 12)).toBe('December')
  })

  it('formats season.end_month 4 → English long month name', (): void => {
    expect(formatMetricValue('season.end_month', 4)).toBe('April')
  })

  it('returns "—" for season.start_month out of range (0)', (): void => {
    expect(formatMetricValue('season.start_month', 0)).toBe('—')
  })

  it('returns "—" for season.end_month out of range (13)', (): void => {
    expect(formatMetricValue('season.end_month', 13)).toBe('—')
  })

  it('formats snow_depth_cm with the cm unit', (): void => {
    expect(formatMetricValue('snow_depth_cm', 145)).toBe('145 cm')
  })

  it('formats lifts_open.count as a plain integer', (): void => {
    expect(formatMetricValue('lifts_open.count', 12)).toBe('12')
  })

  it('formats lifts_open.total as a plain integer', (): void => {
    expect(formatMetricValue('lifts_open.total', 24)).toBe('24')
  })

  it('formats lift_pass_day Money via Intl.NumberFormat with EUR currency', (): void => {
    const expected = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'EUR',
    }).format(4250)
    expect(formatMetricValue('lift_pass_day', { amount: 4250, currency: 'EUR' })).toBe(expected)
  })

  it('formats lodging_sample.median_eur Money via Intl.NumberFormat with EUR currency', (): void => {
    const expected = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'EUR',
    }).format(80)
    expect(
      formatMetricValue('lodging_sample.median_eur', { amount: 80, currency: 'EUR' }),
    ).toBe(expected)
  })

  it('returns "—" for null / undefined values across paths', (): void => {
    expect(formatMetricValue('slopes_km', null)).toBe('—')
    expect(formatMetricValue('snow_depth_cm', undefined)).toBe('—')
    expect(formatMetricValue('lift_pass_day', null)).toBe('—')
    expect(formatMetricValue('season.start_month', undefined)).toBe('—')
    expect(formatMetricValue('lift_count', null)).toBe('—')
    expect(formatMetricValue('lifts_open.count', undefined)).toBe('—')
  })

  it('returns "—" for non-integer month inputs', (): void => {
    expect(formatMetricValue('season.start_month', 3.5)).toBe('—')
  })

  it('returns "—" for shape mismatches (e.g. number where Money is expected)', (): void => {
    expect(formatMetricValue('lift_pass_day', 50)).toBe('—')
    expect(formatMetricValue('slopes_km', { amount: 1, currency: 'EUR' })).toBe('—')
  })

  it('returns "—" for Money objects whose currency is not the EUR literal', (): void => {
    expect(formatMetricValue('lift_pass_day', { amount: 50, currency: 'USD' })).toBe('—')
  })

  it('returns "—" for Money objects whose amount is not a number', (): void => {
    expect(formatMetricValue('lift_pass_day', { amount: 'abc', currency: 'EUR' })).toBe('—')
  })
})

describe('FieldRow render-only (PR 4.4b Tasks 3+4)', (): void => {
  it('renders the field label, formatted value, StatusPill (live), and source badge for a live state', (): void => {
    render(<FieldRow path="slopes_km" state={liveState(142)} />)
    const row = screen.getByLabelText('Slopes (km)')
    expect(within(row).getByText('Slopes (km)')).toBeInTheDocument()
    expect(within(row).getByText('142 km')).toBeInTheDocument()
    expect(within(row).getByText('Live')).toBeInTheDocument()
    expect(within(row).getByText('Resort Feed')).toBeInTheDocument()
  })

  it('renders the StatusPill (stale) and source badge for a stale state', (): void => {
    render(<FieldRow path="snow_depth_cm" state={staleState(80)} />)
    const row = screen.getByLabelText('Snow depth (cm)')
    expect(within(row).getByText('Stale')).toBeInTheDocument()
    expect(within(row).getByText('80 cm')).toBeInTheDocument()
    expect(within(row).getByText('OpenSnow')).toBeInTheDocument()
  })

  it('renders "—" and omits the source badge for a failed state', (): void => {
    render(<FieldRow path="lift_pass_day" state={failedState()} />)
    const row = screen.getByLabelText('Lift pass (per day)')
    expect(within(row).getByText('Failed')).toBeInTheDocument()
    expect(within(row).getByText('—')).toBeInTheDocument()
    expect(within(row).queryByText('OpenSnow')).toBeNull()
    expect(within(row).queryByText('Resort Feed')).toBeNull()
    expect(within(row).queryByText('Manual')).toBeNull()
  })

  it('renders the StatusPill (manual) and a Manual source badge for a manual state', (): void => {
    render(<FieldRow path="lift_count" state={manualState(7)} />)
    const row = screen.getByLabelText('Lift count')
    expect(within(row).getByText('7')).toBeInTheDocument()
    expect(row.querySelector('[data-variant="manual"]')).not.toBeNull()
    expect(row.querySelector('[data-source="manual"]')).not.toBeNull()
  })

  // Below-md responsive branch (Decision D11): the inline render-only span
  // is now the FALLBACK below the md breakpoint. The pre-existing 4.4b
  // assertion is preserved by switching the matchMedia stub to false.
  it('below md (matchMedia=false): ModeToggle degrades to span role="switch" aria-disabled', (): void => {
    stubMatchMedia(false)
    const { rerender } = render(<FieldRow path="slopes_km" state={liveState(10)} />)
    const liveToggle = screen.getByRole('switch')
    expect(liveToggle.tagName).toBe('SPAN')
    expect(liveToggle).toHaveAttribute('aria-disabled', 'true')
    expect(liveToggle).toHaveAttribute('aria-checked', 'false')

    // For the manual canonical projection, the inline span renders aria-checked=true.
    prepopulateResortDetail(KOTELNICA, syntheticResponse({ slopesState: 'manual' }))
    rerender(<FieldRow path="slopes_km" state={manualState(15)} />)
    const manualToggle = screen.getByRole('switch')
    expect(manualToggle).toHaveAttribute('aria-disabled', 'true')
    expect(manualToggle).toHaveAttribute('aria-checked', 'true')
  })

  it('passes jest-axe across all four FieldStateFor states', async (): Promise<void> => {
    const { container, rerender } = render(<FieldRow path="slopes_km" state={liveState(142)} />)
    expect(await axe(container)).toHaveNoViolations()

    rerender(<FieldRow path="snow_depth_cm" state={staleState(80)} />)
    expect(await axe(container)).toHaveNoViolations()

    rerender(<FieldRow path="lift_pass_day" state={failedState()} />)
    expect(await axe(container)).toHaveNoViolations()

    rerender(<FieldRow path="lift_count" state={manualState(7)} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('labelForPath (PR 4.4b §D2)', (): void => {
  it('returns a human label for every MetricPath', (): void => {
    expect(labelForPath('altitude_m.min')).toBe('Altitude (min, m)')
    expect(labelForPath('altitude_m.max')).toBe('Altitude (max, m)')
    expect(labelForPath('slopes_km')).toBe('Slopes (km)')
    expect(labelForPath('lift_count')).toBe('Lift count')
    expect(labelForPath('skiable_terrain_ha')).toBe('Skiable terrain (ha)')
    expect(labelForPath('season.start_month')).toBe('Season start')
    expect(labelForPath('season.end_month')).toBe('Season end')
    expect(labelForPath('snow_depth_cm')).toBe('Snow depth (cm)')
    expect(labelForPath('lifts_open.count')).toBe('Lifts open (count)')
    expect(labelForPath('lifts_open.total')).toBe('Lifts open (total)')
    expect(labelForPath('lift_pass_day')).toBe('Lift pass (per day)')
    expect(labelForPath('lodging_sample.median_eur')).toBe('Lodging median')
  })
})

// PR 4.4d Task 6 — above-md interactive branches (Decision D11, F1).
describe('FieldRow above-md: interactive ModeToggle + MANUAL input (PR 4.4d)', (): void => {
  it('above md + MANUAL on slopes_km (durable): renders DS Input AND DS Button ModeToggle', (): void => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse({ slopesState: 'manual' }))
    render(<FieldRow path="slopes_km" state={manualState(8)} />)

    const input = screen.getByRole('textbox', { name: 'Slopes (km)' })
    expect(input.tagName).toBe('INPUT')

    const toggle = screen.getByRole('button', { name: /Mode for Slopes \(km\)/ })
    expect(toggle.tagName).toBe('BUTTON')
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
  })

  it('above md + AUTO on slopes_km: no MANUAL Input rendered; ModeToggle button visible with aria-pressed=false', (): void => {
    render(<FieldRow path="slopes_km" state={liveState(8)} />)
    expect(screen.queryByRole('textbox', { name: 'Slopes (km)' })).toBeNull()
    const toggle = screen.getByRole('button', { name: /Mode for Slopes \(km\)/ })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
  })

  it('above md + live-only path (lift_pass_day): ModeToggle is disabled AND explanatory copy renders unconditionally (Codex round-22 P2-30)', (): void => {
    render(<FieldRow path="lift_pass_day" state={liveState({ amount: 50, currency: 'EUR' })} />)
    const toggle = screen.getByRole('button', { name: /Mode for Lift pass/ })
    expect(toggle).toBeDisabled()
    expect(screen.getByText(/MANUAL editing for lift_pass_day lands in PR 4.6a/)).toBeInTheDocument()
    // No MANUAL Input rendered for the live path (it's not in MANUAL_EDITABLE_PATHS).
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('above md + live-only paths: all 5 (snow_depth_cm, lifts_open.{count,total}, lift_pass_day, lodging_sample.median_eur) show disabled toggle', (): void => {
    const livePaths = [
      'snow_depth_cm', 'lifts_open.count', 'lifts_open.total',
      'lift_pass_day', 'lodging_sample.median_eur',
    ] as const
    for (const path of livePaths) {
      const { unmount } = render(<FieldRow path={path} state={liveState(1)} />)
      const toggle = screen.getByRole('button', { name: `Mode for ${labelForPath(path)}` })
      expect(toggle).toBeDisabled()
      unmount()
    }
  })

  it('above md + MANUAL + typing a valid number: setFieldValue fires after debounce, PUT body carries the new value', async (): Promise<void> => {
    vi.useFakeTimers()
    prepopulateResortDetail(KOTELNICA, syntheticResponse({ slopesState: 'manual' }))
    const spy = vi
      .spyOn(apiClient, 'upsertResort')
      .mockResolvedValue(syntheticResponse({ slopesState: 'manual' }))

    render(<FieldRow path="slopes_km" state={manualState(8)} />)
    const input = screen.getByRole('textbox', { name: 'Slopes (km)' })
    await act(async (): Promise<void> => {
      fireEvent.change(input, { target: { value: '150' } })
      await vi.advanceTimersByTimeAsync(600)
    })

    expect(spy).toHaveBeenCalled()
    const body = spy.mock.calls[0]?.[1] as ResortUpsertBody
    expect(body.resort?.slopes_km).toBe(150)
    expect(body.resort?.field_sources?.['slopes_km']?.source).toBe('manual')
  })

  it('above md + MANUAL + empty input: no PUT fires (Codex round-11 P2-15 + round-17 P2-24)', async (): Promise<void> => {
    vi.useFakeTimers()
    prepopulateResortDetail(KOTELNICA, syntheticResponse({ slopesState: 'manual' }))
    const spy = vi.spyOn(apiClient, 'upsertResort').mockResolvedValue(syntheticResponse())

    render(<FieldRow path="slopes_km" state={manualState(8)} />)
    const input = screen.getByRole('textbox', { name: 'Slopes (km)' })
    await act(async (): Promise<void> => {
      fireEvent.change(input, { target: { value: '' } })
      await vi.advanceTimersByTimeAsync(600)
    })

    expect(spy).not.toHaveBeenCalled()
    expect(input).toHaveValue('')
  })

  it('above md + MANUAL + whitespace-only input: no PUT fires (Codex round-17 P2-23)', async (): Promise<void> => {
    vi.useFakeTimers()
    prepopulateResortDetail(KOTELNICA, syntheticResponse({ slopesState: 'manual' }))
    const spy = vi.spyOn(apiClient, 'upsertResort').mockResolvedValue(syntheticResponse())

    render(<FieldRow path="slopes_km" state={manualState(8)} />)
    const input = screen.getByRole('textbox', { name: 'Slopes (km)' })
    await act(async (): Promise<void> => {
      fireEvent.change(input, { target: { value: '   ' } })
      await vi.advanceTimersByTimeAsync(600)
    })

    expect(spy).not.toHaveBeenCalled()
  })

  it('above md + MANUAL + invalid intermediates (-, ., 1e): no PUT fires', async (): Promise<void> => {
    vi.useFakeTimers()
    prepopulateResortDetail(KOTELNICA, syntheticResponse({ slopesState: 'manual' }))
    const spy = vi.spyOn(apiClient, 'upsertResort').mockResolvedValue(syntheticResponse())

    render(<FieldRow path="slopes_km" state={manualState(8)} />)
    const input = screen.getByRole('textbox', { name: 'Slopes (km)' })
    for (const raw of ['-', '.', '1e']) {
      await act(async (): Promise<void> => {
        fireEvent.change(input, { target: { value: raw } })
        await vi.advanceTimersByTimeAsync(600)
      })
    }

    expect(spy).not.toHaveBeenCalled()
  })

  it('above md + MANUAL on lift_count + fractional input (7.5): no PUT fires (Codex round-19 P2-26)', async (): Promise<void> => {
    vi.useFakeTimers()
    prepopulateResortDetail(KOTELNICA, syntheticResponse({ liftCountState: 'manual' }))
    const spy = vi.spyOn(apiClient, 'upsertResort').mockResolvedValue(syntheticResponse())

    render(<FieldRow path="lift_count" state={manualState(7)} />)
    const input = screen.getByRole('textbox', { name: 'Lift count' })
    await act(async (): Promise<void> => {
      fireEvent.change(input, { target: { value: '7.5' } })
      await vi.advanceTimersByTimeAsync(600)
    })
    expect(spy).not.toHaveBeenCalled()

    // Then valid integer → PUT fires.
    await act(async (): Promise<void> => {
      fireEvent.change(input, { target: { value: '8' } })
      await vi.advanceTimersByTimeAsync(600)
    })
    expect(spy).toHaveBeenCalled()
    const body = spy.mock.calls[0]?.[1] as ResortUpsertBody
    expect(body.resort?.lift_count).toBe(8)
  })

  it('above md + MANUAL on season.start_month + out-of-range / non-integer input: no PUT fires', async (): Promise<void> => {
    vi.useFakeTimers()
    prepopulateResortDetail(KOTELNICA, syntheticResponse())
    const spy = vi.spyOn(apiClient, 'upsertResort').mockResolvedValue(syntheticResponse())

    // Flip MANUAL via the toggle so the Input renders.
    render(<FieldRow path="season.start_month" state={liveState(12)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mode for Season start' }))
    const input = screen.getByRole('textbox', { name: 'Season start' })

    // 13 is out of range; 5.5 is non-integer; both must short-circuit.
    for (const raw of ['13', '0', '5.5']) {
      fireEvent.change(input, { target: { value: raw } })
      await act(async (): Promise<void> => { await vi.advanceTimersByTimeAsync(600) })
    }

    // Only the initial mode-toggle PUT fires (one body containing only editor_modes).
    for (const call of spy.mock.calls) {
      const body = call[1]
      expect(body.resort?.season).toBeUndefined()
    }
  })

  it('above md + MANUAL + non-finite input (Infinity, -Infinity, 1e999): no PUT fires (Codex round-22 P2-31)', async (): Promise<void> => {
    vi.useFakeTimers()
    prepopulateResortDetail(KOTELNICA, syntheticResponse({ slopesState: 'manual' }))
    const spy = vi.spyOn(apiClient, 'upsertResort').mockResolvedValue(syntheticResponse())

    render(<FieldRow path="slopes_km" state={manualState(8)} />)
    const input = screen.getByRole('textbox', { name: 'Slopes (km)' })
    for (const raw of ['Infinity', '-Infinity', '1e999']) {
      await act(async (): Promise<void> => {
        fireEvent.change(input, { target: { value: raw } })
        await vi.advanceTimersByTimeAsync(600)
      })
    }
    expect(spy).not.toHaveBeenCalled()
  })

  it('above md + ModeToggle click invokes toggleMode (durable path)', async (): Promise<void> => {
    vi.useFakeTimers()
    const spy = vi
      .spyOn(apiClient, 'upsertResort')
      .mockResolvedValue(syntheticResponse({ slopesState: 'manual' }))

    render(<FieldRow path="slopes_km" state={liveState(8)} />)
    const toggle = screen.getByRole('button', { name: /Mode for Slopes \(km\)/ })
    await act(async (): Promise<void> => {
      fireEvent.click(toggle)
      await vi.advanceTimersByTimeAsync(600)
    })

    expect(spy).toHaveBeenCalled()
    const body = spy.mock.calls[0]?.[1] as ResortUpsertBody
    expect(body.editor_modes?.['slopes_km']).toBe('manual')
  })
})

// Coverage: readDraftLeaf's live-path switch case (returns undefined for the
// 5 live paths even when draft.resort is populated by a durable edit).
describe('FieldRow live-path render with draft.resort populated', (): void => {
  it('renders the live-path FieldRow correctly when an unrelated durable field has been edited', (): void => {
    workspaceSetFieldValue(KOTELNICA, 'slopes_km', 100)
    // Now draft.resort is defined; readDraftLeaf for a live path hits the
    // switch's live-path return-undefined arm.
    render(<FieldRow path="snow_depth_cm" state={liveState(145)} />)
    // The display falls back to the canonical FieldState value via valueOfState.
    const row = screen.getByLabelText('Snow depth (cm)')
    expect(within(row).getByText('145 cm')).toBeInTheDocument()
  })
})

// PR 4.4d Task 6 — below-md responsive read-only gate (Decision D11 +
// AGENTS.md "Admin App Rules"). Edit controls REMOVED from the tab order
// — not merely disabled.
describe('FieldRow below-md responsive gate (Decision D11)', (): void => {
  beforeEach((): void => { stubMatchMedia(false) })

  it('below md + MANUAL on slopes_km (durable): no Input rendered AND no interactive Button ModeToggle', (): void => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse({ slopesState: 'manual' }))
    render(<FieldRow path="slopes_km" state={manualState(8)} />)

    // No MANUAL Input present below md.
    expect(screen.queryByRole('textbox')).toBeNull()
    // No interactive DS Button ModeToggle either — the span fallback is not a button.
    expect(screen.queryByRole('button', { name: /Mode for/ })).toBeNull()
    // PR N.c4 §6.5: the analyst-note affordance still RENDERS below md (so
    // the read-only note count stays visible) but is natively `disabled`.
    expect(screen.getByRole('button', { name: 'Add note' })).toBeDisabled()
    // The render-only span IS still there.
    const fallback = screen.getByRole('switch')
    expect(fallback.tagName).toBe('SPAN')
    expect(fallback).toHaveAttribute('aria-disabled', 'true')
  })

  it('below md + live path: no explanatory copy, no Input', (): void => {
    render(<FieldRow path="lift_pass_day" state={liveState({ amount: 50, currency: 'EUR' })} />)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByText(/MANUAL editing for/)).toBeNull()
  })

  it('below md: the render-only span has no tabindex (not in tab order per AGENTS.md "Admin App Rules")', (): void => {
    render(<FieldRow path="slopes_km" state={liveState(8)} />)
    const span = screen.getByRole('switch')
    // Spans have no default tabindex — assert it's not made focusable.
    expect(span).not.toHaveAttribute('tabindex')
  })
})

// PR 4.4d Task 6 — edit-then-clear scenarios (Codex rounds 20/21/24).
describe('FieldRow MANUAL clear scenarios (Codex rounds 20/21/24)', (): void => {
  it('clear-after-typing leaves the input blank (Codex P2-A: render-time sync must not restore the old canonical when the user clears)', (): void => {
    prepopulateResortDetail(KOTELNICA, syntheticResponse({ slopesState: 'manual' }))
    render(<FieldRow path="slopes_km" state={manualState(8)} />)
    const input = screen.getByRole('textbox', { name: 'Slopes (km)' })

    // Initial state: input shows the canonical value '8'.
    expect(input).toHaveValue('8')

    // User types a valid value — draft is set, localString reflects '155'.
    fireEvent.change(input, { target: { value: '155' } })
    expect(input).toHaveValue('155')

    // User clears the input — clearFieldValue drops the draft, persistedValue
    // falls back to the canonical state.value = 8. Without the P2-A fix, the
    // render-time sync would overwrite localString with '8', making it
    // impossible to hold the field blank to retype.
    fireEvent.change(input, { target: { value: '' } })
    expect(input).toHaveValue('')

    // Typing an invalid intermediate (e.g., '7e') triggers the same
    // clearFieldValue path. The user's transient string must survive.
    fireEvent.change(input, { target: { value: '7e' } })
    expect(input).toHaveValue('7e')
  })

  it('edit-then-clear of a top-level path drops value/provenance but preserves editor_modes (round-20 P2-28 + round-24 P2-35 no-mode variant)', async (): Promise<void> => {
    vi.useFakeTimers()
    prepopulateResortDetail(KOTELNICA, syntheticResponse({ slopesState: 'manual' }))
    const spy = vi.spyOn(apiClient, 'upsertResort').mockResolvedValue(syntheticResponse())

    render(<FieldRow path="slopes_km" state={manualState(8)} />)
    const input = screen.getByRole('textbox', { name: 'Slopes (km)' })
    fireEvent.change(input, { target: { value: '150' } })
    // Before debounce fires: clear input.
    fireEvent.change(input, { target: { value: '' } })
    await act(async (): Promise<void> => {
      await vi.advanceTimersByTimeAsync(600)
    })

    // No editor_modes was toggled in this test → empty-diff short-circuit → no PUT.
    expect(spy).not.toHaveBeenCalled()
  })

  it('edit-then-clear of a nested path (season.start_month) drops the WHOLE parent — no incomplete-parent PUT (round-21 P2-29)', async (): Promise<void> => {
    vi.useFakeTimers()
    prepopulateResortDetail(KOTELNICA, syntheticResponse())
    const spy = vi.spyOn(apiClient, 'upsertResort').mockResolvedValue(syntheticResponse())

    // First, toggle MANUAL above-md so the Input renders.
    render(<FieldRow path="season.start_month" state={liveState(12)} />)
    const toggle = screen.getByRole('button', { name: 'Mode for Season start' })
    fireEvent.click(toggle)

    // After the click flush, modeFor='manual' and the Input is in the DOM.
    const input = screen.getByRole('textbox', { name: 'Season start' })
    fireEvent.change(input, { target: { value: '11' } })
    // Before debounce: clear.
    fireEvent.change(input, { target: { value: '' } })
    await act(async (): Promise<void> => {
      await vi.advanceTimersByTimeAsync(600)
    })

    // The pending PUT (if it fires) carries ONLY editor_modes; no resort.season patch.
    // Empty-diff for resort is OK since season was cleared from draft.
    for (const call of spy.mock.calls) {
      const body = call[1]
      expect(body.resort?.season).toBeUndefined()
    }
  })
})

// PR N.c4 — analyst-note affordance + lazy-load (spec §6.1 / §6.4 / §6.6).
const OBS_NOTE = '2026-04-26T08:00:00Z'

function seedNote(markdown: string, html: string, path = 'slopes_km'): void {
  prepopulateAnalystNotes(
    KOTELNICA,
    AnalystNotesGetResponse.parse({
      slug: KOTELNICA,
      notes: {
        [path]: {
          schema_version: 1,
          markdown,
          html,
          created_at: OBS_NOTE,
          updated_at: OBS_NOTE,
        },
      },
    }),
  )
}

describe('noteSaveStatusLabel (Codex P2 fold — spec §6.2 status mapping)', (): void => {
  it('maps saving → "saving…"', (): void => {
    expect(noteSaveStatusLabel('saving')).toBe('saving…')
  })
  it('maps saved → "saved"', (): void => {
    expect(noteSaveStatusLabel('saved')).toBe('saved')
  })
  it('maps save-failed → "save-failed"', (): void => {
    expect(noteSaveStatusLabel('save-failed')).toBe('save-failed')
  })
  it('maps idle → null (no noise on untouched rows)', (): void => {
    expect(noteSaveStatusLabel('idle')).toBeNull()
  })
  it('maps dirty → null (no noise mid-keystroke)', (): void => {
    expect(noteSaveStatusLabel('dirty')).toBeNull()
  })
})

describe('editorSlug (PR N.c4 invariant helper)', (): void => {
  it('returns the slug on the editor route', (): void => {
    expect(editorSlug({ route: 'editor', slug: KOTELNICA })).toBe(KOTELNICA)
  })

  it('throws on a non-editor route (defensive invariant — useWorkspaceState throws first in practice)', (): void => {
    expect((): void => {
      editorSlug({ route: 'dashboard' })
    }).toThrow('FieldRow rendered outside the editor route')
  })
})

describe('FieldRow analyst-note affordance (PR N.c4 §6.1 / §6.4)', (): void => {
  it('renders 📝 0 (outlined, "Add note") when the path has no note', (): void => {
    render(<FieldRow path="slopes_km" state={liveState(8)} />)
    const aff = screen.getByRole('button', { name: 'Add note' })
    expect(aff).toHaveTextContent('📝 0')
    expect(aff).toHaveAttribute('data-note-filled', 'false')
  })

  it('renders 📝 N (filled, "Edit note") where N = rendered-HTML text-char count', (): void => {
    // html "<p>hello</p>" → textContent "hello" → 5 chars.
    seedNote('hello', '<p>hello</p>')
    render(<FieldRow path="slopes_km" state={liveState(8)} />)
    const aff = screen.getByRole('button', { name: 'Edit note' })
    expect(aff).toHaveTextContent('📝 5')
    expect(aff).toHaveAttribute('data-note-filled', 'true')
  })

  it('counts only text characters, not HTML markup', (): void => {
    // Heavy markup, no inter-element whitespace: textContent is "Hithere"
    // (7 chars) — tags / attributes are excluded from N.
    seedNote('# Hi\n\nthere', '<h1 id="x"><strong>Hi</strong></h1><p>there</p>')
    render(<FieldRow path="slopes_km" state={liveState(8)} />)
    expect(screen.getByRole('button', { name: 'Edit note' })).toHaveTextContent(
      '📝 7',
    )
  })

  it('the affordance is scoped per path (only its own note counts)', (): void => {
    seedNote('hello', '<p>hello</p>', 'lift_count')
    render(<FieldRow path="slopes_km" state={liveState(8)} />)
    // slopes_km has no note even though lift_count does.
    expect(screen.getByRole('button', { name: 'Add note' })).toHaveTextContent(
      '📝 0',
    )
  })

  it('exposes aria-expanded=false + aria-controls before expand', (): void => {
    render(<FieldRow path="slopes_km" state={liveState(8)} />)
    const aff = screen.getByRole('button', { name: 'Add note' })
    expect(aff).toHaveAttribute('aria-expanded', 'false')
    expect(aff).toHaveAttribute('aria-controls')
  })

  it('the note tooltip is the first ~80 chars of text when N>0, "Add note" when 0', (): void => {
    const long = 'x'.repeat(200)
    seedNote(long, `<p>${long}</p>`)
    const { rerender } = render(<FieldRow path="slopes_km" state={liveState(8)} />)
    const filled = screen.getByRole('button', { name: 'Edit note' })
    expect(filled.getAttribute('title')?.length).toBeLessThanOrEqual(80)
    expect(filled.getAttribute('title')).toMatch(/^x+$/)

    prepopulateAnalystNotes(
      KOTELNICA,
      AnalystNotesGetResponse.parse({ slug: KOTELNICA, notes: {} }),
    )
    rerender(<FieldRow path="slopes_km" state={liveState(8)} />)
    expect(screen.getByRole('button', { name: 'Add note' })).toHaveAttribute(
      'title',
      'Add note',
    )
  })

  it('the affordance is disabled below the md breakpoint (PR 4.6a rule)', (): void => {
    stubMatchMedia(false)
    render(<FieldRow path="slopes_km" state={liveState(8)} />)
    expect(screen.getByRole('button', { name: 'Add note' })).toBeDisabled()
  })

  it('does NOT load AnalystNoteSection before the first expand (no source pane / no chunk)', (): void => {
    render(<FieldRow path="slopes_km" state={liveState(8)} />)
    expect(
      screen.queryByRole('textbox', { name: /note source/i }),
    ).toBeNull()
  })

  it('lazy-loads AnalystNoteSection on the first affordance click', async (): Promise<void> => {
    seedNote('hello', '<p>hello</p>')
    render(<FieldRow path="slopes_km" state={liveState(8)} />)
    const aff = screen.getByRole('button', { name: 'Edit note' })
    expect(
      screen.queryByRole('textbox', { name: /note source/i }),
    ).toBeNull()
    fireEvent.click(aff)
    // React.lazy resolves the dynamic import asynchronously.
    const source = await screen.findByRole('textbox', { name: /note source/i })
    expect(source).toHaveValue('hello')
    expect(aff).toHaveAttribute('aria-expanded', 'true')
  })

  it('collapses (unmounts the section) on a second affordance click', async (): Promise<void> => {
    render(<FieldRow path="slopes_km" state={liveState(8)} />)
    const aff = screen.getByRole('button', { name: 'Add note' })
    fireEvent.click(aff)
    await screen.findByRole('textbox', { name: /note source/i })
    fireEvent.click(aff)
    await waitFor((): void => {
      expect(
        screen.queryByRole('textbox', { name: /note source/i }),
      ).toBeNull()
    })
    expect(aff).toHaveAttribute('aria-expanded', 'false')
  })

  it('collapses when AnalystNoteSection requests it via onCollapse (Escape inside the source pane)', async (): Promise<void> => {
    seedNote('hello', '<p>hello</p>')
    render(<FieldRow path="slopes_km" state={liveState(8)} />)
    const aff = screen.getByRole('button', { name: 'Edit note' })
    fireEvent.click(aff)
    const source = await screen.findByRole('textbox', { name: /note source/i })
    expect(aff).toHaveAttribute('aria-expanded', 'true')
    // Escape inside the source pane → AnalystNoteSection.onCollapse →
    // FieldRow.setNotesExpanded(false) → the section unmounts.
    await act(async (): Promise<void> => {
      source.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      )
      await Promise.resolve()
    })
    await waitFor((): void => {
      expect(
        screen.queryByRole('textbox', { name: /note source/i }),
      ).toBeNull()
    })
    expect(
      screen.getByRole('button', { name: 'Edit note' }),
    ).toHaveAttribute('aria-expanded', 'false')
  })

  // Codex P2 fold (spec §6.2): the save-status indicator belongs next to the
  // affordance button at FieldRow level (always mounted), NOT inside the
  // collapsible AnalystNoteSection. If the analyst edits a note then collapses
  // the row while the debounced flush is still pending and that flush FAILS,
  // the failure must remain visible — otherwise the analyst leaves believing
  // the note saved (silent data loss).
  it('keeps the save-failed status visible at the affordance after the section collapses (silent-failure guard)', async (): Promise<void> => {
    seedNote('hello', '<p>hello</p>')
    const spy = vi
      .spyOn(apiClient, 'upsertAnalystNote')
      .mockRejectedValue(new Error('boom'))

    render(<FieldRow path="slopes_km" state={liveState(8)} />)
    const aff = screen.getByRole('button', { name: 'Edit note' })
    fireEvent.click(aff)
    const source = await screen.findByRole('textbox', { name: /note source/i })

    // Dirty the draft, then collapse the row (Escape) BEFORE the failing
    // flush settles. Escape flushNow()s immediately (no 500ms wait) + asks
    // FieldRow to collapse, so AnalystNoteSection unmounts while the
    // rejecting PUT is in flight.
    fireEvent.change(source, { target: { value: 'edited but doomed' } })
    await act(async (): Promise<void> => {
      source.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      )
      await Promise.resolve()
    })

    // The collapsible section is gone…
    await waitFor((): void => {
      expect(
        screen.queryByRole('textbox', { name: /note source/i }),
      ).toBeNull()
    })
    // …but the affordance-adjacent status still surfaces the failure.
    await waitFor((): void => {
      expect(screen.getByText('save-failed')).toBeInTheDocument()
    })
    expect(spy).toHaveBeenCalled()
  })

  it('keeps the saved status visible at the affordance after a successful flush while collapsed (happy path)', async (): Promise<void> => {
    seedNote('hello', '<p>hello</p>')
    const spy = vi
      .spyOn(apiClient, 'upsertAnalystNote')
      .mockResolvedValue({
        slug: KOTELNICA,
        path: 'slopes_km',
        note: {
          schema_version: 1,
          markdown: 'edited and saved',
          html: '<p>edited and saved</p>',
          created_at: OBS_AT,
          updated_at: OBS_AT,
        },
      })

    render(<FieldRow path="slopes_km" state={liveState(8)} />)
    const aff = screen.getByRole('button', { name: 'Edit note' })
    fireEvent.click(aff)
    const source = await screen.findByRole('textbox', { name: /note source/i })

    fireEvent.change(source, { target: { value: 'edited and saved' } })
    await act(async (): Promise<void> => {
      source.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      )
      await Promise.resolve()
    })

    await waitFor((): void => {
      expect(
        screen.queryByRole('textbox', { name: /note source/i }),
      ).toBeNull()
    })
    await waitFor((): void => {
      expect(screen.getByText('saved')).toBeInTheDocument()
    })
    expect(spy).toHaveBeenCalled()
  })

  it('shows no save-status indicator for an untouched row (idle state)', (): void => {
    render(<FieldRow path="slopes_km" state={liveState(8)} />)
    expect(screen.queryByText('saving…')).toBeNull()
    expect(screen.queryByText('saved')).toBeNull()
    expect(screen.queryByText('save-failed')).toBeNull()
  })

  it('is axe-clean with the affordance present (collapsed + expanded)', async (): Promise<void> => {
    seedNote('hello', '<p>hello</p>')
    const { container } = render(<FieldRow path="slopes_km" state={liveState(8)} />)
    expect(await axe(container)).toHaveNoViolations()
    fireEvent.click(screen.getByRole('button', { name: 'Edit note' }))
    await screen.findByRole('textbox', { name: /note source/i })
    expect(await axe(container)).toHaveNoViolations()
  })

  // Codex P2 fold (spec §6.5): the expanded analyst-notes section is gated on
  // `isAboveMd && notesExpanded`, mirroring `modeToggleEl` / the MANUAL input.
  // Expanding above md then crossing below md must UNMOUNT the editable
  // Textarea + Delete button (read-only-below-md guard cannot be bypassed by
  // resizing after opening). `notesExpanded` is preserved so returning above
  // md re-mounts the section with no imperative collapse.
  it('unmounts the expanded section below md (isAboveMd gate) and re-mounts it when back above md', async (): Promise<void> => {
    seedNote('hello', '<p>hello</p>')
    const { rerender } = render(<FieldRow path="slopes_km" state={liveState(8)} />)

    // Above md (beforeEach stubs matchMedia=true): expand the section.
    const aff = screen.getByRole('button', { name: 'Edit note' })
    fireEvent.click(aff)
    await screen.findByRole('textbox', { name: /note source/i })
    expect(
      screen.getByRole('button', { name: /delete note/i }),
    ).toBeInTheDocument()

    // Viewport crosses below md AFTER expanding. useResponsiveTabOrder reads
    // the fresh matchMedia snapshot on the next render (useSyncExternalStore).
    stubMatchMedia(false)
    rerender(<FieldRow path="slopes_km" state={liveState(8)} />)

    await waitFor((): void => {
      expect(
        screen.queryByRole('textbox', { name: /note source/i }),
      ).toBeNull()
    })
    // The editable Textarea AND the Delete button are gone — not merely
    // disabled — exactly like the mode toggle / value input below md.
    expect(
      screen.queryByRole('textbox', { name: /note source/i }),
    ).toBeNull()
    expect(
      screen.queryByRole('button', { name: /delete note/i }),
    ).toBeNull()
    // The affordance button itself still renders, natively disabled.
    expect(screen.getByRole('button', { name: 'Edit note' })).toBeDisabled()

    // Viewport returns above md: notesExpanded was preserved (no imperative
    // collapse), so the section re-mounts declaratively.
    stubMatchMedia(true)
    rerender(<FieldRow path="slopes_km" state={liveState(8)} />)
    const source = await screen.findByRole('textbox', { name: /note source/i })
    expect(source).toHaveValue('hello')
    expect(
      screen.getByRole('button', { name: /delete note/i }),
    ).toBeInTheDocument()
  })
})
