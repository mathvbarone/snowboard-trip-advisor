# Epic 4 Tier 4 — Admin Publish Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan PR-by-PR. Steps use checkbox (`- [ ]`) syntax for tracking. Each PR is its own atomic concern; do **not** bundle. Read the **Reviewer-fold log** at the bottom before starting Task 1 of any PR. Per memory `feedback_atomic_prs.md`: ≤8 files per PR; one concern per PR.

**Goal:** Ship the admin publish workflow — server-side publish + listPublishes handlers, a Toast design-system primitive, the PublishDialog with pre-publish blocking-state gating, and the PublishHistory view — closing the Tier 4 → Tier 5 gate ([spec §7.4](../specs/2026-05-01-epic-4-admin-app-design.md)).

**Architecture:** The publish handler reads `data/admin-workspace/**` ∪ `data/published/current.v1.json` (workspace overrides per slug), composes a `PublishedDataset` envelope, and delegates to `publishDataset()` from `@snowboard-trip-advisor/schema/node` — same library the Epic 2 CLI / `publishDataset.test.ts` exercises. listPublishes parses `data/published/history/${counter}-${isoTimestamp}.json` filenames. PublishDialog reads `GET /api/health` (no client-side `validatePublishedDataset` import per [spec §4.3.1](../specs/2026-05-01-epic-4-admin-app-design.md#431-pre-publish-blocking-state-surface)); confirm-button disabled gates on 4 health fields. Toast is a single-slot DS primitive with 3 variants. PublishHistory uses a Suspense-friendly hook mirroring `useResortList`'s pattern.

**Tech Stack:** TypeScript strict, React 19, Zod v4, MSW tiered (canned + bridge), Vitest + jest-axe, `<div role="dialog" aria-modal="true">` for modal (raw `<dialog>` JSX banned by `eslint.config.js:19` `RAW_HTML_ELS`).

---

## Tier 4 → Tier 5 gate (what we are proving)

Per [spec §7.4](../specs/2026-05-01-epic-4-admin-app-design.md), after PRs 4.5a/b/c/d merge:

1. Publish dialog → POST → `data/published/history/` grows on disk (verified via bridge test); Toast renders on success/failure; PublishHistory shows the new version.
2. Pre-publish blocking-state surface gates correctly on all four conditions: `resorts_with_failed_fields > 0`, `resorts_with_missing_provenance > 0`, `resorts_with_corrupt_workspace > 0`, `resorts_total === 0`. Each disabled-state's tooltip text verified per [spec §4.3.1](../specs/2026-05-01-epic-4-admin-app-design.md#431-pre-publish-blocking-state-surface).
3. `npm run qa` green on `main` after each PR merges.

---

## Decisions log

| ID | Decision | Why |
|---|---|---|
| **A1** | Tier 4 ships as **4 PRs**: 4.5a (server) → 4.5b (Toast DS primitive) → 4.5c (state hooks + PublishDialog + Shell wire-up; ships both `usePublish` AND `useListPublishes` so `usePublish.invalidateListPublishes()` resolves at compile time) → 4.5d (PublishHistory view + routing + bridge integration). Spec §7.15 bundled all UI in one PR (4.5b); execution splits for the ≤8-file-budget per `feedback_atomic_prs.md`. Same pattern as Tier 3's 4.4a split into 4.4a-1 + 4.4a-2. **Note on dependency ordering** (Codex-equivalent plan review P0-1 fold): `usePublish` (PR 4.5c) imports `invalidateListPublishes` from `useListPublishes`; therefore `useListPublishes.ts` ships in **PR 4.5c**, not 4.5d. PR 4.5d ships only the `PublishHistory` view + URL routing + integration test that consume the hook. | File budget + import-graph correctness. Each concern (server, DS primitive, action+state, history view) ships atomically. |
| **B1** | Server handler does **NOT** pre-check the 4 blocking conditions from spec §4.3.1. The dialog uses `useHealth()` for pre-block; the server delegates validation to `publishDataset()`. Single source of truth on the server (publishDataset); client pre-block is a UX affordance. **No new `publish-blocked-*` error codes** — rely on the existing `publish-validation-failed` envelope (spec §4.6). | Locality + flat architecture. The post-Tier-3 handoff suggested distinct codes "as an option"; the spec text already locks `publish-validation-failed` as the validation-failure code. Adding new codes would be premature abstraction. |
| **B2** | Publish handler still asserts `slug === '__all__'` in Phase 1 (per spec §4.6 "the handler asserts `slug === '__all__'` (catches accidental per-slug calls before Phase 2 widens the contract)"). Non-`'__all__'` slugs respond `400 invalid-request` with `details.reason: 'per-slug publish is Phase 2'`. | Defense in depth. The path-param schema accepts the union but the handler refuses per-slug in Phase 1. |
| **B3** | Publish handler reads workspace ∪ published as documented in spec §4.6 (workspace overrides per slug; published-only resorts kept as-is). The composition function `composePublishInput(workspaceDir, publishedDoc): Resort[]` lives inline inside `apps/admin/server/publish.ts` (NOT a separate `composePublishInput.ts` file) — locality-of-behaviour per `ai-clean-code-adherence`. Tested through the handler's unit tests. | Locality. No "factored-out function for testability"; the test boundary is the handler. |
| **C1** | Toast variants: `'info' \| 'success' \| 'error'` per spec §7.15 (line 644/653). ARIA: `info`/`success` → `role="status"` (polite), `error` → `role="alert"` (assertive). **Auto-dismiss defaults (P2-1 fold — per-variant for WCAG 2.2 SC 2.2.1 timing-adjustable):** `info` 5000 ms, `success` 5000 ms, `error` 8000 ms. The `dismissAfterMs` prop overrides per-call. **Pause-on-interaction (P2-5 fold — keyboard parity):** `onMouseEnter` / `onFocus` clear the timer + capture remaining time; `onMouseLeave` / `onBlur` reset the timer from the captured remainder. The Toast root carries `tabIndex={0}` so keyboard users can focus + pause. A visible "Dismiss" `<Button>` inside the Toast lets keyboard users clear the Toast without waiting (mirrors error-Toast convention). **Single Toast at a time** — Phase 1 doesn't need a queue/portal/stack; one slot at the top-right. Add fan-out when a second concurrent consumer exists. | YAGNI. Publish is the only consumer; one Toast suffices. WCAG 2.2 SC 2.2.1 satisfied via dismiss button + pause on hover/focus + per-variant timing. |
| **C2** | `<ToastProvider>` is the host. Children opt-in via a `useToast()` hook returning `{ show(input): void }`. Provider stores `ToastInput \| null` in `useState`; show overwrites and starts the timer. **No queue.** If a second `show()` fires while one is visible, it replaces. **P2-2 fold — accepted risk:** in the publish flow, the user triggers the Toast (Publish click → success/error Toast); only that flow shows Toasts in Phase 1, so the user never sees a Toast they didn't trigger get replaced. When Phase 2 adds adapter actions (Test / Sync) that emit Toasts, revisit the queue decision then. | YAGNI for Phase 1; the user-triggered-only invariant makes replacement safe. |
| **D1** | `usePublish` returns `{ submit, status, response, error, reset }`. `status` is `'idle' \| 'submitting' \| 'success' \| 'error'`. `submit(): Promise<void>` calls `apiClient.publish()` and updates state. `reset()` clears back to `'idle'` (used by the dialog to dismiss the error indicator before the user re-tries). **NOT** Suspense-based — publish is a mutation, not a render-time read. | Locality + ai-clean-code-adherence §2: Suspense for reads, callbacks for mutations. Don't reuse `useResortDetail`'s `use()` pattern for an action. |
| **D2** | On successful publish, `usePublish` calls `invalidateListPublishes()` so the PublishHistory list reflects the new state. **NOT** `invalidateHealth()` — PublishDialog unmounts on success (it calls `onClose()`); next time it opens it re-fetches health from scratch via the existing `useHealth` `useEffect`-on-mount pattern (no cache, no stale read). The Dashboard's persistent health-card display lags one navigation cycle behind a publish; tracked as Phase-1 limitation for PR 4.6a Tier 5 polish per spec §7.16. **NOT** `invalidateResortDetail()` — workspace files weren't mutated. Per-resort detail caches stay valid. | Cache coherence + tight scope. Only invalidate what the publish mutation actually affects within the open user session. Dashboard staleness deferred. (Decision originally added `invalidateHealth()` per Tier 3 precedent; Codex round 2 PR #97 P2 fold revealed it pushes PR 4.5c over the 8-file budget without buying anything load-bearing for the publish flow.) |
| ~~**D3**~~ | **Removed** per Codex round 2 PR #97 P2 fold. Original D3 extended `useHealth` with `invalidateHealth` + `useSyncExternalStore` subscription mirroring `useResortDetail`'s round-2 P2-C pattern. Dropped because (a) `useHealth.ts` + `useHealth.test.ts` would be 2 paths counted toward PR 4.5c's budget per AGENTS.md PR-sizing rule (paths, not concerns), pushing PR 4.5c to 9 files (over the ≤8 ceiling); (b) PublishDialog re-fetches health on each mount via the existing `useEffect` pattern, so the subscription wasn't load-bearing for the publish flow. Dashboard's persistent health-card display will lag a publish by one navigation cycle (acceptable Phase-1 limitation, tagged for PR 4.6a Tier 5 polish). | File budget + scope correctness. |
| **E1** | `useListPublishes` uses **`useState` + `useEffect` + module-level `inFlight: Map<string, Promise<...>>` cache** — matching the **actual** `useResortList` pattern (verified at `apps/admin/src/state/useResortList.ts:2-16`). **NOT** Suspense-based. Returns the 3-state discriminated union `{ value, error }` ∈ `{ value: ListPublishesResponse, error: null } \| { value: null, error: Error } \| { value: null, error: null }`. Exposes `invalidateListPublishes(): void` module export that clears the in-flight Map AND any cached state via a per-key subscriber-set (so post-publish mounts re-fetch). `__resetForTests()` clears caches. Codex round 9 PR #97 P1 fold: the original Decision E1 misread `useResortList`'s pattern as Suspense-based; correcting that eliminates the need for any `<Suspense>` boundary in `App.tsx`/`PublishHistory`. | Consistency with `useResortList` (verified). No Suspense boundary needed — App.tsx's `?route=publishes` branch can be plain `<Shell><PublishHistory /></Shell>` like the dashboard/resorts branches. |
| **F1** | `PublishDialog` is a `<div role="dialog" aria-modal="true" aria-labelledby="publish-dialog-title">` overlay (raw `<dialog>` JSX banned by `RAW_HTML_ELS`). Backdrop: sibling `<div className="publish-dialog__backdrop">` with `onClick` → close. **Focus management** (Phase 1, P1-6 fold — scope reduced from full trap to MVP):
- `useEffect` on mount focuses the first focusable element via ref.
- `Escape` key handler closes the dialog.
- On close, focus restores to the opener button (Publish in HeaderBar) via a saved `previouslyFocused` ref captured on mount.
- **NO Tab / Shift+Tab focus trap in Phase 1.** Tab from the Confirm button leaves the modal — acceptable because (i) `aria-modal="true"` signals modality to AT, (ii) the dialog has at most 3 focusable elements (Cancel, Confirm, backdrop is `aria-hidden`), and (iii) tab-leaving lands on the HeaderBar / Sidebar buttons, all of which are visually-occluded by the modal overlay (CSS pointer-events). Add a real trap in PR 4.6a Tier 5 polish if needed. **The 4.5c-6 PublishDialog test removes the "Tab/Shift+Tab cycles inside" assertion accordingly.**

**ARIA tooltip wiring** (P2-4 fold):
- The blocking-state copy renders inside `<p id="publish-dialog-blocker" className="publish-dialog__tooltip">…</p>` (no `role="status"` — the tooltip is not a live region; it's static descriptive text for a disabled button).
- The Confirm button carries `aria-describedby="publish-dialog-blocker"` when `blocker !== null` so AT users hear the reason for the disabled state. When `blocker === null`, the `aria-describedby` attribute is omitted (no `<p>` rendered). | No DS Modal exists; building one would balloon scope. Inline the primitive with explicit focus management; promote to DS when a second modal consumer (with a real focus-trap need) exists. |
| **F2** | PublishDialog **does NOT call `apiClient.publish()` directly** — it consumes `usePublish()` from `apps/admin/src/state/usePublish.ts`. Side effects live in the hook; render lives in the dialog. | Locality. Render-only component; state lives in hook. |
| **G1** | Shell's HeaderBar gains a `<Button>Publish</Button>` (existing DS primitive, `variant="primary"` per design pattern). Click toggles `isPublishOpen` local Shell state. `<ToastProvider>` wraps Shell's main content. **Codex round 3 PR #97 P1 fold:** PublishDialog is **conditionally mounted** — `{isPublishOpen && <PublishDialog onClose={...} />}` — so each open is a fresh mount that re-runs `useHealth()`'s effect against the latest health snapshot. The original `<PublishDialog open={...} onClose={...} />` pattern with internal `if (!open) return null` left the component mounted for the app lifetime, and `useHealth`'s effect has an empty dep array so it would never re-fetch; the dialog would open against stale health (possibly with confirm enabled when corrupt-workspace state newly appeared). PublishDialog no longer accepts an `open` prop; presence ↔ open. | Locality + freshness. Conditional mount is the cleanest way to retrigger an existing useEffect; no plumbing changes to `useHealth`. |
| **H1** | PublishHistory route lives at `?route=publishes`. `urlState.ts` MODIFY adds `{ route: 'publishes'; page?: number }` variant; default page = 0. Sort: `published_at` descending (handler returns newest-first per spec §4.7). Pagination: `?route=publishes&page=N`. Page size: 20 (matches `ListPublishesQuery` default per spec §4.7). | Match existing URL-state pattern. |
| **I1** | Bridge integration test `publish-flow.test.tsx` ships in PR **4.5d** (NOT a separate 4.5e). The integration test exercises the full flow (open Shell → click Publish → confirm → wait → see Toast → navigate to `?route=publishes` → see entry); PublishHistory is required for the "see entry" assertion. The PR 4.5d file budget (6 files post-A1 P0-1 fold) fits. | Test serves the user-facing flow; ship with the last UI piece. |
| **J1** | Per spec §4.9 invariant 5 (`POST` carries `Idempotency-Key`; Phase 1 honors but does not enforce; Phase 2 enforces): build the real Phase 1 client→server header path (Codex round 1 PR #97 fold — corrects the original J1 which assumed nonexistent `PublishRequestMeta` scaffolding):
- **Client (`apps/admin/src/lib/apiClient.ts`):** `apiClient.publish()` MODIFY to inject `Idempotency-Key: ${crypto.randomUUID()}` (Node 19+ web-crypto API available in both apps/admin's Vite dev runtime and the Vitest jsdom test environment) into the POST request headers. A co-located `apiClient.test.ts` MODIFY case asserts the header is present and matches the UUID regex.
- **Server (`apps/admin/server/dispatch.ts` + handler):** the dispatcher already forwards Node `http.IncomingMessage.headers` through to handlers via the existing route plumbing. The publish handler does NOT read the header in Phase 1 (it has no dedup store). A dispatch-test case asserts a POST carrying `Idempotency-Key: <opaque>` produces an identical 200 response (no rejection). Phase 2's Hono service swap will read the header at the middleware boundary; no Phase 1 schema change required.
- **NOT in scope:** `PublishRequestMeta` Zod schema (does not exist; the header is HTTP transport metadata, not request body). No `packages/schema/api/**` change for the header. | Spec-compliance + Phase 2 readiness. Codex round 1 verified that the original J1 claim ("schemas already include `PublishRequestMeta`") was incorrect — no such symbol exists. Real path: client adds the header on every POST publish; server accepts but ignores in Phase 1. |

---

## What we are NOT building (anti-patterns avoided per ai-clean-code-adherence)

- **No `createPublishClient({ fetcher })` factory.** `usePublish` calls `apiClient.publish()` directly; tests mock at the MSW boundary. (§2 anti-pattern: "inject the fetcher for testability".)
- **No Toast queue / portal / stack.** Single Toast slot in Shell with replacement-on-second-show (Decision C2). Add a queue when Phase 2 adapter actions emit concurrent Toasts.
- **No new `publish-blocked-*` error codes** as the post-Tier-3 handoff suggested as an option. Rely on the existing `publish-validation-failed` envelope. (§3 — premature error-code expansion.)
- **No DS `Modal` primitive yet.** PublishDialog inlines the `<div role="dialog">` + focus-trap. Promote to DS when a second modal consumer exists.
- **No PublishStatus discriminated union with explicit branch object types** (e.g., `{ kind: 'submitting' }`). `status: 'idle' | 'submitting' | 'success' | 'error'` enum string is sufficient; the `response` and `error` fields carry the payload.
- **No PublishHistoryRow / PublishHistoryList component split.** One `PublishHistory.tsx` file until a second list view exists.
- **No factored-out `composePublishInput.ts` module.** The union-merge function lives inline in `publish.ts`. Tested through the handler's unit tests.
- **No "PublishButton" component split out of HeaderBar.** Inline the button + dialog open-state in Shell.
- **No `useResortDetail()` invalidation on publish success.** Workspace files aren't mutated by publish; per-resort caches stay valid. Only invalidate `health` + `listPublishes`.
- **No bridging-tier test for Toast in isolation.** Toast is a leaf DS primitive; canned-tier unit tests + jest-axe cover it.

---

## PR breakdown

### PR 4.5a — Publish + listPublishes server handlers

**Branch:** `epic-4/pr-4.5a-publish-handler`. **Depends on:** `main` (post-Tier-3 closeout merged). **README:** skip.

**Subagent review trigger:** **YES** — `apps/admin/server/**` is the Phase 2 portability surface. Brief the reviewer to verify: (a) `composePublishInput` correctly merges workspace ∪ published (workspace overrides per slug; published-only resorts kept), (b) the handler calls `publishDataset()` from `@snowboard-trip-advisor/schema/node` (NOT a subprocess), (c) `slug === '__all__'` assertion catches per-slug calls in Phase 1, (d) listPublishes parses the `${counter}-${iso}.json` filename pattern (NOT `v_<iso>`) per `packages/schema/src/publishDataset.ts:81`, (e) `dispatch.ts` route registration uses the wire-schema's `PublishSlugParam` union.

**File budget:** 8 files (at ≤8 budget; Codex round 1 PR #97 fold added the `apiClient` Idempotency-Key wiring per Decision J1).

**Files (tests first):**

1. **Create** `apps/admin/server/__tests__/publish.test.ts` — handler unit tests.
2. **Create** `apps/admin/server/__tests__/listPublishes.test.ts` — handler unit tests.
3. **Modify** `apps/admin/server/__tests__/dispatch.test.ts` — add bridge-routed positive controls for `POST /api/resorts/__all__/publish` and `GET /api/publishes`, plus the Idempotency-Key passthrough test (Decision J1).
4. **Modify** `apps/admin/server/publish.ts` — replace 4.1b's 501 stub with the real handler.
5. **Modify** `apps/admin/server/listPublishes.ts` — replace 4.1b's 501 stub with the real handler.
6. **Modify** `apps/admin/server/dispatch.ts` — add route entries; verify `STATUS_FOR_CODE` covers `publish-validation-failed` + `invalid-request` + `workspace-corrupt` (the last per Codex round 1 PR #97 P1 fold; `workspace-corrupt` → 500 per spec §10.3.1).
7. **Modify** `apps/admin/src/lib/apiClient.ts` — inject `Idempotency-Key: ${crypto.randomUUID()}` header in `publish()` per Decision J1.
8. **Modify** `apps/admin/src/lib/apiClient.test.ts` — assert the header is present + matches UUID regex.

#### Task 4.5a-1: `publish.test.ts` happy path + slug assertion

**Files:** Create `apps/admin/server/__tests__/publish.test.ts`.

- [ ] **Step 1: Write the failing tests.**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { publishHandler } from '../publish'
import type { HandlerDeps } from '../listResorts'

describe('publishHandler — happy path', (): void => {
  let workspaceRoot: string
  let deps: HandlerDeps

  beforeEach(async (): Promise<void> => {
    workspaceRoot = await mkdtemp(join(tmpdir(), 'snowboard-publish-'))
    // Seed published doc with 2 resorts; seed 1 workspace file editing 1 of them.
    // (Full fixture wiring inlined here — load from tests/fixtures/admin-workspace/.)
    // Codex round 6 PR #97 P2 fold: no clock seam in HandlerDeps — use
    // vi.setSystemTime() to make `new Date()` deterministic inside the handler.
    vi.setSystemTime(new Date('2026-05-11T00:00:00Z'))
    deps = { workspaceRoot }
  })

  afterEach(async (): Promise<void> => {
    await rm(workspaceRoot, { recursive: true, force: true })
  })

  it('publishes workspace ∪ published; returns version metadata', async (): Promise<void> => {
    const response = await publishHandler(
      { params: { slug: '__all__' }, body: { confirm: true } },
      deps,
    )
    expect(response.resort_count).toBe(2)
    expect(response.version_id).toMatch(/^\d+-/)
    expect(response.archive_path).toContain('data/published/history/')
    expect(response.published_at).toBeDefined()
    // Verify on-disk: history dir grew + current.v1.json updated.
    const historyDir = join(workspaceRoot, 'data/published/history')
    const entries = await readdir(historyDir)
    expect(entries.some((e): boolean => e.endsWith('.json'))).toBe(true)
  })

  it('rejects non-__all__ slugs as 400 invalid-request (Phase 1)', async (): Promise<void> => {
    await expect(
      publishHandler(
        { params: { slug: 'kotelnica-bialczanska' }, body: { confirm: true } },
        deps,
      ),
    ).rejects.toMatchObject({
      code: 'invalid-request',
      details: { reason: expect.stringMatching(/per-slug.*Phase 2/i) },
    })
  })
})
```

- [ ] **Step 2: Run the tests — expect FAIL.**

Run: `npx vitest run apps/admin/server/__tests__/publish.test.ts`
Expected: failures pointing at the missing `publishHandler` real impl (still 501-stub from PR 4.1b).

- [ ] **Step 3: Commit the failing tests.**

```bash
git add apps/admin/server/__tests__/publish.test.ts
git commit -s -m "test(admin-server): failing publish-handler happy-path + slug-assertion tests (PR 4.5a §4.5a-1)"
```

#### Task 4.5a-2: `publish.ts` minimal impl to green Task 1's tests

**Files:** Modify `apps/admin/server/publish.ts`.

- [ ] **Step 1: Implement the handler.**

```ts
import { mkdir, readdir, readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

import { publishDataset } from '@snowboard-trip-advisor/schema/node'
// Codex round 5 PR #97 P2 fold: `Resort` + `ResortLiveSignal` are domain types
// exported from the schema root (`packages/schema/src/index.ts`), NOT the API
// barrel (`packages/schema/api/index.ts:1-9`, which only exposes endpoint
// schema types like PublishBody/PublishResponse/PublishSlugParam).
import type {
  PublishBody,
  PublishResponse,
  PublishSlugParam,
} from '@snowboard-trip-advisor/schema/api'
import type { Resort, ResortLiveSignal } from '@snowboard-trip-advisor/schema'
import { WorkspaceFile } from '@snowboard-trip-advisor/schema'

import type { HandlerDeps } from './listResorts'

export interface PublishInput {
  readonly params: PublishSlugParam
  readonly body: PublishBody
}

export async function publishHandler(
  input: PublishInput,
  deps: HandlerDeps,
): Promise<PublishResponse> {
  if (input.params.slug !== '__all__') {
    const err = new Error('per-slug publish is Phase 2')
    ;(err as Error & { code: string; details: unknown }).code = 'invalid-request'
    ;(err as Error & { code: string; details: unknown }).details = {
      reason: 'per-slug publish is Phase 2 — Phase 1 publish is all-or-nothing.',
    }
    throw err
  }

  // Codex round 3 PR #97 P1 fold: compose BOTH resorts AND live_signals from
  // workspace ∪ published, then build the full PublishedDataset envelope per
  // packages/schema/src/published.ts:12-22 (schema_version, published_at,
  // resorts, live_signals, manifest).
  const { resorts, live_signals } = await composePublishInput(deps.workspaceRoot)
  // Codex round 6 PR #97 P2 fold: existing handlers (listResorts.ts:57,
  // health.ts:63) use `new Date()` directly — `HandlerDeps` has no clock
  // seam. Match the existing pattern; tests stub via `vi.useFakeTimers()`
  // + `vi.setSystemTime()` per Vitest convention.
  const publishedAt = new Date().toISOString()

  const result = await publishDataset(
    {
      schema_version: 1,
      published_at: publishedAt,
      resorts,
      live_signals,
      manifest: {
        resort_count: resorts.length,
        generated_by: 'admin-workspace',  // Phase 1 fingerprint per spec §4.7.
        validator_version: '1',
      },
    },
    { rootDir: join(deps.workspaceRoot, 'data', 'published') },
  )

  if (!result.ok) {
    const err = new Error('publish-validation-failed')
    ;(err as Error & { code: string; details: unknown }).code = 'publish-validation-failed'
    ;(err as Error & { code: string; details: unknown }).details = { issues: result.issues }
    throw err
  }

  return {
    // Codex round 4 PR #97 P2 fold: derive version_id from the archive path
    // returned by publishDataset() — which is the authoritative source — rather
    // than reconstructing from deps.now(). publishDataset() internally calls
    // `new Date()` (NOT deps.now()) for its filename, so reconstruction here
    // would mismatch what listPublishesHandler later returns, causing the
    // success Toast to identify a different version_id than the PublishHistory
    // row. basename(path, '.json') strips dirname + extension.
    version_id: basename(result.archive_path, '.json'),
    archive_path: result.archive_path,
    published_at: publishedAt,
    resort_count: resorts.length,
  }
}

interface ComposeResult {
  readonly resorts: Resort[]
  readonly live_signals: ResortLiveSignal[]
}

async function composePublishInput(workspaceRoot: string): Promise<ComposeResult> {
  // Inline per Decision B3 — locality of behavior, not extracted to its own file.
  // Codex round 3 PR #97 P1 fold: also composes live_signals from workspace ∪
  // published — PublishedDataset.live_signals is a required array per the schema.
  const workspaceDir = join(workspaceRoot, 'data/admin-workspace')
  const publishedPath = join(workspaceRoot, 'data/published/current.v1.json')

  await mkdir(workspaceDir, { recursive: true })

  const workspaceResorts = new Map<string, Resort>()
  const workspaceLive = new Map<string, ResortLiveSignal>()
  // Codex round 6 PR #97 P2 fold: track which slugs have a workspace entry
  // SEPARATELY from which workspace entries had a non-null live_signal.
  // A workspace file with explicit `live_signal: null` is intentional
  // (the upsert handler at apps/admin/server/resortUpsert.ts supports it);
  // without this set, the merge would fall back to the published live_signal
  // for that slug and silently resurrect data the analyst cleared.
  const workspaceSlugsWithEntry = new Set<string>()
  for (const entry of await readdir(workspaceDir)) {
    if (!entry.endsWith('.json')) { continue }
    const filePath = join(workspaceDir, entry)
    let json: unknown
    try {
      json = JSON.parse(await readFile(filePath, 'utf-8'))
    } catch (e) {
      // P1 (Codex round 1 PR #97 fold): per spec §10.3.1, publish must REJECT
      // (not silently skip) when any workspace file is corrupt — the dialog's
      // pre-publish gate is a UX affordance, not the load-bearing safety; the
      // server is the source of truth. Skipping would let a curl-bypassing
      // caller silently lose the corrupt staged file in the new snapshot.
      const err = new Error('workspace-corrupt')
      ;(err as Error & { code: string; details: unknown }).code = 'workspace-corrupt'
      ;(err as Error & { code: string; details: unknown }).details = {
        slug: entry.replace(/\.json$/, ''),
        reason: e instanceof Error ? e.message : 'invalid JSON',
      }
      throw err
    }
    const parsed = WorkspaceFile.safeParse(json)
    if (!parsed.success) {
      const err = new Error('workspace-corrupt')
      ;(err as Error & { code: string; details: unknown }).code = 'workspace-corrupt'
      ;(err as Error & { code: string; details: unknown }).details = {
        slug: entry.replace(/\.json$/, ''),
        issues: parsed.error.issues,
      }
      throw err
    }
    workspaceResorts.set(parsed.data.slug, parsed.data.resort)
    workspaceSlugsWithEntry.add(parsed.data.slug)
    if (parsed.data.live_signal !== null) {
      workspaceLive.set(parsed.data.slug, parsed.data.live_signal)
    }
    // If parsed.data.live_signal === null, intentionally do NOT populate
    // workspaceLive; the merge below uses workspaceSlugsWithEntry to detect
    // the explicit-clear case and skip the published fallback.
  }

  let publishedResorts: Resort[] = []
  let publishedLive: ResortLiveSignal[] = []
  try {
    const raw = await readFile(publishedPath, 'utf-8')
    const doc = JSON.parse(raw) as { resorts?: Resort[]; live_signals?: ResortLiveSignal[] }
    publishedResorts = doc.resorts ?? []
    publishedLive = doc.live_signals ?? []
  } catch { /* missing published doc — workspace-only publish per §10.9. */ }

  // Merge resorts: workspace overrides per slug; published-only kept.
  const mergedResorts: Resort[] = []
  const consumedSlugs = new Set<string>()
  for (const r of publishedResorts) {
    mergedResorts.push(workspaceResorts.get(r.slug) ?? r)
    consumedSlugs.add(r.slug)
  }
  for (const [slug, r] of workspaceResorts.entries()) {
    if (!consumedSlugs.has(slug)) { mergedResorts.push(r) }
  }

  // Merge live_signals: workspace's intent wins. If a slug has a workspace
  // entry (per workspaceSlugsWithEntry), use its live_signal value (which may
  // be null → omit from merged list; explicit clear). Only fall back to the
  // published live_signal when the slug has NO workspace entry at all.
  // (Codex round 6 PR #97 P2 fold.)
  const publishedLiveBySlug = new Map(publishedLive.map((ls): [string, ResortLiveSignal] => [ls.resort_slug, ls]))
  const mergedLive: ResortLiveSignal[] = []
  for (const r of mergedResorts) {
    if (workspaceSlugsWithEntry.has(r.slug)) {
      const ws = workspaceLive.get(r.slug)
      if (ws !== undefined) { mergedLive.push(ws) }
      // else: workspace had this slug but with live_signal: null → cleared.
    } else {
      const pub = publishedLiveBySlug.get(r.slug)
      if (pub !== undefined) { mergedLive.push(pub) }
    }
  }

  return { resorts: mergedResorts, live_signals: mergedLive }
}
```

- [ ] **Step 2: Run the tests — expect PASS.**

Run: `npx vitest run apps/admin/server/__tests__/publish.test.ts`
Expected: 2 passing.

- [ ] **Step 3: Commit.**

```bash
git add apps/admin/server/publish.ts
git commit -s -m "feat(admin-server): publish handler — workspace ∪ published union → publishDataset (PR 4.5a §4.5a-2)"
```

#### Task 4.5a-3: `publish.test.ts` — `publishDataset` failure path + corrupt workspace skip

**Files:** Modify `apps/admin/server/__tests__/publish.test.ts`.

- [ ] **Step 1: Add tests.**

```ts
it('returns 400 publish-validation-failed when validatePublishedDataset rejects', async (): Promise<void> => {
  // Seed empty workspace + missing published → resorts.length === 0 → dataset_empty.
  // P1-9 fold: match the issue's `message` field exactly against the canonical sentinel
  // `EMPTY_DATASET_ZOD_MESSAGE = 'dataset_empty'` from `packages/schema/src/published.ts:15`.
  await expect(
    publishHandler({ params: { slug: '__all__' }, body: { confirm: true } }, deps),
  ).rejects.toMatchObject({
    code: 'publish-validation-failed',
    details: { issues: expect.arrayContaining([
      expect.objectContaining({ message: 'dataset_empty' }),
    ]) },
  })
})

// Codex round 6 PR #97 P2 fold: explicit-null override semantics.
it('preserves explicit `live_signal: null` overrides — workspace null wins over published value', async (): Promise<void> => {
  // Seed published with a live_signal for slug A; seed workspace file for A
  // with live_signal: null (the upsert handler supports this clear semantic).
  // Assert: published live_signal for A is NOT in the merged published set.
  const response = await publishHandler(
    { params: { slug: '__all__' }, body: { confirm: true } }, deps,
  )
  // Filesystem assertion: the archived current.v1.json should contain
  // resorts: [A] and live_signals: [] (A's published live_signal was cleared).
  const archive = JSON.parse(await readFile(response.archive_path, 'utf-8'))
  expect(archive.live_signals).toEqual([])
  expect(archive.resorts).toHaveLength(1)
})

it('rejects publish with 500 workspace-corrupt when any workspace file is corrupt (spec §10.3.1)', async (): Promise<void> => {
  // P1 (Codex round 1 PR #97 fold): per spec §10.3.1, publish MUST refuse when
  // any workspace file is corrupt — the operator must `rm` the file or repair
  // it. Silently skipping (the original plan's behavior) would let a curl
  // bypass of the dialog drop the staged corrupt slug from the snapshot.
  // Seed published with resort A; seed a corrupt workspace JSON.
  await expect(
    publishHandler({ params: { slug: '__all__' }, body: { confirm: true } }, deps),
  ).rejects.toMatchObject({
    code: 'workspace-corrupt',
    details: expect.objectContaining({ slug: expect.any(String) }),
  })
})
```

- [ ] **Step 2: Run — expect PASS** (`composePublishInput` already skips corrupt; `publishDataset` already rejects empty datasets).

- [ ] **Step 3: Commit.**

```bash
git add apps/admin/server/__tests__/publish.test.ts
git commit -s -m "test(admin-server): publishDataset failure + corrupt-skip coverage (PR 4.5a §4.5a-3)"
```

#### Task 4.5a-4: `listPublishes.test.ts` + impl

**Files:** Create `apps/admin/server/__tests__/listPublishes.test.ts`; modify `apps/admin/server/listPublishes.ts`.

- [ ] **Step 1: Write tests.**

```ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { listPublishesHandler } from '../listPublishes'
import type { HandlerDeps } from '../listResorts'

describe('listPublishesHandler', (): void => {
  let workspaceRoot: string
  let deps: HandlerDeps

  beforeEach(async (): Promise<void> => {
    workspaceRoot = await mkdtemp(join(tmpdir(), 'snowboard-list-pub-'))
    // Codex round 6 PR #97 P2 fold: no clock seam in HandlerDeps — use
    // vi.setSystemTime() to make `new Date()` deterministic inside the handler.
    vi.setSystemTime(new Date('2026-05-11T00:00:00Z'))
    deps = { workspaceRoot }
  })

  afterEach(async (): Promise<void> => {
    await rm(workspaceRoot, { recursive: true, force: true })
  })

  it('returns empty items + page metadata for empty history', async (): Promise<void> => {
    const r = await listPublishesHandler({ query: {} }, deps)
    expect(r.items).toEqual([])
    expect(r.page).toEqual({ offset: 0, limit: 20, total: 0 })
  })

  it('parses ${counter}-${iso}.json filenames; sorts newest-first', async (): Promise<void> => {
    const dir = join(workspaceRoot, 'data/published/history')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, '1-2026-05-09T00-00-00-000Z.json'), '{"schema_version":1,"published_at":"2026-05-11T00:00:00.000Z","resorts":[],"live_signals":[],"manifest":{"resort_count":0,"generated_by":"test","validator_version":"1"}}')
    await writeFile(join(dir, '2-2026-05-10T00-00-00-000Z.json'), '{"schema_version":1,"published_at":"2026-05-11T00:00:00.000Z","resorts":[],"live_signals":[],"manifest":{"resort_count":0,"generated_by":"test","validator_version":"1"}}')

    const r = await listPublishesHandler({ query: {} }, deps)
    expect(r.items).toHaveLength(2)
    expect(r.items[0]?.version_id).toBe('2-2026-05-10T00-00-00-000Z')
    expect(r.items[1]?.version_id).toBe('1-2026-05-09T00-00-00-000Z')
  })

  it('respects page.offset + page.limit', async (): Promise<void> => {
    const dir = join(workspaceRoot, 'data/published/history')
    await mkdir(dir, { recursive: true })
    for (let n = 1; n <= 25; n += 1) {
      await writeFile(
        join(dir, `${String(n)}-2026-05-${String(n).padStart(2, '0')}T00-00-00-000Z.json`),
        '{"schema_version":1,"published_at":"2026-05-11T00:00:00.000Z","resorts":[],"live_signals":[],"manifest":{"resort_count":0,"generated_by":"test","validator_version":"1"}}',
      )
    }
    const r = await listPublishesHandler({ query: { page: { offset: 20, limit: 5 } } }, deps)
    expect(r.items).toHaveLength(5)
    expect(r.page).toEqual({ offset: 20, limit: 5, total: 25 })
  })

  it('skips files that do not match the version pattern', async (): Promise<void> => {
    const dir = join(workspaceRoot, 'data/published/history')
    await mkdir(dir, { recursive: true })
    // Codex round 5 PR #97 P2 fold: the matching `1-...json` needs a real
    // archive body — the handler reads body.published_at + body.resorts for
    // every filename matching VERSION_FILENAME, so `{}` would crash before
    // the non-matching assertion could fire.
    await writeFile(
      join(dir, '1-2026-05-09T00-00-00-000Z.json'),
      '{"schema_version":1,"published_at":"2026-05-09T00:00:00.000Z","resorts":[],"live_signals":[],"manifest":{"resort_count":0,"generated_by":"test","validator_version":"1"}}',
    )
    await writeFile(join(dir, 'not-a-version.json'), '{}')  // Non-matching pattern — skipped.
    await writeFile(join(dir, 'README.txt'), 'unrelated')

    const r = await listPublishesHandler({ query: {} }, deps)
    expect(r.items).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run — expect FAIL** (still 501-stub).

- [ ] **Step 3: Implement.**

```ts
// apps/admin/server/listPublishes.ts
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type {
  ListPublishesQuery,
  ListPublishesResponse,
  PublishMetadata,
} from '@snowboard-trip-advisor/schema/api'

import type { HandlerDeps } from './listResorts'

// P1-8 fold: filename encoding is `${counter}-${sanitizeIsoForPath(iso)}.json` per
// packages/schema/src/publishDataset.ts:80-86, where sanitizeIsoForPath at line 246
// is `iso.replace(/[:.]/g, '-')`. Capturing the counter is straightforward; the iso
// part is NOT a clean round-trip target via regex (the substitution is lossy with
// respect to which `-` characters were originally `:` vs `.` vs `-`). Authoritative
// `published_at` lives INSIDE each archived JSON file (validated by
// `validatePublishedDataset` against `packages/schema/src/published.ts:14`). Read
// from `body.published_at` (NOT `generated_at` — Codex round 3 PR #97 P1 fold:
// the schema field is `published_at`; `generated_at` does not exist).
const VERSION_FILENAME = /^(\d+)-(.+)\.json$/
const DEFAULT_LIMIT = 20

export interface ListPublishesInput {
  readonly query: ListPublishesQuery
}

export async function listPublishesHandler(
  input: ListPublishesInput,
  deps: HandlerDeps,
): Promise<ListPublishesResponse> {
  const historyDir = join(deps.workspaceRoot, 'data/published/history')
  const offset = input.query.page?.offset ?? 0
  const limit = input.query.page?.limit ?? DEFAULT_LIMIT

  let entries: string[]
  try {
    entries = await readdir(historyDir)
  } catch { entries = [] }

  // Build version metadata; sort by counter desc (the lock-allocated counter IS
  // the canonical newest-first ordering per `publishDataset.ts:74-86`).
  const filtered: { counter: number; entry: string }[] = []
  for (const entry of entries) {
    const m = VERSION_FILENAME.exec(entry)
    if (m === null) { continue }
    const counterRaw = m[1]
    if (counterRaw === undefined) { continue }
    filtered.push({ counter: Number(counterRaw), entry })
  }
  filtered.sort((a, b): number => b.counter - a.counter)

  const versions: PublishMetadata[] = []
  for (const { counter, entry } of filtered.slice(offset, offset + limit)) {
    const archivePath = join(historyDir, entry)
    const body = JSON.parse(await readFile(archivePath, 'utf-8')) as {
      published_at: string
      resorts: Array<{ slug: string }>
      manifest?: { generated_by?: string }
    }
    versions.push({
      version_id: entry.replace(/\.json$/, ''),
      published_at: body.published_at,  // Authoritative — from inside the file (spec §4.7).
      archive_path: archivePath,
      resort_count: body.resorts.length,
      published_by: body.manifest?.generated_by ?? 'admin-workspace',  // Phase 1 fingerprint.
    })
  }

  return {
    items: versions,
    page: { offset, limit, total: filtered.length },
  }
}
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Commit.**

```bash
git add apps/admin/server/__tests__/listPublishes.test.ts apps/admin/server/listPublishes.ts
git commit -s -m "feat(admin-server): listPublishes handler — counter-prefixed history pagination (PR 4.5a §4.5a-4)"
```

#### Task 4.5a-5: dispatch.ts wire-up — failing bridge tests FIRST (per `feedback_tdd_in_plans_and_specs.md`)

**Files:** Modify `apps/admin/server/__tests__/dispatch.test.ts`; modify `apps/admin/server/dispatch.ts`.

- [ ] **Step 1: Add failing bridge-routed test cases to `dispatch.test.ts`.**

```ts
it('routes POST /api/resorts/__all__/publish → publishHandler (200 with PublishResponse)', /* ... */)
it('routes POST /api/resorts/non-all-slug/publish → 400 invalid-request (Phase 1)', /* ... */)
it('routes GET /api/publishes → listPublishesHandler (200 with ListPublishesResponse)', /* ... */)
// Codex round 8 PR #97 P2 fold: apiClient serializeQuery() JSON-stringifies
// nested query values as a single top-level param (apiClient.ts:64-73).
// `?page.offset=5&page.limit=10` would be ignored by ListPublishesQuery.parse().
// Use the JSON-encoded format that apiClient actually produces.
it('routes GET /api/publishes?page={"offset":5,"limit":10} → respects pagination', /* ... */)
it('honors Idempotency-Key header on POST publish without rejecting (Phase 1, spec §4.9 invariant 5)', /* ... */)  // Decision J1.
```

- [ ] **Step 2: Run** `npx vitest run apps/admin/server/__tests__/dispatch.test.ts`. Expected: 5 new tests FAIL (routes not registered).

- [ ] **Step 3: Modify dispatch.ts route table.** Add route entries:
  - `POST /api/resorts/:slug/publish` → wrap `publishHandler` with `PublishSlugParam.parse` + `PublishBody.parse`.
  - `GET /api/publishes` → wrap `listPublishesHandler` with `ListPublishesQuery.parse`.
  - Verify `STATUS_FOR_CODE` maps `publish-validation-failed` → 400 (existing) and `invalid-request` → 400 (existing); ADD a map entry for `workspace-corrupt` → 500 (Codex round 1 PR #97 P1 fold — per spec §10.3.1 the publish handler throws this when any workspace file fails JSON parse or `WorkspaceFile.parse()`).

- [ ] **Step 4: Run** `npx vitest run apps/admin/server/__tests__/dispatch.test.ts`. Expected: 5 new tests PASS.

- [ ] **Step 5: Run** `npm run qa` — expect green (full chain since `apps/admin/server/**` triggers scope-detector → `full`).

- [ ] **Step 6: Commit (do NOT push yet — Task 4.5a-6 follows with the apiClient Idempotency-Key change, then pushes the full PR at once).**

```bash
git add apps/admin/server/__tests__/dispatch.test.ts apps/admin/server/dispatch.ts
git commit -s -m "feat(admin-server): wire publish + listPublishes routes in dispatch (PR 4.5a §4.5a-5)"
# Codex round 4 PR #97 P2 fold: deferred push to end of 4.5a-6 so the PR
# branch includes the Idempotency-Key client change.
```

#### Task 4.5a-6: `apiClient.publish()` injects `Idempotency-Key` (Decision J1)

**Files:** Modify `apps/admin/src/lib/apiClient.test.ts` first, then `apps/admin/src/lib/apiClient.ts`.

- [ ] **Step 1: Add failing tests to `apiClient.test.ts`.**

```ts
it('publish() sends an Idempotency-Key header matching UUID v4 regex (spec §4.9 invariant 5)', async (): Promise<void> => {
  let capturedHeader: string | null = null
  server.use(
    http.post(/\/api\/resorts\/__all__\/publish$/, (info): HttpResponse => {
      capturedHeader = info.request.headers.get('Idempotency-Key')
      return HttpResponse.json({ version_id: 'x', archive_path: '/x', published_at: '2026-05-11T00:00:00.000Z', resort_count: 0 })
    }),
  )
  await apiClient.publish()
  expect(capturedHeader).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
})

it('publish() generates a fresh Idempotency-Key per call', async (): Promise<void> => {
  const captured: string[] = []
  server.use(
    http.post(/\/api\/resorts\/__all__\/publish$/, (info): HttpResponse => {
      const v = info.request.headers.get('Idempotency-Key')
      if (v !== null) { captured.push(v) }
      return HttpResponse.json({ version_id: 'x', archive_path: '/x', published_at: '2026-05-11T00:00:00.000Z', resort_count: 0 })
    }),
  )
  await apiClient.publish()
  await apiClient.publish()
  expect(captured).toHaveLength(2)
  expect(captured[0]).not.toBe(captured[1])
})
```

- [ ] **Step 2: Run — expect FAIL** (`apiClient.publish()` does not set the header).

- [ ] **Step 3: Modify `apiClient.publish()` body.**

```ts
// Codex round 12 PR #97 P2 fold: the helper at apps/admin/src/lib/apiClient.ts:27
// is `request<T>(method, path, body, parser)` — there is NO `postJson` symbol.
// Extend `request()` with an optional 5th `extraHeaders` argument; `publish()`
// passes the Idempotency-Key through it.

// In the `request()` helper signature:
async function request<T>(
  method: string,
  path: string,
  body: unknown,
  parser: (raw: unknown) => T,
  extraHeaders?: Record<string, string>,  // ← new
): Promise<T> {
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json', ...(extraHeaders ?? {}) },
  }
  // ... rest unchanged ...
}

// In the apiClient.publish() body:
publish: (): Promise<PublishResponse> =>
  request(
    'POST',
    '/api/resorts/__all__/publish',
    { confirm: true } satisfies PublishBody,
    (raw): PublishResponse => PublishResponse.parse(raw),
    { 'Idempotency-Key': crypto.randomUUID() },  // Decision J1.
  ),
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Commit + push the full PR branch (apiClient change is the last commit).**

```bash
git add apps/admin/src/lib/apiClient.ts apps/admin/src/lib/apiClient.test.ts
git commit -s -m "feat(admin-client): apiClient.publish() injects Idempotency-Key (PR 4.5a §4.5a-6, Decision J1)"
# Codex round 4 PR #97 P2 fold: push happens HERE (not in 4.5a-5) so the PR
# branch carries the apiClient Idempotency-Key change.
git push -u origin epic-4/pr-4.5a-publish-handler
```

#### Task 4.5a-7: PR creation + subagent review + Codex review

- [ ] Open the PR (`gh pr create`) with subagent-review brief in the body (per Decision 4.5a subagent trigger above).
- [ ] Dispatch subagent reviewer with the brief from the §7.14 trigger justification.
- [ ] Post `@codex review`.
- [ ] Fold round-by-round per memory `feedback_codex_review_per_pr.md` (reply with fix SHA; resolve thread via GraphQL).
- [ ] Generate AND execute a tailored local-test plan per memory `feedback_local_test_per_pr.md` (qa, build smoke, dev probe, Playwright if applicable).
- [ ] After merge: `git fetch origin main && git rebase origin/main` on the next PR's branch.

**Acceptance gate (PR 4.5a):** `npm run qa` green; handler unit tests + bridge-routed dispatch tests pass; manual smoke via `npm run dev:admin` followed by `curl -X POST http://127.0.0.1:5174/api/resorts/__all__/publish -d '{"confirm":true}'` writes `data/published/history/<entry>.json` on disk.

---

### PR 4.5b — Toast design-system primitive

**Branch:** `epic-4/pr-4.5b-toast`. **Depends on:** PR 4.5a merged. **README:** skip.

**Subagent review trigger:** **YES** — `packages/design-system/**` (per spec §7.15 line 659). Brief the reviewer to verify: (a) ARIA roles per variant (`info`/`success` → `role="status"`; `error` → `role="alert"`), (b) auto-dismiss timing prop respected, (c) hover-to-pause works via timer clear/reset, (d) jest-axe clean in all 3 variants, (e) single-Toast semantics (no queue/stack — Decision C1).

**File budget:** 6 files (within ≤8 budget; Codex round 5 PR #97 P2 fold added `Button` ARIA-prop extension here since it's the same DS-surface review surface as Toast).

**Files (tests first):**

1. **Create** `packages/design-system/src/components/Toast.test.tsx`.
2. **Create** `packages/design-system/src/components/Toast.tsx`.
3. **Modify** `packages/design-system/src/components/Button.test.tsx` — assert new ARIA props pass through to the rendered `<button>` element.
4. **Modify** `packages/design-system/src/components/Button.tsx` — extend `ButtonProps` with `aria-describedby?: string` (needed by PR 4.5c's PublishDialog for `aria-describedby` → tooltip wiring per Decision F1). `aria-disabled` is NOT added because the standard `disabled` attribute already conveys disabled state to AT; PublishDialog should pass `disabled={blocker !== null}` and drop the `aria-disabled` prop.
5. **Modify** `packages/design-system/src/index.ts` — re-export `Toast` + `ToastProvider` + `useToast`.
6. **Modify** `packages/design-system/src/index.test.ts` — barrel test (verified at `packages/design-system/src/index.test.ts:1`); add assertions that `Toast`, `ToastProvider`, `useToast` exports are re-exported from the package root.

#### Task 4.5b-1: Toast.test.tsx — 3 variants + ARIA + axe

**Files:** Create `packages/design-system/src/components/Toast.test.tsx`.

- [ ] **Step 1: Write tests.**

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe, toHaveNoViolations } from 'jest-axe'

import { Toast, ToastProvider, useToast } from './Toast'

expect.extend(toHaveNoViolations)

describe('Toast — variants + ARIA', (): void => {
  it('info renders role="status"; success renders role="status"; error renders role="alert"', (): void => {
    const { rerender } = render(<Toast variant="info" message="Hello" onDismiss={(): void => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent('Hello')
    rerender(<Toast variant="success" message="Done" onDismiss={(): void => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent('Done')
    rerender(<Toast variant="error" message="Oops" onDismiss={(): void => {}} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Oops')
  })

  it('is axe-clean in all 3 variants', async (): Promise<void> => {
    for (const variant of ['info', 'success', 'error'] as const) {
      const { container } = render(<Toast variant={variant} message="X" onDismiss={(): void => {}} />)
      expect(await axe(container)).toHaveNoViolations()
    }
  })

  it('auto-dismisses after dismissAfterMs', (): void => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    render(<Toast variant="info" message="X" onDismiss={onDismiss} dismissAfterMs={5000} />)
    expect(onDismiss).not.toHaveBeenCalled()
    act((): void => { vi.advanceTimersByTime(5000) })
    expect(onDismiss).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })

  it('hover pauses the timer; mouse-leave resumes', async (): Promise<void> => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    const { container } = render(
      <Toast variant="info" message="X" onDismiss={onDismiss} dismissAfterMs={5000} />,
    )
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    act((): void => { vi.advanceTimersByTime(2000) })
    await user.hover(container.firstChild as HTMLElement)
    act((): void => { vi.advanceTimersByTime(10_000) })
    expect(onDismiss).not.toHaveBeenCalled()  // Paused.
    await user.unhover(container.firstChild as HTMLElement)
    act((): void => { vi.advanceTimersByTime(5000) })
    expect(onDismiss).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })

  // P2-5 fold: keyboard parity for pause/resume.
  it('focus pauses the timer; blur resumes (keyboard parity)', async (): Promise<void> => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    const { container } = render(
      <Toast variant="info" message="X" onDismiss={onDismiss} dismissAfterMs={5000} />,
    )
    act((): void => { vi.advanceTimersByTime(2000) })
    ;(container.firstChild as HTMLElement).focus()
    act((): void => { vi.advanceTimersByTime(10_000) })
    expect(onDismiss).not.toHaveBeenCalled()  // Paused via focus.
    ;(container.firstChild as HTMLElement).blur()
    act((): void => { vi.advanceTimersByTime(5000) })
    expect(onDismiss).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })

  // P2-5 fold: dismiss button for keyboard users / impatient mouse users.
  it('clicking the Dismiss button calls onDismiss immediately', async (): Promise<void> => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()
    render(<Toast variant="error" message="X" onDismiss={onDismiss} />)
    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  // P2-1 fold: per-variant default timing (error 8s; others 5s).
  it.each([
    ['info', 5000],
    ['success', 5000],
    ['error', 8000],
  ])('variant %s default-dismisses at %i ms when dismissAfterMs is unspecified', (variant, expectedMs): void => {
    vi.useFakeTimers()
    const onDismiss = vi.fn()
    render(<Toast variant={variant as ToastVariant} message="X" onDismiss={onDismiss} />)
    act((): void => { vi.advanceTimersByTime(expectedMs - 1) })
    expect(onDismiss).not.toHaveBeenCalled()
    act((): void => { vi.advanceTimersByTime(1) })
    expect(onDismiss).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })
})

describe('ToastProvider + useToast', (): void => {
  function Probe(): React.ReactElement {
    const { show } = useToast()
    return <button onClick={(): void => { show({ variant: 'success', message: 'Yay' }) }}>fire</button>
  }
  it('shows a Toast when useToast().show is called; clears after onDismiss', async (): Promise<void> => {
    const user = userEvent.setup()
    render(<ToastProvider><Probe /></ToastProvider>)
    expect(screen.queryByRole('status')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'fire' }))
    expect(screen.getByRole('status')).toHaveTextContent('Yay')
  })

  // Codex round 2 PR #97 P1 fold: context value must be stable across renders
  // so consumers' useEffect deps including `toast` don't infinite-loop.
  it('useToast().show is referentially stable across re-renders of ToastProvider', (): void => {
    let captured: Array<{ show: (i: ToastInput) => void }> = []
    function Probe(): React.ReactElement {
      const toast = useToast()
      captured.push(toast)
      return null
    }
    const { rerender } = render(<ToastProvider><Probe /></ToastProvider>)
    rerender(<ToastProvider><Probe /></ToastProvider>)
    expect(captured.length).toBeGreaterThanOrEqual(2)
    expect(captured[0]!.show).toBe(captured[1]!.show)
  })

  // Codex round 2 PR #97 P2 fold: replacement Toast must use its own timing,
  // not inherit the previous Toast's remainingRef.
  it('replacement Toast remounts with fresh timing (key-by-show-counter)', async (): Promise<void> => {
    vi.useFakeTimers()
    function DoubleFire(): React.ReactElement {
      const { show } = useToast()
      return (
        <>
          <button onClick={(): void => { show({ variant: 'info', message: 'First', dismissAfterMs: 100_000 }) }}>fire1</button>
          <button onClick={(): void => { show({ variant: 'error', message: 'Second', dismissAfterMs: 1000 }) }}>fire2</button>
        </>
      )
    }
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<ToastProvider><DoubleFire /></ToastProvider>)
    await user.click(screen.getByRole('button', { name: 'fire1' }))
    expect(screen.getByRole('status')).toHaveTextContent('First')
    await user.click(screen.getByRole('button', { name: 'fire2' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Second')
    // The replacement uses its own 1000ms; the first one's 100000ms is forgotten.
    act((): void => { vi.advanceTimersByTime(1000) })
    expect(screen.queryByRole('alert')).toBeNull()
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run — expect FAIL.** (`Toast` does not exist yet.)

- [ ] **Step 3: Commit failing tests.**

#### Task 4.5b-2: Toast.tsx impl

**Files:** Create `packages/design-system/src/components/Toast.tsx`.

- [ ] **Step 1: Implement.**

```tsx
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { JSX, ReactNode } from 'react'

import { Button } from './Button'

export type ToastVariant = 'info' | 'success' | 'error'

export interface ToastProps {
  readonly variant: ToastVariant
  readonly message: string
  readonly onDismiss: () => void
  readonly dismissAfterMs?: number
}

// Per-variant defaults per Decision C1 P2-1 fold (WCAG 2.2 SC 2.2.1).
const DEFAULT_DISMISS_MS: Record<ToastVariant, number> = {
  info: 5000,
  success: 5000,
  error: 8000,
}

export function Toast(props: ToastProps): JSX.Element {
  const { variant, message, onDismiss } = props
  const dismissAfterMs = props.dismissAfterMs ?? DEFAULT_DISMISS_MS[variant]
  const remainingRef = useRef<number>(dismissAfterMs)
  const startedAtRef = useRef<number>(Date.now())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect((): (() => void) => {
    startedAtRef.current = Date.now()
    timerRef.current = setTimeout(onDismiss, remainingRef.current)
    return (): void => {
      if (timerRef.current !== null) { clearTimeout(timerRef.current) }
    }
  }, [onDismiss])

  function pauseTimer(): void {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
      remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAtRef.current))
    }
  }

  function resumeTimer(): void {
    if (timerRef.current !== null) { return }
    startedAtRef.current = Date.now()
    timerRef.current = setTimeout(onDismiss, remainingRef.current)
  }

  // ARIA per Decision C1: info/success → polite status; error → assertive alert.
  const role = variant === 'error' ? 'alert' : 'status'
  return (
    <div
      role={role}
      tabIndex={0}
      className={`sta-toast sta-toast--${variant}`}
      onMouseEnter={pauseTimer}
      onMouseLeave={resumeTimer}
      onFocus={pauseTimer}
      onBlur={resumeTimer}
    >
      <span>{message}</span>
      <Button variant="ghost" onClick={onDismiss} aria-label="Dismiss notification">×</Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ToastProvider + useToast — single-slot per Decision C2.
// ---------------------------------------------------------------------------

export interface ToastInput {
  readonly variant: ToastVariant
  readonly message: string
  readonly dismissAfterMs?: number
}

interface ToastContextValue {
  readonly show: (input: ToastInput) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  // Codex round 2 PR #97 P1 fold: memoize context value so consumers' useEffect
  // deps including `toast` don't see a new object every render (the original
  // inline `value={{ show: setCurrent }}` would cause infinite re-loops in
  // PublishDialog's success/error effect).
  const [current, setCurrent] = useState<{ input: ToastInput; key: number } | null>(null)
  const keyRef = useRef<number>(0)
  const value = useMemo((): ToastContextValue => ({
    // Codex round 2 PR #97 P2 fold: increment key on every show() so a replacement
    // Toast un-mounts/re-mounts (fresh `useRef(dismissAfterMs)` — otherwise the
    // second toast inherits the first one's remaining time).
    show: (input: ToastInput): void => {
      keyRef.current += 1
      setCurrent({ input, key: keyRef.current })
    },
  }), [])
  return (
    <ToastContext.Provider value={value}>
      {children}
      {current !== null && (
        <Toast
          key={current.key}
          variant={current.input.variant}
          message={current.input.message}
          dismissAfterMs={current.input.dismissAfterMs}
          onDismiss={(): void => { setCurrent(null) }}
        />
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (ctx === null) { throw new Error('useToast() called outside <ToastProvider>') }
  return ctx
}
```

- [ ] **Step 2: Run — expect PASS.**

- [ ] **Step 3: Commit.**

#### Task 4.5b-3: extend `Button` `aria-describedby` support (Codex round 5 PR #97 P2 fold)

**Files:** Modify `packages/design-system/src/components/Button.test.tsx` first, then `packages/design-system/src/components/Button.tsx`.

- [ ] **Step 1: Add failing test for `aria-describedby` pass-through.**

```tsx
it('forwards aria-describedby to the rendered <button> (PR 4.5c PublishDialog consumer per Decision F1)', (): void => {
  render(<Button aria-describedby="some-id">Click</Button>)
  expect(screen.getByRole('button')).toHaveAttribute('aria-describedby', 'some-id')
})
```

- [ ] **Step 2: Run — expect FAIL** (current `ButtonProps` does not declare `aria-describedby`).

- [ ] **Step 3: Extend `ButtonProps`:**

```ts
export interface ButtonProps {
  // ... existing props ...
  'aria-label'?: string
  'aria-pressed'?: boolean
  'aria-describedby'?: string  // ← new (PR 4.5c consumes for PublishDialog tooltip wiring).
}

export function Button({
  // ... existing destructuring ...
  'aria-label': ariaLabel,
  'aria-pressed': ariaPressed,
  'aria-describedby': ariaDescribedBy,
  ...rest
}: ButtonProps): JSX.Element {
  return (
    <button
      // ... existing JSX ...
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      aria-describedby={ariaDescribedBy}
    >
      {children}
    </button>
  )
}
```

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Commit.**

```bash
git add packages/design-system/src/components/Button.tsx packages/design-system/src/components/Button.test.tsx
git commit -s -m "feat(design-system): extend Button with aria-describedby for PublishDialog tooltip wiring (PR 4.5b §4.5b-3)"
```

#### Task 4.5b-4: barrel re-export

**Files:** Modify `packages/design-system/src/index.ts`.

- [ ] **Step 1: Add re-exports.**

```ts
export { Toast, ToastProvider, useToast } from './components/Toast'
export type { ToastProps, ToastVariant, ToastInput } from './components/Toast'
```

- [ ] **Step 2: Update the exports test to assert presence; run `npm run qa`.**

- [ ] **Step 3: Commit + push + open PR + post `@codex review` + section-review subagent (Toast component is a user-facing UX surface per `feedback_section_review_workflow.md` — brief: verify dismiss timing copy, error-vs-status semantics, hover-pause feel).**

**Acceptance gate (PR 4.5b):** `npm run qa` green; coverage 100% on Toast.tsx; jest-axe clean in all 3 variants; subagent + Codex round both 👍.

---

### PR 4.5c — PublishDialog + usePublish + Shell wire-up

**Branch:** `epic-4/pr-4.5c-publish-dialog`. **Depends on:** PR 4.5b merged. **README:** skip.

**Subagent review trigger:** **NO** (UI components; schema + server + DS shipped under review in PRs 4.5a + 4.5b). **Section review (`feedback_section_review_workflow.md`):** PublishDialog 4-state blocking UX is user-facing — dispatch a domain-specialist subagent reviewer with the blocking tooltip copy from spec §4.3.1 BEFORE asking the user for section approval.

**File budget:** 7 files (within ≤8 budget; Codex round 2 PR #97 P2 fold removed `useHealth.ts` + `useHealth.test.ts` after dropping Decision D3).

**Files (tests first):**

1. **Create** `apps/admin/src/state/usePublish.test.ts` — hook tests.
2. **Create** `apps/admin/src/state/usePublish.ts` — submit + state machine + on-success invalidation of `listPublishes`.
3. **Create** `apps/admin/src/state/useListPublishes.test.ts` — Suspense + invalidation tests (moved from PR 4.5d per A1 P0-1 fold).
4. **Create** `apps/admin/src/state/useListPublishes.ts` — single-promise cache + consumer subscription per Decision E1 (moved from PR 4.5d per A1 P0-1 fold).
5. **Create** `apps/admin/src/views/PublishDialog.test.tsx` — render + 4 blocking states + interaction.
6. **Create** `apps/admin/src/views/PublishDialog.tsx` — modal overlay; reads `useHealth()` (existing, unchanged); uses `usePublish()`.
7. **Modify** `apps/admin/src/views/Shell.tsx` — add `<Button>Publish</Button>` in header; wrap children in `<ToastProvider>`; render `<PublishDialog open onClose />` conditionally.

**`useHealth.ts` is NOT extended** (per Decision D3 removal — Codex round 2 P2 fold). PublishDialog re-fetches health via the existing `useEffect`-on-mount pattern each time the modal opens. Dashboard staleness post-publish is a documented Phase-1 limitation; PR 4.6a Tier 5 polish revisits.

**MSW handlers** for the new `getHealth` blocker fixtures live inline in `PublishDialog.test.tsx` (via `server.use(...)` per the existing apps/admin test-setup convention); no global `test-setup.ts` modification needed.

#### Task 4.5c-1: `useListPublishes.test.ts` — useState/useEffect + cache + invalidation (ships BEFORE usePublish per A1 P0-1 fold)

**Files:** Create `apps/admin/src/state/useListPublishes.test.ts`.

- [ ] **Step 1: Write failing tests.** Test cases per Decision E1 (post-round-9 fold — useState pattern, NOT Suspense):
  - Initial mount: `value === null` and `error === null` (loading state).
  - After fetch resolves: `value === <response>`, `error === null`.
  - Different `page` → different cache key → different inFlight promise → independent fetch.
  - Fetch error: `value === null`, `error === <Error>`.
  - `invalidateListPublishes()` triggers re-fetch in subscribed consumers (verify via mounted-component re-render assertion: render the hook, await initial settle, swap the MSW handler to return a new response, call `invalidateListPublishes()`, assert the new response is visible).
  - Subscriber cleanup on unmount: unmounted consumer does NOT re-fetch on invalidation.
  - `__resetForTests()` clears inFlight + subscribers maps.
  - **Stale-request identity guard** (Codex round 10 PR #97 P2 fold): start fetch `p1` (returns response A after 50ms); call `invalidateListPublishes()` 10ms in (clears inFlight + fires onInvalidate which starts `p2` returning response B after 5ms); assert that after `p1` resolves, the component state still holds B (not A). Mirrors `useResortDetail.ts:94` `cachedPromises.get(slug) === next` pattern.
  - **Reset-on-key-change** (Codex round 11 PR #97 P2 fold): mount with query `{ page: { offset: 0, limit: 20 } }`, await resolve, assert `value !== null`; rerender with query `{ page: { offset: 20, limit: 20 } }`; assert that BEFORE the new fetch resolves the hook returns `{ value: null, error: null }` (loading state) — NOT the prior page's `value`. Mirrors `useResortList`'s reset-on-effect-entry behaviour.

- [ ] **Step 2: Run — expect FAIL** (`useListPublishes.ts` does not yet exist).

- [ ] **Step 3: Commit failing tests.**

#### Task 4.5c-2: `useListPublishes.ts` impl per Decision E1

**Files:** Create `apps/admin/src/state/useListPublishes.ts` (impl shown in PR 4.5d section below — full code there; ship the impl with this task).

- [ ] **Step 1: Implement** the dual-cache + subscriber-set pattern (`cachedPromises`, `cachedFulfilled`, `subscribers`, `revisions`, `loadOnce`, exported `useListPublishes`, `invalidateListPublishes`, `__resetForTests`).
- [ ] **Step 2: Run tests — expect PASS.**
- [ ] **Step 3: Commit** (`feat(admin-state): useListPublishes Suspense hook with consumer subscription (PR 4.5c §4.5c-2)`).

#### Task 4.5c-3: `usePublish.test.ts` — state machine + invalidations

```ts
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

import { usePublish, __resetForTests } from './usePublish'
import * as listPublishesModule from './useListPublishes'  // ships in §4.5c-2 above; import resolves.
// Codex round 2 PR #97 P2 fold: useHealth not extended in this PR; usePublish does NOT call invalidateHealth.

// MSW: success-mock for happy path; error-mock for failure path.

describe('usePublish', (): void => {
  beforeEach((): void => { __resetForTests() })

  it('starts idle', (): void => {
    const { result } = renderHook((): ReturnType<typeof usePublish> => usePublish())
    expect(result.current.status).toBe('idle')
  })

  it('happy path: idle → submitting → success; calls invalidateListPublishes (NOT invalidateHealth — Decision D3 removed)', async (): Promise<void> => {
    const invalidateP = vi.spyOn(listPublishesModule, 'invalidateListPublishes')
    const { result } = renderHook((): ReturnType<typeof usePublish> => usePublish())

    await act(async (): Promise<void> => { await result.current.submit() })
    expect(result.current.status).toBe('success')
    expect(result.current.response).toMatchObject({ resort_count: expect.any(Number) })
    expect(invalidateP).toHaveBeenCalledOnce()
  })

  it('failure path: idle → submitting → error; error carries message', async (): Promise<void> => {
    // MSW handler responds 400 publish-validation-failed.
    const { result } = renderHook((): ReturnType<typeof usePublish> => usePublish())
    await act(async (): Promise<void> => { await result.current.submit() })
    expect(result.current.status).toBe('error')
    expect(result.current.error?.message).toMatch(/publish-validation-failed/)
  })

  it('reset() returns to idle from error state', async (): Promise<void> => {
    const { result } = renderHook((): ReturnType<typeof usePublish> => usePublish())
    await act(async (): Promise<void> => { await result.current.submit() })  // assume error path mocked
    act((): void => { result.current.reset() })
    expect(result.current.status).toBe('idle')
    expect(result.current.error).toBeNull()
  })

  // Codex round 8 PR #97 P2 fold: synchronous in-flight guard.
  it('synchronous in-flight guard: a second submit() while one is pending is a no-op', async (): Promise<void> => {
    const apiSpy = vi.spyOn(apiClient, 'publish')
    const { result } = renderHook((): ReturnType<typeof usePublish> => usePublish())
    // Fire two submits synchronously — second one must not invoke apiClient.publish().
    await act(async (): Promise<void> => {
      const p1 = result.current.submit()
      const p2 = result.current.submit()
      await Promise.all([p1, p2])
    })
    expect(apiSpy).toHaveBeenCalledOnce()
  })
})
```

#### Task 4.5c-4: `usePublish.ts` impl per Decision D1 + D2

```ts
import { useRef, useState } from 'react'

import type { PublishResponse } from '@snowboard-trip-advisor/schema/api'

import { apiClient } from '../lib/apiClient'
// Codex round 2 PR #97 P2 fold: no invalidateHealth import — Decision D3 dropped.
import { invalidateListPublishes } from './useListPublishes'

export type PublishStatus = 'idle' | 'submitting' | 'success' | 'error'

export interface UsePublishResult {
  readonly status: PublishStatus
  readonly response: PublishResponse | null
  readonly error: Error | null
  readonly submit: () => Promise<void>
  readonly reset: () => void
}

export function usePublish(): UsePublishResult {
  const [status, setStatus] = useState<PublishStatus>('idle')
  const [response, setResponse] = useState<PublishResponse | null>(null)
  const [error, setError] = useState<Error | null>(null)
  // Codex round 8 PR #97 P2 fold: synchronous in-flight guard. Without this,
  // a double-click on Confirm (or any second submit() call before React
  // commits the `setStatus('submitting')` render) would launch a second
  // apiClient.publish() — Phase 1 does NOT deduplicate Idempotency-Keys
  // server-side (spec §4.9 invariant 5), so two POSTs = two history archives
  // + two current.v1.json writes for one user intent.
  const inFlightRef = useRef<boolean>(false)

  async function submit(): Promise<void> {
    if (inFlightRef.current) { return }
    inFlightRef.current = true
    setStatus('submitting')
    setError(null)
    try {
      const r = await apiClient.publish()
      setResponse(r)
      setStatus('success')
      invalidateListPublishes()
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
      setStatus('error')
    } finally {
      inFlightRef.current = false
    }
  }

  function reset(): void {
    setStatus('idle')
    setResponse(null)
    setError(null)
  }

  return { status, response, error, submit, reset }
}

export function __resetForTests(): void { /* no module-level state */ }
```

#### Task 4.5c-5 — **REMOVED** per Codex round 2 PR #97 P2 fold

Original Task 4.5c-5 extended `useHealth.ts` with an `invalidateHealth` export + `useSyncExternalStore` subscription. Removed because: (a) the AGENTS.md PR-sizing rule counts paths, not concerns, so `useHealth.ts` + `useHealth.test.ts` would have pushed PR 4.5c to 9 files (over the ≤8 hard ceiling), and (b) `PublishDialog` unmounts on success/close and re-fetches health on every subsequent mount via the existing `useEffect` pattern, so the subscription wasn't load-bearing for the publish flow. Decision D3 has been struck through in the Decisions log. The Dashboard's post-publish health-card staleness is a documented Phase-1 limitation tagged for PR 4.6a Tier 5 polish.

#### Task 4.5c-6: `PublishDialog.test.tsx` — 4 blocking states

**The 4 blocking conditions + tooltip copy from spec §4.3.1.** Section-reviewer subagent must verify the copy before user approval.

```tsx
it.each([
  ['resorts_with_failed_fields', 1, 'fix failures or switch fields to MANUAL before publishing.'],
  ['resorts_with_missing_provenance', 1, 'every metric field needs a matching `field_sources` entry; check the editor\'s StatusPill column for missing-provenance markers.'],
  ['resorts_with_corrupt_workspace', 1, '1 workspace file is corrupt. Inspect `data/admin-workspace/` and either repair or `rm` the file before publishing. See server logs for the failing slug + Zod issue list.'],
  ['resorts_total', 0, 'no resorts staged for publish. Add resorts in the editor before publishing.'],
])('disables confirm + shows tooltip when %s = %i', async (field, value, tooltip): Promise<void> => {
  // Seed MSW health response with the blocking field; render <PublishDialog open onClose=…/>.
  // Codex round 11 PR #97 P2 fold: assert via native `disabled` (Button forwards
  // it; aria-disabled prop was dropped from Button in round 5 — native disabled
  // covers the AT semantic). Tooltip text asserted exactly.
  // Assert: screen.getByRole('button', { name: /Confirm/ }).toBeDisabled()
  // and tooltip element renders the exact copy from spec §4.3.1.
})

it('confirm button enabled when health is clean; click → submit; on success → onClose called + Toast surfaces', /* ... */)
it('confirm button DISABLED while health.value === null (loading); shows "Loading pre-publish checks…"', /* P2 fold Codex round 1 PR #97 */)
it('confirm button DISABLED while health.error !== null; shows error message', /* P2 fold Codex round 1 PR #97 */)
it('on success: fires Toast EXACTLY ONCE then calls publish.reset() so subsequent re-renders are no-ops', /* P1 fold Codex round 2 PR #97 */)
it('on error: fires Toast EXACTLY ONCE then calls publish.reset()', /* P1 fold Codex round 2 PR #97 */)
it('Escape closes dialog; backdrop click closes dialog; first focusable element is auto-focused', /* ... */)
it('Confirm button has aria-describedby pointing at the blocker tooltip id when a blocker is active', /* P2-4 fold */)
// P1-6 fold: dropped the "Tab / Shift+Tab cycles inside (focus trap)" assertion. Phase 1 relies
// on aria-modal="true" + minimal focusable surface; full trap deferred to PR 4.6a Tier 5 polish.
```

#### Task 4.5c-7: `PublishDialog.tsx` impl

```tsx
import { useEffect, useRef } from 'react'
import type { JSX } from 'react'
import { Button, useToast } from '@snowboard-trip-advisor/design-system'

import { useHealth } from '../state/useHealth'
import { usePublish } from '../state/usePublish'

const TOOLTIP_BY_BLOCKER = {
  failed_fields:
    'fix failures or switch fields to MANUAL before publishing.',
  missing_provenance:
    'every metric field needs a matching `field_sources` entry; check the editor\'s StatusPill column for missing-provenance markers.',
  corrupt_workspace:
    '1 workspace file is corrupt. Inspect `data/admin-workspace/` and either repair or `rm` the file before publishing. See server logs for the failing slug + Zod issue list.',
  empty:
    'no resorts staged for publish. Add resorts in the editor before publishing.',
} as const
type Blocker = keyof typeof TOOLTIP_BY_BLOCKER

export interface PublishDialogProps {
  readonly onClose: () => void
}

// Codex round 3 PR #97 P1 fold: no `open` prop. Shell mounts the dialog
// conditionally (`{isPublishOpen && <PublishDialog onClose={...} />}`) so
// each open re-runs `useHealth()`'s mount effect against fresh health.
export function PublishDialog({ onClose }: PublishDialogProps): JSX.Element {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const health = useHealth()
  const publish = usePublish()
  const toast = useToast()

  useEffect((): (() => void) => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(
      'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )
    firstFocusable?.focus()
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') { onClose() }
      // P1-6 fold: NO Tab trap in Phase 1. aria-modal="true" + minimal focusable surface
      // (Cancel + Confirm) suffices; PR 4.6a Tier 5 polish adds a real trap if needed.
    }
    document.addEventListener('keydown', onKey)
    return (): void => {
      document.removeEventListener('keydown', onKey)
      previouslyFocused?.focus()
    }
  }, [onClose])

  useEffect((): void => {
    // Codex round 2 PR #97 P1 fold: after handling terminal status, call
    // publish.reset() so subsequent re-renders see status === 'idle' and the
    // effect's body is a no-op — defense-in-depth on top of the ToastProvider
    // memoization that already stabilizes `toast`. Without the reset, if any
    // future refactor destabilizes `toast`, the effect re-runs while status
    // is still 'success'/'error' and fires a fresh Toast per render.
    if (publish.status === 'success') {
      toast.show({ variant: 'success', message: `Published version ${publish.response?.version_id ?? ''}` })
      publish.reset()
      onClose()
    } else if (publish.status === 'error') {
      toast.show({ variant: 'error', message: `Publish failed: ${publish.error?.message ?? 'unknown'}` })
      publish.reset()
    }
  }, [publish, onClose, toast])

  // Codex round 1 PR #97 P2 fold: fail-CLOSED while health is unknown.
  // Original logic enabled the confirm button when `health.value === null`
  // (loading or error), letting a fast click bypass the very blockers the
  // dialog enforces. Treat unknown health as disabled with a loading affordance.
  const healthUnknown = health.value === null
  const blocker: Blocker | null =
    healthUnknown ? null
      : health.value!.resorts_with_failed_fields > 0 ? 'failed_fields'
      : health.value!.resorts_with_missing_provenance > 0 ? 'missing_provenance'
      : health.value!.resorts_with_corrupt_workspace > 0 ? 'corrupt_workspace'
      : health.value!.resorts_total === 0 ? 'empty'
      : null

  const disabled = healthUnknown || blocker !== null || publish.status === 'submitting'

  return (
    <>
      <div className="publish-dialog__backdrop" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-dialog-title"
        className="publish-dialog"
      >
        <h2 id="publish-dialog-title">Publish</h2>
        {healthUnknown && (
          <p id="publish-dialog-blocker" className="publish-dialog__tooltip" role="status">
            {health.error === null ? 'Loading pre-publish checks…' : `Could not load health: ${health.error.message}`}
          </p>
        )}
        {!healthUnknown && blocker !== null && (
          <p id="publish-dialog-blocker" className="publish-dialog__tooltip">
            {TOOLTIP_BY_BLOCKER[blocker]}
          </p>
        )}
        <div className="publish-dialog__actions">
          <Button onClick={onClose} variant="ghost">Cancel</Button>
          <Button
            onClick={(): void => { void publish.submit() }}
            disabled={disabled}
            aria-describedby={blocker !== null ? 'publish-dialog-blocker' : undefined}
          >
            {publish.status === 'submitting' ? 'Publishing…' : 'Confirm'}
          </Button>
        </div>
      </div>
    </>
  )
}
```

#### Task 4.5c-8: Shell.tsx MODIFY — Publish button + ToastProvider + dialog

```tsx
import { Button, DropdownMenu, Sidebar, ToastProvider } from '@snowboard-trip-advisor/design-system'
import { useState } from 'react'
import type { JSX, ReactNode } from 'react'

import { PublishDialog } from './PublishDialog'

export function Shell({ children }: { children: ReactNode }): JSX.Element {
  const [publishOpen, setPublishOpen] = useState(false)
  return (
    <ToastProvider>
      <div className="app-shell">
        <header role="banner" className="app-shell__header">
          <span className="app-shell__brand">Admin</span>
          <Button onClick={(): void => { setPublishOpen(true) }}>Publish</Button>
          <DropdownMenu /* …existing… */ />
        </header>
        {/* …existing nav + main… */}
        {children}
        {/* Codex round 3 PR #97 P1 fold: conditionally mount so each open re-runs useHealth on mount. */}
        {publishOpen && (
          <PublishDialog onClose={(): void => { setPublishOpen(false) }} />
        )}
      </div>
    </ToastProvider>
  )
}
```

#### Task 4.5c-9: Section-review + PR + Codex

- [ ] Before user approval of the PublishDialog tooltip copy, **dispatch a section-review subagent** with the §4.3.1 tooltip strings as load-bearing claims to verify against the spec. Findings folded before opening the PR.
- [ ] Commit, push, open PR (no subagent review trigger for the PR itself per Decision A1 / PR-level trigger matrix — only the section copy gets reviewed).
- [ ] Post `@codex review`; fold; re-request until 👍.

**Acceptance gate (PR 4.5c):** all 4 blocker states render correct tooltip copy; confirm enabled iff none of the 4 blockers; submit happy path emits success Toast + closes dialog; failure path emits error Toast + keeps dialog open; ESC + backdrop close the dialog; focus restored to opener button.

---

### PR 4.5d — PublishHistory view + routing + bridge integration

**Branch:** `epic-4/pr-4.5d-publish-history`. **Depends on:** PR 4.5c merged. **README:** consider mentioning admin app's `npm run dev:admin` entrypoint (Epic 4 is now end-to-end functional through publish).

**Subagent review trigger:** **NO** (no CODEOWNERS-protected paths; integration test is in `tests/integration/**`).

**File budget:** 7 files (within ≤8 budget; Codex round 10 PR #97 P2 fold added Shell.tsx MODIFY for the Sidebar Publishes-link href fix).

**Files (tests first):**

1. **Create** `apps/admin/src/views/PublishHistory.test.tsx` — render, empty state (offset = 0 + paginated-past-total branch per P1-7 fold), pagination, accessibility (`<time dateTime>` + pluralized resort count per P2-3 fold).
2. **Create** `apps/admin/src/views/PublishHistory.tsx` — list view + page nav. Reads `useListPublishes` shipped in 4.5c.
3. **Modify** `apps/admin/src/lib/urlState.ts` — add `{ route: 'publishes'; page?: number }` variant.
4. **Modify** `apps/admin/src/lib/urlState.test.ts` — round-trip case for `?route=publishes&page=2`.
5. **Modify** `apps/admin/src/App.tsx` — mount `<PublishHistory />` on `publishes` route.
6. **Modify** `apps/admin/src/views/Shell.tsx` — change the SIDEBAR_ITEMS `Publishes` entry's `href` from `/publishes` to `/?route=publishes` so clicking the sidebar link reaches the new route via urlState's query-string parser (Codex round 10 PR #97 P2 fold). **Pre-existing Sidebar pathname-vs-query mismatch for the other links (`/`, `/resorts`) stays Tier 5 polish per the post-Tier-2 handoff** — fixing all of them is out of scope for this PR.
7. **Create** `tests/integration/apps/admin/publish-flow.test.tsx` — bridge-tier end-to-end (per Decision I1). Add an assertion that clicking the Sidebar "Publishes" link navigates to `?route=publishes` and renders `<PublishHistory />`.

#### Reference — `useListPublishes.ts` impl

> `useListPublishes.ts` ships in PR 4.5c per Decision A1's P0-1 fold; full impl block kept here for executing-agent reference (the implementation move is captured in the reviewer-fold log).

```ts
// apps/admin/src/state/useListPublishes.ts (shipped in PR 4.5c, kept here as reference)
// Codex round 9 PR #97 P1 fold: matches `useResortList.ts:2-16` pattern —
// useState + useEffect + module-level inFlight Map. NOT Suspense-based.
// Eliminates the need for any <Suspense> boundary in App.tsx / PublishHistory.
import { useEffect, useState } from 'react'

import type { ListPublishesQuery, ListPublishesResponse } from '@snowboard-trip-advisor/schema/api'

import { apiClient } from '../lib/apiClient'

export type UseListPublishesResult =
  | { value: ListPublishesResponse; error: null }
  | { value: null; error: Error }
  | { value: null; error: null }

// Module-level: keyed in-flight cache — same shape as useResortList.ts:16 +
// useHealth.ts (per the existing project convention). Cleared on settle so a
// second mount AFTER the first resolves triggers a fresh fetch.
const inFlight = new Map<string, Promise<ListPublishesResponse>>()

// Per-key generation counter for stale-request detection. Codex round 12 PR #97
// P1 fold replaces the previous identity-via-inFlight check (which failed in
// the normal happy path because `.finally` removes the inFlight entry BEFORE
// `.then` runs). Generations only increase via invalidate; capture-at-fetch +
// compare-at-settle still detects the stale case, but cache cleanup no longer
// affects state-write guards.
const generations = new Map<string, number>()
function bumpGeneration(key: string): number {
  const g = (generations.get(key) ?? 0) + 1
  generations.set(key, g)
  return g
}
function currentGeneration(key: string): number {
  return generations.get(key) ?? 0
}

// Recursive-key-sorted JSON for stable cache keys across caller construction order
// (per useResortList.ts's documented "queryKey deeply sorts nested object keys" invariant).
function keyOf(q: ListPublishesQuery): string {
  return JSON.stringify(q, (_k, v): unknown =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]): number => a.localeCompare(b)))
      : v
  )
}

// Per-key subscribers for `invalidateListPublishes()` post-publish refresh.
const subscribers = new Map<string, Set<() => void>>()

export function useListPublishes(q: ListPublishesQuery): UseListPublishesResult {
  const [value, setValue] = useState<ListPublishesResponse | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const key = keyOf(q)

  useEffect((): (() => void) => {
    let cancelled = false
    // Codex round 11 PR #97 P2 fold: reset to loading on key change so the
    // user doesn't see stale rows from the previous page while the new fetch
    // is in flight. Mirrors useResortList's reset-on-effect-entry pattern.
    setValue(null); setError(null)

    // Codex round 12 PR #97 P1 fold: capture the active generation at fetch
    // start; compare at settle. Cache cleanup (.finally) no longer affects
    // state-write guards because generation is independent of inFlight presence.
    const myGen = currentGeneration(key)

    let p = inFlight.get(key)
    if (p === undefined) {
      p = apiClient.listPublishes(q)
      inFlight.set(key, p)
      p.finally((): void => {
        if (inFlight.get(key) === p) { inFlight.delete(key) }
      })
    }
    p.then((r): void => {
      // Generation guard: if invalidate bumped the generation while this
      // request was in flight, our captured myGen is now stale → skip write.
      if (cancelled || currentGeneration(key) !== myGen) { return }
      setValue(r); setError(null)
    }, (e: unknown): void => {
      if (cancelled || currentGeneration(key) !== myGen) { return }
      setError(e instanceof Error ? e : new Error(String(e))); setValue(null)
    })

    // Subscribe to invalidations so post-publish kicks a re-fetch.
    function onInvalidate(): void {
      if (cancelled) { return }
      setValue(null); setError(null)
      // bumpGeneration already happened in invalidateListPublishes (before
      // subscribers fire). Capture the NEW generation for this fresh fetch.
      const myGen2 = currentGeneration(key)
      const p2 = apiClient.listPublishes(q)
      inFlight.set(key, p2)
      p2.finally((): void => {
        if (inFlight.get(key) === p2) { inFlight.delete(key) }
      })
      p2.then((r): void => {
        if (cancelled || currentGeneration(key) !== myGen2) { return }
        setValue(r); setError(null)
      }, (e: unknown): void => {
        if (cancelled || currentGeneration(key) !== myGen2) { return }
        setError(e instanceof Error ? e : new Error(String(e))); setValue(null)
      })
    }
    let set = subscribers.get(key)
    if (set === undefined) { set = new Set(); subscribers.set(key, set) }
    set.add(onInvalidate)

    return (): void => {
      cancelled = true
      set?.delete(onInvalidate)
    }
  }, [key])

  return { value, error } as UseListPublishesResult
}

// usePublish.ts calls this on successful publish so the PublishHistory view re-fetches.
export function invalidateListPublishes(): void {
  // Bump generation for every known key BEFORE clearing inFlight so any
  // in-flight promise's eventual .then sees the generation mismatch and
  // skips its setValue. Subscribers then fire onInvalidate which captures
  // the new generation for the fresh fetch.
  for (const key of subscribers.keys()) { bumpGeneration(key) }
  inFlight.clear()
  for (const set of subscribers.values()) {
    for (const cb of set) { cb() }
  }
}

export function __resetForTests(): void {
  inFlight.clear()
  subscribers.clear()
  generations.clear()
}
```

#### Task 4.5d-1: `PublishHistory.test.tsx` + impl

```tsx
// Test cases (post-round-9 fold — view is a <section>, hook returns { value, error }):
//   - Loading state: useListPublishes returns { value: null, error: null } → renders <p role="status">Loading…</p>.
//   - Error state: useListPublishes returns { value: null, error } → renders <p role="alert"> with the error message.
//   - Renders empty state when ListPublishesResponse.items is [] AND offset === 0.
//   - Renders paginated-past-total empty state when items === [] AND offset > 0 (with "Back to first page" button).
//   - Renders N rows for N items; each shows version_id + <time dateTime> + pluralized resort count + published_by.
//   - Sorted desc by published_at (handler returns newest-first; component just renders).
//   - Pagination: Next button → setRoute({ route: 'publishes', page: page + 1 }); disabled when offset + limit >= total.
//   - Previous button → setRoute({ route: 'publishes', page: page - 1 }); disabled when page === 0.
//   - Root element is <section aria-label="Publish history"> — NOT <main> — so it nests cleanly inside Shell's <main>{children}</main>.
```

```tsx
// apps/admin/src/views/PublishHistory.tsx
// Codex round 9 PR #97 P2 fold: root element is <section>, NOT <main>.
// Shell already wraps children in <main>{children}</main> at Shell.tsx:42;
// returning another <main> would nest the landmark — invalid HTML +
// confusing for AT navigation. Dashboard.tsx uses <section> too.
import { Button } from '@snowboard-trip-advisor/design-system'
import type { JSX } from 'react'

import { useURLState, setRoute } from '../state/useURLState'
import { useListPublishes } from '../state/useListPublishes'

const PAGE_SIZE = 20

export function PublishHistory(): JSX.Element {
  const route = useURLState()
  if (route.route !== 'publishes') { throw new Error('PublishHistory mounted outside publishes route') }
  const page = route.page ?? 0
  const offset = page * PAGE_SIZE

  // Codex round 9 PR #97 P1 fold: useListPublishes is useState-based (NOT
  // Suspense); returns `{ value, error }`. Handle loading + error states inline
  // — no <Suspense> boundary required upstream.
  const { value, error } = useListPublishes({ page: { offset, limit: PAGE_SIZE } })

  if (error !== null) {
    return (
      <section aria-label="Publish history">
        <h1>Publish history</h1>
        <p role="alert">Could not load publish history: {error.message}</p>
      </section>
    )
  }
  if (value === null) {
    return (
      <section aria-label="Publish history">
        <h1>Publish history</h1>
        <p role="status" aria-live="polite">Loading…</p>
      </section>
    )
  }

  // P1-7 fold: split the empty-state branches.
  if (value.items.length === 0 && offset === 0) {
    return (
      <section aria-label="Publish history">
        <h1>Publish history</h1>
        <p>No publishes yet. Use the Publish button in the header to publish for the first time.</p>
      </section>
    )
  }
  if (value.items.length === 0 && offset > 0) {
    return (
      <section aria-label="Publish history">
        <h1>Publish history</h1>
        <p>No publishes on this page.</p>
        <Button onClick={(): void => { setRoute({ route: 'publishes' }) }}>Back to first page</Button>
      </section>
    )
  }

  return (
    <section aria-label="Publish history">
      <h1>Publish history</h1>
      <ul className="publish-history">
        {value.items.map((item): JSX.Element => (
          <li key={item.version_id}>
            <span>{item.version_id}</span>
            <time dateTime={item.published_at}>{item.published_at}</time>
            {/* P2-3 fold: pluralize + drop the file_size_bytes column (not in
                PublishMetadata schema per packages/schema/api/listPublishes.ts:15-21). */}
            <span>{item.resort_count} {item.resort_count === 1 ? 'resort' : 'resorts'}</span>
            <span>by {item.published_by}</span>
          </li>
        ))}
      </ul>
      <nav aria-label="Publish history pagination">
        <Button
          variant="ghost"
          disabled={page === 0}
          onClick={(): void => { setRoute({ route: 'publishes', page: page - 1 }) }}
        >Previous</Button>
        <Button
          variant="ghost"
          disabled={offset + PAGE_SIZE >= value.page.total}
          onClick={(): void => { setRoute({ route: 'publishes', page: page + 1 }) }}
        >Next</Button>
      </nav>
    </section>
  )
}
```

#### Task 4.5d-2: `urlState.ts` MODIFY + `urlState.test.ts` round-trip

```ts
// urlState.ts: extend AdminRoute union:
export type AdminRoute =
  | { route: 'dashboard' }
  | { route: 'resorts'; country?: ISOCountryCode; hasFailures?: boolean }
  | { route: 'editor'; slug: ResortSlug }
  | { route: 'publishes'; page?: number }

// In parseURL: add the 'publishes' branch:
if (route === 'publishes') {
  const pageRaw = params.get('page')
  const page = pageRaw !== null && /^\d+$/.test(pageRaw) ? Number(pageRaw) : undefined
  return page === undefined ? { route: 'publishes' } : { route: 'publishes', page }
}

// In serializeURL: add the 'publishes' branch with optional page.
```

```ts
// urlState.test.ts: round-trip cases for ?route=publishes (page=0 default) and ?route=publishes&page=2.
```

#### Task 4.5d-3: `App.tsx` MODIFY — mount PublishHistory on `publishes` route + Shell.tsx Sidebar href fix

```tsx
// apps/admin/src/App.tsx
if (route.route === 'publishes') {
  return <Shell><PublishHistory /></Shell>
}
```

```tsx
// apps/admin/src/views/Shell.tsx — SIDEBAR_ITEMS Publishes-link fix per Codex round 10 PR #97 P2 fold.
const SIDEBAR_ITEMS = [
  { href: '/', label: 'Dashboard' },
  { href: '/resorts', label: 'Resorts' },
  { href: '/?route=publishes', label: 'Publishes' },  // ← was '/publishes'; query-string form so urlState routes correctly.
] as const
```

The other two sidebar items (`/` for Dashboard and `/resorts` for Resorts) keep their pathname-form hrefs — fixing the full Sidebar pathname-vs-query mismatch is **Tier 5 polish** per the post-Tier-2 handoff and out of scope here. Only the Publishes link gets the in-scope fix since it's the new route this PR adds.

#### Task 4.5d-4: `publish-flow.test.tsx` bridge integration

```tsx
// tests/integration/apps/admin/publish-flow.test.tsx
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Codex round 7 PR #97 P2 fold: 4 `..` segments to reach repo root from
// tests/integration/apps/admin/ (matches existing tests like
// resort-editor-write.test.tsx:13). App is a default export per App.tsx:9.
import { server } from '../../../../apps/admin/src/mocks/server'
import { bridgeHandlers } from '../../../../apps/admin/src/mocks/realHandlers'
import App from '../../../../apps/admin/src/App'

describe('publish flow — bridge tier', (): void => {
  let workspaceRoot: string
  beforeEach(async (): Promise<void> => {
    workspaceRoot = await mkdtemp(join(tmpdir(), 'snowboard-publish-flow-'))
    // Seed both seed fixtures into workspaceRoot/data/admin-workspace/.
    server.use(...bridgeHandlers(workspaceRoot))
  })
  afterEach(async (): Promise<void> => {
    await rm(workspaceRoot, { recursive: true, force: true })
  })

  it('open Shell → click Publish → confirm → Toast → navigate to publishes → see entry', async (): Promise<void> => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Publish' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    // Success Toast appears.
    expect(await screen.findByRole('status', { name: /Published version/ })).toBeInTheDocument()

    // History dir grew.
    const dir = join(workspaceRoot, 'data/published/history')
    const entries = await readdir(dir)
    expect(entries.some((e): boolean => /^\d+-.+\.json$/.test(e))).toBe(true)

    // Navigate to publishes.
    window.history.replaceState({}, '', '/?route=publishes')
    render(<App />)
    await waitFor((): void => {
      expect(screen.getByText(/2 resorts/)).toBeInTheDocument()  // or version_id, depending on render.
    })
  })

  it('blocked state: empty workspace + empty published → cold-start tooltip; confirm disabled', async (): Promise<void> => {
    // Clear workspace fixtures; render; click Publish; assert tooltip.
  })
})
```

#### Task 4.5d-5: Section-review + PR + Codex

- [ ] PublishHistory empty-state copy + pagination labels are user-facing — dispatch section-review subagent before user approval.
- [ ] Commit, push, open PR + Codex review + fold + Tier 4 → 5 gate sign-off.

**Acceptance gate (PR 4.5d):** `npm run qa` green; bridge integration covers happy path + at least one blocked state; PublishHistory shows the version published in the integration test; URL state round-trip on `?route=publishes&page=N` is reversible.

---

## Per-PR workflow (every PR; saved memory checklist — apply ALL)

From `~/.claude/projects/.../memory/MEMORY.md`:

- **`feedback_atomic_prs.md`** — one concern per PR; ≤300 LOC / ≤5 commits / ≤8 files. Fold commits exceeding ≤5 are expected per the Codex per-PR memory.
- **`feedback_codex_review_per_pr.md`** — `@codex review` on every PR; fold reply with fix SHA; resolve thread via GraphQL.
- **`feedback_local_test_per_pr.md`** — generate AND execute a tailored local-test plan before surfacing to the maintainer.
- **`feedback_section_review_workflow.md`** — for user-facing UX (PublishDialog tooltips, Toast variants, PublishHistory copy), dispatch a domain-specialist subagent reviewer BEFORE asking the user for section approval.
- **`feedback_tdd_in_plans_and_specs.md`** — file lists in this plan order tests before implementation per Tasks N.M-1 (test) → N.M-2 (impl) → N.M-3 (more tests / commit).
- **`feedback_edit_tool_in_worktrees.md`** — prefix paths with the worktree dir; verify with `git status` IN the worktree.

After implementation completes on a PR's branch:

1. `npm run qa` green locally before pushing. Do NOT bypass with `--no-verify` (the PreToolUse:Bash hook blocks it).
2. Subagent review for PRs flagged YES (PR 4.5a server + PR 4.5b DS).
3. `git push -u origin <branch>` with auto-DCO sign-off.
4. `gh pr create` with PR body listing spec section + decisions log IDs touched + file budget + verification commands.
5. Post `@codex review` as a PR comment. Wait 2–5 min.
6. Fold P0/P1/P2 findings on the same branch. For each fold: re-run `npm run qa`; reply to the thread with the fix SHA AND resolve the thread via GraphQL.
7. Re-request `@codex review` after each fold round; iterate until 👍 OR re-flagged duplicates (architectural concerns at different anchors count as "nothing new").
8. Generate + EXECUTE a tailored local-test plan (qa, build smoke, dev probe, browser smoke via Playwright MCP for UI PRs).
9. Report findings to the maintainer; maintainer merges.
10. After merge, on the next PR's branch: `git fetch origin main && git rebase origin/main`.

---

## Reviewer-fold log

_Populate as Codex / subagent / maintainer / user findings land per round. Carry only **load-bearing** facts forward; everything else is in `git log`._

| Round | PR | Source | Finding | Resolution |
|---|---|---|---|---|
| 0 | — | plan author | — | initial draft |
| 1 | — | plan-document-reviewer subagent | **P0-1** usePublish → useListPublishes import cycle (4.5c → 4.5d) | Move `useListPublishes.ts`/`.test.ts` from PR 4.5d into PR 4.5c (Decision A1 amended); PR 4.5d ships PublishHistory view only. |
| 1 | 4.5b | plan-document-reviewer subagent | **P0-2** barrel test path `__tests__/exports.test.ts` does not exist | Use the verified path `packages/design-system/src/index.test.ts`. |
| 1 | 4.5a | plan-document-reviewer subagent | **P0-3** `Idempotency-Key` invariant (spec §4.9 #5) unaddressed | Add Decision J1; add `dispatch.test.ts` case asserting header is honored without rejection. |
| 1 | 4.5a | plan-document-reviewer subagent | **P1-4** Task 4.5a-5 had impl before tests | Rewrote with explicit Step 1 (failing tests) → Step 2 (expect FAIL) → Step 3 (impl) → Step 4 (expect PASS) → Step 5 (qa) → Step 6 (commit). |
| 1 | 4.5c | plan-document-reviewer subagent | **P1-5** `useHealth` MODIFY task had no Step-1/2/3 structure | Rewrote Task 4.5c-5 with explicit failing-tests-first ordering mirroring `useResortDetail`'s round-2 P2-C fold pattern. |
| 1 | 4.5c | plan-document-reviewer subagent | **P1-6** Focus-trap impl underspec'd; test asserted Tab cycling | Dropped the Tab-cycle test (Decision F1 amended); rely on `aria-modal="true"` + minimal focusable surface for Phase 1. Real trap deferred to PR 4.6a Tier 5 polish. |
| 1 | 4.5d | plan-document-reviewer subagent | **P1-7** PublishHistory empty state misses paginated-past-total | Added second empty-state branch with "Back to first page" button. |
| 1 | 4.5a | plan-document-reviewer subagent | **P1-8** listPublishes filename reverse-regex is fragile | Refactored impl to read authoritative `generated_at` from inside each archived JSON; updated test fixtures to include a real `generated_at` field. |
| 1 | 4.5a | plan-document-reviewer subagent | **P1-9** `dataset_empty` matcher was substring-match | Tightened to exact `message: 'dataset_empty'` against the canonical `EMPTY_DATASET_ZOD_MESSAGE` constant in `packages/schema/src/published.ts:15`. |
| 1 | 4.5b | plan-document-reviewer subagent | **P2-1** Toast 5 s default too short for error variant (WCAG 2.2 SC 2.2.1) | Decision C1 amended to per-variant defaults: info/success 5 s, error 8 s. |
| 1 | 4.5b | plan-document-reviewer subagent | **P2-2** Single-Toast replacement risk | Documented in Decision C2 — accepted for Phase 1 (publish flow is user-triggered only). |
| 1 | 4.5d | plan-document-reviewer subagent | **P2-3** PublishHistory row lacked `<time dateTime>`, pluralization, and used a `file_size_bytes` field NOT in `PublishMetadata` schema | Added `dateTime` attribute, pluralized resort count, dropped `file_size_bytes` (not in schema; replaced with `published_by` display). |
| 1 | 4.5c | plan-document-reviewer subagent | **P2-4** PublishDialog tooltip used `role="status"`; Confirm button lacked `aria-describedby` | Tooltip now uses `id="publish-dialog-blocker"`; Confirm button carries `aria-describedby` when a blocker is active. Decision F1 amended. |
| 1 | 4.5b | plan-document-reviewer subagent | **P2-5** Toast pause was mouse-only (WCAG 2.2 SC 2.2.1 keyboard parity) | Added `onFocus`/`onBlur` parity + `tabIndex={0}` + visible "Dismiss" `<Button>` for keyboard users. |
| 2 | 4.5a | Codex round 1 PR #97 | **P1** `composePublishInput` silently skipped corrupt workspace files; contradicted spec §10.3.1 which mandates publish refuses with `500 workspace-corrupt`. Curl could bypass the dialog and drop the staged corrupt slug. | `composePublishInput` now throws `workspace-corrupt` (with the failing slug + Zod issues in `details`) on any JSON-parse or `WorkspaceFile.parse()` failure. Test renamed from "skips corrupt; survivor publishes" → "rejects publish with workspace-corrupt when any workspace file is corrupt". `dispatch.ts` `STATUS_FOR_CODE` adds `workspace-corrupt → 500`. |
| 2 | 4.5a | Codex round 1 PR #97 | **P1** Decision J1 claimed `PublishRequestMeta` schema scaffolding existed; it does not (`grep` returns 0 hits). Following the plan as written would leave Phase 1 publish POSTs without the spec §4.9 `Idempotency-Key` header. | Decision J1 rewritten to build the real client→server header path: `apiClient.publish()` MODIFY to inject `Idempotency-Key: ${crypto.randomUUID()}`; co-located test asserts header + UUID regex + freshness per call. Added apiClient + test to PR 4.5a file list (8/8 budget). New Task 4.5a-6 ships the client-side change before PR creation. |
| 2 | 4.5c | Codex round 1 PR #97 | **P2** PublishDialog failed open while `health.value === null` — fast click could submit before health loaded. | Treat unknown health as disabled (`healthUnknown` short-circuit on top of the blocker chain); added loading affordance (`role="status"` + "Loading pre-publish checks…" / error message); added 2 dialog test cases asserting the disabled-during-loading + disabled-during-error semantics. |
| 3 | 4.5b/4.5c | Codex round 2 PR #97 | **P1** `ToastProvider`'s inline `value={{ show: setCurrent }}` creates a new context object every render; `PublishDialog`'s effect with `toast` in deps would infinite-loop firing Toasts while `publish.status === 'success'` until React's max-update-depth fired. | (a) `ToastProvider` memoizes the context value via `useMemo`. (b) `PublishDialog` calls `publish.reset()` after handling terminal status so subsequent re-renders see `'idle'` and the effect body is a no-op (defense-in-depth). New tests assert context-value stability across re-renders + dialog fires Toast exactly once per terminal status. |
| 3 | 4.5b | Codex round 2 PR #97 | **P2** Replacement Toast inherits prior Toast's `remainingRef.current` because `useRef(dismissAfterMs)` only captures initial-mount value; the same instance stays mounted across replacement. | `ToastProvider` keys `<Toast>` by a per-show counter (`keyRef.current += 1` inside `show`) so React remounts on replacement → fresh refs → correct timing. Added a "replacement remounts with fresh timing" test that first triggers a 100s Toast then replaces with a 1s Toast and asserts the 1s timing is honored. |
| 3 | 4.5c | Codex round 2 PR #97 | **P2** PR 4.5c file count was 8 only by counting `useHealth.ts` + `useHealth.test.ts` as one budget item; AGENTS.md PR-sizing rule counts paths, not concerns — true count was 9 (over the ≤8 ceiling). | **Dropped Decision D3 entirely.** `useHealth.ts` is NOT extended in PR 4.5c. PublishDialog re-fetches health via `useEffect`-on-mount each time the modal opens (existing pattern). Dashboard health-card staleness post-publish is a documented Phase-1 limitation tagged for PR 4.6a Tier 5 polish. Decision D2 amended (no `invalidateHealth()` call). PR 4.5c is now 7 files. |
| 4 | 4.5a | Codex round 3 PR #97 | **P1** `publish.ts` envelope was incomplete: `PublishedDataset` schema (`packages/schema/src/published.ts:12-22`) requires `schema_version`, `published_at`, `resorts`, `live_signals`, `manifest{resort_count,generated_by,validator_version}` — the plan used `generated_at` (wrong field name) and was missing `live_signals` + `manifest`. Every non-empty publish would fail `validatePublishedDataset` before any archive write. | Rewrote `publish.ts` envelope construction to include all required fields. `composePublishInput` now returns `{ resorts, live_signals }` — merging `WorkspaceFile.live_signal` (non-null) ∪ `published.live_signals` keyed on `resort_slug`. Manifest uses `generated_by: 'admin-workspace'` per spec §4.7 + `validator_version: '1'`. |
| 4 | 4.5a | Codex round 3 PR #97 | **P1** `listPublishes.ts` read `body.generated_at`; the archived `PublishedDataset` schema has `published_at` (no `generated_at` field). Real archives would assign `undefined` → `apiClient.listPublishes()` rejects the response → PublishHistory unusable. | `listPublishes.ts` now reads `body.published_at`. Test fixtures updated to use the real schema shape `{schema_version, published_at, resorts, live_signals, manifest}`. Also pulls `published_by` from `body.manifest.generated_by` (falling back to `'admin-workspace'`). |
| 4 | 4.5c | Codex round 3 PR #97 | **P1** `<PublishDialog open={open} onClose={...} />` left the component mounted for the app lifetime; the internal `if (!open) return null` returns null but does NOT unmount → `useHealth`'s once-on-mount effect fires only at app boot → dialog always opens against stale health. Confirm could be enabled after corrupt-workspace state newly appeared. | Removed the `open` prop. Shell mounts the dialog conditionally: `{isPublishOpen && <PublishDialog onClose={...} />}`. Each open is a fresh mount → fresh `useHealth` fetch. Decision G1 amended. |
| 5 | 4.5a | Codex round 4 PR #97 | **P2** `version_id` reconstructed from `deps.now()` mismatches the archive filename. `publishDataset()` internally calls `new Date()` (NOT `deps.now()`) for its filename — slight timestamp drift makes the handler's response version_id different from what `listPublishesHandler` reports for the same archive. Success Toast and PublishHistory row would identify the same archive with different IDs. | Derive `version_id` from `basename(result.archive_path, '.json')` — authoritative source (same path `listPublishesHandler` reads). Added `basename` import from `node:path`. |
| 5 | 4.5a | Codex round 4 PR #97 | **P2** Workflow ordering bug: Task 4.5a-5 ended with `git push`; Task 4.5a-6 (apiClient Idempotency-Key) commits locally but never pushes; Task 4.5a-7 opens the PR with an outdated branch missing the client header change. | Moved the `git push -u origin` from end of Task 4.5a-5 to end of Task 4.5a-6 so the PR branch carries every commit through the final apiClient change. |
| 6 | 4.5a | Codex round 5 PR #97 | **P2** `publish.ts` imported `Resort` + `ResortLiveSignal` from `@snowboard-trip-advisor/schema/api`; the API barrel exports only endpoint schemas (`packages/schema/api/index.ts:1-9` — `ListResortsQuery`, `PublishBody`, `HealthResponse`, etc.). Domain types live at the schema root. Plan would fail typecheck. | Split imports: endpoint shapes from `/api`, domain types (`Resort`, `ResortLiveSignal`) from the schema root. |
| 6 | 4.5a | Codex round 5 PR #97 | **P2** `listPublishes.test.ts` "skips non-matching files" case seeded the matching `1-...json` as `'{}'`. The handler reads `body.published_at` + `body.resorts.length` for every filename matching `VERSION_FILENAME`, so the matching file would crash before the non-matching assertion could fire. | Replaced the matching-file fixture with a valid archive-shape body. Non-matching fixture stays as `'{}'` (irrelevant to the read path). |
| 6 | 4.5b | Codex round 5 PR #97 | **P2** DS `Button` only declared `aria-label` + `aria-pressed` props (`packages/design-system/src/components/Button.tsx:21-34`). PR 4.5c's PublishDialog passes `aria-describedby` (and `aria-disabled`). Plan would fail typecheck. | Added Task 4.5b-3: extend `ButtonProps` with `aria-describedby?: string` (the `aria-disabled` prop dropped from PublishDialog — `disabled` covers the same AT semantic). PR 4.5b file count now 6 (well under ≤8). |
| 7 | 4.5a | Codex round 6 PR #97 | **P2** `composePublishInput` skipped workspace `live_signal: null` entries; the merge then fell back to published live_signal for that slug — silently resurrecting data the analyst explicitly cleared via the upsert handler. | Track `workspaceSlugsWithEntry: Set<string>` separately from the value `Map`. Merge logic: if slug ∈ set → use workspace's value (which may be `null` → omit); else → fall back to published. Added a test case asserting that workspace null + published-non-null yields an empty `live_signals` array in the archived snapshot. |
| 7 | 4.5a | Codex round 6 PR #97 | **P2** Plan called `deps.now()` but `HandlerDeps` (`apps/admin/server/listResorts.ts:16-18`) only contains `workspaceRoot`; `dispatch()` passes only `{ workspaceRoot }`. Existing handlers (`listResorts.ts:57`, `health.ts:63`) use `Date.now()` / `new Date()` directly. Plan as-written would fail typecheck. | Switched to `new Date()` directly inside the handler (matches existing pattern). Tests now use `vi.setSystemTime()` for deterministic clock (Vitest convention) instead of injecting a `now` dep. |
| 8 | 4.5d | Codex round 7 PR #97 | **P2** `publish-flow.test.tsx` integration test imports used `../../../apps/admin/...` (3 segments — resolves to `tests/apps/admin/`, not repo-root `apps/admin/`); existing tests in the same directory (`resort-editor-write.test.tsx:13`, `resort-editor-read.test.tsx:20`, `shell.test.tsx:11`) use **4** segments. Also imported `{ App }` (named) but `apps/admin/src/App.tsx:9` declares `export default function App()`. Plan as-written would fail module resolution. | Corrected to `../../../../apps/admin/...` (4 segments) + `import App from '...'` (default). Comment cites the existing-test reference paths so an executing agent can verify. |
| 9 | 4.5c | Codex round 8 PR #97 | **P2** `usePublish.submit()` only set state before the await — a double-click on Confirm (or any second `submit()` call before React commits the `setStatus('submitting')` render) would launch a second `apiClient.publish()`. Phase 1 does NOT deduplicate Idempotency-Keys server-side (per Decision J1), so two POSTs = two history archives + two `current.v1.json` writes for one user intent. | Added a synchronous in-flight guard via `useRef<boolean>(false)`: `submit()` returns early if the ref is true; sets the ref true before awaiting; clears in `finally`. Added a regression test that fires two concurrent `submit()`s and asserts `apiClient.publish` was called exactly once. |
| 9 | 4.5a | Codex round 8 PR #97 | **P2** `dispatch.test.ts` test for pagination used dotted query keys (`?page.offset=5&page.limit=10`). The existing `apiClient.serializeQuery()` (`apps/admin/src/lib/apiClient.ts:64-73`) JSON-stringifies nested values as a single top-level param, so dotted keys would be silently ignored by `ListPublishesQuery.parse()`, defaulting to the first page. | Updated the test case to use the JSON-encoded format `?page={"offset":5,"limit":10}` (matching the apiClient serializer shape). Comment cites the serializer line numbers. |
| 10 | 4.5c+d | Codex round 9 PR #97 (post-main-merge) | **P1** Decision E1 said `useListPublishes` was Suspense-based "mirroring `useResortList`'s pattern" — but `useResortList.ts:2-16` is actually `useState`+`useEffect`+inFlight Map, NOT Suspense. With my Suspense-based impl, `App.tsx`'s `?route=publishes` branch (`<Shell><PublishHistory /></Shell>`) lacked any `<Suspense>` boundary → first cold load would throw a suspension promise to React root and crash. | Rewrote `useListPublishes` to match the **actual** `useResortList` pattern: `useState` + `useEffect` + module-level `inFlight: Map<string, Promise<...>>` + per-key subscriber set for `invalidateListPublishes()`. Returns `{ value, error }` 3-state union. **No `<Suspense>` boundary needed** — PublishHistory handles loading/error inline (`role="status"` / `role="alert"`). Updated Decision E1, the impl reference block, the test outline, and the PublishHistory consumer accordingly. |
| 10 | 4.5d | Codex round 9 PR #97 (post-main-merge) | **P2** `PublishHistory` returned `<main>...</main>` but `Shell.tsx:42` already wraps children in `<main>{children}</main>` → nested `main` landmarks (invalid HTML + AT navigation confusion). Other views (`Dashboard.tsx`, `ResortsTable.tsx`) use `<section>` instead. | Changed all four PublishHistory branches (loading, error, two empty states, content) to `<section aria-label="Publish history">`. Test outline updated to assert the root element is `<section>` not `<main>`. |
| 11 | 4.5c | Codex round 10 PR #97 | **P2** `useListPublishes` round-9 rewrite lacked the stale-request identity guard. After `invalidateListPublishes()` clears the inFlight Map and a fresh fetch starts, the older promise's `.then` could still resolve and overwrite component state with stale data — the `useResortDetail.ts:94` `cachedPromises.get(slug) === next` guard the previous Suspense-based impl had. | Captured `currentP = p` reference; gated all `.then` writes on `inFlight.get(key) === currentP` (and same for `p2` in `onInvalidate`). Also identity-guarded the `inFlight.delete()` in `.finally` so a stale settle doesn't evict a fresh promise. Added a test case asserting that after invalidating mid-flight, the stale response cannot overwrite the fresh response in component state. |
| 11 | 4.5d | Codex round 10 PR #97 | **P2** `Shell.tsx`'s SIDEBAR_ITEMS Publishes link still pointed at the pathname `/publishes`, but urlState is query-string-driven (`?route=publishes`). Clicking the sidebar Publishes link would navigate to `/publishes` with no `route` query → `parseURL` falls back to dashboard → PublishHistory never mounts via sidebar nav. | Added `apps/admin/src/views/Shell.tsx` MODIFY to PR 4.5d's file list (now 7/8 budget). Change is one line: `href: '/publishes'` → `href: '/?route=publishes'` for the Publishes item only. Other sidebar items keep their pathname-form hrefs — fixing the full Sidebar pathname-vs-query mismatch stays **Tier 5 polish per the post-Tier-2 handoff** as previously documented (out of scope here). publish-flow.test.tsx gains a sidebar-click assertion that the Publishes link routes correctly. |
| 12 | 4.5c | Codex round 11 PR #97 | **P2** `useListPublishes` did not reset to loading on query-key change — user would see the prior page's rows + stale pagination state during the new-page fetch window. `useResortList` resets to loading at the start of its effect for this exact case. | Added `setValue(null); setError(null)` at the top of the `useEffect` body (before in-flight lookup). Added a test case asserting that rerendering with a new query key shows `{ value: null, error: null }` during the fetch window. |
| 12 | 4.5c | Codex round 11 PR #97 | **P2** PublishDialog test instruction still asserted `aria-disabled="true"` on the Confirm button, but the round-5 fold dropped `aria-disabled` from PublishDialog in favor of the native `disabled` attribute (Button only forwards native disabled + the aria-describedby prop added in Task 4.5b-3). Following the test instruction literally would fail despite the impl being correct. | Updated the test instruction to assert via native `disabled` (`screen.getByRole('button', { name: /Confirm/ }).toBeDisabled()`); comment explains the prop history. |
| 13 | 4.5c | Codex round 12 PR #97 | **P1** Round-10 stale-request identity-guard (`inFlight.get(key) === currentP`) had a fatal flaw: the `.finally` removes the inFlight entry BEFORE the `.then` runs in the happy path → state never sets → view stuck in loading forever. | Replaced inFlight-identity guard with a per-key **generation counter**. `invalidateListPublishes()` bumps the generation for every known key; useEffect captures the active generation at fetch start; `.then` writes state only if `currentGeneration(key) === myGen`. Cache cleanup (inFlight delete in `.finally`) is now independent of state-write guards — fixes the happy-path bug while preserving the stale-request guarantee. Test outline updated to match the new contract. |
| 13 | 4.5a | Codex round 12 PR #97 | **P2** Task 4.5a-6's impl snippet referenced `postJson` — no such helper exists in `apps/admin/src/lib/apiClient.ts`. The actual helper is `request<T>(method, path, body, parser)` at line 27. | Rewrote the snippet to extend `request()` signature with an optional `extraHeaders?: Record<string, string>` 5th argument and pass `{ 'Idempotency-Key': crypto.randomUUID() }` through that. `apiClient.publish()` continues to use `request` (matching the rest of the apiClient's call style). |

---

## Sub-skill handoffs

- **Execution skill:** [`superpowers:subagent-driven-development`](../../../.claude/plugins/cache/claude-plugins-official/superpowers/5.0.5/skills/subagent-driven-development/) — one PR at a time, fresh subagent per task.
- **Plan-review skill:** [`superpowers:writing-plans`](../../../.claude/plugins/cache/claude-plugins-official/superpowers/5.0.5/skills/writing-plans/) — re-invoke if a new decision adds significant scope.
- **Worktree skill:** [`superpowers:using-git-worktrees`](../../../.claude/plugins/cache/claude-plugins-official/superpowers/5.0.5/skills/using-git-worktrees/) — fresh worktree per PR.
