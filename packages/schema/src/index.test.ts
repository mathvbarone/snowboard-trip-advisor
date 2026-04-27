import { describe, expect, it } from 'vitest'

import {
  ResortSlug,
  UpstreamHash,
  ISOCountryCode,
  ISODateTimeString,
  Money,
  LocalizedString,
  PublishState,
  AdapterSourceKey,
  SourceKey,
  FieldSource,
  FxProvenance,
  METRIC_FIELDS,
  Resort,
  ResortLiveSignal,
  PublishedDataset,
  validatePublishedDataset,
  publishDataset,
  loadResortDataset,
  FRESHNESS_TTL_DAYS,
} from './index'

describe('package barrel (index.ts)', (): void => {
  it('re-exports every Zod schema and constant the public API needs', (): void => {
    // Smoke check: each export resolves to a defined value at runtime.
    // Catches accidental mis-spellings or dropped exports in the barrel.
    expect(ResortSlug).toBeDefined()
    expect(UpstreamHash).toBeDefined()
    expect(ISOCountryCode).toBeDefined()
    expect(ISODateTimeString).toBeDefined()
    expect(Money).toBeDefined()
    expect(LocalizedString).toBeDefined()
    expect(PublishState).toBeDefined()
    expect(AdapterSourceKey).toBeDefined()
    expect(SourceKey).toBeDefined()
    expect(FieldSource).toBeDefined()
    expect(METRIC_FIELDS).toBeDefined()
    expect(Resort).toBeDefined()
    expect(ResortLiveSignal).toBeDefined()
    expect(PublishedDataset).toBeDefined()
    expect(FxProvenance).toBeDefined()
    expect(validatePublishedDataset).toBeDefined()
    expect(publishDataset).toBeDefined()
    expect(loadResortDataset).toBeDefined()
    expect(FRESHNESS_TTL_DAYS).toBeDefined()
  })
})
