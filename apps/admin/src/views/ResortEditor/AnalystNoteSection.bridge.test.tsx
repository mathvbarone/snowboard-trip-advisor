import {
  ISODateTimeString,
  METRIC_FIELDS,
  ResortSlug,
  type FieldStateFor,
} from '@snowboard-trip-advisor/schema'
import {
  AnalystNotesGetResponse,
  ResortDetailResponse,
} from '@snowboard-trip-advisor/schema/api'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { server } from '../../mocks/server'
import {
  __resetForTests as resetFlushAll,
} from '../../state/flushAll'
import {
  __resetForTests as resetAnalystNoteDraft,
} from '../../state/useAnalystNoteDraft'
import {
  __resetForTests as resetAnalystNotes,
  prepopulateAnalystNotes,
} from '../../state/useAnalystNotes'
import {
  __resetForTests as resetResortDetail,
  prepopulateResortDetail,
} from '../../state/useResortDetail'
import { __resetForTests as resetURLState } from '../../state/useURLState'
import { __resetForTests as resetWorkspaceState } from '../../state/useWorkspaceState'
import { ResortEditor } from '../ResortEditor'
import { Shell } from '../Shell'

// PR N.c4 §11.2 step 18 — full-flow bridge test. ResortEditor → MetricPanel
// → FieldRow → (lazy) AnalystNoteSection → useAnalystNoteDraft → MSW PUT,
// exercising the real network shape (the same mocks/server.ts handlers the
// SPA hits at runtime), with per-test PUT spies via server.use().

const KB = ResortSlug.parse('kotelnica-bialczanska')
const OBS = '2026-04-26T08:00:00Z'
const HASH_64 = 'a'.repeat(64)

function makeFullDetail(): ResortDetailResponse {
  const fieldSources: Record<string, unknown> = {}
  const fieldStates: Record<string, FieldStateFor<unknown>> = {}
  for (const path of METRIC_FIELDS) {
    fieldSources[path] = {
      source: 'resort-feed',
      source_url: 'https://example.com/x',
      observed_at: OBS,
      fetched_at: OBS,
      upstream_hash: HASH_64,
      attribution_block: { en: 'Source: example.' },
    }
    fieldStates[path] = {
      state: 'live',
      value: 1,
      source: 'resort-feed',
      observed_at: ISODateTimeString.parse(OBS),
    }
  }
  return ResortDetailResponse.parse({
    resort: {
      schema_version: 1,
      slug: 'kotelnica-bialczanska',
      name: { en: 'Test Resort' },
      country: 'PL',
      region: { en: 'Test Region' },
      altitude_m: { min: 800, max: 2300 },
      slopes_km: 142,
      lift_count: 24,
      skiable_terrain_ha: 50,
      season: { start_month: 12, end_month: 4 },
      publish_state: 'published',
      field_sources: fieldSources,
    },
    live_signal: {
      schema_version: 1,
      resort_slug: 'kotelnica-bialczanska',
      observed_at: OBS,
      fetched_at: OBS,
      snow_depth_cm: 145,
      lifts_open: { count: 12, total: 24 },
      lift_pass_day: { amount: 50, currency: 'EUR' },
      lodging_sample: {
        median_eur: { amount: 80, currency: 'EUR' },
        sample_size: 30,
      },
      field_sources: fieldSources,
    },
    field_states: fieldStates,
  })
}

// Real timers throughout: the React.lazy dynamic import of AnalystNoteSection
// pulls the deep `unified` module graph, which needs the real microtask/macro
// task loop to settle (a frozen fake clock starves it). The autosave /
// preview debounces are short real waits absorbed by `waitFor`.
beforeEach((): void => {
  resetURLState()
  resetResortDetail()
  resetWorkspaceState()
  resetAnalystNotes()
  resetAnalystNoteDraft()
  resetFlushAll()
  window.history.replaceState({}, '', '/?route=editor&slug=kotelnica-bialczanska')
  // Seed both caches so the initial ResortEditor mount is synchronous (no
  // network suspense); only the PUT round-trips + the lazy import are async.
  prepopulateResortDetail(KB, makeFullDetail())
  prepopulateAnalystNotes(
    KB,
    AnalystNotesGetResponse.parse({ slug: KB, notes: {} }),
  )
})

afterEach((): void => {
  vi.restoreAllMocks()
  resetURLState()
  resetResortDetail()
  resetWorkspaceState()
  resetAnalystNotes()
  resetAnalystNoteDraft()
  resetFlushAll()
  server.resetHandlers()
})

