import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ResortSlug, WorkspaceFile } from '@snowboard-trip-advisor/schema'
import type { ResortDetailResponse } from '@snowboard-trip-advisor/schema/api'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Cross-package deep imports via relative path — apps/admin/package.json
// declares no `exports` map and the eslint config bans
// `@snowboard-trip-advisor/admin-app/*` deep imports. Mirrors the existing
// resort-editor-read.test.tsx pattern.
import App from '../../../../apps/admin/src/App'
import { apiClient } from '../../../../apps/admin/src/lib/apiClient'
import { bridgeHandlers } from '../../../../apps/admin/src/mocks/realHandlers'
import { __resetForTests as resetResortDetail } from '../../../../apps/admin/src/state/useResortDetail'
import { __resetForTests as resetURLState } from '../../../../apps/admin/src/state/useURLState'
import { __resetForTests as resetWorkspaceState } from '../../../../apps/admin/src/state/useWorkspaceState'
import { server } from '../../../../apps/public/src/mocks/server'

// PR 4.4d Task 7 — bridge integration test for the editor write path.
//
// Per fold §5 + Decision D7 + Codex round-6 P2-8: per-test workspace tmpdir
// seeded with the kotelnica fixture; `bridgeHandlers(tmpdir)` swaps in the
// REAL apps/admin/server/* dispatch (so atomic-write actually lands on
// disk); `vi.stubGlobal('matchMedia', ...)` returning `matches: true` so
// the interactive above-md branch renders the DS Input + DS Button
// ModeToggle (the below-md fallback is covered by FieldRow.test.tsx);
// reload simulation calls `__resetForTests()` on BOTH useResortDetail
// and useWorkspaceState between unmount/remount so the module-scoped
// caches don't keep stale pre-PUT promises around (per fold §5 — without
// the reset, the test would pass spuriously).
//
// Real timers throughout: the bridge dispatch goes through node fs reads,
// which resolve on the event loop's I/O tick — fake timers don't drain
// macrotasks, so `vi.advanceTimersByTimeAsync` cannot wait on fs. The
// 500ms debounce is exercised via a real setTimeout wait.

// ResortSlug brand-parse exercises the seed-slug regex even though the
// integration flow drives the slug through the URL, not via prop. Keeping
// the parsed brand here pins the workspace fixture's slug to a real
// ResortSlug at module load so a drift in the seed file surfaces as an
// import-time failure rather than a mid-test mismatch.
void ResortSlug.parse('kotelnica-bialczanska')
const SEED_FIXTURE_DIR = join(process.cwd(), 'tests/fixtures/admin-workspace')
const DEBOUNCE_WAIT_MS = 800   // 500ms debounce + 300ms slack for fs I/O round-trip

interface TmpRoot {
  readonly root: string
  readonly workspaceDir: string
  readonly targetFile: string
}

async function setupTmpRoot(slug: string): Promise<TmpRoot> {
  const root = await mkdtemp(join(tmpdir(), 'editor-write-'))
  const workspaceDir = join(root, 'data', 'admin-workspace')
  await mkdir(workspaceDir, { recursive: true })
  const targetFile = join(workspaceDir, `${slug}.json`)
  await copyFile(join(SEED_FIXTURE_DIR, `${slug}.json`), targetFile)
  return { root, workspaceDir, targetFile }
}

function stubMatchMediaAboveMd(): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
}

let tmp: TmpRoot

beforeEach(async (): Promise<void> => {
  tmp = await setupTmpRoot('kotelnica-bialczanska')
  server.use(...bridgeHandlers(tmp.root))
  stubMatchMediaAboveMd()
  resetURLState()
  resetWorkspaceState()
  resetResortDetail()
  window.history.replaceState({}, '', '/?route=editor&slug=kotelnica-bialczanska')
})

afterEach(async (): Promise<void> => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  resetURLState()
  resetWorkspaceState()
  resetResortDetail()
  cleanup()
  await rm(tmp.root, { recursive: true, force: true })
})

async function renderAndAwaitEditor(): Promise<ReturnType<typeof render>> {
  let view!: ReturnType<typeof render>
  await act(async (): Promise<void> => {
    view = render(<App />)
    for (let i = 0; i < 30; i += 1) {
      await Promise.resolve()
    }
  })
  await waitFor((): void => {
    expect(screen.queryByRole('tablist', { name: 'Editor sections' })).not.toBeNull()
  }, { timeout: 8000, interval: 50 })
  return view
}

