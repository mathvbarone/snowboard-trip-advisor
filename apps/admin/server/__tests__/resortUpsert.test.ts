import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  ISODateTimeString,
  ResortSlug,
  UpstreamHash,
  WorkspaceFile,
} from '@snowboard-trip-advisor/schema'
import type { ResortUpsertBody } from '@snowboard-trip-advisor/schema/api'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resolveWorkspaceRoot } from '../dispatch'
import { resortUpsertHandler } from '../resortUpsert'

// PR 4.4c Tasks 7+8 — handler unit tests for PUT /api/resorts/:slug.
//
// Wire-layer reject (`editor_modes: { ghost: 'manual' }` non-MetricPath key)
// is enforced by ResortUpsertBody.parse() in dispatch.ts:269 before the
// handler runs — covered by dispatch.test.ts. The HANDLER-level cross-key
// reject (`editor_modes: { snow_depth_cm: 'manual' }` — valid MetricPath
// but NOT in resort.field_sources) lives below; per Codex round-10 P2-14
// fold this is the only path that produces `invalid-resort` from this
// handler.
//
// Empty-body reject is also enforced at the wire layer by ResortUpsertBody's
// .refine — covered by dispatch.test.ts. Defensive empty-body check inside
// the handler would be unreachable per AGENTS.md "no defensive code for
// impossible cases".

const KOTELNICA = ResortSlug.parse('kotelnica-bialczanska')
const SEED_FIXTURE_DIR = join(resolveWorkspaceRoot(), 'tests/fixtures/admin-workspace')

async function setupRoot(): Promise<{ root: string; workspaceDir: string; publishedPath: string }> {
  const root = await mkdtemp(join(tmpdir(), 'upsert-test-'))
  const workspaceDir = join(root, 'data', 'admin-workspace')
  const publishedDir = join(root, 'data', 'published')
  await mkdir(workspaceDir, { recursive: true })
  await mkdir(publishedDir, { recursive: true })
  return { root, workspaceDir, publishedPath: join(publishedDir, 'current.v1.json') }
}

async function seedWorkspace(workspaceDir: string, slug: string): Promise<void> {
  const seed = readFileSync(join(SEED_FIXTURE_DIR, `${slug}.json`), 'utf8')
  await writeFile(join(workspaceDir, `${slug}.json`), seed, 'utf8')
}

async function seedPublished(
  publishedPath: string,
  slug: string,
  opts: { withLiveSignal?: boolean } = {},
): Promise<void> {
  const withLive = opts.withLiveSignal ?? true
  const seed = JSON.parse(readFileSync(join(SEED_FIXTURE_DIR, `${slug}.json`), 'utf8')) as {
    resort: unknown
    live_signal: unknown
  }
  const dataset = {
    schema_version: 1,
    published_at: '2026-04-29T08:00:00Z',
    resorts: [seed.resort],
    live_signals: withLive ? [seed.live_signal] : [],
    manifest: { resort_count: 1, generated_by: 'test', validator_version: 'test' },
  }
  await writeFile(publishedPath, JSON.stringify(dataset), 'utf8')
}

let root: string
let workspaceDir: string
let publishedPath: string

beforeEach(async (): Promise<void> => {
  ;({ root, workspaceDir, publishedPath } = await setupRoot())
})

afterEach(async (): Promise<void> => {
  await rm(root, { recursive: true, force: true })
})

