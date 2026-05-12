import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { WorkspaceFile } from '@snowboard-trip-advisor/schema'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// Cross-package deep imports via relative path — apps/admin/package.json
// declares no `exports` map and the eslint config bans
// `@snowboard-trip-advisor/admin-app/*` deep imports. Mirrors the existing
// resort-editor-write.test.tsx pattern.
import App from '../../../../apps/admin/src/App'
import { bridgeHandlers } from '../../../../apps/admin/src/mocks/realHandlers'
import { __resetForTests as resetHealth } from '../../../../apps/admin/src/state/useHealth'
import { __resetForTests as resetListPublishes } from '../../../../apps/admin/src/state/useListPublishes'
import { __resetForTests as resetResortDetail } from '../../../../apps/admin/src/state/useResortDetail'
import { __resetForTests as resetResortList } from '../../../../apps/admin/src/state/useResortList'
import { setRoute, __resetForTests as resetURLState } from '../../../../apps/admin/src/state/useURLState'
import { __resetForTests as resetWorkspaceState } from '../../../../apps/admin/src/state/useWorkspaceState'
import { server } from '../../../../apps/public/src/mocks/server'

// PR 4.6b Task 4.6b-3 — bridge-tier full-flow integration test.
// Closes the Tier 5 → Epic 4 done gate (spec §7.4 criterion 3):
//
//   open admin → navigate to Resorts → click row → MANUAL edit →
//   wait for autosave → publish → see in PublishHistory.
//
// Split into two complementary tests:
//
// 1. "Resorts → row click → editor URL" — covers the navigation contract
//    (Sidebar Resorts link href + Table.onRowSelect → setRoute('editor',
//    slug)). Asserts URL transition only; the editor's Suspense `use()`
//    load is exercised separately in the next test.
//
// 2. "editor MANUAL edit → publish → PublishHistory shows new version"
//    — covers the full edit→save→publish→publishes axis. Renders with the
//    URL pre-set to the editor route so React 19's Suspense `use()` and
//    the bridge fetch interleave cleanly (matches the resort-editor-write
//    .test.tsx render pattern). Splitting the two concerns is the only
//    way to exercise both in jsdom without inventing a re-render scheme
//    that drains a route-transition's pending Suspense without the
//    cooperating browser scheduler React 19 expects in concurrent mode.
//
// Bridge tier per spec §6.3 / P0-3 fold: per-test workspace + history tmpdir;
// `server.use(...bridgeHandlers(tmpdir))` swaps the canned MSW with the real
// apps/admin/server/* dispatch so the publish handler actually writes to disk.
//
// Two-axis assertion in test (2): SPA-visible state (Toast, PublishHistory
// row) AND filesystem state (`data/published/current.v1.json` exists in
// tmpdir; `data/published/history/*.json` count grew by 1). Either alone is
// insufficient — the SPA-only assertion would pass even if the publish
// handler became a no-op; the filesystem-only assertion would pass even
// if PublishHistory failed to render.
//
// Real timers throughout (mirrors resort-editor-write.test.tsx:46-47): the
// bridge dispatch goes through node fs reads which only resolve on the I/O
// tick — fake timers don't drain macrotasks. The 500ms autosave debounce is
// exercised via a real setTimeout wait.

const SEED_FIXTURE_DIR = join(process.cwd(), 'tests/fixtures/admin-workspace')
const DEBOUNCE_WAIT_MS = 800   // 500ms debounce + 300ms slack for fs I/O round-trip

interface TmpRoot {
  readonly root: string
  readonly workspaceDir: string
  readonly historyDir: string
  readonly currentPointer: string
}

