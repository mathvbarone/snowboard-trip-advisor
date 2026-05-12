// Bridge integration test for the Tier 4 publish workflow (Decision I1).
// Exercises the full flow end-to-end against the REAL admin server dispatch
// (apps/admin/server/*) via the MSW bridge handlers — no canned-response
// mocks. Each test seeds its own per-test workspace tmpdir; the publish
// handler writes to that tmpdir so `data/published/history/` actually grows
// on disk and listPublishesHandler reads it back for the PublishHistory
// render.
//
// Per Codex round-18 PR #97 P2 fold: import `server` from
// apps/public/src/mocks/server (the singleton wired by
// tests/integration/test-setup.ts), NOT the admin unit-test server. The
// integration MSW lifecycle (listen / resetHandlers / close) binds to the
// public singleton; using the admin one would attach bridge handlers to an
// unstarted server and leave /api/* requests unhandled.
//
// Per Codex round-7 PR #97 P2 fold: use 4 `..` segments to reach the repo
// root from tests/integration/apps/admin/ (matches resort-editor-write.test
// .tsx:13). App is a DEFAULT export per apps/admin/src/App.tsx.

import { copyFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import App from '../../../../apps/admin/src/App'
import { bridgeHandlers } from '../../../../apps/admin/src/mocks/realHandlers'
import { __resetForTests as resetHealth } from '../../../../apps/admin/src/state/useHealth'
import { __resetForTests as resetListPublishes } from '../../../../apps/admin/src/state/useListPublishes'
import { __resetForTests as resetResortList } from '../../../../apps/admin/src/state/useResortList'
import { setRoute, __resetForTests as resetURLState } from '../../../../apps/admin/src/state/useURLState'
import { server } from '../../../../apps/public/src/mocks/server'

const SEED_FIXTURE_DIR = join(process.cwd(), 'tests/fixtures/admin-workspace')

async function setupTmpRoot(slugs: ReadonlyArray<string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'publish-flow-'))
  const workspaceDir = join(root, 'data', 'admin-workspace')
  await mkdir(workspaceDir, { recursive: true })
  for (const slug of slugs) {
    await copyFile(join(SEED_FIXTURE_DIR, `${slug}.json`), join(workspaceDir, `${slug}.json`))
  }
  return root
}

// Resetting URL + per-state module caches in BOTH before/afterEach mirrors
// resort-editor-write.test.tsx. Without symmetric reset the first test's
// terminal URL (?route=publishes) bleeds into the next test's first render.
function resetSharedState(): void {
  window.history.replaceState({}, '', '/')
  resetURLState()
  resetHealth()
  resetResortList()
  resetListPublishes()
}

describe('publish flow — bridge tier (PR 4.5d Task 4.5d-4)', (): void => {
  let workspaceRoot: string

  beforeEach((): void => {
    resetSharedState()
  })

  afterEach(async (): Promise<void> => {
    resetSharedState()
    await rm(workspaceRoot, { recursive: true, force: true })
  })

  it('happy path: open Publish → confirm → success Toast → navigate via Sidebar Publishes → PublishHistory shows the new entry', async (): Promise<void> => {
    workspaceRoot = await setupTmpRoot(['kotelnica-bialczanska', 'spindleruv-mlyn'])
    server.use(...bridgeHandlers(workspaceRoot))

    const user = userEvent.setup()
    render(<App />)

    // The Sidebar Publishes link's href is the query-string form so urlState's
    // parser (?route=publishes branch) routes correctly.
    expect(screen.getByRole('link', { name: 'Publishes' })).toHaveAttribute('href', '/?route=publishes')

    // Open the dialog from the header Publish button.
    await user.click(screen.getByRole('button', { name: 'Publish' }))
    expect(await screen.findByRole('dialog', { name: 'Publish' })).toBeInTheDocument()

    // Round-25 fold preflight: useHealth is pending right after open and the
    // round-1 P2 fold makes PublishDialog fail-closed (Confirm disabled while
    // health.value === null). Wait for the loading copy to disappear AND for
    // Confirm to be enabled before clicking.
    await waitFor((): void => {
      expect(screen.queryByText(/Loading pre-publish checks/)).toBeNull()
    })
    const confirm = await screen.findByRole('button', { name: 'Confirm' })
    await waitFor((): void => {
      expect(confirm).not.toBeDisabled()
    })

    await user.click(confirm)

    // Success Toast contract: `<div role="status"><span>{message}</span>…</div>`
    // with no aria-label. The `name` option matches the accessible name
    // (aria-label/-labelledby), NOT element text — locate by text content
    // instead so the assertion does not time out (Codex round-21 PR #97).
    const successToast = await screen.findByText(/Published version/i)
    expect(successToast).toBeInTheDocument()

    // The publish handler wrote a new archive to disk.
    const historyDir = join(workspaceRoot, 'data/published/history')
    const entries = await readdir(historyDir)
    expect(entries.some((e): boolean => /^\d+-.+\.json$/.test(e))).toBe(true)

    // Navigate to the publishes route. jsdom does not follow a real `<a href>`
    // click as a browser would, so drive the navigation through setRoute
    // (which the sidebar link would otherwise produce via popstate). The
    // setRoute target is the same query-string form as the link's href.
    act((): void => {
      setRoute({ route: 'publishes' })
    })

    // PublishHistory mounts and the freshly-published entry surfaces.
    expect(await screen.findByRole('region', { name: 'Publish history' })).toBeInTheDocument()
    await waitFor((): void => {
      // Two seed fixtures → resort_count: 2 → plural pluralization branch.
      expect(screen.getByText(/^2 resorts$/)).toBeInTheDocument()
    })
  })

  it('blocked state: empty workspace → empty-state tooltip; Confirm disabled', async (): Promise<void> => {
    workspaceRoot = await setupTmpRoot([])  // workspace dir exists but is empty
    server.use(...bridgeHandlers(workspaceRoot))

    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Publish' }))
    await screen.findByRole('dialog', { name: 'Publish' })

    // Wait for useHealth to resolve so the empty-workspace blocker can show.
    await waitFor((): void => {
      expect(screen.queryByText(/Loading pre-publish checks/)).toBeNull()
    })

    // Empty workspace → spec §4.3.1 `empty` blocker copy.
    expect(screen.getByText(/no resorts staged for publish/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
  })
})
