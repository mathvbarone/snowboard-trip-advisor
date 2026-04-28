// Design-system formatters. All signatures take destructured primitives —
// never schema branded types, never the FieldValue<T> envelope. Renderers
// like FieldValueRenderer (PR 3.2) extract primitives from FieldValue and
// dispatch into a typed-key formatter map; this file owns that map's
// implementations.

const LOCALE = 'en-GB'

export function formatNumber({
  value,
  maximumFractionDigits = 0,
}: {
  value: number
  maximumFractionDigits?: number
}): string {
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits }).format(value)
}

export function formatMoney({
  amount,
  currency,
  maximumFractionDigits = 0,
}: {
  amount: number
  currency: string
  maximumFractionDigits?: number
}): string {
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    maximumFractionDigits,
  }).format(amount)
}

export function formatPercent({
  ratio,
  maximumFractionDigits = 0,
}: {
  ratio: number
  maximumFractionDigits?: number
}): string {
  return new Intl.NumberFormat(LOCALE, {
    style: 'percent',
    maximumFractionDigits,
  }).format(ratio)
}

const MONTH_LABELS: ReadonlyArray<string> = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function monthLabel(monthIndex: number): string {
  // Months are 1-indexed (Jan=1, Dec=12) per the schema's season type;
  // out-of-range values fall back to a positional placeholder rather than
  // throw because the formatter's contract is "best-effort display".
  return MONTH_LABELS[monthIndex - 1] ?? `M${String(monthIndex)}`
}

export function formatMonths({
  start,
  end,
}: {
  start: number
  end: number
}): string {
  if (start === end) {
    return monthLabel(start)
  }
  return `${monthLabel(start)}–${monthLabel(end)}`         // en-dash for ranges
}

export function formatDateRelative({
  iso,
  now,
}: {
  iso: string
  now: Date
}): string {
  const then = new Date(iso)
  const diffMs = then.getTime() - now.getTime()
  const dayMs = 24 * 60 * 60 * 1000
  const diffDays = Math.round(diffMs / dayMs)
  if (diffDays === 0) {
    return 'today'
  }
  if (Math.abs(diffDays) > 7) {
    return new Intl.DateTimeFormat(LOCALE, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(then)
  }
  if (diffDays > 0) {
    return diffDays === 1 ? 'in 1 day' : `in ${String(diffDays)} days`
  }
  const past = -diffDays
  return past === 1 ? '1 day ago' : `${String(past)} days ago`
}
