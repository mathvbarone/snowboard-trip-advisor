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

export type NormalizedResort = {
  id: string
  name: string
  country: string
  region: string
  status: 'active'
  overall_confidence: number
  source_urls: string[]
  field_sources: {
    piste_km: Omit<SourceField, 'value'>
    lift_pass_day_eur: Omit<SourceField, 'value'>
  }
  piste_km: number
  lift_pass_day_eur: number
}

function requireField(source: SourceRecord, key: string): SourceField {
  if (!Object.hasOwn(source.fields, key)) {
    throw new Error(`Missing required field: ${key}`)
  }

  return source.fields[key]
}

function parseNumericField(
  source: SourceRecord,
  key: string,
): { field: SourceField; value: number } {
  const field = requireField(source, key)

  if (typeof field.value === 'string') {
    if (field.value.trim() === '') {
      throw new Error(`Invalid numeric value for field: ${key}`)
    }
  }

  const parsed =
    typeof field.value === 'number' ? field.value : Number(field.value)

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value for field: ${key}`)
  }

  return { field, value: parsed }
}

export function normalizeResort(source: SourceRecord): NormalizedResort {
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
