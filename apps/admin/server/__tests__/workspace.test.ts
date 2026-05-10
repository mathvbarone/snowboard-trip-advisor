import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resolveWorkspaceRoot } from '../dispatch'
import {
  ensureWorkspaceDir,
  readPublishedDocOrNull,
  readWorkspaceFileForSlug,
  WorkspaceCorruptError,
} from '../workspace'

// Anchor against the repo root via resolveWorkspaceRoot — same helper
// production uses to find the workspaces-declaring package.json. Avoids
// import.meta.url under jsdom (the env this workspace pins via
// apps/admin/vite.config.ts) which is not a file: URL.
const SEED_FIXTURE_DIR = join(resolveWorkspaceRoot(), 'tests/fixtures/admin-workspace')

describe('ensureWorkspaceDir (PR 4.1b §2.2, spec §10.9)', (): void => {
  let root: string

  beforeEach(async (): Promise<void> => {
    root = await mkdtemp(join(tmpdir(), 'ws-test-'))
  })

  afterEach(async (): Promise<void> => {
    await rm(root, { recursive: true, force: true })
  })

  it('creates data/admin-workspace/ when absent', async (): Promise<void> => {
    await ensureWorkspaceDir(root)
    const s = await stat(join(root, 'data', 'admin-workspace'))
    expect(s.isDirectory()).toBe(true)
  })

  it('is idempotent (mkdir -p semantics)', async (): Promise<void> => {
    await ensureWorkspaceDir(root)
    await expect(ensureWorkspaceDir(root)).resolves.toBeUndefined()
  })

  it('creates the data parent dir too if missing', async (): Promise<void> => {
    await ensureWorkspaceDir(root)
    const dataStat = await stat(join(root, 'data'))
    expect(dataStat.isDirectory()).toBe(true)
  })
})

describe('readWorkspaceFileForSlug (PR 4.4a-2, spec §4.2 / §10.3.1)', (): void => {
  let root: string
  let workspaceDir: string

  beforeEach(async (): Promise<void> => {
    root = await mkdtemp(join(tmpdir(), 'ws-read-test-'))
    workspaceDir = join(root, 'data', 'admin-workspace')
    await mkdir(workspaceDir, { recursive: true })
  })

  afterEach(async (): Promise<void> => {
    await rm(root, { recursive: true, force: true })
  })

  it('returns the parsed WorkspaceFile when file exists and is valid', async (): Promise<void> => {
    const slug = 'kotelnica-bialczanska'
    const seedJson = readFileSync(join(SEED_FIXTURE_DIR, `${slug}.json`), 'utf8')
    await writeFile(join(workspaceDir, `${slug}.json`), seedJson, 'utf8')
    const wf = await readWorkspaceFileForSlug(workspaceDir, slug)
    expect(wf).not.toBeNull()
    expect(wf?.slug).toBe(slug)
    expect(wf?.resort.country).toBe('PL')
    expect(wf?.editor_modes).toEqual({})
  })

  it('returns null when the workspace file is missing (ENOENT)', async (): Promise<void> => {
    const wf = await readWorkspaceFileForSlug(workspaceDir, 'nonexistent-slug')
    expect(wf).toBeNull()
  })

  it('throws WorkspaceCorruptError when the file fails Zod parse', async (): Promise<void> => {
    const slug = 'corrupt-slug'
    // Valid JSON but missing required fields (e.g., schema_version, resort).
    await writeFile(join(workspaceDir, `${slug}.json`), JSON.stringify({ slug }), 'utf8')
    await expect(readWorkspaceFileForSlug(workspaceDir, slug)).rejects.toThrow(WorkspaceCorruptError)
  })

  it('throws WorkspaceCorruptError when the JSON itself is malformed (SyntaxError)', async (): Promise<void> => {
    const slug = 'malformed-json-slug'
    await writeFile(join(workspaceDir, `${slug}.json`), '{ this is not valid json', 'utf8')
    await expect(readWorkspaceFileForSlug(workspaceDir, slug)).rejects.toThrow(WorkspaceCorruptError)
  })

  it('WorkspaceCorruptError carries .code, .slug, .issues, .details for dispatch propagation', async (): Promise<void> => {
    const slug = 'introspection-slug'
    await writeFile(join(workspaceDir, `${slug}.json`), JSON.stringify({ slug }), 'utf8')
    await expect(readWorkspaceFileForSlug(workspaceDir, slug)).rejects.toMatchObject({
      code: 'workspace-corrupt',
      slug,
    })
    try {
      await readWorkspaceFileForSlug(workspaceDir, slug)
    } catch (e: unknown) {
      const err = e as WorkspaceCorruptError
      expect(err.issues.length).toBeGreaterThan(0)
      expect(err.details).toEqual({ slug, issues: err.issues })
    }
  })

  it('Codex P2 fold: filename/embedded-slug drift throws WorkspaceCorruptError (does NOT serve the wrong resort)', async (): Promise<void> => {
    // Author a valid WorkspaceFile that internally references a DIFFERENT
    // slug, then save it under the kotelnica filename. WorkspaceFile.parse
    // succeeds (internal slug consistency holds: top-level slug === resort.slug
    // === live_signal.resort_slug). Without the filename↔slug drift guard,
    // GET /api/resorts/kotelnica-bialczanska would serve the spindleruv resort.
    const seedJson = readFileSync(join(SEED_FIXTURE_DIR, 'spindleruv-mlyn.json'), 'utf8')
    await writeFile(join(workspaceDir, 'kotelnica-bialczanska.json'), seedJson, 'utf8')

    await expect(readWorkspaceFileForSlug(workspaceDir, 'kotelnica-bialczanska'))
      .rejects.toMatchObject({
        code: 'workspace-corrupt',
        slug: 'kotelnica-bialczanska',
      })
    await expect(readWorkspaceFileForSlug(workspaceDir, 'kotelnica-bialczanska'))
      .rejects.toThrow(/filename\/slug drift/)
  })
})

