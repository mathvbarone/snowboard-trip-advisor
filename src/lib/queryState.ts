const MAX_COMPARE_IDS = 4

function normalizeIds(ids: string[]) {
  return Array.from(
    new Set(ids.map((id) => id.trim()).filter(Boolean)),
  ).slice(0, MAX_COMPARE_IDS)
}

export function parseCompareIds(search: string): string[] {
  const params = new URLSearchParams(search)
  const values = params
    .getAll('compare')
    .flatMap((value) => value.split(','))

  return normalizeIds(values)
}

export function serializeCompareIds(ids: string[]): string {
  const normalizedIds = normalizeIds(ids)

  return normalizedIds.length ? `?compare=${normalizedIds.join(',')}` : ''
}
