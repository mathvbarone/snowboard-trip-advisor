import { publishedDatasetSchema } from '../schema'

export function validatePublishedDataset(input: unknown) {
  const dataset = publishedDatasetSchema.parse(input)

  for (const resort of dataset.resorts) {
    const requiredSources = [
      ['piste_km', resort.piste_km],
      ['lift_pass_day_eur', resort.lift_pass_day_eur],
      ['estimated_trip_cost_3_days_eur', resort.estimated_trip_cost_3_days_eur],
    ] as const

    for (const [field, value] of requiredSources) {
      if (value !== undefined && !resort.field_sources[field]) {
        throw new Error(`Missing field source for published field: ${field}`)
      }
    }

    const hasDerivedInputs =
      resort.piste_km !== undefined || resort.lift_pass_day_eur !== undefined

    if (hasDerivedInputs) {
      const derivedFields = [
        resort.size_category_official,
        resort.price_category_ski_only,
        resort.overall_score,
      ]

      if (derivedFields.some((value) => value === undefined)) {
        throw new Error(`Missing derived published fields for resort: ${resort.id}`)
      }
    }
  }

  return dataset
}
