function createFormatter(
  options: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  return new Intl.NumberFormat('en-IE', options)
}

export function formatEuro(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—'
  }

  return createFormatter({
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatInteger(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—'
  }

  return createFormatter({ maximumFractionDigits: 0 }).format(value)
}

export function formatPercent(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—'
  }

  return createFormatter({
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatConfidence(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'Unknown confidence'
  }

  if (value >= 0.8) {
    return 'High confidence'
  }

  if (value >= 0.5) {
    return 'Medium confidence'
  }

  return 'Low confidence'
}
