import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { validatePublishedDataset } from './validatePublishedDataset'

const FIXTURE_PATH = fileURLToPath(
  new URL('../../../data/published/current.v1.json', import.meta.url),
)
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as unknown

describe('validatePublishedDataset (Epic 2 PR 2.2)', (): void => {
  it('passes the PR 2.1 seed fixture cleanly', (): void => {
    const result = validatePublishedDataset(fixture)
    expect(result).toMatchObject({ ok: true })
  })

  it('returns zod_parse_failed when the input is not a PublishedDataset', (): void => {
    const result = validatePublishedDataset({ schema_version: 1 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues[0]?.code).toBe('zod_parse_failed')
    }
  })

  it('returns metric_field_missing_source when a populated durable path lacks a field_sources entry', (): void => {
    // Build a mutated fixture: drop slopes_km from kotelnica's field_sources but keep slopes_km: 8.
    const mutated = structuredClone(fixture) as { resorts: Array<{ slug: string; field_sources: Record<string, unknown> }> }
    const kot = mutated.resorts.find((r): boolean => r.slug === 'kotelnica-bialczanska')
    if (!kot) { throw new Error('fixture invariant: kotelnica resort must exist') }
    delete kot.field_sources['slopes_km']
    const result = validatePublishedDataset(mutated)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toContainEqual(expect.objectContaining({
        code: 'metric_field_missing_source',
        metric_path: 'slopes_km',
        document: 'resort',
      }))
    }
  })

  it('returns metric_field_missing_source when a populated live path lacks a field_sources entry', (): void => {
    const mutated = structuredClone(fixture) as { live_signals: Array<{ resort_slug: string; field_sources: Record<string, unknown> }> }
    const kot = mutated.live_signals.find((l): boolean => l.resort_slug === 'kotelnica-bialczanska')
    if (!kot) { throw new Error('fixture invariant') }
    delete kot.field_sources['lift_pass_day']
    const result = validatePublishedDataset(mutated)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toContainEqual(expect.objectContaining({
        code: 'metric_field_missing_source',
        metric_path: 'lift_pass_day',
        document: 'live_signal',
      }))
    }
  })

  it('returns manifest_count_mismatch when manifest.resort_count is wrong', (): void => {
    const mutated = structuredClone(fixture) as { manifest: { resort_count: number } }
    mutated.manifest.resort_count = 5
    const result = validatePublishedDataset(mutated)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toContainEqual(expect.objectContaining({
        code: 'manifest_count_mismatch',
        declared: 5,
        actual: 2,
      }))
    }
  })

  it('returns envelope_published_at_before_signal when a signal observed_at is later than published_at', (): void => {
    const mutated = structuredClone(fixture) as {
      published_at: string
      live_signals: Array<{ resort_slug: string; observed_at: string }>
    }
    mutated.published_at = '2026-04-25T08:00:00Z'
    const firstSignal = mutated.live_signals[0]
    if (!firstSignal) { throw new Error('fixture invariant: must have at least one live signal') }
    firstSignal.observed_at = '2026-04-26T08:00:00Z'
    const result = validatePublishedDataset(mutated)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i): boolean => i.code === 'envelope_published_at_before_signal')).toBe(true)
    }
  })

  it('returns fx_provenance_invalid when fx math diverges from Money.amount by > 1 EUR', (): void => {
    const mutated = structuredClone(fixture) as {
      live_signals: Array<{
        resort_slug: string
        field_sources: Record<string, { fx?: { rate: number; native_amount: number } } | undefined>
      }>
    }
    const kot = mutated.live_signals.find((l): boolean => l.resort_slug === 'kotelnica-bialczanska')
    if (!kot) { throw new Error('fixture invariant') }
    const liftPassFs = kot.field_sources['lift_pass_day']
    if (!liftPassFs?.fx) { throw new Error('fixture invariant: kotelnica lift_pass_day must carry fx') }
    liftPassFs.fx.rate = 999 // garbage rate; math now diverges from Money.amount = 51 by ~ 219000
    const result = validatePublishedDataset(mutated)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i): boolean => i.code === 'fx_provenance_invalid')).toBe(true)
    }
  })

  it('returns metric_field_missing_source for snow_depth_cm when field_sources entry is absent', (): void => {
    const mutated = structuredClone(fixture) as { live_signals: Array<{ resort_slug: string; field_sources: Record<string, unknown> }> }
    const kot = mutated.live_signals.find((l): boolean => l.resort_slug === 'kotelnica-bialczanska')
    if (!kot) { throw new Error('fixture invariant') }
    delete kot.field_sources['snow_depth_cm']
    const result = validatePublishedDataset(mutated)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toContainEqual(expect.objectContaining({
        code: 'metric_field_missing_source',
        metric_path: 'snow_depth_cm',
        document: 'live_signal',
      }))
    }
  })

  it('returns metric_field_missing_source for lifts_open.count when field_sources entry is absent', (): void => {
    const mutated = structuredClone(fixture) as { live_signals: Array<{ resort_slug: string; field_sources: Record<string, unknown> }> }
    const kot = mutated.live_signals.find((l): boolean => l.resort_slug === 'kotelnica-bialczanska')
    if (!kot) { throw new Error('fixture invariant') }
    delete kot.field_sources['lifts_open.count']
    const result = validatePublishedDataset(mutated)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toContainEqual(expect.objectContaining({
        code: 'metric_field_missing_source',
        metric_path: 'lifts_open.count',
        document: 'live_signal',
      }))
    }
  })

  it('returns metric_field_missing_source for lifts_open.total when field_sources entry is absent', (): void => {
    const mutated = structuredClone(fixture) as { live_signals: Array<{ resort_slug: string; field_sources: Record<string, unknown> }> }
    const kot = mutated.live_signals.find((l): boolean => l.resort_slug === 'kotelnica-bialczanska')
    if (!kot) { throw new Error('fixture invariant') }
    delete kot.field_sources['lifts_open.total']
    const result = validatePublishedDataset(mutated)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toContainEqual(expect.objectContaining({
        code: 'metric_field_missing_source',
        metric_path: 'lifts_open.total',
        document: 'live_signal',
      }))
    }
  })

  it('returns metric_field_missing_source for lodging_sample.median_eur when field_sources entry is absent', (): void => {
    const mutated = structuredClone(fixture) as { live_signals: Array<{ resort_slug: string; field_sources: Record<string, unknown> }> }
    const kot = mutated.live_signals.find((l): boolean => l.resort_slug === 'kotelnica-bialczanska')
    if (!kot) { throw new Error('fixture invariant') }
    delete kot.field_sources['lodging_sample.median_eur']
    const result = validatePublishedDataset(mutated)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toContainEqual(expect.objectContaining({
        code: 'metric_field_missing_source',
        metric_path: 'lodging_sample.median_eur',
        document: 'live_signal',
      }))
    }
  })

  it('compares envelope timestamps as instants, not lexicographic strings (Codex P1 #9)', (): void => {
    // Regression: ISODateTimeString allows offsets per Zod's .datetime({ offset: true }).
    // String comparison fails for cross-offset timestamps. This signal is at 17:00 UTC,
    // genuinely BEFORE published_at at 18:00 UTC, but lexicographically '19:...+02:00' > '18:...Z'.
    // Pre-fix: the validator flagged this (wrong). Post-fix: no issue raised.
    const mutated = structuredClone(fixture) as {
      published_at: string
      live_signals: Array<{ resort_slug: string; observed_at: string }>
    }
    mutated.published_at = '2026-04-26T18:00:00Z'                  // 18:00 UTC
    const firstSignal = mutated.live_signals[0]
    if (!firstSignal) { throw new Error('fixture invariant: must have at least one live signal') }
    firstSignal.observed_at = '2026-04-26T19:00:00+02:00'           // 17:00 UTC (earlier than published)
    const result = validatePublishedDataset(mutated)
    expect(result.ok).toBe(true)
  })

  it('rejects empty resorts array with dataset_empty issue code (PR 3.1a)', (): void => {
    // PR 3.1a tightens PublishedDataset.resorts to .min(1). Validator surfaces the
    // failure as a typed `dataset_empty` ValidationIssue (NOT opaque `zod_parse_failed`)
    // so callers can branch on the empty-dataset case explicitly.
    const mutated = structuredClone(fixture) as { resorts: unknown[]; manifest: { resort_count: number } }
    mutated.resorts = []
    mutated.manifest.resort_count = 0
    const result = validatePublishedDataset(mutated)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i): boolean => i.code === 'dataset_empty')).toBe(true)
    }
  })

  // Note: a `fx_provenance_required` test does NOT exist in Phase 1. Per ai-clean-code-adherence
  // audit, KNOWN_NON_EUR_SOURCES + the enforcement branch are deferred to Epic 5 PR 5.x. Epic 5
  // adds the test alongside the first non-EUR adapter.
})
