import { describe, expect, it } from 'vitest'

import {
  ResortSlug,
  UpstreamHash,
  ISOCountryCode,
  ISODateTimeString
} from './branded'

describe('ResortSlug', (): void => {
  it('parses lowercase alphanumeric + hyphens up to 64 chars', (): void => {
    expect(ResortSlug.parse('three-valleys')).toBe('three-valleys')
  })
  it('rejects uppercase, underscores, and length > 64', (): void => {
    expect(() => ResortSlug.parse('Three-Valleys')).toThrow()
    expect(() => ResortSlug.parse('three_valleys')).toThrow()
    expect(() => ResortSlug.parse('a'.repeat(65))).toThrow()
  })
  it('round-trips through JSON', (): void => {
    const v = ResortSlug.parse('st-anton')
    expect(ResortSlug.parse(JSON.parse(JSON.stringify(v)))).toBe(v)
  })
})

describe('UpstreamHash', (): void => {
  it('parses 64 lowercase hex chars', (): void => {
    expect(UpstreamHash.parse('a'.repeat(64))).toBe('a'.repeat(64))
  })
  it('rejects non-hex and wrong length', (): void => {
    expect(() => UpstreamHash.parse('a'.repeat(63))).toThrow()
    expect(() => UpstreamHash.parse('A'.repeat(64))).toThrow()
    expect(() => UpstreamHash.parse('g'.repeat(64))).toThrow()
  })
})

describe('ISOCountryCode', (): void => {
  it('parses two-letter codes', (): void => {
    expect(ISOCountryCode.parse('FR')).toBe('FR')
    expect(ISOCountryCode.parse('AT')).toBe('AT')
  })
  it('rejects wrong length', (): void => {
    expect(() => ISOCountryCode.parse('FRA')).toThrow()
    expect(() => ISOCountryCode.parse('F')).toThrow()
  })
})

describe('ISODateTimeString', (): void => {
  it('parses ISO with offset', (): void => {
    expect(ISODateTimeString.parse('2026-04-26T12:00:00Z')).toBe('2026-04-26T12:00:00Z')
  })
  it('rejects naive datetimes', (): void => {
    expect(() => ISODateTimeString.parse('2026-04-26 12:00:00')).toThrow()
  })
})
