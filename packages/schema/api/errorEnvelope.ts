import { z } from 'zod'

export const ErrorCode = z.enum([
  'invalid-request',
  'invalid-resort',
  'not-found',
  'not-implemented',
  'publish-validation-failed',
  'workspace-corrupt',
  'internal',
])
export type ErrorCode = z.infer<typeof ErrorCode>

export const ErrorEnvelope = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    details: z.unknown().optional(),
  }),
})
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>