async function waitForDebounceAndFlush(): Promise<void> {
  // Real timer wait: the 500ms debounce fires, the PUT runs through the
  // bridge dispatch (multiple fs ops), the response arrives, prepopulate
  // updates the canonical cache, React reconciles. 800ms covers all of
  // this on local fs.
  await new Promise((r): void => { setTimeout(r, DEBOUNCE_WAIT_MS) })
  // Drain microtasks under act so React commits the post-PUT state.
  await act(async (): Promise<void> => {
    for (let i = 0; i < 30; i += 1) { await Promise.resolve() }
  })
}

describe('Editor write integration (PR 4.4d Task 7)', (): void => {
  it('top-level numeric MANUAL edit on slopes_km round-trips to disk with manual provenance (Decision D12)', async (): Promise<void> => {
    await renderAndAwaitEditor()

    // Flip slopes_km AUTO → MANUAL by clicking the durable-tab ModeToggle.
    fireEvent.click(screen.getByRole('button', { name: 'Mode for Slopes (km)' }))
    await waitForDebounceAndFlush()

    // After the mode-only PUT lands, the Input is visible (modeFor flipped
    // by both draft and canonical via the prepopulate-on-success path).
    const input = await screen.findByRole('textbox', { name: 'Slopes (km)' })
    fireEvent.change(input, { target: { value: '150' } })
    await waitForDebounceAndFlush()

    // On-disk filesystem assertion (NOT just MSW request log).
    const onDisk = JSON.parse(await readFile(tmp.targetFile, 'utf-8')) as unknown
    const wf = WorkspaceFile.parse(onDisk)
    expect(wf.editor_modes['slopes_km']).toBe('manual')
    expect(wf.resort.slopes_km).toBe(150)
    expect(wf.resort.field_sources['slopes_km']?.source).toBe('manual')
    // Other field_sources entries untouched (lift_count came from resort-feed in fixture).
    expect(wf.resort.field_sources['lift_count']?.source).toBe('resort-feed')
  })

  it('reload simulation: explicit __resetForTests() between unmount/remount triggers a cache-miss fetch AND the persisted state survives (fold §5)', async (): Promise<void> => {
    const first = await renderAndAwaitEditor()

    fireEvent.click(screen.getByRole('button', { name: 'Mode for Slopes (km)' }))
    await waitForDebounceAndFlush()
    const input = await screen.findByRole('textbox', { name: 'Slopes (km)' })
    fireEvent.change(input, { target: { value: '210' } })
    await waitForDebounceAndFlush()

    first.unmount()

    // Module-level caches survive unmount; the explicit reset is required
    // for the reload to actually round-trip through the server.
    resetResortDetail()
    resetWorkspaceState()

    const getSpy = vi.spyOn(apiClient, 'getResort')

    await renderAndAwaitEditor()

    // The freshly-loaded canonical state reflects the previously-persisted MANUAL value.
    expect(getSpy).toHaveBeenCalled()
    const reloadedInput = await screen.findByRole('textbox', { name: 'Slopes (km)' })
    expect(reloadedInput).toHaveValue('210')
    expect(screen.getByRole('button', { name: 'Mode for Slopes (km)' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('nested-path round-trip: season.start_month MANUAL edit preserves end_month sibling on disk (D10 + Codex round-13 P2-17)', async (): Promise<void> => {
    await renderAndAwaitEditor()

    fireEvent.click(screen.getByRole('button', { name: 'Mode for Season start' }))
    await waitForDebounceAndFlush()

    const input = await screen.findByRole('textbox', { name: 'Season start' })
    fireEvent.change(input, { target: { value: '11' } })
    await waitForDebounceAndFlush()

    const onDisk = JSON.parse(await readFile(tmp.targetFile, 'utf-8')) as unknown
    const wf = WorkspaceFile.parse(onDisk)
    // Sibling preserved (D10 hydration-on-edit).
    expect(wf.resort.season).toEqual({ start_month: 11, end_month: 4 })
    // editor_modes uses the FLAT dotted key (Codex round-13 P2-17).
    expect(wf.editor_modes['season.start_month']).toBe('manual')
    // Manual provenance for the edited path.
    expect(wf.resort.field_sources['season.start_month']?.source).toBe('manual')
  })
})

describe('useWorkspaceState — in-flight-clear race (PR 4.6c Decision K1)', (): void => {
  // The race window in production (localhost bridge) is sub-millisecond and
  // not deterministically observable. This integration test creates a
  // controlled in-flight window by wrapping `apiClient.upsertResort` in a
  // delay that BOTH respects the AbortSignal (clearTimeout when aborted)
  // AND delegates to the REAL bridge dispatch when not aborted — so the
  // test still exercises the on-disk atomic write path for the un-aborted
  // mode-only PUT that preceded the race. When the abort fires within the
  // delay window, the real upsertResort is never invoked → the workspace
  // file on disk does NOT carry the soon-to-be-cleared value, AND the SPA's
  // editor input renders blank.
  //
  // Honest residual scope: in production where the delay is < 1ms instead
  // of the test's 200ms window, the server may have already atomic-written
  // before the abort lands. The spec §7.13 amendment documents that
  // residual; this test pins the abort-wins half of the contract.
  it('K1: clear during in-flight PUT aborts the request → workspace file does NOT carry the typed value AND editor input renders blank', { timeout: 30_000 }, async (): Promise<void> => {
    await renderAndAwaitEditor()

    // Step 1: flip slopes_km to MANUAL (the input only renders for MANUAL
    // durable paths). The mode-only PUT lands on disk before our race
    // scenario starts.
    fireEvent.click(screen.getByRole('button', { name: 'Mode for Slopes (km)' }))
    await waitForDebounceAndFlush()
    const input = await screen.findByRole('textbox', { name: 'Slopes (km)' })

    // Step 2: install the delayed-pass-through spy. Existing in-flight (none
    // by now — mode PUT completed at step 1) is unaffected. New invocations
    // of `apiClient.upsertResort` (the value-edit PUT we're about to
    // trigger) wait 1500ms before reaching the real bridge dispatch — long
    // enough that the test's clear at ~600ms reliably hits the in-flight
    // window. The abort cancels the timer cleanly so the real PUT never
    // fires; the workspace file on disk is untouched by the cleared edit.
    const realUpsert = apiClient.upsertResort.bind(apiClient)
    let aborted = false
    vi.spyOn(apiClient, 'upsertResort').mockImplementation(
      (slug, body, opts): Promise<ResortDetailResponse> => new Promise((resolve, reject): void => {
        const signal = (opts as { signal?: AbortSignal } | undefined)?.signal
        const timer = setTimeout((): void => {
          // signal could only fire AFTER this setTimeout already ran; safe
          // to invoke the real bridge here.
          realUpsert(slug, body, opts).then(resolve, reject)
        }, 1500)
        if (signal !== undefined) {
          signal.addEventListener('abort', (): void => {
            clearTimeout(timer)
            aborted = true
            reject(new DOMException('aborted', 'AbortError'))
          })
        }
      }),
    )

    // Step 3: type 150 → debounce fires at 500ms → flush() invokes
    // upsertResort spy → spy's 1500ms timer ticking. Wait long enough to
    // confirm debounce has fired (600ms) but well before the 1500ms timer
    // elapses, so the clear at step 4 hits the in-flight window.
    fireEvent.change(input, { target: { value: '150' } })
    await new Promise((r): void => { setTimeout(r, 600) })

    // Step 4: clear the input mid-flight → clearFieldValue's path-gated
    // abort fires → spy's setTimeout is canceled → realUpsert never runs
    // → workspace file on disk is untouched by the cleared edit.
    fireEvent.change(input, { target: { value: '' } })
    await act(async (): Promise<void> => {
      for (let i = 0; i < 30; i += 1) { await Promise.resolve() }
    })

    expect(aborted).toBe(true)

    // SPA-side assertion: editor input renders blank locally (FieldRow's
    // localString tracking).
    expect(input).toHaveValue('')

    // Filesystem assertion: workspace file does NOT have slopes_km=150.
    // It retains the seed value (8 from kotelnica-bialczanska.json) AND
    // the editor_modes.slopes_km='manual' from the mode-only PUT at step 1.
    const onDisk = JSON.parse(await readFile(tmp.targetFile, 'utf-8')) as unknown
    const wf = WorkspaceFile.parse(onDisk)
    expect(wf.resort.slopes_km).toBe(8)
    expect(wf.editor_modes['slopes_km']).toBe('manual')
    // The cleared path's field_sources entry was dropped by clearFieldValue
    // (or never landed because the PUT was aborted before reaching disk);
    // the seed file's 'resort-feed' provenance remains.
    expect(wf.resort.field_sources['slopes_km']?.source).toBe('resort-feed')
  })
})
