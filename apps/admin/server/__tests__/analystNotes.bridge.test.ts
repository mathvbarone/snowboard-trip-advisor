import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ResortSlug } from '@snowboard-trip-advisor/schema'
import type { ResortUpsertBody } from '@snowboard-trip-advisor/schema/api'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { analystNotesPut } from '../analystNotes'
import { resolveWorkspaceRoot } from '../dispatch'
import { resortUpsertHandler } from '../resortUpsert'
import { atomicWriteWorkspaceFile } from '../workspace'

// PR N.b3b §7.2 step 21 — cross-handler bridge integration.
//
// This is the inseparable-concern crux of N.b3b (§7.1): its pre-condition
// is that BOTH resortUpsert (N.b3a retrofit) AND analystNotesPut (this PR)
// wrap their read-merge-write in the SAME per-slug `withSlugLock`. A split
// that shipped the handler without this test would orphan the end-to-end
// concurrency guarantee. The two handlers touch DISJOINT regions of the
// same workspace file (resortUpsert → resort.* / editor_modes.*;
// analystNotesPut → notes.*); the lock must serialize them so neither
// handler's last-writer-wins atomic write clobbers the other's region.

const KOTELNICA = ResortSlug.parse('kotelnica-bialczanska')
const SEED_FIXTURE_DIR = join(resolveWorkspaceRoot(), 'tests/fixtures/admin-workspace')

let root: string
let workspaceDir: string
let targetPath: string

beforeEach(async (): Promise<void> => {
  root = await mkdtemp(join(tmpdir(), 'analyst-notes-bridge-'))
  workspaceDir = join(root, 'data', 'admin-workspace')
  await mkdir(workspaceDir, { recursive: true })
  await mkdir(join(root, 'data', 'published'), { recursive: true })
  targetPath = join(workspaceDir, 'kotelnica-bialczanska.json')
  // Seed an Epic-4-era workspace file (no `notes` key — the schema default
  // applies). Written via the canonical atomic helper.
  const seed = readFileSync(join(SEED_FIXTURE_DIR, 'kotelnica-bialczanska.json'), 'utf8')
  await atomicWriteWorkspaceFile(targetPath, seed)
})

afterEach(async (): Promise<void> => {
  await rm(root, { recursive: true, force: true })
})

describe('analyst-notes ↔ resortUpsert bridge (spec §3.2 PUT step 3, §5.5/§5.6)', (): void => {
  it('concurrent resortUpsert + analystNotesPut on the same slug serialize via withSlugLock — both writes survive on disk', async (): Promise<void> => {
    const deps = { workspaceRoot: root }

    // resortUpsert writes editor_modes.slopes_km. editor_modes is a
    // value-neutral edit (no metric VALUE changes) so it does not trip the
    // provenance-pairing guard — keeps this a pure concurrency test rather
    // than a provenance test.
    const upsertBody: ResortUpsertBody = { editor_modes: { slopes_km: 'manual' } }

    // analystNotesPut writes notes.slopes_km — a DISJOINT region of the same
    // workspace file. If the two handlers' read-merge-write cycles
    // interleaved (no shared lock), whichever wrote last would clobber the
    // other's region: the loser's edit would be absent from the final file.
    const upsertP = resortUpsertHandler({ params: { slug: KOTELNICA }, body: upsertBody }, deps)
    const notesP = analystNotesPut(
      { params: { slug: KOTELNICA }, body: { path: 'slopes_km', markdown: '# bridge note' } },
      deps,
    )

    const [, notesResult] = await Promise.all([upsertP, notesP])

    // Handler-level return shapes.
    expect(notesResult.note?.markdown).toBe('# bridge note')
    expect(notesResult.note?.html).toBe('<h1>bridge note</h1>')

    // The real guarantee: the FINAL on-disk file carries BOTH writes. Read
    // it raw (not via the schema) so we assert exactly what landed on disk.
    const final = JSON.parse(await readFile(targetPath, 'utf8')) as {
      resort: { slug: string }
      editor_modes: Record<string, string>
      notes: Record<string, { markdown: string }>
    }
    // resortUpsert's region survived (its write was not clobbered).
    expect(final.resort.slug).toBe('kotelnica-bialczanska')
    expect(final.editor_modes['slopes_km']).toBe('manual')
    // analystNotesPut's region survived (its write was not clobbered).
    expect(final.notes['slopes_km']?.markdown).toBe('# bridge note')
  })

  it('serializes under repeated concurrent interleavings — neither region is ever lost', async (): Promise<void> => {
    // Drive several rounds back-to-back. Each round fires both handlers
    // concurrently; the shared lock must keep every round's pair of writes
    // mutually consistent. A torn merge (read-before-other-write,
    // write-after) would surface as a missing region in some round.
    const deps = { workspaceRoot: root }
    for (let round = 0; round < 5; round++) {
      const markdown = `# round ${String(round)}`
      await Promise.all([
        resortUpsertHandler(
          { params: { slug: KOTELNICA }, body: { editor_modes: { slopes_km: 'manual' } } },
          deps,
        ),
        analystNotesPut(
          { params: { slug: KOTELNICA }, body: { path: 'slopes_km', markdown } },
          deps,
        ),
      ])
      const final = JSON.parse(await readFile(targetPath, 'utf8')) as {
        editor_modes: Record<string, string>
        notes: Record<string, { markdown: string }>
      }
      expect(final.editor_modes['slopes_km']).toBe('manual')
      expect(final.notes['slopes_km']?.markdown).toBe(markdown)
    }
  })
})