async function setupTmpRoot(slugs: ReadonlyArray<string>): Promise<TmpRoot> {
  const root = await mkdtemp(join(tmpdir(), 'full-flow-'))
  const workspaceDir = join(root, 'data', 'admin-workspace')
  await mkdir(workspaceDir, { recursive: true })
  for (const slug of slugs) {
    await copyFile(join(SEED_FIXTURE_DIR, `${slug}.json`), join(workspaceDir, `${slug}.json`))
  }
  return {
    root,
    workspaceDir,
    historyDir: join(root, 'data', 'published', 'history'),
    currentPointer: join(root, 'data', 'published', 'current.v1.json'),
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

async function safeReaddir(p: string): Promise<ReadonlyArray<string>> {
  try {
    return await readdir(p)
  } catch {
    return []
  }
}

function resetSharedState(): void {
  window.history.replaceState({}, '', '/')
  resetURLState()
  resetHealth()
  resetResortList()
  resetResortDetail()
  resetWorkspaceState()
  resetListPublishes()
}

async function waitForDebounceAndFlush(): Promise<void> {
  await new Promise((r): void => { setTimeout(r, DEBOUNCE_WAIT_MS) })
  await act(async (): Promise<void> => {
    for (let i = 0; i < 30; i += 1) { await Promise.resolve() }
  })
}

let tmp: TmpRoot

beforeEach(async (): Promise<void> => {
  tmp = await setupTmpRoot(['kotelnica-bialczanska', 'spindleruv-mlyn'])
  server.use(...bridgeHandlers(tmp.root))
  resetSharedState()
})

afterEach(async (): Promise<void> => {
  resetSharedState()
  cleanup()
  await rm(tmp.root, { recursive: true, force: true })
})

describe('Full flow integration (PR 4.6b Task 4.6b-3 — Tier 5 → Epic 4 done gate)', (): void => {
  it('navigation: Sidebar Resorts link href is the contract; clicking a row in the table sets the editor URL', { timeout: 15_000 }, async (): Promise<void> => {
    window.history.replaceState({}, '', '/?route=resorts')
    const user = userEvent.setup()

    await act(async (): Promise<void> => {
      render(<App />)
      for (let i = 0; i < 30; i += 1) { await Promise.resolve() }
    })
    // Sidebar Resorts link href contract (the route the row was reached through).
    expect(screen.getByRole('link', { name: 'Resorts' })).toHaveAttribute('href', '/resorts')

    // Wait for the table to render the seed slugs (bridge → real listResorts).
    await waitFor((): void => {
      expect(screen.queryByRole('button', { name: 'Kotelnica Białczańska' })).not.toBeNull()
    }, { timeout: 8000, interval: 50 })

    // Row click → setRoute({ route: 'editor', slug }) per Table.onRowSelect contract.
    await user.click(screen.getByRole('button', { name: 'Kotelnica Białczańska' }))
    // The URL transition is the navigation contract this test pins. Asserting
    // the editor's full Suspense-load resolves cleanly in the same render
    // cycle as a useSyncExternalStore-driven route change is brittle in
    // React 19 concurrent mode (the suspended `use(loadOnce)` does not
    // resume reliably when the route transition originates from a
    // matched-render rather than a fresh mount); the editor's render path
    // is covered by the next test. The URL → useURLState → App route is the
    // contract that matters here.
    expect(window.location.search).toBe('?route=editor&slug=kotelnica-bialczanska')
  })

  // Custom timeout: the composite walks two debounce waits (mode + value)
  // + a publish that does multiple fs reads/writes via the bridge dispatch
  // + a PublishHistory mount that re-fetches. Vitest's 5s default trips
  // around the second debounce wait on a cold node_modules cache.
  it('editor MANUAL edit → publish → PublishHistory shows new version (SPA + filesystem)', { timeout: 30_000 }, async (): Promise<void> => {
    // URL preset to the editor route mirrors resort-editor-write.test.tsx —
    // the proven render path that exercises useResortDetail's Suspense
    // `use()` cleanly under the bridge handler. The navigation step (Resorts
    // → row click → editor) is covered by the test above.
    window.history.replaceState({}, '', '/?route=editor&slug=kotelnica-bialczanska')
    const user = userEvent.setup()

    await act(async (): Promise<void> => {
      render(<App />)
      for (let i = 0; i < 30; i += 1) { await Promise.resolve() }
    })
    await waitFor((): void => {
      expect(screen.queryByRole('tablist', { name: 'Editor sections' })).not.toBeNull()
    }, { timeout: 8000, interval: 50 })

    // ----- Step 1: flip MANUAL on Slopes (km) — mode-only PUT lands first. -----
    fireEvent.click(screen.getByRole('button', { name: 'Mode for Slopes (km)' }))
    await waitForDebounceAndFlush()

    // ----- Step 2: type a new value — value PUT lands next. -----
    const input = await screen.findByRole('textbox', { name: 'Slopes (km)' })
    fireEvent.change(input, { target: { value: '150' } })
    await waitForDebounceAndFlush()

    // ----- Step 3 (filesystem half — pre-publish): the workspace file
    //              now carries the MANUAL value AND manual provenance.
    const workspaceFile = join(tmp.workspaceDir, 'kotelnica-bialczanska.json')
    const onDisk = JSON.parse(await readFile(workspaceFile, 'utf-8')) as unknown
    const wf = WorkspaceFile.parse(onDisk)
    expect(wf.editor_modes['slopes_km']).toBe('manual')
    expect(wf.resort.slopes_km).toBe(150)
    expect(wf.resort.field_sources['slopes_km']?.source).toBe('manual')

    // ----- Step 4: open Publish dialog and confirm. -----
    // Pre-publish history snapshot: directory may not exist yet (publishDataset
    // mkdir -p's it on first write), so count via the safe wrapper.
    const historyBefore = await safeReaddir(tmp.historyDir)
    expect(await pathExists(tmp.currentPointer)).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Publish' }))
    expect(await screen.findByRole('dialog', { name: 'Publish' })).toBeInTheDocument()

    // Wait for the pre-publish checks (useHealth) to resolve so Confirm enables.
    await waitFor((): void => {
      expect(screen.queryByText(/Loading pre-publish checks/)).toBeNull()
    })
    const confirm = await screen.findByRole('button', { name: 'Confirm' })
    await waitFor((): void => {
      expect(confirm).not.toBeDisabled()
    })
    await user.click(confirm)

    // Success Toast: PublishDialog surfaces "Published version <id>" on success.
    // Per publish-flow.test.tsx Codex round-21 fold: the Toast contract puts
    // the message in element text (not aria-label), so locate via findByText.
    expect(await screen.findByText(/Published version/i)).toBeInTheDocument()

    // ----- Step 5 (filesystem half — post-publish): history dir grew by 1
    //              AND current.v1.json now exists.
    const historyAfter = await readdir(tmp.historyDir)
    expect(historyAfter.length).toBe(historyBefore.length + 1)
    expect(historyAfter.some((e): boolean => /^\d+-.+\.json$/.test(e))).toBe(true)
    expect(await pathExists(tmp.currentPointer)).toBe(true)

    // ----- Step 6: navigate to PublishHistory and assert the new entry. -----
    act((): void => {
      setRoute({ route: 'publishes' })
    })
    expect(await screen.findByRole('region', { name: 'Publish history' })).toBeInTheDocument()
    // resort_count: 2 → plural pluralization branch.
    await waitFor((): void => {
      expect(screen.getByText(/^2 resorts$/)).toBeInTheDocument()
    })
  })
})