describe('resortUpsertHandler — happy paths (PR 4.4c spec §7.12)', (): void => {
  it('writes the merged WorkspaceFile to disk and returns the projected response (published — live_signal exposed)', async (): Promise<void> => {
    // Both seeds (workspace + published doc) so the resort is NOT a draft and
    // live_signal flows through to the response. Draft semantics are exercised
    // by the dedicated draft test below (Codex round-2 P2 fold).
    await seedWorkspace(workspaceDir, 'kotelnica-bialczanska')
    await seedPublished(publishedPath, 'kotelnica-bialczanska')
    const body: ResortUpsertBody = { editor_modes: { slopes_km: 'manual' } }
    const response = await resortUpsertHandler(
      { params: { slug: KOTELNICA }, body },
      { workspaceRoot: root },
    )
    expect(response.resort.slug).toBe('kotelnica-bialczanska')
    expect(response.live_signal).not.toBeNull()
    expect(response.field_states['slopes_km']?.state).toBe('manual')

    // On-disk write is the actual proof; round-trip parse pins the on-disk shape.
    const onDisk = JSON.parse(
      await readFile(join(workspaceDir, 'kotelnica-bialczanska.json'), 'utf-8'),
    ) as unknown
    const wf = WorkspaceFile.parse(onDisk)
    expect(wf.editor_modes['slopes_km']).toBe('manual')
  })

  it('is idempotent — re-running the same PUT produces the same on-disk content (modulo modified_at)', async (): Promise<void> => {
    await seedWorkspace(workspaceDir, 'kotelnica-bialczanska')
    await seedPublished(publishedPath, 'kotelnica-bialczanska')
    const body: ResortUpsertBody = { editor_modes: { slopes_km: 'manual' } }
    await resortUpsertHandler({ params: { slug: KOTELNICA }, body }, { workspaceRoot: root })
    const first = JSON.parse(
      await readFile(join(workspaceDir, 'kotelnica-bialczanska.json'), 'utf-8'),
    ) as { modified_at: string; editor_modes: Record<string, string> }
    await resortUpsertHandler({ params: { slug: KOTELNICA }, body }, { workspaceRoot: root })
    const second = JSON.parse(
      await readFile(join(workspaceDir, 'kotelnica-bialczanska.json'), 'utf-8'),
    ) as { modified_at: string; editor_modes: Record<string, string> }
    expect(second.editor_modes).toEqual(first.editor_modes)
    // modified_at is set by the handler on each call — both are valid ISO strings.
    expect(typeof second.modified_at).toBe('string')
    expect(new Date(second.modified_at).toString()).not.toBe('Invalid Date')
  })

  it('sets modified_at via ISODateTimeString.parse on every PUT', async (): Promise<void> => {
    await seedWorkspace(workspaceDir, 'kotelnica-bialczanska')
    const before = Date.now()
    await resortUpsertHandler(
      { params: { slug: KOTELNICA }, body: { editor_modes: { slopes_km: 'manual' } } },
      { workspaceRoot: root },
    )
    const after = Date.now()
    const onDisk = JSON.parse(
      await readFile(join(workspaceDir, 'kotelnica-bialczanska.json'), 'utf-8'),
    ) as { modified_at: string }
    const ts = new Date(onDisk.modified_at).getTime()
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)
  })

  it('editor_modes shallow-merge: existing entries preserved, patch entries override', async (): Promise<void> => {
    await seedWorkspace(workspaceDir, 'kotelnica-bialczanska')
    // First PUT seeds {slopes_km: 'manual', lift_count: 'manual'}.
    await resortUpsertHandler(
      {
        params: { slug: KOTELNICA },
        body: { editor_modes: { slopes_km: 'manual', lift_count: 'manual' } },
      },
      { workspaceRoot: root },
    )
    // Second PUT overrides slopes_km to auto and adds altitude_m.min: manual.
    await resortUpsertHandler(
      {
        params: { slug: KOTELNICA },
        body: { editor_modes: { slopes_km: 'auto', 'altitude_m.min': 'manual' } },
      },
      { workspaceRoot: root },
    )
    const wf = WorkspaceFile.parse(
      JSON.parse(await readFile(join(workspaceDir, 'kotelnica-bialczanska.json'), 'utf-8')),
    )
    expect(wf.editor_modes).toEqual({
      slopes_km: 'auto',
      lift_count: 'manual',
      'altitude_m.min': 'manual',
    })
  })

  it('cold-start live_signal: complete patch succeeds; handler hydrates schema_version + resort_slug (Codex round-1 P2)', async (): Promise<void> => {
    // ResortUpsertBody.parse strips schema_version + resort_slug for forging
    // prevention (URL is the authoritative slug source). The handler is the
    // trusted authority for these identity fields and seeds them on cold-start
    // (existing live_signal === null). Without the seed, even a complete client
    // patch (observed_at + fetched_at + value fields + field_sources) would
    // fail post-merge WorkspaceFile.parse — making cleared/missing live_signals
    // impossible to restore through PUT.
    await seedPublished(publishedPath, 'kotelnica-bialczanska', { withLiveSignal: false })
    await resortUpsertHandler(
      {
        params: { slug: KOTELNICA },
        body: {
          live_signal: {
            observed_at: ISODateTimeString.parse('2026-04-29T10:00:00Z'),
            fetched_at: ISODateTimeString.parse('2026-04-29T10:00:00Z'),
            snow_depth_cm: 100,
            field_sources: {
              snow_depth_cm: {
                source: 'manual',
                source_url: 'https://admin.local/manual',
                observed_at: ISODateTimeString.parse('2026-04-29T10:00:00Z'),
                fetched_at: ISODateTimeString.parse('2026-04-29T10:00:00Z'),
                upstream_hash: UpstreamHash.parse('c'.repeat(64)),
                attribution_block: { en: 'Manual entry.' },
              },
            },
          },
        },
      },
      { workspaceRoot: root },
    )
    const wf = WorkspaceFile.parse(
      JSON.parse(await readFile(join(workspaceDir, 'kotelnica-bialczanska.json'), 'utf-8')),
    )
    expect(wf.live_signal?.schema_version).toBe(1)
    expect(wf.live_signal?.resort_slug).toBe('kotelnica-bialczanska')
    expect(wf.live_signal?.snow_depth_cm).toBe(100)
    expect(wf.live_signal?.field_sources['snow_depth_cm']?.source).toBe('manual')
  })

  it('cold-start: workspace absent + slug present in published doc → 200 first edit (workspace file written)', async (): Promise<void> => {
    await seedPublished(publishedPath, 'kotelnica-bialczanska')
    const response = await resortUpsertHandler(
      { params: { slug: KOTELNICA }, body: { editor_modes: { slopes_km: 'manual' } } },
      { workspaceRoot: root },
    )
    expect(response.resort.slug).toBe('kotelnica-bialczanska')
    // Workspace file was just written — round-trips through the schema.
    const wf = WorkspaceFile.parse(
      JSON.parse(await readFile(join(workspaceDir, 'kotelnica-bialczanska.json'), 'utf-8')),
    )
    expect(wf.editor_modes['slopes_km']).toBe('manual')
  })

  it('field_sources deep-merge: patch adds a manual entry without dropping pre-existing entries', async (): Promise<void> => {
    await seedWorkspace(workspaceDir, 'kotelnica-bialczanska')
    const body: ResortUpsertBody = {
      resort: {
        slopes_km: 100,
        field_sources: {
          slopes_km: {
            source: 'manual',
            source_url: 'https://admin.local/manual',
            observed_at: ISODateTimeString.parse('2026-04-29T09:00:00Z'),
            fetched_at: ISODateTimeString.parse('2026-04-29T09:00:00Z'),
            upstream_hash: UpstreamHash.parse('a'.repeat(64)),
            attribution_block: { en: 'Manual entry by analyst.' },
          },
        },
      },
    }
    await resortUpsertHandler(
      { params: { slug: KOTELNICA }, body },
      { workspaceRoot: root },
    )
    const wf = WorkspaceFile.parse(
      JSON.parse(await readFile(join(workspaceDir, 'kotelnica-bialczanska.json'), 'utf-8')),
    )
    expect(wf.resort.slopes_km).toBe(100)
    expect(wf.resort.field_sources['slopes_km']?.source).toBe('manual')
    // Pre-existing entries preserved — lift_count's resort-feed entry survives.
    expect(wf.resort.field_sources['lift_count']?.source).toBe('resort-feed')
  })

  it('live_signal shallow-merge: patch updates snow_depth_cm without dropping other fields', async (): Promise<void> => {
    await seedWorkspace(workspaceDir, 'kotelnica-bialczanska')
    const body: ResortUpsertBody = {
      live_signal: {
        snow_depth_cm: 200,
        field_sources: {
          snow_depth_cm: {
            source: 'manual',
            source_url: 'https://admin.local/manual',
            observed_at: ISODateTimeString.parse('2026-04-29T09:00:00Z'),
            fetched_at: ISODateTimeString.parse('2026-04-29T09:00:00Z'),
            upstream_hash: UpstreamHash.parse('b'.repeat(64)),
            attribution_block: { en: 'Manual entry.' },
          },
        },
      },
    }
    await resortUpsertHandler(
      { params: { slug: KOTELNICA }, body },
      { workspaceRoot: root },
    )
    const wf = WorkspaceFile.parse(
      JSON.parse(await readFile(join(workspaceDir, 'kotelnica-bialczanska.json'), 'utf-8')),
    )
    expect(wf.live_signal?.snow_depth_cm).toBe(200)
    // Other live fields preserved.
    expect(wf.live_signal?.lift_pass_day?.amount).toBe(50)
    expect(wf.live_signal?.lifts_open?.count).toBe(7)
  })

  it('live_signal patch without field_sources preserves base.field_sources entries (shallow merge)', async (): Promise<void> => {
    // Provenance is non-negotiable in production (the SPA always pairs a value
    // edit with a manual FieldSource), but the wire schema allows omission;
    // pin the merge invariant so a patch lacking field_sources doesn't wipe
    // the base entries.
    await seedWorkspace(workspaceDir, 'kotelnica-bialczanska')
    await resortUpsertHandler(
      {
        params: { slug: KOTELNICA },
        body: { live_signal: { snow_depth_cm: 220 } },
      },
      { workspaceRoot: root },
    )
    const wf = WorkspaceFile.parse(
      JSON.parse(await readFile(join(workspaceDir, 'kotelnica-bialczanska.json'), 'utf-8')),
    )
    expect(wf.live_signal?.snow_depth_cm).toBe(220)
    // Base field_sources entries (snow_depth_cm provenance from OpenSnow) survive.
    expect(wf.live_signal?.field_sources['snow_depth_cm']?.source).toBe('opensnow')
  })

  it('draft resort: PUT response hides live_signal even if on-disk has it (mirrors GET; Codex round-2 P2)', async (): Promise<void> => {
    // Workspace exists with live_signal populated; published doc is absent
    // (draft scenario per spec §4.2.1). The GET handler returns
    // `live_signal: null` for drafts; the PUT response MUST do the same so
    // PR 4.4d's prepopulateResortDetail doesn't seed an inconsistent
    // ResortDetailResponse into the cache. The on-disk workspace file
    // preserves the live_signal — only the projected response strips it.
    await seedWorkspace(workspaceDir, 'kotelnica-bialczanska')
    const response = await resortUpsertHandler(
      {
        params: { slug: KOTELNICA },
        body: { editor_modes: { slopes_km: 'manual' } },
      },
      { workspaceRoot: root },
    )
    // Response: live_signal hidden (draft semantics).
    expect(response.live_signal).toBeNull()
    // field_states for live paths reflect the absent live_signal — no value.
    expect(response.field_states['snow_depth_cm']?.state).toBe('failed')
    // On-disk preservation: workspace file STILL carries live_signal.
    const wf = WorkspaceFile.parse(
      JSON.parse(await readFile(join(workspaceDir, 'kotelnica-bialczanska.json'), 'utf-8')),
    )
    expect(wf.live_signal).not.toBeNull()
    expect(wf.live_signal?.snow_depth_cm).toBe(145)
  })

  it('live_signal: explicit null clears the live signal in the workspace file', async (): Promise<void> => {
    await seedWorkspace(workspaceDir, 'kotelnica-bialczanska')
    await resortUpsertHandler(
      {
        params: { slug: KOTELNICA },
        body: { live_signal: null, editor_modes: { slopes_km: 'manual' } },
      },
      { workspaceRoot: root },
    )
    const wf = WorkspaceFile.parse(
      JSON.parse(await readFile(join(workspaceDir, 'kotelnica-bialczanska.json'), 'utf-8')),
    )
    expect(wf.live_signal).toBeNull()
  })
})

