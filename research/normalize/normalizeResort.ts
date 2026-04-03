export type SourceField = {
  value: number | string | boolean
  source: string
  retrieved_at: string
  confidence: number
}

export type SourceRecord = {
  id: string
  name: string
  country: string
  region: string
  source_urls: string[]
  fields: Record<string, SourceField>
}

export function normalizeResort(source: SourceRecord) {
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
        source: source.fields.piste_km.source,
        retrieved_at: source.fields.piste_km.retrieved_at,
        confidence: source.fields.piste_km.confidence,
      },
      lift_pass_day_eur: {
        source: source.fields.lift_pass_day_eur.source,
        retrieved_at: source.fields.lift_pass_day_eur.retrieved_at,
        confidence: source.fields.lift_pass_day_eur.confidence,
      },
    },
    piste_km: Number(source.fields.piste_km.value),
    lift_pass_day_eur: Number(source.fields.lift_pass_day_eur.value),
  }
}
