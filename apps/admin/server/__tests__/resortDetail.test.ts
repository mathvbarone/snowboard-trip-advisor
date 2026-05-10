import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { METRIC_FIELDS, ResortSlug } from '@snowboard-trip-advisor/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resolveWorkspaceRoot } from '../dispatch'
import { resortDetailHandler } from '../resortDetail'
import { WorkspaceCorruptError } from '../workspace'

const SEED_FIXTURE_DIR = join(resolveWorkspaceRoot(), 'tests/fixtures/admin-workspace')

function loadSeed(slug: string): { full: unknown; resort: unknown; live_signal: unknown } {
  const raw = JSON.parse(
    readFileSync(join(SEED_FIXTURE_DIR, `${slug}.json`), 'utf8'),
  ) as { resort: unknown; live_signal: unknown }
  return { full: raw, resort: raw.resort, live_signal: raw.live_signal }
}

async function writeWorkspace(workspaceDir: string, slug: string, content: string): Promise<void> {
  await mkdir(workspaceDir, { recursive: true })
  await writeFile(join(workspaceDir, `${slug}.json`), content, 'utf8')
}

async function writePublished(root: string, dataset: unknown): Promise<void> {
  await mkdir(join(root, 'data', 'published'), { recursive: true })
  await writeFile(join(root, 'data', 'published', 'current.v1.json'), JSON.stringify(dataset), 'utf8')
}

