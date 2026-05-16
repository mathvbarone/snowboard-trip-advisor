import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ResortSlug } from '@snowboard-trip-advisor/schema'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resolveWorkspaceRoot } from '../dispatch'

// PR N.b3b §7.2 — analystNotesGet + analystNotesPut handler unit tests.
//
// Wire-layer body rejects (markdown > 10 KB UTF-8, bad NotePath regex,
// missing field) are enforced by AnalystNoteUpsertBody.parse() in
// dispatch.ts before the handler runs — covered by dispatch.test.ts. The
// handler-level 400 test below proves the handler ALSO validates (defense
// in depth + direct-call contract for the bridge test, which bypasses
// dispatch).

const KOTELNICA = ResortSlug.parse('kotelnica-bialczanska')
const SEED_FIXTURE_DIR = join(resolveWorkspaceRoot(), 'tests/fixtures/admin-workspace')

interface SeedFixture {
  readonly schema_version: 1
  readonly slug: string
  readonly resort: unknown
  readonly live_signal: unknown
  readonly modified_at: string
  readonly editor_modes: Record<string, unknown>
}

function readSeed(slug: string): SeedFixture {
  return JSON.parse(readFileSync(join(SEED_FIXTURE_DIR, `${slug}.json`), 'utf8')) as SeedFixture
}

async function setupRoot(): Promise<{
  root: string
  workspaceDir: string
  publishedDir: string
  publishedPath: string
}> {
  const root = await mkdtemp(join(tmpdir(), 'analyst-notes-test-'))
  const workspaceDir = join(root, 'data', 'admin-workspace')
  const publishedDir = join(root, 'data', 'published')
  await mkdir(workspaceDir, { recursive: true })
  await mkdir(publishedDir, { recursive: true })
  return { root, workspaceDir, publishedDir, publishedPath: join(publishedDir, 'current.v1.json') }
}

/** Write a workspace file from the on-disk fixture, optionally injecting notes. */
async function seedWorkspace(
  workspaceDir: string,
  slug: string,
  notes?: Record<string, unknown>,
): Promise<void> {
  const seed = readSeed(slug)
  const wf = notes === undefined ? seed : { ...seed, notes }
  await writeFile(join(workspaceDir, `${slug}.json`), JSON.stringify(wf), 'utf8')
}

