import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { HandlerDeps } from '../listResorts'
import { publishHandler } from '../publish'

// ---------------------------------------------------------------------------
// Fixture helpers — reuse the canonical workspace seeds at
// `tests/fixtures/admin-workspace/`. These survived Tier 3's resortDetail tests
// and are the same shape the editor view writes back via PUT /api/resorts/:slug.
// ---------------------------------------------------------------------------

const FIXTURE_DIR = join(__dirname, '..', '..', '..', '..', 'tests', 'fixtures', 'admin-workspace')

async function seedWorkspaceFile(workspaceRoot: string, slug: string): Promise<void> {
  const dir = join(workspaceRoot, 'data', 'admin-workspace')
  await mkdir(dir, { recursive: true })
  await copyFile(join(FIXTURE_DIR, `${slug}.json`), join(dir, `${slug}.json`))
}

async function seedPublishedDoc(
  workspaceRoot: string,
  doc: unknown,
): Promise<void> {
  const dir = join(workspaceRoot, 'data', 'published')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'current.v1.json'), JSON.stringify(doc), 'utf-8')
}

interface FixtureFile {
  readonly resort: unknown
  readonly live_signal: unknown
}

/**
 * Build a published doc seeded with the two canonical workspace fixtures.
 * Both are parse-valid Resorts so publishDataset's validatePublishedDataset
 * accepts the envelope when written out.
 */
async function publishedDocFromFixtures(slugs: ReadonlyArray<string>): Promise<unknown> {
  const resorts: unknown[] = []
  const live_signals: unknown[] = []
  for (const slug of slugs) {
    const text = await readFile(join(FIXTURE_DIR, `${slug}.json`), 'utf-8')
    const raw = JSON.parse(text) as FixtureFile
    resorts.push(raw.resort)
    if (raw.live_signal !== null) {
      live_signals.push(raw.live_signal)
    }
  }
  return {
    schema_version: 1,
    published_at: '2026-05-10T00:00:00.000Z',
    resorts,
    live_signals,
    manifest: {
      resort_count: resorts.length,
      generated_by: 'test-seed',
      validator_version: '1',
    },
  }
}

interface CodedError {
  code: string
  message: string
  details?: { reason?: string; slug?: string; issues?: ReadonlyArray<{ code?: string; message?: string }> }
}

/** Run an async fn and return the rejected error as a typed CodedError. */
async function captureError<T>(fn: () => Promise<T>): Promise<CodedError> {
  try {
    await fn()
  } catch (e: unknown) {
    const err = e as CodedError
    return { code: err.code, message: err.message, details: err.details }
  }
  throw new Error('expected fn() to reject; it resolved')
}

interface ArchiveDoc {
  readonly resorts: ReadonlyArray<{ slug: string }>
  readonly live_signals: ReadonlyArray<{ resort_slug: string }>
  readonly manifest: { generated_by: string }
}

async function readArchive(path: string): Promise<ArchiveDoc> {
  const text = await readFile(path, 'utf-8')
  return JSON.parse(text) as ArchiveDoc
}

describe('publishHandler — happy path + slug assertion', (): void => {
  let workspaceRoot: string
  let deps: HandlerDeps

  beforeEach(async (): Promise<void> => {
    workspaceRoot = await mkdtemp(join(tmpdir(), 'snowboard-publish-'))
    // Round-6 P2 fold: no clock seam in HandlerDeps — fix the clock via
    // Vitest's setSystemTime. publishDataset's archive filename uses
    // `new Date()` too; version_id is derived from the archive path
    // (round-4 fold) so the test does not need to predict the filename.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-11T00:00:00.000Z'))
    deps = { workspaceRoot }
  })

  afterEach(async (): Promise<void> => {
    vi.useRealTimers()
    await rm(workspaceRoot, { recursive: true, force: true })
  })

  it('publishes workspace ∪ published; returns version metadata + writes archive on disk', async (): Promise<void> => {
    // Seed published with 2 resorts; seed 1 workspace file overriding 1 of them.
    await seedPublishedDoc(
      workspaceRoot,
      await publishedDocFromFixtures(['kotelnica-bialczanska', 'spindleruv-mlyn']),
    )
    await seedWorkspaceFile(workspaceRoot, 'kotelnica-bialczanska')

    const response = await publishHandler(
      { params: { slug: '__all__' }, body: { confirm: true } },
      deps,
    )

    expect(response.resort_count).toBe(2)
    expect(response.version_id).toMatch(/^\d+-/)
    expect(response.archive_path).toContain('data/published/history/')
    expect(response.published_at).toBeDefined()

    const historyDir = join(workspaceRoot, 'data', 'published', 'history')
    const entries = await readdir(historyDir)
    expect(entries.some((e): boolean => /^\d+-.+\.json$/.test(e))).toBe(true)
  })

  it('rejects non-__all__ slugs as 400 invalid-request (Phase 1)', async (): Promise<void> => {
    // ResortSlug is a Zod brand on string, so passing a plain string requires
    // a cast at the handler boundary (the dispatcher's PublishSlugParam.parse
    // is the production producer of the branded value).
    const err = await captureError(
      (): Promise<unknown> =>
        publishHandler(
          { params: { slug: 'kotelnica-bialczanska' as unknown as '__all__' }, body: { confirm: true } },
          deps,
        ),
    )
    expect(err.code).toBe('invalid-request')
    expect(err.details?.reason).toMatch(/per-slug.*Phase 2/i)
  })
})

