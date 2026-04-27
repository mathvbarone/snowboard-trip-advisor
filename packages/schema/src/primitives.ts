import { z } from 'zod'

import { ISODateTimeString, UpstreamHash } from './branded'

export const Money = z.object({
  amount: z.number(),
  currency: z.literal('EUR')
})
export type Money = z.infer<typeof Money>

export const LocalizedString = z.object({ en: z.string() }).catchall(z.string())
export type LocalizedString = z.infer<typeof LocalizedString>

export const PublishState = z.enum(['draft', 'published'])
export type PublishState = z.infer<typeof PublishState>

// Spec note: §7.2 lists 5 adapter sources; §5.1.1 says published `FieldSource.source` can also be
// `'manual'` when the admin sets a value manually. We model these as two distinct enums to keep the
// registry's mapped type clean (no `Exclude<>` gymnastics) and the FieldSource discriminator faithful.
export const AdapterSourceKey = z.enum(['opensnow', 'resort-feed', 'booking', 'airbnb', 'snowforecast'])
export type AdapterSourceKey = z.infer<typeof AdapterSourceKey>

export const SourceKey = z.enum(['opensnow', 'resort-feed', 'booking', 'airbnb', 'snowforecast', 'manual'])
export type SourceKey = z.infer<typeof SourceKey>

export const FieldSource = z.object({
  source: SourceKey,
  source_url: z.string().regex(/^https:/),
  observed_at: ISODateTimeString,
  fetched_at: ISODateTimeString,
  upstream_hash: UpstreamHash,
  attribution_block: LocalizedString
})
export type FieldSource = z.infer<typeof FieldSource>
