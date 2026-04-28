import { ISODateTimeString } from '@snowboard-trip-advisor/schema'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { describe, expect, it } from 'vitest'

import { FieldValueRenderer } from './FieldValueRenderer'

// Test fixtures must satisfy the branded ISODateTimeString. Use the schema
// parser (the only Phase-1 path to a branded value); the brand-cast ESLint
// rule bans `as ISODateTimeString` casts.
const OBSERVED_FRESH = ISODateTimeString.parse('2026-04-26T08:00:00Z')
const OBSERVED_STALE = ISODateTimeString.parse('2026-04-12T08:00:00Z')

describe('FieldValueRenderer', (): void => {
  describe('fresh state', (): void => {
    it('renders the formatted value, suffixed by the unit', (): void => {
      render(
        <FieldValueRenderer
          field={{
            state: 'fresh',
            value: 27,
            source: 'manual',
            observed_at: OBSERVED_FRESH,
          }}
          formatter="number"
          unit="km"
        />,
      )
      expect(screen.getByText('27 km')).toBeInTheDocument()
    })

    it('renders the SourceBadge for the field source', (): void => {
      render(
        <FieldValueRenderer
          field={{
            state: 'fresh',
            value: 27,
            source: 'opensnow',
            observed_at: OBSERVED_FRESH,
          }}
          formatter="number"
        />,
      )
      // SourceBadge renders the display name "OpenSnow".
      expect(screen.getByText('OpenSnow')).toBeInTheDocument()
    })

    it('exposes an observed_at tooltip via a focusable info trigger', async (): Promise<void> => {
      const user = userEvent.setup()
      render(
        <FieldValueRenderer
          field={{
            state: 'fresh',
            value: 27,
            source: 'manual',
            observed_at: OBSERVED_FRESH,
          }}
          formatter="number"
        />,
      )
      // Tab to the provenance info trigger.
      await user.tab()
      const tooltip = await screen.findByRole('tooltip')
      // Tooltip body contains the observed_at ISO string (or a derived
      // human label — we assert against the iso prefix).
      expect(tooltip).toHaveTextContent(/2026-04-26/)
    })

    it('does NOT render the stale Pill when state is fresh', (): void => {
      render(
        <FieldValueRenderer
          field={{
            state: 'fresh',
            value: 27,
            source: 'manual',
            observed_at: OBSERVED_FRESH,
          }}
          formatter="number"
        />,
      )
      // No "stale value" sr-only string from <Pill variant="stale">.
      expect(screen.queryByText('stale value')).toBeNull()
    })

    it('formats Money via the "money" formatter', (): void => {
      render(
        <FieldValueRenderer
          field={{
            state: 'fresh',
            value: { amount: 51, currency: 'EUR' },
            source: 'manual',
            observed_at: OBSERVED_FRESH,
          }}
          formatter="money"
        />,
      )
      expect(screen.getByText('€51')).toBeInTheDocument()
    })
  })

  describe('stale state', (): void => {
    it('renders the value, the stale Pill, and an age-days tooltip', async (): Promise<void> => {
      const user = userEvent.setup()
      render(
        <FieldValueRenderer
          field={{
            state: 'stale',
            value: 27,
            source: 'manual',
            observed_at: OBSERVED_STALE,
            age_days: 16,
          }}
          formatter="number"
          unit="km"
        />,
      )
      expect(screen.getByText('27 km')).toBeInTheDocument()
      // <Pill variant="stale"> emits the SR-only "stale value" announcement.
      expect(screen.getByText('stale value')).toBeInTheDocument()
      // Tooltip mentions the age in days.
      await user.tab()
      const tooltip = await screen.findByRole('tooltip')
      expect(tooltip).toHaveTextContent(/16/)
    })
  })

  describe('never_fetched state', (): void => {
    it('renders missingLabel + missingTooltip when no value is available', async (): Promise<void> => {
      const user = userEvent.setup()
      render(
        <FieldValueRenderer
          field={{ state: 'never_fetched' }}
          formatter="number"
          missingLabel="—"
          missingTooltip="No live data yet"
        />,
      )
      expect(screen.getByText('—')).toBeInTheDocument()
      await user.tab()
      const tooltip = await screen.findByRole('tooltip')
      expect(tooltip).toHaveTextContent('No live data yet')
    })

    it('falls back to a sensible default missingLabel when none is supplied', (): void => {
      render(
        <FieldValueRenderer
          field={{ state: 'never_fetched' }}
          formatter="number"
        />,
      )
      // En-dash is the default placeholder.
      expect(screen.getByText('—')).toBeInTheDocument()
    })

    it('does not show a tooltip if no missingTooltip is supplied', async (): Promise<void> => {
      const user = userEvent.setup()
      render(
        <FieldValueRenderer
          field={{ state: 'never_fetched' }}
          formatter="number"
          missingLabel="—"
        />,
      )
      await user.tab()
      // No focusable info trigger, so no tooltip surface.
      expect(screen.queryByRole('tooltip')).toBeNull()
    })
  })

  describe('axe', (): void => {
    it('is axe-clean across fresh / stale / never_fetched', async (): Promise<void> => {
      const { container, rerender } = render(
        <FieldValueRenderer
          field={{
            state: 'fresh',
            value: 27,
            source: 'manual',
            observed_at: OBSERVED_FRESH,
          }}
          formatter="number"
          unit="km"
        />,
      )
      expect(await axe(container)).toHaveNoViolations()
      rerender(
        <FieldValueRenderer
          field={{
            state: 'stale',
            value: 27,
            source: 'manual',
            observed_at: OBSERVED_STALE,
            age_days: 16,
          }}
          formatter="number"
          unit="km"
        />,
      )
      expect(await axe(container)).toHaveNoViolations()
      rerender(
        <FieldValueRenderer
          field={{ state: 'never_fetched' }}
          formatter="number"
          missingLabel="—"
          missingTooltip="No live data yet"
        />,
      )
      expect(await axe(container)).toHaveNoViolations()
    })
  })
})
