import { z } from 'zod'

export const statusSchema = z.enum([
  'active',
  'seasonal_unknown',
  'temporarily_unavailable',
  'closed',
])

const isoDatetimeSchema = z.string().datetime({ offset: true })
const nonNegativeNumberSchema = z.number().nonnegative()

export const boundarySchema = z.object({
  min: nonNegativeNumberSchema,
  max: nonNegativeNumberSchema,
}).refine(({ min, max }) => min <= max, {
  message: 'min must be less than or equal to max',
  path: ['max'],
})

export const fieldSourceSchema = z.object({
  source: z.string().url(),
  retrieved_at: isoDatetimeSchema,
  confidence: z.number().min(0).max(1),
  notes: z.string().optional(),
})

export const resortRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  country: z.string(),
  region: z.string(),
  status: statusSchema,
  overall_confidence: z.number().min(0).max(1),
  source_urls: z.array(z.string().url()),
  field_sources: z.record(fieldSourceSchema),
  piste_km: nonNegativeNumberSchema.optional(),
  lift_count: nonNegativeNumberSchema.optional(),
  vertical_drop_m: nonNegativeNumberSchema.optional(),
  base_elevation_m: nonNegativeNumberSchema.optional(),
  top_elevation_m: nonNegativeNumberSchema.optional(),
  lift_pass_day_eur: nonNegativeNumberSchema.optional(),
  estimated_trip_cost_3_days_eur: nonNegativeNumberSchema.optional(),
  glacier_access: z.boolean().optional(),
  snow_reliability_proxy: z.number().min(0).max(1).optional(),
  transfer_complexity: z.number().min(0).max(1).optional(),
  size_category_official: z.enum(['Small', 'Medium', 'Large', 'Mega']).optional(),
  size_category_practical: z.enum(['Small', 'Medium', 'Large', 'Mega']).optional(),
  price_category_ski_only: z
    .enum(['Budget', 'Midrange', 'Premium', 'Luxury'])
    .optional(),
  price_category_trip_cost: z
    .enum(['Budget', 'Midrange', 'Premium', 'Luxury'])
    .optional(),
  size_score: nonNegativeNumberSchema.optional(),
  value_score: nonNegativeNumberSchema.optional(),
  snow_score: nonNegativeNumberSchema.optional(),
  access_score: nonNegativeNumberSchema.optional(),
  overall_score: nonNegativeNumberSchema.optional(),
})

export const publishedDatasetSchema = z.object({
  version: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z$/),
  generated_at: isoDatetimeSchema,
  scoring: z.object({
    normalization: z.literal('min-max'),
    boundaries: z.record(boundarySchema),
  }),
  resorts: z.array(resortRecordSchema),
})
