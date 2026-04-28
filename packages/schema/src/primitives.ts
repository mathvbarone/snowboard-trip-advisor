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

// PR 2.2 (ADR-0003): FX provenance for non-Eurozone Money fields. The fx sub-object is OPTIONAL on
// FieldSource because (a) EUR-native upstreams legitimately omit it, and (b) Phase 1 manual fixtures
// MAY include it for transparency but aren't forced to. Conditional enforcement (presence required
// when source is in KNOWN_NON_EUR_SOURCES) is deferred to Epic 5 PR 5.x per the ai-clean-code-adherence
// audit — Phase 1 has zero non-EUR adapter sources, so the table + validator branch ship together
// alongside the first real adapter.
export const FxProvenance = z.object({
  source: z.literal('ecb-reference-rate'),                  // Phase 1: ECB only; widening = schema_version bump
  observed_at: ISODateTimeString,                           // ECB rates publish ~16:00 CET end-of-day TARGET
  rate: z.number().nonnegative(),                           // EUR per native unit
  native_amount: z.number().nonnegative(),                  // amount in native currency
  native_currency: z.enum(['PLN', 'CZK', 'CHF', 'GBP', 'NOK', 'SEK', 'DKK', 'HUF', 'RON', 'BGN']),
})
export type FxProvenance = z.infer<typeof FxProvenance>

export const FieldSource = z.object({
  source: SourceKey,
  source_url: z.string().regex(/^https:/),
  observed_at: ISODateTimeString,
  fetched_at: ISODateTimeString,
  upstream_hash: UpstreamHash,
  attribution_block: LocalizedString,
  fx: FxProvenance.optional(),                              // ADR-0003
})
export type FieldSource = z.infer<typeof FieldSource>