describe('resortDetailHandler (PR 4.4a-2, spec §4.2 / §4.2.1 / §10.3.1 / §10.9)', (): void => {
  let root: string

  beforeEach(async (): Promise<void> => {
    root = await mkdtemp(join(tmpdir(), 'resort-detail-test-'))
  })

  afterEach(async (): Promise<void> => {
    await rm(root, { recursive: true, force: true })
  })

  it('happy path (workspace + published): response includes resort, live_signal, and 12-key field_states', async (): Promise<void> => {
    // For a non-draft (workspace AND published doc has the slug), live_signal
    // from the workspace is preserved per §4.2.1. Published doc here uses the
    // same seed as the workspace; field_states project all 12 paths as live.
    const slug = 'kotelnica-bialczanska'
    const seed = loadSeed(slug)
    const seedJson = readFileSync(join(SEED_FIXTURE_DIR, `${slug}.json`), 'utf8')
    await writeWorkspace(join(root, 'data', 'admin-workspace'), slug, seedJson)
    await writePublished(root, {
      schema_version: 1,
      published_at: '2026-04-29T08:00:00Z',
      resorts: [seed.resort],
      live_signals: [seed.live_signal],
      manifest: { resort_count: 1, generated_by: 'test', validator_version: 'test' },
    })

    const result = await resortDetailHandler(
      { params: { slug: ResortSlug.parse(slug) } },
      { workspaceRoot: root },
    )
    expect(result.resort.slug).toBe(slug)
    expect(result.resort.country).toBe('PL')
    expect(result.live_signal).not.toBeNull()
    expect(Object.keys(result.field_states).sort()).toEqual([...METRIC_FIELDS].sort())
  })

  it('field_states is a TOTAL record with all 12 metric keys (reviewer P2: total → partialRecord widening)', async (): Promise<void> => {
    const slug = 'kotelnica-bialczanska'
    const seed = loadSeed(slug)
    const seedJson = readFileSync(join(SEED_FIXTURE_DIR, `${slug}.json`), 'utf8')
    await writeWorkspace(join(root, 'data', 'admin-workspace'), slug, seedJson)
    await writePublished(root, {
      schema_version: 1,
      published_at: '2026-04-29T08:00:00Z',
      resorts: [seed.resort],
      live_signals: [seed.live_signal],
      manifest: { resort_count: 1, generated_by: 'test', validator_version: 'test' },
    })

    const result = await resortDetailHandler(
      { params: { slug: ResortSlug.parse(slug) } },
      { workspaceRoot: root },
    )
    expect(Object.keys(result.field_states).length).toBe(12)
    for (const path of METRIC_FIELDS) {
      expect(result.field_states[path]).toBeDefined()
    }
  })

  it('published-only slug (no workspace file): response carries projected Resort + live_signal_by_slug.get(slug) ?? null + editor_modes: {}', async (): Promise<void> => {
    const slug = 'kotelnica-bialczanska'
    const seed = loadSeed(slug)
    await writePublished(root, {
      schema_version: 1,
      published_at: '2026-04-29T08:00:00Z',
      resorts: [seed.resort],
      live_signals: [seed.live_signal],
      manifest: { resort_count: 1, generated_by: 'test', validator_version: 'test' },
    })
    // No workspace file; admin-workspace dir doesn't even need to exist.

    const result = await resortDetailHandler(
      { params: { slug: ResortSlug.parse(slug) } },
      { workspaceRoot: root },
    )
    expect(result.resort.slug).toBe(slug)
    expect(result.live_signal).not.toBeNull()
    // editor_modes: {} on the published-only branch; field_states still 12 keys.
    expect(Object.keys(result.field_states).length).toBe(12)
  })

  it('draft slug (§4.2.1): workspace file exists, slug NOT in published doc → 200 with live_signal: null (Codex round-3 P2 fold)', async (): Promise<void> => {
    // Spec §4.2.1: "live_signal is null for drafts (no live data until the
    // resort is published and signals start flowing)". Even though the
    // workspace file may carry live_signal data (e.g., copied from a seed
    // fixture), the handler MUST normalize it to null when the slug is
    // absent from the published resorts list.
    const slug = 'kotelnica-bialczanska'
    const seedJson = readFileSync(join(SEED_FIXTURE_DIR, `${slug}.json`), 'utf8')
    await writeWorkspace(join(root, 'data', 'admin-workspace'), slug, seedJson)
    // Publish a doc that does NOT include this slug.
    const otherSeed = loadSeed('spindleruv-mlyn')
    await writePublished(root, {
      schema_version: 1,
      published_at: '2026-04-29T08:00:00Z',
      resorts: [otherSeed.resort],
      live_signals: [otherSeed.live_signal],
      manifest: { resort_count: 1, generated_by: 'test', validator_version: 'test' },
    })

    const result = await resortDetailHandler(
      { params: { slug: ResortSlug.parse(slug) } },
      { workspaceRoot: root },
    )
    expect(result.resort.slug).toBe(slug)
    expect(result.live_signal).toBeNull()
    // Live paths project as failed because live_signal is null.
    for (const livePath of ['snow_depth_cm', 'lifts_open.count', 'lifts_open.total',
      'lift_pass_day', 'lodging_sample.median_eur'] as const) {
      expect(result.field_states[livePath]).toMatchObject({ state: 'failed' })
    }
  })

  it('workspace + published (non-draft): live_signal from workspace IS preserved (only drafts get null)', async (): Promise<void> => {
    // The other half of the §4.2.1 contract: when the workspace file exists
    // AND the slug IS in the published doc, the workspace's live_signal
    // takes precedence (workspace overrides published per §4.1.1).
    const slug = 'kotelnica-bialczanska'
    const seed = loadSeed(slug)
    const seedJson = readFileSync(join(SEED_FIXTURE_DIR, `${slug}.json`), 'utf8')
    await writeWorkspace(join(root, 'data', 'admin-workspace'), slug, seedJson)
    await writePublished(root, {
      schema_version: 1,
      published_at: '2026-04-29T08:00:00Z',
      resorts: [seed.resort],
      live_signals: [],   // published doc has the resort but no live_signal entry
      manifest: { resort_count: 1, generated_by: 'test', validator_version: 'test' },
    })

    const result = await resortDetailHandler(
      { params: { slug: ResortSlug.parse(slug) } },
      { workspaceRoot: root },
    )
    expect(result.resort.slug).toBe(slug)
    expect(result.live_signal).not.toBeNull()
    expect(result.live_signal?.snow_depth_cm).toBe(145)
  })

  it('missing published doc + missing workspace file → throws NotFoundError (§10.9)', async (): Promise<void> => {
    await mkdir(join(root, 'data', 'admin-workspace'), { recursive: true })
    // No workspace file for the requested slug; no current.v1.json either.

    await expect(
      resortDetailHandler(
        { params: { slug: ResortSlug.parse('nonexistent-slug') } },
        { workspaceRoot: root },
      ),
    ).rejects.toMatchObject({ code: 'not-found' })
  })

  it('workspace-only after missing published: workspace file present, no current.v1.json → 200', async (): Promise<void> => {
    const slug = 'kotelnica-bialczanska'
    const seedJson = readFileSync(join(SEED_FIXTURE_DIR, `${slug}.json`), 'utf8')
    await writeWorkspace(join(root, 'data', 'admin-workspace'), slug, seedJson)
    // No current.v1.json.

    const result = await resortDetailHandler(
      { params: { slug: ResortSlug.parse(slug) } },
      { workspaceRoot: root },
    )
    expect(result.resort.slug).toBe(slug)
  })

  it('corrupt workspace (§10.3.1): workspace file fails parse → throws WorkspaceCorruptError (propagates with .code, .slug, .issues)', async (): Promise<void> => {
    const slug = 'corrupt-slug'
    await writeWorkspace(join(root, 'data', 'admin-workspace'), slug, JSON.stringify({ slug }))

    await expect(
      resortDetailHandler(
        { params: { slug: ResortSlug.parse(slug) } },
        { workspaceRoot: root },
      ),
    ).rejects.toBeInstanceOf(WorkspaceCorruptError)
    await expect(
      resortDetailHandler(
        { params: { slug: ResortSlug.parse(slug) } },
        { workspaceRoot: root },
      ),
    ).rejects.toMatchObject({ code: 'workspace-corrupt', slug })
  })

  it('slug not found anywhere (workspace empty + published doc covers different slug) → throws NotFoundError', async (): Promise<void> => {
    await mkdir(join(root, 'data', 'admin-workspace'), { recursive: true })
    const otherSeed = loadSeed('spindleruv-mlyn')
    await writePublished(root, {
      schema_version: 1,
      published_at: '2026-04-29T08:00:00Z',
      resorts: [otherSeed.resort],
      live_signals: [otherSeed.live_signal],
      manifest: { resort_count: 1, generated_by: 'test', validator_version: 'test' },
    })

    await expect(
      resortDetailHandler(
        { params: { slug: ResortSlug.parse('not-in-published-or-workspace') } },
        { workspaceRoot: root },
      ),
    ).rejects.toMatchObject({ code: 'not-found' })
  })

  it('published doc with no live_signal entry for the requested slug → resort renders with live_signal: null', async (): Promise<void> => {
    const slug = 'kotelnica-bialczanska'
    const seed = loadSeed(slug)
    await writePublished(root, {
      schema_version: 1,
      published_at: '2026-04-29T08:00:00Z',
      resorts: [seed.resort],
      live_signals: [],   // intentionally empty — the slug has no live entry
      manifest: { resort_count: 1, generated_by: 'test', validator_version: 'test' },
    })

    const result = await resortDetailHandler(
      { params: { slug: ResortSlug.parse(slug) } },
      { workspaceRoot: root },
    )
    expect(result.live_signal).toBeNull()
    // 5 live paths project to 'failed' when live_signal is null.
    for (const livePath of ['snow_depth_cm', 'lifts_open.count', 'lifts_open.total',
      'lift_pass_day', 'lodging_sample.median_eur'] as const) {
      expect(result.field_states[livePath]).toMatchObject({ state: 'failed' })
    }
  })
})