describe('AnalystNoteSection bridge — full create→preview→delete flow', (): void => {
  it('creates, previews, and deletes a note end-to-end through ResortEditor', async (): Promise<void> => {
    const puts: Array<{ path: string; markdown: string | null }> = []
    server.use(
      http.put(
        '/api/analyst-notes/:slug',
        async ({ params, request }): Promise<Response> => {
          const slug = params.slug as string
          const body = (await request.json()) as {
            path: string
            markdown: string | null
          }
          puts.push(body)
          return HttpResponse.json({
            slug,
            path: body.path,
            note:
              body.markdown === null
                ? null
                : {
                    schema_version: 1 as const,
                    markdown: body.markdown,
                    html: `<p>${body.markdown}</p>`,
                    created_at: OBS,
                    updated_at: OBS,
                  },
          })
        },
      ),
    )

    const user = userEvent.setup()
    render(<ResortEditor slug={KB} />)

    // The Slopes (km) row's affordance starts at "📝 0" (no note).
    const row = await screen.findByLabelText('Slopes (km)')
    const affordance = within(row).getByRole('button', { name: 'Add note' })
    expect(affordance).toHaveTextContent('📝 0')

    // Expand → lazy-load AnalystNoteSection (real dynamic import).
    await user.click(affordance)
    const source = await screen.findByRole('textbox', {
      name: /note source/i,
    })

    // Type "hello" into the source pane.
    await user.type(source, 'hello')

    // Debounced autosave (500ms) fires the single-path delta PUT.
    await waitFor((): void => {
      expect(puts).toEqual([{ path: 'slopes_km', markdown: 'hello' }])
    })

    // Client-side preview (~150ms debounce) renders <p>hello</p> via the
    // SAME renderAnalystNoteMarkdown the server uses (parity).
    const preview = screen.getByLabelText(
      'sanitized preview of the note above',
    )
    await waitFor((): void => {
      expect(preview.innerHTML).toContain('<p>hello</p>')
    })

    // After the PUT settled, the cache holds html "<p>hello</p>" → text
    // "hello" → affordance label becomes "📝 5" / "Edit note".
    await waitFor((): void => {
      expect(
        within(row).getByRole('button', { name: 'Edit note' }),
      ).toHaveTextContent('📝 5')
    })

    // Delete → PUT { markdown: null }.
    await user.click(screen.getByRole('button', { name: 'Delete note' }))
    await waitFor((): void => {
      expect(puts).toEqual([
        { path: 'slopes_km', markdown: 'hello' },
        { path: 'slopes_km', markdown: null },
      ])
    })

    // The cache delta removes the note → affordance falls back to "📝 0".
    await waitFor((): void => {
      expect(
        within(row).getByRole('button', { name: 'Add note' }),
      ).toHaveTextContent('📝 0')
    })
  })

  // Codex P2 fold end-to-end coverage (spec §6.3 — "mod+enter forces
  // immediate flush via flushAllForSlug"). The SINGLE flush owner is Shell's
  // global keydown listener (lib/shortcuts.ts fires mod+enter from a focused
  // TEXTAREA per spec §3.10) → Shell.tsx onModEnter (editor route) →
  // flushAllForSlug → the note's registered useAnalystNoteDraft SlugStore
  // flusher → PUT. AnalystNoteSection's LOCAL mod+enter branch calls ONLY
  // e.preventDefault() (no flush, no stopPropagation): it suppresses the
  // textarea's default Enter action (newline insertion) so the save shortcut
  // never injects a stray "\n" the analyst didn't type, while the event still
  // bubbles to Shell's document-level listener for the (single) flush.
  // Wrapping ResortEditor in <Shell> mounts that document-level listener
  // (the other bridge test renders ResortEditor bare, so no Shell shortcut).
  // The save fires IMMEDIATELY (mod+enter), well before the 500ms debounce —
  // that timing is what proves the flush came from the shortcut, not the
  // debounced autosave — AND the saved markdown is EXACTLY the typed text
  // (no trailing newline) because the local preventDefault cancelled the
  // textarea's Enter default. The previous fold's `\n?` tolerance masked the
  // stray-newline bug (Codex round-8 P2) and is removed here.
  it('mod+enter SAVES exactly the typed text (no stray newline) via Shell → flushAllForSlug, single flush', async (): Promise<void> => {
    const puts: Array<{ path: string; markdown: string | null }> = []
    server.use(
      http.put(
        '/api/analyst-notes/:slug',
        async ({ params, request }): Promise<Response> => {
          const slug = params.slug as string
          const body = (await request.json()) as {
            path: string
            markdown: string | null
          }
          puts.push(body)
          return HttpResponse.json({
            slug,
            path: body.path,
            note:
              body.markdown === null
                ? null
                : {
                    schema_version: 1 as const,
                    markdown: body.markdown,
                    html: `<p>${body.markdown}</p>`,
                    created_at: OBS,
                    updated_at: OBS,
                  },
          })
        },
      ),
    )

    const user = userEvent.setup()
    render(
      <Shell>
        <ResortEditor slug={KB} />
      </Shell>,
    )

    const row = await screen.findByLabelText('Slopes (km)')
    const affordance = within(row).getByRole('button', { name: 'Add note' })
    await user.click(affordance)
    const source = await screen.findByRole('textbox', {
      name: /note source/i,
    })

    // Type then immediately mod+enter (do NOT wait for the 500ms debounce):
    // the PUT must come from Shell's shortcut → flushAllForSlug → the note
    // flusher, proving the shortcut (not the debounced autosave) drove the
    // save through Shell. The local mod+enter branch calls e.preventDefault()
    // so the textarea's default Enter action (newline insertion) is cancelled
    // — without it userEvent's Meta+Enter would inject a stray "\n" into the
    // draft the analyst never typed (Codex round-8 P2). The branch does NOT
    // stopPropagation, so the event still bubbles to Shell's document-level
    // listener → exactly ONE flushAllForSlug.
    await user.type(source, 'urgent note')
    await user.keyboard('{Meta>}{Enter}{/Meta}')

    await waitFor((): void => {
      expect(puts).toHaveLength(1)
    })
    // EXACT typed text — no `\n?` tolerance. preventDefault suppressed the
    // textarea's Enter default; a trailing newline here would mean the save
    // shortcut persisted content the analyst never typed.
    expect(puts[0]?.path).toBe('slopes_km')
    expect(puts[0]?.markdown).toBe('urgent note')

    // Single-flush regression guard (Codex round-6): the local branch must
    // NOT flush; Shell is the sole flush owner. If the local branch flushed
    // too, this slug would PUT twice (the second aborts/duplicates the
    // first). Give any erroneous second flush a chance to land.
    await waitFor((): void => {
      expect(puts).toHaveLength(1)
    })
  })
})