describe('publishHandler — failure + edge paths', (): void => {
  let workspaceRoot: string
  let deps: HandlerDeps

  beforeEach(async (): Promise<void> => {
    workspaceRoot = await mkdtemp(join(tmpdir(), 'snowboard-publish-fail-'))
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-11T00:00:00.000Z'))
    deps = { workspaceRoot }
  })

  afterEach(async (): Promise<void> => {
    vi.useRealTimers()
    await rm(workspaceRoot, { recursive: true, force: true })
  })

  it('returns publish-validation-failed when validatePublishedDataset rejects (empty dataset)', async (): Promise<void> => {
    // Cold workspace + no published doc → resorts.length === 0 →
    // validatePublishedDataset emits the typed `dataset_empty` issue per
    // `packages/schema/src/validatePublishedDataset.ts:48` (the typed issue is
    // `{ code: 'dataset_empty' }`, NOT a Zod-style `message` — this is the
    // validator's own discriminated-union issue type, separate from raw Zod
    // issues).
    const err = await captureError(
      (): Promise<unknown> =>
        publishHandler({ params: { slug: '__all__' }, body: { confirm: true } }, deps),
    )
    expect(err.code).toBe('publish-validation-failed')
    const issues = err.details?.issues ?? []
    expect(issues.some((i): boolean => i.code === 'dataset_empty')).toBe(true)
  })

  it('preserves explicit `live_signal: null` overrides — workspace null wins over published value', async (): Promise<void> => {
    // Seed published with a live_signal for kotelnica.
    await seedPublishedDoc(
      workspaceRoot,
      await publishedDocFromFixtures(['kotelnica-bialczanska']),
    )
    // Seed a workspace file whose live_signal is explicitly null. We cannot
    // use the fixture file directly (its live_signal is set), so re-write it
    // with the field cleared. WorkspaceFile.parse accepts `live_signal: null`.
    const rawFixture = JSON.parse(
      await readFile(join(FIXTURE_DIR, 'kotelnica-bialczanska.json'), 'utf-8'),
    ) as Record<string, unknown>
    const workspaceDir = join(workspaceRoot, 'data', 'admin-workspace')
    await mkdir(workspaceDir, { recursive: true })
    await writeFile(
      join(workspaceDir, 'kotelnica-bialczanska.json'),
      JSON.stringify({ ...rawFixture, live_signal: null }),
      'utf-8',
    )

    const response = await publishHandler(
      { params: { slug: '__all__' }, body: { confirm: true } },
      deps,
    )

    const archive = await readArchive(response.archive_path)
    expect(archive.resorts).toHaveLength(1)
    // The published doc had a live_signal for kotelnica; workspace cleared it.
    expect(archive.live_signals).toEqual([])
  })

  it('rejects with workspace-corrupt when any workspace file is corrupt (spec §10.3.1)', async (): Promise<void> => {
    await seedPublishedDoc(
      workspaceRoot,
      await publishedDocFromFixtures(['kotelnica-bialczanska']),
    )
    // Seed a corrupt workspace JSON. Per spec §10.3.1, publish MUST refuse —
    // silently skipping would let a curl bypass of the dialog drop the staged
    // corrupt slug.
    const workspaceDir = join(workspaceRoot, 'data', 'admin-workspace')
    await mkdir(workspaceDir, { recursive: true })
    await writeFile(join(workspaceDir, 'broken.json'), '{not-json', 'utf-8')

    const err = await captureError(
      (): Promise<unknown> =>
        publishHandler({ params: { slug: '__all__' }, body: { confirm: true } }, deps),
    )
    expect(err.code).toBe('workspace-corrupt')
    expect(typeof err.details?.slug).toBe('string')
  })

  it('rejects with workspace-corrupt when a workspace file fails schema (valid JSON, invalid shape)', async (): Promise<void> => {
    await seedPublishedDoc(
      workspaceRoot,
      await publishedDocFromFixtures(['kotelnica-bialczanska']),
    )
    // Valid JSON but missing required fields → WorkspaceFile.safeParse rejects.
    const workspaceDir = join(workspaceRoot, 'data', 'admin-workspace')
    await mkdir(workspaceDir, { recursive: true })
    await writeFile(
      join(workspaceDir, 'shape-fail.json'),
      JSON.stringify({ slug: 'shape-fail' }),
      'utf-8',
    )

    const err = await captureError(
      (): Promise<unknown> =>
        publishHandler({ params: { slug: '__all__' }, body: { confirm: true } }, deps),
    )
    expect(err.code).toBe('workspace-corrupt')
    expect(err.details?.slug).toBe('shape-fail')
    const issues = err.details?.issues ?? []
    expect(issues.length).toBeGreaterThan(0)
  })

  it('manifest.generated_by carries a sha256-hashed host fingerprint per spec §4.5.1', async (): Promise<void> => {
    await seedPublishedDoc(
      workspaceRoot,
      await publishedDocFromFixtures(['kotelnica-bialczanska']),
    )

    const response = await publishHandler(
      { params: { slug: '__all__' }, body: { confirm: true } },
      deps,
    )
    const archive = await readArchive(response.archive_path)
    // Format: '<cli-identifier> host=<hex>' where hex is 64-char sha256 digest.
    expect(archive.manifest.generated_by).toMatch(/^admin-workspace host=[0-9a-f]{64}$/)
  })

  it('publishes when only the workspace has resorts (published doc absent — cold start)', async (): Promise<void> => {
    // No published doc at all; workspace alone provides the resorts.
    await seedWorkspaceFile(workspaceRoot, 'kotelnica-bialczanska')

    const response = await publishHandler(
      { params: { slug: '__all__' }, body: { confirm: true } },
      deps,
    )
    expect(response.resort_count).toBe(1)
  })

  it('published-only resort with no corresponding live_signal is preserved (defensive — partial published doc)', async (): Promise<void> => {
    // Build a published doc where a resort exists but has NO live_signal
    // entry — exercises the merge's "no published live_signal for this slug"
    // fallthrough (the `pub === undefined` branch).
    const text = await readFile(join(FIXTURE_DIR, 'kotelnica-bialczanska.json'), 'utf-8')
    const raw = JSON.parse(text) as FixtureFile
    await seedPublishedDoc(workspaceRoot, {
      schema_version: 1,
      published_at: '2026-05-10T00:00:00.000Z',
      resorts: [raw.resort],
      // Intentionally empty — resort present, live_signal absent.
      live_signals: [],
      manifest: {
        resort_count: 1,
        generated_by: 'test-seed',
        validator_version: '1',
      },
    })

    const response = await publishHandler(
      { params: { slug: '__all__' }, body: { confirm: true } },
      deps,
    )
    const archive = await readArchive(response.archive_path)
    expect(archive.resorts).toHaveLength(1)
    expect(archive.live_signals).toEqual([])
  })

  it('skips non-.json files in the workspace directory (defensive — sidecar files / OS metadata)', async (): Promise<void> => {
    // Seed published with a parse-valid resort so the publish succeeds; drop
    // a non-json file (e.g. macOS `.DS_Store`) into the workspace dir.
    await seedPublishedDoc(
      workspaceRoot,
      await publishedDocFromFixtures(['kotelnica-bialczanska']),
    )
    const workspaceDir = join(workspaceRoot, 'data', 'admin-workspace')
    await mkdir(workspaceDir, { recursive: true })
    await writeFile(join(workspaceDir, '.DS_Store'), 'binary-junk', 'utf-8')

    // The .DS_Store is silently skipped; the publish proceeds with the
    // published-only resort.
    const response = await publishHandler(
      { params: { slug: '__all__' }, body: { confirm: true } },
      deps,
    )
    expect(response.resort_count).toBe(1)
  })

  it('workspace overrides per slug; published-only resorts kept (Decision B3)', async (): Promise<void> => {
    // Seed published with 2 resorts; seed workspace with 1 of them edited.
    // Merged set: 2 resorts; the kotelnica entry is workspace-sourced.
    await seedPublishedDoc(
      workspaceRoot,
      await publishedDocFromFixtures(['kotelnica-bialczanska', 'spindleruv-mlyn']),
    )
    await seedWorkspaceFile(workspaceRoot, 'kotelnica-bialczanska')

    const response = await publishHandler(
      { params: { slug: '__all__' }, body: { confirm: true } },
      deps,
    )
    const archive = await readArchive(response.archive_path)
    const slugs = archive.resorts.map((r): string => r.slug).sort()
    expect(slugs).toEqual(['kotelnica-bialczanska', 'spindleruv-mlyn'])
  })
})
