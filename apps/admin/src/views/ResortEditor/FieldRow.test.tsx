import { ISODateTimeString, type FieldStateFor } from '@snowboard-trip-advisor/schema'
import { render, screen, within } from '@testing-library/react'
import { axe } from 'jest-axe'
import { describe, expect, it } from 'vitest'

import { FieldRow, formatMetricValue, labelForPath } from './FieldRow'

const OBS_AT = ISODateTimeString.parse('2026-04-29T08:00:00Z')

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

// PR 4.4b Task 1 — formatMetricValue + labelForPath tests.
// Per Decision D2 (formatters): exhaustive switch on MetricPath; out-of-range
// or missing parts → '—'; never throws. Money formatting uses Intl.NumberFormat
// with `currency: 'EUR'` (Money.currency is z.literal('EUR') in
// packages/schema/src/primitives.ts:5-9; non-EUR upstream prices live on
// field_sources.<path>.fx.native_currency per ADR-0003 — Codex round-8 P2-11
// fold corrected the v9 plan's `currency: 'PLN'` test to EUR).

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
    // Per D2: locale undefined uses runtime default; assert via the same
    // construction so the test stays portable across runners.
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
    // Defensive — formatter never throws.
    expect(formatMetricValue('lift_pass_day', 50)).toBe('—')
    expect(formatMetricValue('slopes_km', { amount: 1, currency: 'EUR' })).toBe('—')
  })

  it('returns "—" for Money objects whose currency is not the EUR literal', (): void => {
    // Defends against upstream wire mistakes; the schema rejects non-EUR Money
    // before the formatter sees it (per ADR-0003 + Codex round-8 P2-11), but
    // the formatter still falls back rather than rendering bogus output.
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
    // No source badge for the failed state — failed has no provenance to show.
    expect(within(row).queryByText('OpenSnow')).toBeNull()
    expect(within(row).queryByText('Resort Feed')).toBeNull()
    expect(within(row).queryByText('Manual')).toBeNull()
  })

  it('renders the StatusPill (manual) and a Manual source badge for a manual state', (): void => {
    render(<FieldRow path="lift_count" state={manualState(7)} />)
    const row = screen.getByLabelText('Lift count')
    expect(within(row).getByText('7')).toBeInTheDocument()
    // "Manual" appears three times in this state (StatusPill, SourceBadge,
    // ModeToggle); use the typed data attributes the DS primitives expose to
    // assert each one independently of DOM-text count.
    expect(row.querySelector('[data-variant="manual"]')).not.toBeNull()
    expect(row.querySelector('[data-source="manual"]')).not.toBeNull()
  })

  it('renders an inline render-only ModeToggle (span role="switch" aria-disabled) — aria-checked tracks the manual state', (): void => {
    const { rerender } = render(<FieldRow path="slopes_km" state={liveState(10)} />)
    const liveToggle = screen.getByRole('switch')
    expect(liveToggle.tagName).toBe('SPAN')
    expect(liveToggle).toHaveAttribute('aria-disabled', 'true')
    expect(liveToggle).toHaveAttribute('aria-checked', 'false')

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