describe('readPublishedDocOrNull (PR 4.4a-2, spec §10.9)', (): void => {
  let root: string
  let publishedPath: string

  beforeEach(async (): Promise<void> => {
    root = await mkdtemp(join(tmpdir(), 'ws-pub-test-'))
    await mkdir(join(root, 'data', 'published'), { recursive: true })
    publishedPath = join(root, 'data', 'published', 'current.v1.json')
  })

  afterEach(async (): Promise<void> => {
    await rm(root, { recursive: true, force: true })
  })

  it('returns null when the file is missing', async (): Promise<void> => {
    const doc = await readPublishedDocOrNull(publishedPath)
    expect(doc).toBeNull()
  })

  it('returns null when the JSON is malformed (graceful per §10.9)', async (): Promise<void> => {
    await writeFile(publishedPath, 'not-valid-json{', 'utf8')
    const doc = await readPublishedDocOrNull(publishedPath)
    expect(doc).toBeNull()
  })

  it('returns null when the file fails Zod parse (graceful)', async (): Promise<void> => {
    await writeFile(publishedPath, JSON.stringify({ schema_version: 999 }), 'utf8')
    const doc = await readPublishedDocOrNull(publishedPath)
    expect(doc).toBeNull()
  })

  it('returns the parsed PublishedDataset when the file is valid', async (): Promise<void> => {
    // Build a minimal valid PublishedDataset by lifting the seed fixture's
    // resort + live_signal into the published-doc shape.
    const seed = JSON.parse(
      readFileSync(join(SEED_FIXTURE_DIR, 'kotelnica-bialczanska.json'), 'utf8'),
    ) as { resort: unknown; live_signal: unknown }
    const dataset = {
      schema_version: 1,
      published_at: '2026-04-29T08:00:00Z',
      resorts: [seed.resort],
      live_signals: [seed.live_signal],
      manifest: { resort_count: 1, generated_by: 'test', validator_version: 'test' },
    }
    await writeFile(publishedPath, JSON.stringify(dataset), 'utf8')
    const doc = await readPublishedDocOrNull(publishedPath)
    expect(doc).not.toBeNull()
    expect(doc?.resorts).toHaveLength(1)
    expect(doc?.resorts[0]?.slug).toBe('kotelnica-bialczanska')
  })
})
