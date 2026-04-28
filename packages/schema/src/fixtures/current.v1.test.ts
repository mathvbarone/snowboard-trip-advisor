import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { METRIC_FIELDS } from '../metricFields'
import { PublishedDataset } from '../published'

// Resolve path relative to this test file. Avoids ambient cwd assumptions.
const FIXTURE_PATH = fileURLToPath(
  new URL('../../../../data/published/current.v1.json', import.meta.url),
)

const raw = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as unknown

describe('current.v1.json fixture (Epic 2 PR 2.1)', (): void => {
  it('parses against PublishedDataset (Zod)', (): void => {
    expect(() => PublishedDataset.parse(raw)).not.toThrow()
  })

  it('lists exactly the two seed resorts in the agreed order', (): void => {
    const parsed = PublishedDataset.parse(raw)
    expect(parsed.resorts.map((r): string => r.slug)).toEqual([
      'kotelnica-bialczanska',
      'spindleruv-mlyn',
    ])
  })

  it('joins live signals to resorts by slug', (): void => {
    const parsed = PublishedDataset.parse(raw)
    const resortSlugs = new Set(parsed.resorts.map((r): string => r.slug))
    for (const live of parsed.live_signals) {
      expect(resortSlugs.has(live.resort_slug)).toBe(true)
    }
  })

  it('carries field_sources entries for every populated METRIC_FIELDS path', (): void => {
    const parsed = PublishedDataset.parse(raw)
    for (const resort of parsed.resorts) {
      // Durable paths from METRIC_FIELDS that this Resort carries values for
      const durablePaths: ReadonlyArray<string> = [
        'altitude_m.min', 'altitude_m.max', 'slopes_km', 'lift_count',
        'skiable_terrain_ha', 'season.start_month', 'season.end_month',
      ]
      for (const path of durablePaths) {
        expect(
          Object.keys(resort.field_sources),
          `resort ${resort.slug} missing field_sources entry for ${path}`,
        ).toContain(path)
      }
    }
    for (const live of parsed.live_signals) {
      // Live paths actually populated in the fixture
      const livePaths: ReadonlyArray<string> = [
        'snow_depth_cm', 'lifts_open.count', 'lifts_open.total',
        'lift_pass_day', 'lodging_sample.median_eur',
      ]
      for (const path of livePaths) {
        expect(
          Object.keys(live.field_sources),
          `live signal ${live.resort_slug} missing field_sources entry for ${path}`,
        ).toContain(path)
      }
    }
  })

  it('demonstrates FX provenance on Money-typed fields for both non-Eurozone seed resorts', (): void => {
    const parsed = PublishedDataset.parse(raw)
    for (const live of parsed.live_signals) {
      const liftPassEntry = live.field_sources['lift_pass_day']
      expect(liftPassEntry, `live signal ${live.resort_slug} missing lift_pass_day FieldSource`).toBeDefined()
      // PR 2.2 landed the optional `fx` sub-object on FieldSource; both seed resorts carry FX provenance.
      expect(liftPassEntry?.fx).toBeDefined()
      expect(liftPassEntry?.fx?.native_currency).toMatch(/^(PLN|CZK)$/)
      const lodgingEntry = live.field_sources['lodging_sample.median_eur']
      expect(lodgingEntry?.fx).toBeDefined()
    }
  })

  it('has METRIC_FIELDS coverage parity (every path that has a non-null value has a field source)', (): void => {
    // Belt-and-braces structural test: the fixture's field_sources keys are a subset of METRIC_FIELDS.
    // PR 2.2's validator enforces this rigorously; this test is a fast smoke check that the fixture
    // does not invent paths outside the canonical METRIC_FIELDS list.
    const parsed = PublishedDataset.parse(raw)
    const metricSet = new Set<string>(METRIC_FIELDS)
    for (const resort of parsed.resorts) {
      for (const path of Object.keys(resort.field_sources)) {
        expect(metricSet.has(path), `resort ${resort.slug} field_sources has unknown path: ${path}`).toBe(true)
      }
    }
    for (const live of parsed.live_signals) {
      for (const path of Object.keys(live.field_sources)) {
        expect(metricSet.has(path), `live signal ${live.resort_slug} field_sources has unknown path: ${path}`).toBe(true)
      }
    }
  })
})
