import { describe, expect, it } from 'vitest'

import { Money, LocalizedString, FieldSource, PublishState, SourceKey, AdapterSourceKey, FxProvenance } from './primitives'

describe('Money', (): void => {
  it('parses { amount: number, currency: "EUR" }', (): void => {
    expect(Money.parse({ amount: 12.5, currency: 'EUR' })).toEqual({ amount: 12.5, currency: 'EUR' })
  })
  it('rejects non-EUR currencies in Phase 1', (): void => {
    expect(() => Money.parse({ amount: 12.5, currency: 'USD' })).toThrow()
  })
})

describe('LocalizedString', (): void => {
  it('requires `en` and accepts other lang keys', (): void => {
    expect(LocalizedString.parse({ en: 'hello' })).toEqual({ en: 'hello' })
    expect(LocalizedString.parse({ en: 'hello', fr: 'bonjour' })).toEqual({ en: 'hello', fr: 'bonjour' })
  })
  it('rejects when `en` is missing', (): void => {
    expect(() => LocalizedString.parse({ fr: 'bonjour' })).toThrow()
  })
})

describe('PublishState', (): void => {
  it('accepts only "draft" or "published" in Phase 1', (): void => {
    expect(PublishState.parse('draft')).toBe('draft')
    expect(PublishState.parse('published')).toBe('published')
    expect(() => PublishState.parse('approved')).toThrow()
  })
})

describe('AdapterSourceKey', (): void => {
  it.each(['opensnow', 'resort-feed', 'booking', 'airbnb', 'snowforecast'])(
    'accepts %s (registry-keyed, spec §7.2)',
    (key): void => {
      expect(AdapterSourceKey.parse(key)).toBe(key)
    }
  )
  it('rejects "manual" — the registry never holds a manual adapter', (): void => {
    expect(() => AdapterSourceKey.parse('manual')).toThrow()
  })
})

describe('SourceKey', (): void => {
  it.each(['opensnow', 'resort-feed', 'booking', 'airbnb', 'snowforecast', 'manual'])(
    'accepts %s (FieldSource.source values, spec §5.1.1)',
    (key): void => {
      expect(SourceKey.parse(key)).toBe(key)
    }
  )
  it('rejects unknown sources', (): void => {
    expect(() => SourceKey.parse('weatherchannel')).toThrow()
  })
})

describe('FxProvenance (PR 2.2)', (): void => {
  const validFx = {
    source: 'ecb-reference-rate' as const,
    observed_at: '2026-04-26T16:00:00Z',
    rate: 0.231,
    native_amount: 220,
    native_currency: 'PLN' as const,
  }

  it('parses a valid FX provenance block', (): void => {
    expect(FxProvenance.parse(validFx)).toEqual(validFx)
  })

  it('rejects unknown native currencies (Phase 1 enum is finite)', (): void => {
    expect(() => FxProvenance.parse({ ...validFx, native_currency: 'USD' })).toThrow()
  })

  it('rejects unknown FX source (Phase 1 = ECB reference rate only)', (): void => {
    expect(() => FxProvenance.parse({ ...validFx, source: 'oanda' })).toThrow()
  })

  it('rejects negative rate', (): void => {
    expect(() => FxProvenance.parse({ ...validFx, rate: -0.1 })).toThrow()
  })

  it('rejects negative native_amount', (): void => {
    expect(() => FxProvenance.parse({ ...validFx, native_amount: -10 })).toThrow()
  })
})

describe('FieldSource.fx (PR 2.2)', (): void => {
  const baseFs = {
    source: 'manual' as const,
    source_url: 'https://example.com/x',
    observed_at: '2026-04-26T08:00:00Z',
    fetched_at: '2026-04-26T08:00:01Z',
    upstream_hash: 'a'.repeat(64),
    attribution_block: { en: 'Source: example' },
  }

  it('parses without fx (FieldSource.fx is optional)', (): void => {
    expect(FieldSource.parse(baseFs)).toEqual(baseFs)
  })

  it('parses with a valid fx sub-object', (): void => {
    const withFx = {
      ...baseFs,
      fx: {
        source: 'ecb-reference-rate',
        observed_at: '2026-04-26T16:00:00Z',
        rate: 0.231,
        native_amount: 220,
        native_currency: 'PLN',
      },
    }
    expect(FieldSource.parse(withFx)).toMatchObject({ fx: { native_currency: 'PLN' } })
  })

  it('rejects an invalid fx sub-object', (): void => {
    expect(() => FieldSource.parse({
      ...baseFs,
      fx: { source: 'oanda', observed_at: '2026-04-26T16:00:00Z', rate: 0.231, native_amount: 220, native_currency: 'PLN' },
    })).toThrow()
  })
})

describe('FieldSource', (): void => {
  const valid = {
    source: 'opensnow' as const,
    source_url: 'https://opensnow.com/x',
    observed_at: '2026-04-26T12:00:00Z',
    fetched_at: '2026-04-26T12:00:01Z',
    upstream_hash: 'a'.repeat(64),
    attribution_block: { en: 'Source: OpenSnow' }
  }
  it('parses a valid field source', (): void => {
    expect(FieldSource.parse(valid)).toEqual(valid)
  })
  it('rejects http: source URLs', (): void => {
    expect(() => FieldSource.parse({ ...valid, source_url: 'http://opensnow.com/x' })).toThrow()
  })
})
