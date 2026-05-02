import { describe, expect, it } from 'vitest'

import { Resort } from './resort'
import { WorkspaceFile } from './workspaceFile'

const HASH_64 = 'a'.repeat(64)
const OBS_AT = '2026-04-26T08:00:00Z'

const fieldSourceFor = (path: string): Record<string, unknown> => ({
  source: 'manual',
  source_url: `https://example.com/${path}`,
  observed_at: OBS_AT,
  fetched_at: OBS_AT,
  upstream_hash: HASH_64,
  attribution_block: { en: 'manual entry' },
})

const baseResort = (overrides: { field_sources?: Record<string, unknown>; publish_state?: 'draft' | 'published' } = {}): Resort =>
  Resort.parse({
    schema_version: 1,
    slug: 'kotelnica-bialczanska',
    name: { en: 'Kotelnica Białczańska' },
    country: 'PL',
    region: { en: 'Lesser Poland' },
    altitude_m: { min: 800, max: 1000 },
    slopes_km: 10,
    lift_count: 5,
    skiable_terrain_ha: 50,
    season: { start_month: 12, end_month: 4 },
    publish_state: overrides.publish_state ?? 'published',
    field_sources: overrides.field_sources ?? { snow_depth_cm: fieldSourceFor('snow_depth_cm') },
  })

describe('WorkspaceFile (PR 4.1a, spec §10.2)', (): void => {
  it('parses a workspace with editor_modes ⊆ field_sources', (): void => {
    const r = baseResort({ field_sources: { snow_depth_cm: fieldSourceFor('snow_depth_cm') } })
    const wf = WorkspaceFile.parse({
      schema_version: 1,
      slug: 'kotelnica-bialczanska',
      resort: r,
      live_signal: null,
      modified_at: OBS_AT,
      editor_modes: { snow_depth_cm: 'manual' },
    })
    expect(wf.editor_modes).toEqual({ snow_depth_cm: 'manual' })
  })

  it('defaults editor_modes to {} when missing', (): void => {
    const r = baseResort()
    const wf = WorkspaceFile.parse({
      schema_version: 1,
      slug: 'kotelnica-bialczanska',
      resort: r,
      live_signal: null,
      modified_at: OBS_AT,
    })
    expect(wf.editor_modes).toEqual({})
  })

  it('rejects ghost paths in editor_modes (resort has only snow_depth_cm; editor_modes references lift_count)', (): void => {
    const r = baseResort({ field_sources: { snow_depth_cm: fieldSourceFor('snow_depth_cm') } })
    const result = WorkspaceFile.safeParse({
      schema_version: 1,
      slug: 'kotelnica-bialczanska',
      resort: r,
      live_signal: null,
      modified_at: OBS_AT,
      editor_modes: { lift_count: 'manual' },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('lift_count')
      expect(result.error.issues[0]?.path).toEqual(['editor_modes'])
    }
  })

  it('rejects empty-string keys in editor_modes (defensive)', (): void => {
    const r = baseResort()
    const result = WorkspaceFile.safeParse({
      schema_version: 1,
      slug: 'kotelnica-bialczanska',
      resort: r,
      live_signal: null,
      modified_at: OBS_AT,
      editor_modes: { '': 'manual' },
    })
    expect(result.success).toBe(false)
  })

  it('parses cleanly without a published-doc context (cold-start §10.9 — draft resort, never published)', (): void => {
    const r = baseResort({ publish_state: 'draft', field_sources: {} })
    const wf = WorkspaceFile.parse({
      schema_version: 1,
      slug: 'kotelnica-bialczanska',
      resort: r,
      live_signal: null,
      modified_at: OBS_AT,
    })
    expect(wf.schema_version).toBe(1)
    expect(wf.editor_modes).toEqual({})
  })

  describe('slug consistency (Codex round-3 P2 fold)', (): void => {
    it('rejects when top-level slug disagrees with resort.slug', (): void => {
      const r = baseResort()  // resort.slug === 'kotelnica-bialczanska'
      const result = WorkspaceFile.safeParse({
        schema_version: 1,
        slug: 'spindleruv-mlyn',  // different from resort.slug
        resort: r,
        live_signal: null,
        modified_at: OBS_AT,
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        const slugIssue = result.error.issues.find(
          (i): boolean => i.path.join('.') === 'resort.slug',
        )
        expect(slugIssue?.message).toContain('spindleruv-mlyn')
        expect(slugIssue?.message).toContain('kotelnica-bialczanska')
      }
    })

    it('rejects when live_signal.resort_slug disagrees with top-level slug', (): void => {
      const r = baseResort()  // resort.slug === 'kotelnica-bialczanska'
      const result = WorkspaceFile.safeParse({
        schema_version: 1,
        slug: 'kotelnica-bialczanska',
        resort: r,
        live_signal: {
          schema_version: 1,
          resort_slug: 'spindleruv-mlyn',  // different from top-level slug
          observed_at: OBS_AT,
          fetched_at: OBS_AT,
          field_sources: {},
        },
        modified_at: OBS_AT,
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        const issue = result.error.issues.find(
          (i): boolean => i.path.join('.') === 'live_signal.resort_slug',
        )
        expect(issue).toBeDefined()
      }
    })

    it('accepts when top-level slug, resort.slug, and live_signal.resort_slug all agree', (): void => {
      const r = baseResort()
      const result = WorkspaceFile.safeParse({
        schema_version: 1,
        slug: 'kotelnica-bialczanska',
        resort: r,
        live_signal: {
          schema_version: 1,
          resort_slug: 'kotelnica-bialczanska',
          observed_at: OBS_AT,
          fetched_at: OBS_AT,
          field_sources: {},
        },
        modified_at: OBS_AT,
      })
      expect(result.success).toBe(true)
    })

    it('accepts when live_signal is null (no resort_slug to verify)', (): void => {
      const r = baseResort()
      const result = WorkspaceFile.safeParse({
        schema_version: 1,
        slug: 'kotelnica-bialczanska',
        resort: r,
        live_signal: null,
        modified_at: OBS_AT,
      })
      expect(result.success).toBe(true)
    })
  })

  it('passthrough preserves unknown top-level keys (forward-compat for analyst-notes)', (): void => {
    const r = baseResort()
    const input = {
      schema_version: 1,
      slug: 'kotelnica-bialczanska',
      resort: r,
      live_signal: null,
      modified_at: OBS_AT,
      notes: { snow_depth_cm: { md: 'note' } },
    }
    const wf = WorkspaceFile.parse(input) as { notes?: unknown }
    expect(wf.notes).toEqual(input.notes)
  })
})