/** Write a published dataset carrying the fixture's resort (+ live signal). */
async function seedPublished(
  publishedPath: string,
  slug: string,
  opts: { withLiveSignal?: boolean } = {},
): Promise<void> {
  const withLive = opts.withLiveSignal ?? true
  const seed = readSeed(slug)
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
let deps: { workspaceRoot: string }

beforeEach(async (): Promise<void> => {
  ;({ root, workspaceDir, publishedPath } = await setupRoot())
  void publishedPath
  deps = { workspaceRoot: root }
})

afterEach(async (): Promise<void> => {
  vi.restoreAllMocks()
  vi.resetModules()
  vi.doUnmock('@snowboard-trip-advisor/schema/markdown')
  await rm(root, { recursive: true, force: true })
})

// ------------------------------------------------------------------
// GET handler (spec §3.2 GET)
// ------------------------------------------------------------------

describe('analystNotesGet (spec §3.2 GET)', (): void => {
  it('returns 404 not-found when slug exists in neither workspace nor published', async (): Promise<void> => {
    const { analystNotesGet } = await import('../analystNotes')
    await expect(
      analystNotesGet({ params: { slug: ResortSlug.parse('nope-resort') } }, deps),
    ).rejects.toMatchObject({ status: 404, code: 'not-found' })
  })

  it('returns 404 not-found when the published doc exists but lacks the slug', async (): Promise<void> => {
    // publishedDoc non-null but `.some(slug)` false → the cold-start
    // not-found branch (distinct from the no-published-doc 404 above).
    await seedPublished(publishedPath, 'spindleruv-mlyn')
    const { analystNotesGet } = await import('../analystNotes')
    await expect(
      analystNotesGet({ params: { slug: KOTELNICA } }, deps),
    ).rejects.toMatchObject({ status: 404, code: 'not-found' })
  })

  it('returns rendered notes from the workspace file', async (): Promise<void> => {
    await seedWorkspace(workspaceDir, 'kotelnica-bialczanska', {
      slopes_km: {
        schema_version: 1,
        markdown: '# title',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-02T00:00:00.000Z',
      },
    })
    const { analystNotesGet } = await import('../analystNotes')
    const result = await analystNotesGet({ params: { slug: KOTELNICA } }, deps)
    expect(result.slug).toBe('kotelnica-bialczanska')
    expect(result.notes['slopes_km']?.markdown).toBe('# title')
    expect(result.notes['slopes_km']?.html).toBe('<h1>title</h1>')
    expect(result.notes['slopes_km']?.created_at).toBe('2026-01-01T00:00:00.000Z')
  })

  it('returns empty notes on cold-start when only the published doc has the slug', async (): Promise<void> => {
    await seedPublished(publishedPath, 'kotelnica-bialczanska')
    const { analystNotesGet } = await import('../analystNotes')
    const result = await analystNotesGet({ params: { slug: KOTELNICA } }, deps)
    expect(result.slug).toBe('kotelnica-bialczanska')
    expect(result.notes).toStrictEqual({})
  })

  it('returns 500 workspace-corrupt on malformed workspace JSON', async (): Promise<void> => {
    await writeFile(join(workspaceDir, 'kotelnica-bialczanska.json'), '{invalid json', 'utf8')
    const { analystNotesGet } = await import('../analystNotes')
    await expect(
      analystNotesGet({ params: { slug: KOTELNICA } }, deps),
    ).rejects.toMatchObject({ status: 500, code: 'workspace-corrupt' })
  })

  it('returns 500 internal when the renderer throws (workspace data preserved)', async (): Promise<void> => {
    // Per plan §7 step 6 + step 15 guidance: a deterministic adversarial
    // markdown that crashes the frozen unified pipeline is fragile to pin,
    // so the render-exception path is exercised by stubbing the renderer to
    // throw for this one call. The behaviour under test is the handler's
    // try/catch → 500 `internal` mapping, not the renderer's internals
    // (those have their own XSS/fuzz corpus in markdown.test.ts).
    vi.doMock('@snowboard-trip-advisor/schema/markdown', () => ({
      renderAnalystNoteMarkdown: (): string => {
        throw new Error('synthetic render failure')
      },
    }))
    await seedWorkspace(workspaceDir, 'kotelnica-bialczanska', {
      slopes_km: {
        schema_version: 1,
        markdown: '# boom',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    })
    const before = await readFile(join(workspaceDir, 'kotelnica-bialczanska.json'), 'utf8')
    const { analystNotesGet } = await import('../analystNotes')
    await expect(
      analystNotesGet({ params: { slug: KOTELNICA } }, deps),
    ).rejects.toMatchObject({ status: 500, code: 'internal' })
    const after = await readFile(join(workspaceDir, 'kotelnica-bialczanska.json'), 'utf8')
    expect(after).toBe(before)
  })
})

// ------------------------------------------------------------------
// PUT handler (spec §3.2 PUT)
// ------------------------------------------------------------------

describe('analystNotesPut (spec §3.2 PUT)', (): void => {
  it('returns 400 invalid-request on a prototype-pollution path', async (): Promise<void> => {
    await seedWorkspace(workspaceDir, 'kotelnica-bialczanska')
    const { analystNotesPut } = await import('../analystNotes')
    await expect(
      analystNotesPut(
        {
          params: { slug: KOTELNICA },
          body: { path: '__proto__', markdown: 'x' },
        },
        deps,
      ),
    ).rejects.toMatchObject({ status: 400, code: 'invalid-request' })
  })

  it('upserts a new note on an existing (Epic-4-era, notes-less) workspace file', async (): Promise<void> => {
    await seedWorkspace(workspaceDir, 'kotelnica-bialczanska')
    const { analystNotesPut } = await import('../analystNotes')
    const result = await analystNotesPut(
      { params: { slug: KOTELNICA }, body: { path: 'slopes_km', markdown: '# title' } },
      deps,
    )
    expect(result.slug).toBe('kotelnica-bialczanska')
    expect(result.path).toBe('slopes_km')
    expect(result.note?.markdown).toBe('# title')
    expect(result.note?.html).toBe('<h1>title</h1>')

    const after = JSON.parse(
      await readFile(join(workspaceDir, 'kotelnica-bialczanska.json'), 'utf8'),
    ) as { notes: Record<string, { markdown: string }> }
    expect(after.notes['slopes_km']?.markdown).toBe('# title')
  })

  it('materializes the workspace file from the published doc on a cold-start PUT', async (): Promise<void> => {
    await seedPublished(publishedPath, 'kotelnica-bialczanska')
    const { analystNotesPut } = await import('../analystNotes')
    await analystNotesPut(
      { params: { slug: KOTELNICA }, body: { path: 'slopes_km', markdown: 'x' } },
      deps,
    )
    const wf = JSON.parse(
      await readFile(join(workspaceDir, 'kotelnica-bialczanska.json'), 'utf8'),
    ) as { resort: { slug: string }; notes: Record<string, { markdown: string }> }
    expect(wf.resort.slug).toBe('kotelnica-bialczanska')
    expect(wf.notes['slopes_km']?.markdown).toBe('x')
  })

  it('cold-start materializes with live_signal: null when the published doc has no matching signal', async (): Promise<void> => {
    await seedPublished(publishedPath, 'kotelnica-bialczanska', { withLiveSignal: false })
    const { analystNotesPut } = await import('../analystNotes')
    await analystNotesPut(
      { params: { slug: KOTELNICA }, body: { path: 'slopes_km', markdown: 'x' } },
      deps,
    )
    const wf = JSON.parse(
      await readFile(join(workspaceDir, 'kotelnica-bialczanska.json'), 'utf8'),
    ) as { live_signal: unknown; notes: Record<string, { markdown: string }> }
    expect(wf.live_signal).toBeNull()
    expect(wf.notes['slopes_km']?.markdown).toBe('x')
  })

  it('no-ops a delete against a published-only resort WITHOUT materializing a workspace file', async (): Promise<void> => {
    await seedPublished(publishedPath, 'kotelnica-bialczanska')
    const { analystNotesPut } = await import('../analystNotes')
    const result = await analystNotesPut(
      { params: { slug: KOTELNICA }, body: { path: 'slopes_km', markdown: null } },
      deps,
    )
    expect(result.note).toBeNull()
    await expect(stat(join(workspaceDir, 'kotelnica-bialczanska.json'))).rejects.toThrow()
  })

  it('deletes an existing note and persists the removal', async (): Promise<void> => {
    await seedWorkspace(workspaceDir, 'kotelnica-bialczanska', {
      slopes_km: {
        schema_version: 1,
        markdown: '# title',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    })
    const { analystNotesPut } = await import('../analystNotes')
    const result = await analystNotesPut(
      { params: { slug: KOTELNICA }, body: { path: 'slopes_km', markdown: null } },
      deps,
    )
    expect(result.note).toBeNull()
    const after = JSON.parse(
      await readFile(join(workspaceDir, 'kotelnica-bialczanska.json'), 'utf8'),
    ) as { notes: Record<string, unknown> }
    expect(after.notes['slopes_km']).toBeUndefined()
  })

  it('preserves created_at when upserting over an existing note', async (): Promise<void> => {
    await seedWorkspace(workspaceDir, 'kotelnica-bialczanska', {
      slopes_km: {
        schema_version: 1,
        markdown: 'old',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    })
    const { analystNotesPut } = await import('../analystNotes')
    const result = await analystNotesPut(
      { params: { slug: KOTELNICA }, body: { path: 'slopes_km', markdown: 'updated' } },
      deps,
    )
    expect(result.note?.created_at).toBe('2026-01-01T00:00:00.000Z')
    expect(new Date(result.note?.updated_at ?? 0).getTime()).toBeGreaterThan(
      new Date('2026-01-01T00:00:00.000Z').getTime(),
    )
  })

  it('does NOT write the workspace file when the renderer throws (recovery-preserving)', async (): Promise<void> => {
    // Critical per spec §3.2 PUT step 6 "Render BEFORE write". A render
    // exception must throw 500 `internal` BEFORE atomicWriteWorkspaceFile,
    // leaving the on-disk file byte-identical. A deterministic
    // pipeline-crashing markdown is fragile to pin, so the renderer is
    // stubbed to throw for this one call (plan §7 step 15 sanctioned).
    vi.doMock('@snowboard-trip-advisor/schema/markdown', () => ({
      renderAnalystNoteMarkdown: (): string => {
        throw new Error('synthetic render failure')
      },
    }))
    await seedWorkspace(workspaceDir, 'kotelnica-bialczanska', {
      slopes_km: {
        schema_version: 1,
        markdown: 'original',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    })
    const before = await readFile(join(workspaceDir, 'kotelnica-bialczanska.json'), 'utf8')
    const { analystNotesPut } = await import('../analystNotes')
    await expect(
      analystNotesPut(
        { params: { slug: KOTELNICA }, body: { path: 'slopes_km', markdown: 'updated' } },
        deps,
      ),
    ).rejects.toMatchObject({ status: 500, code: 'internal' })
    const after = await readFile(join(workspaceDir, 'kotelnica-bialczanska.json'), 'utf8')
    expect(after).toBe(before)
  })

  it('returns 404 not-found on a non-delete PUT when slug is in neither workspace nor published', async (): Promise<void> => {
    // Clean tmpdir: no workspace file, no published doc. A non-delete PUT
    // must 404 (the no-op-delete short-circuit only applies to markdown:null).
    const { analystNotesPut } = await import('../analystNotes')
    await expect(
      analystNotesPut(
        { params: { slug: KOTELNICA }, body: { path: 'slopes_km', markdown: 'x' } },
        deps,
      ),
    ).rejects.toMatchObject({ status: 404, code: 'not-found' })
  })

  it('returns 404 not-found when the published doc exists but does NOT carry the slug', async (): Promise<void> => {
    // Published doc present (with a DIFFERENT resort) + no workspace file →
    // exercises the publishedDoc-non-null / resort-not-found 404 path.
    await seedPublished(publishedPath, 'spindleruv-mlyn')
    const { analystNotesPut } = await import('../analystNotes')
    await expect(
      analystNotesPut(
        { params: { slug: KOTELNICA }, body: { path: 'slopes_km', markdown: 'x' } },
        deps,
      ),
    ).rejects.toMatchObject({ status: 404, code: 'not-found' })
  })

  it('returns 500 workspace-corrupt when the existing workspace file is malformed JSON', async (): Promise<void> => {
    await writeFile(join(workspaceDir, 'kotelnica-bialczanska.json'), '{not json', 'utf8')
    const { analystNotesPut } = await import('../analystNotes')
    await expect(
      analystNotesPut(
        { params: { slug: KOTELNICA }, body: { path: 'slopes_km', markdown: 'x' } },
        deps,
      ),
    ).rejects.toMatchObject({ status: 500, code: 'workspace-corrupt' })
  })

  it('deletes one note while leaving sibling notes intact', async (): Promise<void> => {
    await seedWorkspace(workspaceDir, 'kotelnica-bialczanska', {
      slopes_km: {
        schema_version: 1,
        markdown: '# slopes',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      lift_count: {
        schema_version: 1,
        markdown: '# lifts',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    })
    const { analystNotesPut } = await import('../analystNotes')
    const result = await analystNotesPut(
      { params: { slug: KOTELNICA }, body: { path: 'slopes_km', markdown: null } },
      deps,
    )
    expect(result.note).toBeNull()
    const after = JSON.parse(
      await readFile(join(workspaceDir, 'kotelnica-bialczanska.json'), 'utf8'),
    ) as { notes: Record<string, { markdown: string }> }
    expect(after.notes['slopes_km']).toBeUndefined()
    // The sibling note survived the rebuild-without-key path.
    expect(after.notes['lift_count']?.markdown).toBe('# lifts')
  })
})
