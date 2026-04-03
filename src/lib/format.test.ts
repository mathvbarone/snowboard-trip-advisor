import { describe, expect, it } from 'vitest'
import {
  formatConfidence,
  formatEuro,
  formatInteger,
  formatPercent,
} from './format'

describe('formatEuro', () => {
  it('formats euro values and falls back for missing input', () => {
    expect(formatEuro(1234.5)).toBe('€1,235')
    expect(formatEuro(null)).toBe('—')
    expect(formatEuro(undefined)).toBe('—')
    expect(formatEuro(Number.NaN)).toBe('—')
  })
})

describe('formatInteger', () => {
  it('formats whole numbers and falls back for missing input', () => {
    expect(formatInteger(1234.5)).toBe('1,235')
    expect(formatInteger(0)).toBe('0')
    expect(formatInteger(null)).toBe('—')
    expect(formatInteger(undefined)).toBe('—')
    expect(formatInteger(Number.NaN)).toBe('—')
  })
})

describe('formatPercent', () => {
  it('formats percent values and falls back for missing input', () => {
    expect(formatPercent(0.1234)).toBe('12%')
    expect(formatPercent(0.8)).toBe('80%')
    expect(formatPercent(null)).toBe('—')
    expect(formatPercent(undefined)).toBe('—')
    expect(formatPercent(Number.NaN)).toBe('—')
  })
})

describe('formatConfidence', () => {
  it('maps confidence values to descriptive labels', () => {
    expect(formatConfidence(0.8)).toBe('High confidence')
    expect(formatConfidence(0.79)).toBe('Medium confidence')
    expect(formatConfidence(0.5)).toBe('Medium confidence')
    expect(formatConfidence(0.49)).toBe('Low confidence')
    expect(formatConfidence(null)).toBe('Unknown confidence')
    expect(formatConfidence(undefined)).toBe('Unknown confidence')
    expect(formatConfidence(Number.NaN)).toBe('Unknown confidence')
  })
})
