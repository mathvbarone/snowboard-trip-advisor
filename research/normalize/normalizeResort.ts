export type SourceField = {
  value: number | string
  source: string
  retrieved_at: string
  confidence: number
  notes?: string
}

export type SourceRecord = {
  id: string
  name: string
  country: string
  region: string
  source_urls: string[]
  fields: Record<string, SourceField>
}

function requireField(source: SourceRecord, key: string) {
  const field = source.fields[key]

  if (!field) {
    throw new Error(`Missing required field: ${key}`)
  }

  return field
}

function parseNumericField(source: SourceRecord, key: string) {
  const field = requireField(source, key)
  if (typeof field.value === 'string' && field.value.trim() === '') {
    throw new Error(`Invalid numeric value for field: ${key}`)
  }

  const parsed = typeof field.value === 'number' ? field.value : Number(field.value)

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value for field: ${key}`)
  }

  return { field, value: parsed }
}

export function normalizeResort(source: SourceRecord) {
  const pisteKm = parseNumericField(source, 'piste_km')
  const liftPassDay = parseNumericField(source, 'lift_pass_day_eur')

  return {
    id: source.id,
    name: source.name,
    country: source.country,
    region: source.region,
    status: 'active' as const,
    overall_confidence: 0.9,
    source_urls: source.source_urls,
    field_sources: {
      piste_km: {
        source: pisteKm.field.source,
        retrieved_at: pisteKm.field.retrieved_at,
        confidence: pisteKm.field.confidence,
        notes: pisteKm.field.notes,
      },
      lift_pass_day_eur: {
        source: liftPassDay.field.source,
        retrieved_at: liftPassDay.field.retrieved_at,
        confidence: liftPassDay.field.confidence,
        notes: liftPassDay.field.notes,
      },
    },
    piste_km: pisteKm.value,
    lift_pass_day_eur: liftPassDay.value,
  }
}