describe('resortUpsertHandler — reject paths', (): void => {
  it('throws NotFoundError when neither workspace nor published doc carries the slug', async (): Promise<void> => {
    const ghost = ResortSlug.parse('ghost-resort')
    await expect(
      resortUpsertHandler(
        { params: { slug: ghost }, body: { editor_modes: { slopes_km: 'manual' } } },
        { workspaceRoot: root },
      ),
    ).rejects.toMatchObject({ code: 'not-found' })
  })

  it('handler-level cross-key reject: editor_modes on a live-only path → InvalidResortError (Codex round-10 P2-14)', async (): Promise<void> => {
    // snow_depth_cm IS in METRIC_FIELDS (passes ResortUpsertBody.parse) but is
    // NOT in resort.field_sources (it's in live_signal.field_sources), so the
    // post-merge WorkspaceFile.safeParse fails the cross-key refinement.
    await seedWorkspace(workspaceDir, 'kotelnica-bialczanska')
    await expect(
      resortUpsertHandler(
        {
          params: { slug: KOTELNICA },
          body: { editor_modes: { snow_depth_cm: 'manual' } },
        },
        { workspaceRoot: root },
      ),
    ).rejects.toMatchObject({ code: 'invalid-resort' })
  })

  it('InvalidResortError exposes .details = .issues for dispatch envelope propagation', async (): Promise<void> => {
    await seedWorkspace(workspaceDir, 'kotelnica-bialczanska')
    try {
      await resortUpsertHandler(
        {
          params: { slug: KOTELNICA },
          body: { editor_modes: { snow_depth_cm: 'manual' } },
        },
        { workspaceRoot: root },
      )
      throw new Error('should have rejected')
    } catch (e: unknown) {
      const err = e as { code: string; issues: ReadonlyArray<{ message: string }>; details: unknown }
      expect(err.code).toBe('invalid-resort')
      expect(err.issues.length).toBeGreaterThan(0)
      expect(err.details).toEqual(err.issues)
      expect(err.issues[0]?.message).toMatch(/snow_depth_cm/)
    }
  })

  it('resort schema reject: malformed season.start_month (>12) → InvalidResortError', async (): Promise<void> => {
    // Resort.season.start_month is z.number().int().min(1).max(12); 13 fails
    // post-merge WorkspaceFile.safeParse. (country: 'ZZ' is a tempting probe
    // but ISOCountryCode is just z.string().length(2).regex(/^[A-Z]{2}$/) so
    // 'ZZ' matches even though it isn't a real ISO 3166 code; season month
    // exercises the same reject path with an unambiguous failure.)
    await seedWorkspace(workspaceDir, 'kotelnica-bialczanska')
    await expect(
      resortUpsertHandler(
        {
          params: { slug: KOTELNICA },
          body: { resort: { season: { start_month: 13, end_month: 4 } } },
        },
        { workspaceRoot: root },
      ),
    ).rejects.toMatchObject({ code: 'invalid-resort' })
  })

  it('cold-start published with no live_signal: partial-live patch fails WorkspaceFile.parse → InvalidResortError', async (): Promise<void> => {
    // Covers two thin branches together: (a) `publishedDoc.live_signals.find`
    // returns undefined → ?? null fallback (resort exists in published but
    // its live_signal entry is missing), and (b) mergeLiveSignal's `base
    // === null` branch — patch is a partial that doesn't satisfy
    // ResortLiveSignal in full, so the merged candidate fails the post-merge
    // WorkspaceFile.safeParse and the handler throws InvalidResortError.
    await seedPublished(publishedPath, 'kotelnica-bialczanska', { withLiveSignal: false })
    await expect(
      resortUpsertHandler(
        {
          params: { slug: KOTELNICA },
          body: { live_signal: { snow_depth_cm: 100 } },
        },
        { workspaceRoot: root },
      ),
    ).rejects.toMatchObject({ code: 'invalid-resort' })
  })

  it('corrupt workspace target: throws WorkspaceCorruptError and refuses to overwrite', async (): Promise<void> => {
    // Pre-existing corrupt file; the handler should NOT silently overwrite it.
    const targetPath = join(workspaceDir, 'kotelnica-bialczanska.json')
    const corruptBytes = '{"slug":"kotelnica-bialczanska"}'
    await writeFile(targetPath, corruptBytes, 'utf8')
    await expect(
      resortUpsertHandler(
        {
          params: { slug: KOTELNICA },
          body: { editor_modes: { slopes_km: 'manual' } },
        },
        { workspaceRoot: root },
      ),
    ).rejects.toMatchObject({ code: 'workspace-corrupt' })
    // File on disk is byte-equal to its corrupt state — no partial overwrite.
    expect(await readFile(targetPath, 'utf-8')).toBe(corruptBytes)
  })
})
