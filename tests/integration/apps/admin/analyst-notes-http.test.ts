import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// Cross-package deep imports via relative path — mirrors the full-flow.test.tsx
// and resort-editor-write.test.tsx patterns. No `exports` map on admin package.
import { bridgeHandlers } from '../../../../apps/admin/src/mocks/realHandlers'
import { server } from '../../../../apps/public/src/mocks/server'

// PR N.b3b §7.2 permanent HTTP e2e suite — GET/PUT /api/analyst-notes/:slug.
//
// Drives the REAL backend over the HTTP-shaped MSW bridge: plain fetch() →
// MSW intercepts → bridgeHandlers → real in-process dispatch() → analystNotes
// handler → withSlugLock → renderAnalystNoteMarkdown + rehype-sanitize →
// atomicWriteWorkspaceFile → HTTP response. No spawned server.
//
// Two-axis assertions per test: HTTP status + JSON body AND on-disk workspace
// file. Either axis alone is insufficient — HTTP only would pass even if disk
// writes became no-ops; disk only would miss HTTP contract regressions.
//
// Each case gets a fresh mkdtemp root seeded into `server.use(bridgeHandlers)`.
// afterEach: server.resetHandlers() + rm of the tmp root.
//
// Import path for `server`: the integration project's test-setup.ts imports
// from apps/public/src/mocks/server (singleton MSW server); we import from
// the same path so server.use() registers on the same instance the setup file
// already called server.listen() on. Per full-flow.test.tsx line 22.

const SEED_FIXTURE_DIR = join(process.cwd(), 'tests/fixtures/admin-workspace')
const SLUG = 'kotelnica-bialczanska'

// ---- helpers ---------------------------------------------------------------

async function setupTmpRoot(): Promise<{ root: string; workspaceDir: string; publishedDir: string }> {
  const root = await mkdtemp(join(tmpdir(), 'analyst-notes-e2e-'))
  const workspaceDir = join(root, 'data', 'admin-workspace')
  const publishedDir = join(root, 'data', 'published')
  await mkdir(workspaceDir, { recursive: true })
  await mkdir(publishedDir, { recursive: true })
  return { root, workspaceDir, publishedDir }
}

/** Copy the on-disk fixture into the workspace dir (± injected notes). */
async function seedWorkspace(
  workspaceDir: string,
  slug: string,
  notes?: Record<string, unknown>,
): Promise<void> {
  if (notes === undefined) {
    await copyFile(join(SEED_FIXTURE_DIR, `${slug}.json`), join(workspaceDir, `${slug}.json`))
    return
  }
  const base = JSON.parse(await readFile(join(SEED_FIXTURE_DIR, `${slug}.json`), 'utf8')) as Record<string, unknown>
  await writeFile(
    join(workspaceDir, `${slug}.json`),
    JSON.stringify({ ...base, notes }),
    'utf8',
  )
}

/**
 * Write a published dataset carrying the fixture's resort + live_signal.
 * Mirrors analystNotes.test.ts `seedPublished` exactly (same schema shape).
 */
async function seedPublished(publishedDir: string, slug: string): Promise<void> {
  const seed = JSON.parse(
    await readFile(join(SEED_FIXTURE_DIR, `${slug}.json`), 'utf8'),
  ) as { resort: unknown; live_signal: unknown }
  const dataset = {
    schema_version: 1,
    published_at: '2026-04-29T08:00:00Z',
    resorts: [seed.resort],
    live_signals: [seed.live_signal],
    manifest: { resort_count: 1, generated_by: 'test', validator_version: 'test' },
  }
  await writeFile(
    join(publishedDir, 'current.v1.json'),
    JSON.stringify(dataset),
    'utf8',
  )
}

async function pathExists(p: string): Promise<boolean> {
  try { await stat(p); return true } catch { return false }
}

function get(slug: string): Promise<Response> {
  return fetch(`/api/analyst-notes/${slug}`)
}

