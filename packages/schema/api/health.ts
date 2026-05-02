import { z } from 'zod'

import { ISODateTimeString } from '../src/branded'

export const HealthQuery = z.object({})
export type HealthQuery = z.infer<typeof HealthQuery>

export const HealthResponse = z.object({
  resorts_total: z.number().int().nonnegative(),
  resorts_with_stale_fields: z.number().int().nonnegative(),
  resorts_with_failed_fields: z.number().int().nonnegative(),
  resorts_with_missing_provenance: z.number().int().nonnegative(),
  resorts_with_corrupt_workspace: z.number().int().nonnegative(),
  pending_integration_errors: z.number().int().nonnegative(),
  last_published_at: ISODateTimeString.nullable(),
  archive_size_bytes: z.number().int().nonnegative(),
})
export type HealthResponse = z.infer<typeof HealthResponse>
