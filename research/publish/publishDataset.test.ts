import { mkdtemp, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { buildVersionId, publishDataset } from './publishDataset'

describe('buildVersionId', () => {
  it('formats UTC timestamps using the publish convention', () => {
    expect(buildVersionId(new Date('2026-04-03T01:45:00Z'))).toBe(
      '2026-04-03T01-45-00Z',
    )
  })
})

describe('publishDataset', () => {
  let rootDir = ''

  afterEach(async () => {
    if (rootDir) {
      await rm(rootDir, { recursive: true, force: true })
      rootDir = ''
    }
  })

  it('writes a versioned dataset snapshot and keeps current.json stable', async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), 'snowboard-trip-advisor-'))

    await publishDataset(
      {
        version: '2026-04-03T01-45-00Z',
        generated_at: '2026-04-03T01:45:00Z',
        scoring: {
          normalization: 'min-max',
          boundaries: {
            piste_km: { min: 70, max: 600 },
            lift_pass_day_eur: { min: 40, max: 79 },
          },
        },
        resorts: [
          {
            id: 'verbier',
            name: 'Verbier',
            country: 'Switzerland',
            region: 'Valais',
            status: 'active',
            overall_confidence: 0.9,
            source_urls: ['https://www.verbier.ch/'],
            field_sources: {
              piste_km: {
                source: 'https://www.verbier.ch/',
                retrieved_at: '2026-04-03T01:45:00Z',
                confidence: 0.9,
              },
              lift_pass_day_eur: {
                source: 'https://www.verbier.ch/',
                retrieved_at: '2026-04-03T01:45:00Z',
                confidence: 0.9,
              },
              estimated_trip_cost_3_days_eur: {
                source: 'https://www.verbier.ch/',
                retrieved_at: '2026-04-03T01:45:00Z',
                confidence: 0.8,
              },
            },
            piste_km: 410,
            lift_pass_day_eur: 79,
            estimated_trip_cost_3_days_eur: 880,
            size_category_official: 'Mega',
            price_category_ski_only: 'Premium',
            overall_score: 0.75,
          },
        ],
      },
      rootDir,
    )

    const dataset = JSON.parse(
      await readFile(
        path.join(
          rootDir,
          'data/published/versions/2026-04-03T01-45-00Z/dataset.json',
        ),
        'utf8',
      ),
    )
    const manifest = JSON.parse(
      await readFile(path.join(rootDir, 'data/published/manifest.json'), 'utf8'),
    )
    const currentDataset = JSON.parse(
      await readFile(path.join(rootDir, 'data/published/current.json'), 'utf8'),
    )

    expect(dataset.version).toBe('2026-04-03T01-45-00Z')
    expect(currentDataset.version).toBe('2026-04-03T01-45-00Z')
    expect(manifest).toEqual({
      currentVersion: '2026-04-03T01-45-00Z',
      currentPath: '/data/published/current.json',
    })
  })
})