function put(slug: string, body: unknown): Promise<Response> {
  return fetch(`/api/analyst-notes/${slug}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ---- suite -----------------------------------------------------------------

let root: string
let workspaceDir: string
let publishedDir: string

beforeEach(async (): Promise<void> => {
  ;({ root, workspaceDir, publishedDir } = await setupTmpRoot())
  server.use(...bridgeHandlers(root))
})

afterEach(async (): Promise<void> => {
  server.resetHandlers()
  await rm(root, { recursive: true, force: true })
})

describe('GET /PUT /api/analyst-notes/:slug — HTTP e2e (MSW bridge → real dispatch)', (): void => {

  // ---- case 1: 404 on unknown slug -----------------------------------------

  it('1. GET unknown slug (no workspace, no published) → 404 not-found', async (): Promise<void> => {
    const res = await get('totally-unknown-resort')
    expect(res.status).toBe(404)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('not-found')
  })

  // ---- case 2: GET empty notes when workspace has none ---------------------

  it('2. GET seeded workspace with no notes → 200, notes deep-equals {}', async (): Promise<void> => {
    await seedWorkspace(workspaceDir, SLUG)
    const res = await get(SLUG)
    expect(res.status).toBe(200)
    const body = await res.json() as { slug: string; notes: Record<string, unknown> }
    expect(body.slug).toBe(SLUG)
    expect(body.notes).toStrictEqual({})
  })

  // ---- case 3: PUT upsert + render -----------------------------------------

  it('3. PUT upsert → 200, note.markdown preserved, note.html rendered', async (): Promise<void> => {
    await seedWorkspace(workspaceDir, SLUG)
    const res = await put(SLUG, { path: 'slopes_km', markdown: '# E2E heading' })
    expect(res.status).toBe(200)
    const body = await res.json() as {
      slug: string
      path: string
      note: { markdown: string; html: string }
    }
    expect(body.slug).toBe(SLUG)
    expect(body.path).toBe('slopes_km')
    expect(body.note.markdown).toBe('# E2E heading')
    // Proves the live render pipeline ran through HTTP: the markdown is
    // converted to HTML by unified/rehype, not merely echoed back.
    expect(body.note.html).toBe('<h1>E2E heading</h1>')
    // On-disk: raw markdown stored (no html key stored — render-on-read).
    const onDisk = JSON.parse(
      await readFile(join(workspaceDir, `${SLUG}.json`), 'utf8'),
    ) as { notes: Record<string, { markdown: string; html?: string }> }
    expect(onDisk.notes['slopes_km']?.markdown).toBe('# E2E heading')
    expect(onDisk.notes['slopes_km']?.html).toBeUndefined()
  })

  // ---- case 4: GET reflects the upsert ------------------------------------

  it('4. GET after PUT upsert → notes.slopes_km.html rendered, markdown preserved', async (): Promise<void> => {
    await seedWorkspace(workspaceDir, SLUG)
    await put(SLUG, { path: 'slopes_km', markdown: '# E2E heading' })
    const res = await get(SLUG)
    expect(res.status).toBe(200)
    const body = await res.json() as {
      notes: Record<string, { markdown: string; html: string }>
    }
    expect(body.notes['slopes_km']?.html).toBe('<h1>E2E heading</h1>')
    expect(body.notes['slopes_km']?.markdown).toBe('# E2E heading')
  })

  // ---- case 5: sanitizer-through-HTTP (headline security e2e) ------------
  //
  // Why this fails on regression:
  //   The assertion checks that note.html does NOT contain '<script' or
  //   'onerror=' AND that it DOES contain '<img src="x">' (allowing the
  //   safe attribute) and the text 'safe'. If the sanitizer were bypassed
  //   (raw markdown echoed as html), the returned html would contain
  //   `<script>alert(1)</script>` and `onerror=alert(1)` verbatim — the
  //   `.not.toContain('<script')` and `.not.toContain('onerror=')` checks
  //   would both fail. Conversely, if the render pipeline were removed and
  //   the handler returned an empty string or null, the `.toContain('safe')`
  //   check would fail. The assertion is thus tight in both directions.
  //
  //   Additionally, the on-disk check verifies the raw markdown (NOT html)
  //   is stored — if the handler started storing rendered/sanitized html
  //   in the file (violating render-on-read), the `html` key would be
  //   present and the `toBeUndefined` assertion would fail.

  it('5. Sanitizer-through-HTTP: script stripped, onerror stripped, safe text preserved; raw markdown on disk (no html key)', async (): Promise<void> => {
    await seedWorkspace(workspaceDir, SLUG)
    const xssMarkdown = '<script>alert(1)</script><img src=x onerror=alert(1)>safe'
    const res = await put(SLUG, { path: 'slopes_km', markdown: xssMarkdown })
    expect(res.status).toBe(200)
    const body = await res.json() as { note: { html: string; markdown: string } }
    const html = body.note.html

    // No script element survives (XSS stripped).
    expect(html).not.toContain('<script')
    // No event handler attribute survives (onerror= stripped).
    expect(html).not.toContain('onerror=')
    // The safe img src attribute is preserved (sanitizer allows src=x on img).
    expect(html).toContain('<img src="x">')
    // The safe text node is preserved.
    expect(html).toContain('safe')

    // On-disk: raw markdown stored verbatim (render-on-read architecture).
    // If a stale stored html value were present on disk, an attacker could
    // bypass the sanitizer by reading the file directly. This assertion
    // ensures the stored shape contains only the unmodified markdown input
    // and no `html` key (which would represent the forbidden store-on-write
    // pattern).
    const onDisk = JSON.parse(
      await readFile(join(workspaceDir, `${SLUG}.json`), 'utf8'),
    ) as { notes: Record<string, { markdown: string; html?: string }> }
    expect(onDisk.notes['slopes_km']?.markdown).toBe(xssMarkdown)
    expect(onDisk.notes['slopes_km']?.html).toBeUndefined()
  })

  // ---- case 6: delete via PUT markdown:null --------------------------------

  it('6. PUT markdown:null → 200 note:null; GET omits key; on-disk has no slopes_km', async (): Promise<void> => {
    await seedWorkspace(workspaceDir, SLUG, {
      slopes_km: {
        schema_version: 1,
        markdown: '# will be deleted',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    })
    const putRes = await put(SLUG, { path: 'slopes_km', markdown: null })
    expect(putRes.status).toBe(200)
    const putBody = await putRes.json() as { note: null }
    expect(putBody.note).toBeNull()

    // GET reflects deletion.
    const getRes = await get(SLUG)
    expect(getRes.status).toBe(200)
    const getBody = await getRes.json() as { notes: Record<string, unknown> }
    expect(getBody.notes['slopes_km']).toBeUndefined()

    // On-disk workspace file has no slopes_km key.
    const onDisk = JSON.parse(
      await readFile(join(workspaceDir, `${SLUG}.json`), 'utf8'),
    ) as { notes: Record<string, unknown> }
    expect(onDisk.notes['slopes_km']).toBeUndefined()
  })

  // ---- case 7: 400 on invalid body ----------------------------------------

  it('7. PUT {path:"Bad Path"} → 400 invalid-request (NotePath rejects capitals)', async (): Promise<void> => {
    await seedWorkspace(workspaceDir, SLUG)
    const res = await put(SLUG, { path: 'Bad Path', markdown: 'x' })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: { code: string } }
    expect(body.error.code).toBe('invalid-request')
  })

  // ---- case 8: cold-start materialize (e2e-distinctive) -------------------

  it('8. Cold-start: no workspace file, only published → PUT note → workspace materialized on disk', async (): Promise<void> => {
    await seedPublished(publishedDir, SLUG)
    // No workspace file written — directory exists but is empty.

    const res = await put(SLUG, { path: 'slopes_km', markdown: 'cold-start note' })
    expect(res.status).toBe(200)
    const body = await res.json() as { note: { markdown: string } }
    expect(body.note.markdown).toBe('cold-start note')

    // Workspace file now exists on disk (materialized from published).
    const workspacePath = join(workspaceDir, `${SLUG}.json`)
    expect(await pathExists(workspacePath)).toBe(true)
    const onDisk = JSON.parse(await readFile(workspacePath, 'utf8')) as {
      resort: { slug: string }
      notes: Record<string, { markdown: string }>
    }
    expect(onDisk.resort.slug).toBe(SLUG)
    expect(onDisk.notes['slopes_km']?.markdown).toBe('cold-start note')
  })

  // ---- case 9: no-op delete short-circuit (e2e-distinctive) ---------------

  it('9. No-op delete: no workspace, only published → PUT markdown:null → 200 null, NO workspace file written', async (): Promise<void> => {
    await seedPublished(publishedDir, SLUG)

    const res = await put(SLUG, { path: 'slopes_km', markdown: null })
    expect(res.status).toBe(200)
    const body = await res.json() as { note: null }
    expect(body.note).toBeNull()

    // The short-circuit must NOT materialize a workspace file — doing so
    // would shadow future published-dataset updates for a resort the analyst
    // has never touched.
    const workspacePath = join(workspaceDir, `${SLUG}.json`)
    expect(await pathExists(workspacePath)).toBe(false)
  })

  // ---- case 10: concurrency through the HTTP boundary ---------------------
  //
  // Why this fails on regression:
  //   Two concurrent PUTs for DIFFERENT note paths (slopes_km and lift_count)
  //   race against a single workspace file. Without `withSlugLock` the two
  //   handlers' read-merge-write cycles can interleave: whichever handler
  //   reads the file second sees only the state BEFORE the first write, so
  //   the first handler's note is silently overwritten. The final on-disk
  //   assertion checks BOTH keys exist. If `withSlugLock` were removed or
  //   broken, one of the two notes would be absent from the final file and
  //   the assertion would fail. The test is therefore a genuine regression
  //   detector for lock removal or implementation drift.

  it('10. Concurrent PUTs to two different paths → both land on disk (withSlugLock serializes)', async (): Promise<void> => {
    await seedWorkspace(workspaceDir, SLUG)

    const [res1, res2] = await Promise.all([
      put(SLUG, { path: 'slopes_km', markdown: '# slopes note' }),
      put(SLUG, { path: 'lift_count', markdown: '# lift note' }),
    ])

    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)

    // Both notes must survive on disk — a torn merge (no lock) would drop one.
    const onDisk = JSON.parse(
      await readFile(join(workspaceDir, `${SLUG}.json`), 'utf8'),
    ) as { notes: Record<string, { markdown: string }> }
    expect(onDisk.notes['slopes_km']?.markdown).toBe('# slopes note')
    expect(onDisk.notes['lift_count']?.markdown).toBe('# lift note')
  })
})
