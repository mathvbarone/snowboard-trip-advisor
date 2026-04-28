import { describe, expect, it } from 'vitest'

import {
  formatDateRelative,
  formatMoney,
  formatMonths,
  formatNumber,
  formatPercent,
  FORMATTERS,
} from './format'

describe('formatNumber', (): void => {
  it('formats integers with thousands grouping (en-GB)', (): void => {
    expect(formatNumber({ value: 1234 })).toBe('1,234')
  })

  it('respects the maximumFractionDigits option', (): void => {
    expect(formatNumber({ value: 12.345, maximumFractionDigits: 1 })).toBe('12.3')
  })

  it('defaults to zero fraction digits', (): void => {
    expect(formatNumber({ value: 12.7 })).toBe('13')
  })
})

describe('formatMoney', (): void => {
  it('formats EUR amounts with symbol', (): void => {
    expect(formatMoney({ amount: 49, currency: 'EUR' })).toBe('€49')
  })

  it('rounds to whole units by default', (): void => {
    expect(formatMoney({ amount: 49.95, currency: 'EUR' })).toBe('€50')
  })

  it('formats other currencies via the same Intl pipeline', (): void => {
    // PLN / CZK appear post-FX-conversion in Phase 2, but the formatter
    // should not hard-code EUR.
    expect(formatMoney({ amount: 100, currency: 'PLN' })).toMatch(/100/)
  })
})

describe('formatPercent', (): void => {
  it('formats fractional ratios as percent', (): void => {
    expect(formatPercent({ ratio: 0.42 })).toBe('42%')
  })

  it('rounds to whole percent by default', (): void => {
    expect(formatPercent({ ratio: 0.4267 })).toBe('43%')
  })

  it('honours maximumFractionDigits', (): void => {
    expect(formatPercent({ ratio: 0.4267, maximumFractionDigits: 1 })).toBe('42.7%')
  })
})

describe('formatMonths', (): void => {
  it('renders a (start, end) pair as "Mon–Mon"', (): void => {
    // 12 = December, 4 = April. Locale 'en-GB' short month names.
    expect(formatMonths({ start: 12, end: 4 })).toBe('Dec–Apr')
  })

  it('renders a single-month season as "Mon"', (): void => {
    expect(formatMonths({ start: 1, end: 1 })).toBe('Jan')
  })

  it('falls back to a positional placeholder for out-of-range months', (): void => {
    // Defensive branch: schema constrains months to 1..12, but the formatter
    // is best-effort to avoid throwing on a publishing bug. The fallback
    // string is exercised here for branch coverage.
    expect(formatMonths({ start: 13, end: 13 })).toBe('M13')
  })
})

describe('formatDateRelative', (): void => {
  const NOW = new Date('2026-04-28T12:00:00Z')

  it('renders today as "today"', (): void => {
    expect(formatDateRelative({ iso: '2026-04-28T08:00:00Z', now: NOW })).toBe('today')
  })

  it('renders yesterday as "1 day ago"', (): void => {
    expect(formatDateRelative({ iso: '2026-04-27T12:00:00Z', now: NOW })).toBe('1 day ago')
  })

  it('renders 5-days-ago as "5 days ago"', (): void => {
    expect(formatDateRelative({ iso: '2026-04-23T12:00:00Z', now: NOW })).toBe('5 days ago')
  })

  it('renders future-day as "in 1 day"', (): void => {
    expect(formatDateRelative({ iso: '2026-04-29T12:00:00Z', now: NOW })).toBe('in 1 day')
  })

  it('renders multi-day futures as "in N days"', (): void => {
    expect(formatDateRelative({ iso: '2026-05-01T12:00:00Z', now: NOW })).toBe('in 3 days')
  })

  it('renders >7 days as "Apr 12, 2026" (absolute fallback)', (): void => {
    expect(formatDateRelative({ iso: '2026-04-12T08:00:00Z', now: NOW })).toMatch(/Apr.*2026/)
  })
})

describe('FORMATTERS dispatch', (): void => {
  it('dispatches "number" to formatNumber', (): void => {
    expect(FORMATTERS.number(27)).toBe('27')
  })

  it('dispatches "money" to formatMoney', (): void => {
    expect(FORMATTERS.money({ amount: 51, currency: 'EUR' })).toBe('€51')
  })

  it('dispatches "months" to formatMonths via {start_month, end_month}', (): void => {
    expect(FORMATTERS.months({ start_month: 12, end_month: 4 })).toBe('Dec–Apr')
  })

  it('dispatches "altitude" to a min–max range string', (): void => {
    expect(FORMATTERS.altitude({ min: 715, max: 1310 })).toBe('715–1,310')
  })

  it('dispatches "liftsOpen" to "count/total"', (): void => {
    expect(FORMATTERS.liftsOpen({ count: 7, total: 7 })).toBe('7/7')
  })

  it('dispatches "lodging" to a money + sample-size string', (): void => {
    expect(
      FORMATTERS.lodging({
        amount: { amount: 120, currency: 'EUR' },
        sample_size: 12,
      }),
    ).toBe('€120 (n=12)')
  })
})
