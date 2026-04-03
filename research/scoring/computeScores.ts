import {
  scoreWeights,
  sizeThresholds,
  skiOnlyPriceThresholds,
  tripPriceThresholds,
} from '../../config/scoring'

function minMax(values: number[]) {
  if (values.length === 0) {
    return { min: 0, max: 0 }
  }

  return { min: Math.min(...values), max: Math.max(...values) }
}

function normalize(
  value: number | undefined,
  boundary: { min: number; max: number },
  invert = false,
) {
  if (value === undefined) return 0
  if (boundary.max === boundary.min) return 1

  const raw = (value - boundary.min) / (boundary.max - boundary.min)
  return invert ? 1 - raw : raw
}

function definedNumbers(values: Array<number | undefined>) {
  return values.filter((value): value is number => value !== undefined)
}

function sizeBucket(
  value: number,
  thresholds: { medium: number; large: number; mega: number },
) {
  if (value >= thresholds.mega) return 'Mega'
  if (value >= thresholds.large) return 'Large'
  if (value >= thresholds.medium) return 'Medium'
  return 'Small'
}

function priceBucket(
  value: number,
  thresholds: { budget: number; midrange: number; premium: number },
) {
  if (value <= thresholds.budget) return 'Budget'
  if (value <= thresholds.midrange) return 'Midrange'
  if (value <= thresholds.premium) return 'Premium'
  return 'Luxury'
}

function priceBucketOptional(
  value: number | undefined,
  thresholds: { budget: number; midrange: number; premium: number },
) {
  if (value === undefined) return undefined
  return priceBucket(value, thresholds)
}

export function computeScores<
  T extends {
    piste_km?: number
    vertical_drop_m?: number
    lift_count?: number
    lift_pass_day_eur?: number
    estimated_trip_cost_3_days_eur?: number
    snow_reliability_proxy?: number
    transfer_complexity?: number
  },
>(resorts: T[]) {
  const pisteBoundary = minMax(definedNumbers(resorts.map((resort) => resort.piste_km)))
  const skiPriceBoundary = minMax(
    definedNumbers(resorts.map((resort) => resort.lift_pass_day_eur)),
  )
  const tripBoundary = minMax(
    definedNumbers(resorts.map((resort) => resort.estimated_trip_cost_3_days_eur)),
  )

  const scored = resorts.map((resort) => {
    const practicalSizeValue =
      (resort.piste_km ?? 0) +
      (resort.vertical_drop_m ?? 0) / 100 +
      (resort.lift_count ?? 0)

    const sizeScore = normalize(resort.piste_km, pisteBoundary)
    const valueScore =
      normalize(resort.lift_pass_day_eur, skiPriceBoundary, true) * 0.5 +
      normalize(
        resort.estimated_trip_cost_3_days_eur,
        tripBoundary,
        true,
      ) *
        0.5
    const snowScore = resort.snow_reliability_proxy ?? 0
    const accessScore = 1 - (resort.transfer_complexity ?? 1)

    return {
      ...resort,
      size_category_official: sizeBucket(
        resort.piste_km ?? 0,
        sizeThresholds.official,
      ),
      size_category_practical: sizeBucket(
        practicalSizeValue,
        sizeThresholds.practical,
      ),
      price_category_ski_only: priceBucketOptional(
        resort.lift_pass_day_eur,
        skiOnlyPriceThresholds,
      ),
      price_category_trip_cost: priceBucketOptional(
        resort.estimated_trip_cost_3_days_eur,
        tripPriceThresholds,
      ),
      size_score: sizeScore,
      value_score: valueScore,
      snow_score: snowScore,
      access_score: accessScore,
      overall_score:
        sizeScore * scoreWeights.size +
        valueScore * scoreWeights.value +
        snowScore * scoreWeights.snow +
        accessScore * scoreWeights.access,
    }
  })

  return {
    resorts: scored,
    boundaries: {
      piste_km: pisteBoundary,
      lift_pass_day_eur: skiPriceBoundary,
      estimated_trip_cost_3_days_eur: tripBoundary,
    },
  }
}
