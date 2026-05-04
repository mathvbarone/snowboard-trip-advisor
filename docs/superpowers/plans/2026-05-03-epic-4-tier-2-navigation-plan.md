# Epic 4 — Tier 2 (Navigation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal.** Wire the Dashboard view + Resorts table to real `/api/health` and `/api/resorts` handlers, with URL-state routing and the §10.9 cold-start empty states.

**Spec.** [Epic 4 — Admin App Design](../specs/2026-05-01-epic-4-admin-app-design.md) §7.8 + §7.9 (Tier 2 PR deliverables); §7.4 (tier-and-gate workflow); §6.1 (state hooks); §10.9 (cold-start, missing files, resort creation in Phase 1); §4.1 + §4.8 (endpoint contracts for `/api/resorts` + `/api/health`).

**Depends on.** [Tier 1 plan](2026-05-02-epic-4-tier-1-foundation-plan.md) merged. Specifically:
- PR 4.0 (plumbing — workspace deps, schema/api subpath, `metricFields` literal-tuple).
- PR 4.1a (schema/api Zod contract + `apiClient` + `FieldStateFor<T>` projection helper + ESLint admin import restriction).
- PR 4.1b (Vite middleware skeleton + `Shell` + tiered MSW: `mocks/server.ts` canned + `mocks/realHandlers.ts` bridge + 7 stub handlers + `ensureWorkspaceDir`).
- PR 4.1c (DS additions: `Sidebar`, `StatusPill`, `Tabs`, `Popover`, `DropdownMenu` + Shell rewire).

**Tier 1 → Tier 2 gate (spec §7.4) verified before opening PR 4.2** — the implementer MUST confirm the gate passes before branching:
- `npm run dev:admin` boots on `127.0.0.1:5174` `strictPort:true`.
- `fetch('/api/...')` returns `501` with the standard error envelope for all 6 endpoints.
- Shell renders the real Sidebar + DropdownMenu (not placeholders).
- Contract snapshot pinned at `packages/schema/api/__snapshots__/contract.test.ts.snap`; every export from `packages/schema/api/index.ts` represented.
- `WorkspaceFile.parse()` enforces the `editor_modes` cross-key invariant (per spec §10.2 / P0-2 fold).
- Tiered MSW harness present: `apps/admin/src/mocks/server.ts` (canned) + `apps/admin/src/mocks/realHandlers.ts` (bridge) both exist and have unit tests.

**Architecture.** Two sequential atomic PRs, each with a single concern. PR 4.2 ships the Dashboard view + the real `GET /api/health` handler + the URL-state foundation (`apps/admin/src/lib/urlState.ts` initial route schema). PR 4.3 ships the Resorts table + the real `GET /api/resorts` handler + extends `urlState.ts` with the resorts-route filter params. The Tier 2 → Tier 3 gate (spec §7.4) is the boundary at which navigation is verified before editor work begins.

**Tech stack.** TypeScript (strict, explicit return types repo-wide per `eslint.config.js:69`), React 19 (`use()` for Suspense in `useResortDetail` only — not useHealth / useResortList; see §0.5), Vitest + jest-axe (component a11y), MSW (canned + bridge tiers per spec §6.3), Zod v4 (request/response validation), workspace-relative file IO via Node `fs/promises`.

---

## 0. Pre-flight (read once before opening any PR)

### 0.1 Worktree + branch conventions

Per AGENTS.md "Worktree discipline" and project memory: each PR gets its own worktree under `.worktrees/<short-name>/`, branched from `origin/main` at the time of the PR's start. Stacked-PR phantom-merge avoidance (AGENTS.md "PR Sizing Discipline") — **rebase onto `main` after each predecessor merges**, do not stack branches.

Branch names per spec §7.8 / §7.9: `epic-4/pr-4.2-dashboard`, `epic-4/pr-4.3-resorts-table`. Worktrees: `.worktrees/epic-4-pr-4.2/`, `.worktrees/epic-4-pr-4.3/`.

**Edit-tool path discipline (project memory).** When working in a worktree, prefix `Edit` paths with the worktree directory or you'll silently edit the main checkout. Verify with `git status` *inside the worktree*, not `Read` against the main checkout.

### 0.2 Per-task discipline (every task)

- **TDD.** Test file edits land in the same commit as their implementation. The test must fail with a meaningful message before the impl exists. Step ordering in every task: write failing test → run-fail → write minimal impl → run-pass → commit.
- **DCO.** Every commit carries `Signed-off-by:` (`git commit -s` or the `prepare-commit-msg` hook auto-appends it; do not pass `--no-verify`).
- **Pre-commit `npm run qa`** runs automatically. Hook failures are **fixed**, never bypassed.
- **One commit per task** unless a task spans test + impl + commit naturally — then one commit per task is still the rule. If you discover a refactor mid-task, finish the task as planned and open a separate cleanup commit (or PR) for the refactor.
- **Code snippets are illustrative.** Every code block in this plan is **a sketch**, not copy-paste-ready. The implementer is responsible for adding (a) explicit return-type annotations on every function (`@typescript-eslint/explicit-function-return-type` is `'error'` repo-wide — verified at `eslint.config.js:69`); (b) explicit `void` / `Promise<void>` returns on test bodies; (c) `?? defaultValue` instead of non-null assertions (`@typescript-eslint/no-non-null-assertion` is `'error'` per `eslint.config.js:75`); (d) consuming the existing design-system primitives (`<Button>`, `<Input>`, `<Sidebar>`, `<Table>`, etc.) instead of raw HTML elements in any `apps/**` file (`eslint.config.js:236-262` bans raw `<button>`, `<input>`, `<a>`, `<dialog>`, `<select>`, `<textarea>` in `apps/**`). Snippets that show raw `<button>` are illustrating SHAPE; the actual code consumes `<Button>` from `@snowboard-trip-advisor/design-system`.

### 0.3 Per-PR discipline (after the last task lands)

1. Push the branch; open the PR via `gh pr create`.
2. Post `@codex review` as a PR comment (per project memory: `feedback_codex_review_per_pr.md`).
3. Wait ~5 minutes; fold every Codex finding on the same branch; reply to each thread with the fix-commit SHA.
4. Run a tailored local-acceptance test plan (qa, build smoke, dev probes; for Tier 2 specifically, `curl` probes against the new real handlers + browser smoke of the Dashboard / Resorts table). Per project memory: execute the steps yourself, do not just describe them.
5. **Per-PR Subagent Review Discipline:** spec §7.8 + §7.9 narratively suggest "NO subagent review" for either Tier 2 PR's *handler / view code*, but **PR 4.2 IS triggered** because the §0.6 doc-drift fold edits `docs/superpowers/specs/2026-05-01-epic-4-admin-app-design.md` — a `docs/superpowers/specs/**` path that AGENTS.md L57 lists as a Subagent Review Discipline trigger. The implementer MUST dispatch the §1.99 reviewer brief on PR 4.2 before requesting maintainer review. PR 4.3 has no triggered paths (no spec / schema / eslint / hooks / workflow edits). If the implementer touches a triggered path mid-PR (e.g., needing to amend a `packages/schema/api/*.ts` schema), the additional trigger fires and the implementer dispatches the subagent review per the Tier 1 plan §1.99 / §2.99 / §3.99 reviewer-brief pattern. Document the trigger-touch in the PR description either way.
6. Surface to maintainer for merge.

### 0.4 Subagent-review trigger matrix (Tier 2)

| PR | Triggered paths (per AGENTS.md L53-73 + spec §7.8 / §7.9) | Reviewer brief in this plan |
|---|---|---|
| 4.2 | `docs/superpowers/specs/**` (the §0.6 doc-drift fold edits the Epic 4 spec) | §1.99 |
| 4.3 | NONE | N/A — see §0.3 step 5 |

**Codex pass-1 fold:** the prior version of this matrix listed PR 4.2 as "NONE", but §0.6 explicitly adds a 1-line edit to `docs/superpowers/specs/2026-05-01-epic-4-admin-app-design.md`, which is a `docs/superpowers/specs/**` trigger per AGENTS.md L57. The implementer MUST dispatch the §1.99 reviewer brief before requesting maintainer review on PR 4.2.

If the implementer's diff incidentally touches `packages/schema/**`, `packages/schema/api/**`, `eslint.config.js`, or any `.github/` / `scripts/hooks/` / agent-discipline path beyond what §0.4 already lists, the additional trigger fires for that PR and the implementer writes a subagent reviewer brief inline before requesting maintainer review.

### 0.5 Hook-shape decision: `T | null + error` over Suspense-`use()` for useHealth + useResortList

Spec §6.1 only mandates Suspense + React-19 `use()` for `useResortDetail` (Tier 3 PR 4.4a) — the line is *"useResortDetail(slug) — wraps apiClient.getResort(slug). Suspense-friendly via React 19 use() (same pattern as Epic 3's useDataset; same rejected-promise pinning per ADR-0010)."* The lines for `useHealth()` and `useResortList()` say only "wraps apiClient.X(...)", with no Suspense mandate.

**Tier 2 picks `T | null + error` for both Tier-2 hooks.** Rationale, per `ai-clean-code-adherence` §4 + the rubric's *"Three-state union → T | null"* row:

- `useResortList` is URL-query-parameterized (filter / page change refetches). A module-level cached-promise pattern keyed by query-string adds invalidation complexity that the simpler `useState + useEffect` pattern avoids. Epic 3's `useDataset` is single-key (the dataset URL); admin's resort list is multi-key.
- `useHealth` is read by Dashboard once per page-load + `<PublishDialog>` (Tier 4 PR 4.5b). Two consumers; refetch is a user action (page reload). The Suspense boundary doesn't pull weight here.
- Both hooks export a `__resetForTests` per spec §6.1 ("`__resetForTests` exports for isolation") regardless of the inner shape — the export contract matches Epic 3 pattern.

**Concrete shape** (illustrative):

```ts
// apps/admin/src/state/useHealth.ts
export type UseHealthResult =
  | { value: HealthResponse; error: null }
  | { value: null; error: Error }
  | { value: null; error: null }   // initial / loading

export function useHealth(): UseHealthResult { /* useState + useEffect */ }
export function __resetForTests(): void { /* clear module-level fetch promise if any */ }
```

The `T | null + error` shape collapses three states into two nullable fields. Consumers branch with two `if` checks (`error !== null` → error UI; `value === null` → loading UI; `value !== null` → render) — no discriminated-union ceremony.

**`useResortDetail` in Tier 3 PR 4.4a will use Suspense + use()` per spec.** That's a different decision. Tier 2 does not pre-skeleton it.

### 0.6 Documentation drift fold (PR 4.2 §1.5 / final commit)

Per the user-facing brainstorm decision: PR 4.2's final commit (the combined useURLState + App.tsx + doc-drift commit per §1 commit budget) folds these 4 documentation drift fixes that surfaced during the Tier 1 → Tier 2 gate verification. PR 4.2 is the right home because it's the first Tier 2 PR and three of the four affected files live in scope (`apps/admin/server/*.ts` stubs).

| File | Line(s) | Drift | Fix |
|---|---|---|---|
| `docs/superpowers/specs/2026-05-01-epic-4-admin-app-design.md` | 6 | "**ADRs in flight:**" header — both ADR-0011 and ADR-0012 merged before Tier 1 began | Rename to "**Related ADRs (merged):**" |
| `apps/admin/server/resortDetail.ts` | 13, 18 | "lands in PR 4.2" — actually lands in PR 4.4a (spec §7.10) | Replace `4.2` → `4.4a` (both occurrences) |
| `apps/admin/server/listPublishes.ts` | 13, 18 | "lands in PR 4.6a" — actually lands in PR 4.5a (spec §7.14) | Replace `4.6a` → `4.5a` (both occurrences) |
| (`apps/admin/server/health.ts`) | (deleted in §1.2) | The 501 stub itself disappears in PR 4.2; no separate fix needed | — (replacement is the fix) |

These 4 lines (3 file edits + 1 spec edit) ride PR 4.2's polish commit (§1.6) — they're scope-adjacent (all reference the Tier 1 → Tier 2 boundary) and small enough not to bloat the PR.

---

## 1. PR 4.2 — Dashboard view + GET /api/health endpoint

**Branch.** `epic-4/pr-4.2-dashboard`. **Worktree.** `.worktrees/epic-4-pr-4.2/`. **Depends on.** PR 4.1c (= last Tier 1 PR) merged on `origin/main`. Without it: `apps/admin/src/views/Shell.tsx` doesn't render the real Sidebar + DropdownMenu, the design-system additions aren't published, and the URL-state composition the Dashboard view depends on doesn't have a host to mount in.

**Goal.** Replace `apps/admin/server/health.ts`'s 501 stub with the real implementation; ship `apps/admin/src/views/Dashboard.tsx` rendering the 8-field `HealthResponse` (per `packages/schema/api/health.ts`) including the cold-start empty state per spec §10.9; introduce `apps/admin/src/lib/urlState.ts` as a pure helper (not a hook — per spec §6.1's F3 P1 fold) that PR 4.3 will extend.

**README.** Skip (admin internal).

**Commit budget** (per `feedback_atomic_prs.md` ≤5 commits / PR). Per-task `git commit` blocks below are *teaching steps* — the implementer commits at task granularity for incremental TDD evidence, then **before push** consolidates to ≤5 logical units via `git reset --soft <root-sha> && git commit -s` chains. Suggested final commit map:

```bash
git commit -s -m "feat(admin): add urlState parser + serializer (PR 4.2)"
git commit -s -m "feat(admin): replace 501 stub for GET /api/health with real handler (PR 4.2)"
git commit -s -m "feat(admin): add useHealth state hook (PR 4.2)"
git commit -s -m "feat(admin): add Dashboard view + cold-start empty state (PR 4.2)"
git commit -s -m "feat(admin): add useURLState hook + URL-state routing in App + Tier 1→2 doc drift (PR 4.2)"
```

### 1.0 File inventory + per-file dependency declaration

Per `ai-clean-code-adherence` §5: every file declares its dependencies at the top of this plan, so the implementer doesn't have to re-derive them.

**Implementation files (5):**

| File | New / Modify | Imports (codebase) | Imports (external) | Public surface | Internal state |
|---|---|---|---|---|---|
| `apps/admin/src/lib/urlState.ts` | **New** | — (Phase 1: only the route literal union from this same file) | `zod` | `parseURL(search: string): RouteState`, `serializeURL(state: RouteState): string`, `RouteState` type, `Route` discriminated union | None (pure helpers per spec §6.1's F3 fold) |
| `apps/admin/server/health.ts` | **Modify (replace stub)** | `HealthResponse`, `HealthQuery` from `@snowboard-trip-advisor/schema/api`; `WorkspaceFile`, `METRIC_FIELDS`, `PublishedDataset` from `@snowboard-trip-advisor/schema`; `HandlerDeps` from `./listResorts` | `node:fs/promises` (`readFile`, `readdir`, `stat`), `node:path` (`join`) | `healthHandler(input, deps): Promise<HealthResponse>`, `HealthInput` type | None (per-call, no module-level cache; `mkdir` runs in `ensureWorkspaceDir` from PR 4.1b at dispatch boundary) |
| `apps/admin/src/state/useHealth.ts` | **New** | `apiClient` (from `apps/admin/src/lib/apiClient.ts`); `HealthResponse` from `@snowboard-trip-advisor/schema/api` | `react` (`useEffect`, `useState`) | `useHealth(): UseHealthResult`, `__resetForTests(): void`, `UseHealthResult` type | Module-level `Map<string, Promise<HealthResponse>>` keyed by `'singleton'` (per React-state plan-review fold — `Map` shape is race-free under interleaved mounts; cleared on settle so refetch works on remount). |
| `apps/admin/src/views/Dashboard.tsx` | **New** | `useHealth` (`./state/useHealth`); `Card` / `StatusPill` from `@snowboard-trip-advisor/design-system`; `setRoute` (`./state/useURLState`) | `react` | `Dashboard()` default-export React FC | None (component-local UI state via `useState`) |
| `apps/admin/src/state/useURLState.ts` | **New (added in plan-review fold)** | `parseURL`, `serializeURL`, `RouteState` (from `./lib/urlState`) | `react` (`useSyncExternalStore`) | `useURLState(): RouteState`, `setRoute(state): void`, `__resetForTests(): void` | Module-level `subscribers: Set<() => void>` (broadcast channel for `setRoute` programmatic-navigation re-renders, since browsers don't fire `popstate` for `pushState`) + `cachedSearch / cachedSnapshot` for `getSnapshot` referential stability (Epic 3 pattern at `apps/public/src/state/useURLState.ts:71-80`). |
| `apps/admin/src/App.tsx` | **Modify (route by URL state)** | `useURLState` (`./state/useURLState`); `Dashboard` (`./views/Dashboard`); existing `Shell` import | `react` | `App()` default-export React FC | Component-local route state via `useURLState` |

**Test files (5):**

| File | New / Modify | Imports | Notes |
|---|---|---|---|
| `apps/admin/src/lib/urlState.test.ts` | **New** | `vitest`, `./urlState` | Round-trip tests + invalid-input drop tests (Epic 3 pattern from `apps/public/src/lib/urlState.test.ts`) |
| `apps/admin/server/__tests__/health.test.ts` | **New** | `vitest`, `node:fs/promises`, `node:os`, `node:path`, `../health`, fixture builders inline | 5 cases per spec §7.8 (happy / missing-provenance / corrupt-workspace / missing-published / cold-start) |
| `apps/admin/src/state/useHealth.test.ts` | **New** | `vitest`, `@testing-library/react`, MSW canned harness from `../mocks/server`, `./useHealth` | Loading → resolved → error transitions; `__resetForTests` isolation |
| `apps/admin/src/views/Dashboard.test.tsx` | **New** | `vitest`, `@testing-library/react`, `jest-axe`, MSW canned harness, `./Dashboard` | Renders 8 metrics; cold-start empty-state card; click-through URL state update |
| `apps/admin/src/state/useURLState.test.ts` | **New (added in plan-review fold)** | `vitest`, `@testing-library/react`, `./useURLState` | popstate re-render; programmatic setRoute re-render (no popstate); two-consumer subscriber broadcast; getSnapshot stable reference; `__resetForTests` clears subscribers |
| `apps/admin/src/App.test.tsx` | **Modify** | (existing) | Add: `useURLState` returns Route correctly; renders Dashboard for `?route=dashboard` |

**Total files touched in PR 4.2: 12** (6 implementation + 6 test). Slightly over the AGENTS.md atomic-PR ≤8-files default after counting implementation/test pairs as one logical unit (6 pairs); within Epic 3 PR 3.2 / Tier 1 PR 4.1c precedent for tightly-coupled foundation work. PR-sizing acknowledgment to land in PR body.

**Module-level state declared explicitly (per ai-clean-code §5):**
- `apps/admin/src/state/useHealth.ts`: one module-level `Map<string, Promise<HealthResponse>>` keyed by `'singleton'` (per React-state plan-review fold). Race-free under interleaved mounts (different consumers see the same in-flight Promise via `Map.get`). NOT a result cache — entries are deleted on settle so the next mount fetches fresh. `__resetForTests` calls `inFlight.clear()`.
- `apps/admin/src/state/useURLState.ts`: module-level `subscribers: Set<() => void>` (broadcast channel for setRoute) + `cachedSearch: string | null` + `cachedSnapshot: RouteState | null` (getSnapshot referential stability per Epic 3 pattern). All three cleared by `__resetForTests`.
- No other module-level mutable state in PR 4.2.

### 1.1 Task: `apps/admin/src/lib/urlState.ts` — pure parse/serialize helper

**Why first.** Both PR 4.2's Dashboard route + PR 4.3's Resorts route (with filter params) consume `urlState.ts`. Landing it in PR 4.2 with a deliberately-narrow Phase 1 surface (single `dashboard` route literal) avoids retro-fitting in PR 4.3 — PR 4.3 just extends the discriminated union with `{ route: 'resorts'; filter?: ... }`.

**Files:**
- Create: `apps/admin/src/lib/urlState.ts`
- Create: `apps/admin/src/lib/urlState.test.ts`

- [ ] **Step 1: Write failing tests.** Tests cover (a) round-trip — every `parseURL(serializeURL(state))` returns the same `state`; (b) defaults — empty search returns `{ route: 'dashboard' }`; (c) drop-invalid — `?route=unknown` parses as `{ route: 'dashboard' }` (default); (d) extra-keys are silently dropped (Epic 3 pattern).

```ts
// apps/admin/src/lib/urlState.test.ts (sketch — implementer adds explicit return types per AGENTS.md)
import { describe, expect, it } from 'vitest'
import { parseURL, serializeURL } from './urlState'

describe('parseURL (PR 4.2 — Dashboard route only)', () => {
  it('returns dashboard route for empty search', () => {
    expect(parseURL('')).toEqual({ route: 'dashboard' })
  })
  it('returns dashboard route for ?route=dashboard', () => {
    expect(parseURL('?route=dashboard')).toEqual({ route: 'dashboard' })
  })
  it('drops unknown route value (defaults to dashboard)', () => {
    expect(parseURL('?route=bogus')).toEqual({ route: 'dashboard' })
  })
  it('drops extra unknown keys silently', () => {
    expect(parseURL('?route=dashboard&foo=bar')).toEqual({ route: 'dashboard' })
  })
})

describe('serializeURL (PR 4.2)', () => {
  it('serializes dashboard route as empty (default omitted)', () => {
    expect(serializeURL({ route: 'dashboard' })).toBe('')
  })
})

describe('round-trip', () => {
  it('parseURL(serializeURL({route: dashboard})) === input', () => {
    const input = { route: 'dashboard' as const }
    expect(parseURL(serializeURL(input))).toEqual(input)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail.** `npm test --workspace=@snowboard-trip-advisor/admin-app -- --run urlState.test` → expect FAIL with "Cannot find module './urlState'".

- [ ] **Step 3: Write minimal implementation.**

```ts
// apps/admin/src/lib/urlState.ts (sketch)
import { z } from 'zod'

// Phase 1 route surface — PR 4.3 extends with 'resorts' (+ filter params).
// Tier 3 (PR 4.4b) extends with 'editor' (+ slug). Tier 4 (PR 4.5b)
// extends with 'publishes'.
const ROUTE_VALUES = ['dashboard'] as const
const RouteValue = z.enum(ROUTE_VALUES)
type RouteValue = z.infer<typeof RouteValue>

export type Route = { route: RouteValue }
export type RouteState = Route

export function parseURL(search: string): RouteState {
  const params = new URLSearchParams(search)
  const raw = params.get('route') ?? 'dashboard'
  const parsed = RouteValue.safeParse(raw)
  return { route: parsed.success ? parsed.data : 'dashboard' }
}

export function serializeURL(state: RouteState): string {
  // Default ('dashboard') omitted to keep URLs clean (Epic 3 pattern).
  if (state.route === 'dashboard') return ''
  return `?route=${state.route}`
}
```

- [ ] **Step 4: Run tests to verify they pass.** `npm test --workspace=@snowboard-trip-advisor/admin-app -- --run urlState.test` → expect PASS.

- [ ] **Step 5: Run `npm run qa`.** Expect green (lint / typecheck / coverage / tokens / hooks / integration).

- [ ] **Step 6: Commit.**

```bash
git add apps/admin/src/lib/urlState.ts apps/admin/src/lib/urlState.test.ts
git commit -s -m "feat(admin): add urlState parser + serializer (PR 4.2)"
```

### 1.2 Task: Replace `apps/admin/server/health.ts` 501 stub with real handler

**Why next.** The handler is the closer of two halves of "Dashboard renders real health data" — the test fixture surface (5 cases per spec §7.8) drives the handler logic. Landing the handler before the hook means the hook's MSW canned response can be the actual handler's output shape (caught at test-time if it drifts).

**Files:**
- Modify: `apps/admin/server/health.ts` (replace entire file body — 22-line stub becomes ~80-line real impl)
- Create: `apps/admin/server/__tests__/health.test.ts`

- [ ] **Step 1: Write failing tests** covering the 5 cases from spec §7.8 (happy with provenance / missing-provenance / corrupt-workspace / missing-published / cold-start). Use a per-test tmpdir via `node:os` `tmpdir()` + `node:fs/promises` `mkdtemp` to materialize fixture workspace + published files. Inline `Resort.parse({...})` literals — PR 4.0 deferred the `./fixtures` subpath export.

```ts
// apps/admin/server/__tests__/health.test.ts (sketch)
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Resort } from '@snowboard-trip-advisor/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { healthHandler } from '../health'

let workspaceRoot: string

beforeEach(async () => {
  workspaceRoot = await mkdtemp(join(tmpdir(), 'admin-health-test-'))
})

// Workspace-IO plan-review fold (P1): real cleanup, not just a comment. Per
// test mkdtemp creates a unique dir under /var/folders/... on macOS; without
// rm cleanup, repeated test runs leak directories.
afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true })
})

describe('healthHandler (PR 4.2)', () => {
  it('happy path: workspace with intact field_sources → resorts_with_missing_provenance === 0', async () => {
    // Author one workspace file with field_sources covering all METRIC_FIELDS.
    await mkdir(join(workspaceRoot, 'data', 'admin-workspace'), { recursive: true })
    const fixture = /* WorkspaceFile literal — slug + Resort + null live_signal + modified_at */
    await writeFile(join(workspaceRoot, 'data', 'admin-workspace', 'kotelnica.json'), JSON.stringify(fixture))
    // No published doc yet — see "missing-published" case for that branch.

    const result = await healthHandler({ query: {} }, { workspaceRoot })

    expect(result.resorts_with_missing_provenance).toBe(0)
    expect(result.resorts_with_corrupt_workspace).toBe(0)
    expect(result.resorts_total).toBe(1)
    expect(result.last_published_at).toBeNull()  // missing-published branch
  })

  it('missing-provenance: workspace file lacks field_sources entry → resorts_with_missing_provenance === 1', async () => {
    // Author Resort with field_sources missing one METRIC_FIELDS path.
    // Expect resorts_with_missing_provenance === 1.
  })

  it('corrupt-workspace (P0-4): truncated/invalid JSON file → resorts_with_corrupt_workspace === 1, healthy slugs still aggregate', async () => {
    // Author one valid workspace file + one truncated `bad.json` ("{not_json").
    // Expect resorts_with_corrupt_workspace === 1, valid slug counted in resorts_total,
    // bad.json NOT counted in failed/stale aggregates.
  })

  it('missing-published (§10.9): no data/published/current.v1.json → last_published_at: null, archive_size_bytes: 0', async () => {
    // Workspace has 1 valid file; no published doc on disk.
    // Expect last_published_at === null, archive_size_bytes === 0,
    //        resorts_total === 1 (workspace-only count).
  })

  it('cold-start (§10.9): no workspace files AND no published doc → all aggregates 0', async () => {
    // Empty workspace dir (or non-existent), no published doc.
    // Expect resorts_total === 0, every aggregate field === 0,
    //        last_published_at === null.
  })
})
```

- [ ] **Step 2: Run tests to verify they fail.** `npm test --workspace=@snowboard-trip-advisor/admin-app -- --run health.test` → expect FAIL with "health handler not implemented (lands in PR 4.4a)" thrown by the stub.

- [ ] **Step 3: Write the real handler.** Replace the entire body of `apps/admin/server/health.ts`. Sketch:

```ts
// apps/admin/server/health.ts (sketch — replaces 22-line stub)
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

import {
  METRIC_FIELDS,
  PublishedDataset,
  WorkspaceFile,
} from '@snowboard-trip-advisor/schema'
import type { HealthQuery, HealthResponse } from '@snowboard-trip-advisor/schema/api'

import type { HandlerDeps } from './listResorts'

export interface HealthInput {
  readonly query: HealthQuery
}

export async function healthHandler(
  input: HealthInput,
  deps: HandlerDeps,
): Promise<HealthResponse> {
  void input  // No query params on /api/health (per packages/schema/api/health.ts).
  const workspaceDir = join(deps.workspaceRoot, 'data', 'admin-workspace')
  const publishedPath = join(deps.workspaceRoot, 'data', 'published', 'current.v1.json')

  const workspaceFiles = await readWorkspaceFilesOrEmpty(workspaceDir)
  const publishedDoc = await readPublishedDocOrNull(publishedPath)

  // Aggregate per spec §4.8.
  let corruptCount = 0
  let staleCount = 0
  let failedCount = 0
  let missingProvenanceCount = 0
  const workspaceSlugs = new Set<string>()

  for (const { name, raw } of workspaceFiles) {
    const parseResult = WorkspaceFile.safeParse(raw)
    if (!parseResult.success) {
      corruptCount++
      // Stderr log per spec §4.8 + §10.3.1: "logs the failing slug + Zod
      // issues to stderr". Workspace-IO plan-review fold: `no-console` is
      // 'error' repo-wide (`eslint.config.js:90`); only `scripts/**/*.ts` is
      // exempt (`eslint.config.js:659-661`) — there is NO `apps/admin/server/**`
      // carve-out today. Inline-disable per occurrence with a spec citation:
      // eslint-disable-next-line no-console -- spec §10.3.1: stderr corrupt-file logging
      console.error(
        `[admin/health] corrupt workspace file ${name}: ${parseResult.error.issues.map((i) => i.message).join('; ')}`,
      )
      continue
    }
    const wf = parseResult.data
    workspaceSlugs.add(wf.slug)

    // missing-provenance: count if any METRIC_FIELDS entry has no field_sources entry.
    const missing = METRIC_FIELDS.filter((p) => !(p in wf.resort.field_sources))
    if (missing.length > 0) missingProvenanceCount++

    // Schema-API plan-review fold: aggregate stale per the post-fold note below.
    // - stale: count if any METRIC_FIELDS path has field_sources[path].observed_at
    //          older than FRESHNESS_TTL_DAYS.default (canonical computation at
    //          packages/schema/src/loadResortDatasetFromObject.ts:113-118).
    // - failed: ALWAYS 0 in Phase 1 (no upstream adapters per spec §10.5).
    //          Hardcode `failedCount = 0` and document the Epic 5 follow-up.
    // (Implementer inlines the staleness loop here; the projection function
    // FieldStateFor<T> is NOT in the schema package today and is NOT needed
    // for Tier 2 — Tier 3 PR 4.4a's resortDetail extracts it.)
  }

  // Union: workspace ∪ published. workspace takes precedence; published-only resorts add to total.
  const publishedOnlyCount = publishedDoc
    ? publishedDoc.resorts.filter((r) => !workspaceSlugs.has(r.slug)).length
    : 0
  const total = workspaceSlugs.size + publishedOnlyCount

  // last_published_at + archive_size_bytes: from published doc + file stat, or nulls.
  // Schema-API plan-review fold (P1): if the file was deleted between
  // readPublishedDocOrNull (above) and stat (here), stat throws ENOENT and the
  // handler crashes. Either wrap stat in try/catch returning 0, OR (cheaper)
  // compute the size from the text we already read inside readPublishedDocOrNull
  // and return both — cuts a syscall AND closes the TOCTOU race. Implementer
  // can pick either; the inline-stat sketch below is the minimum-viable.
  const lastPublishedAt = publishedDoc?.published_at ?? null
  const archiveSizeBytes = publishedDoc
    ? await stat(publishedPath).then((s): number => s.size).catch((): number => 0)
    : 0

  return {
    resorts_total: total,
    resorts_with_stale_fields: staleCount,
    resorts_with_failed_fields: failedCount,
    resorts_with_missing_provenance: missingProvenanceCount,
    resorts_with_corrupt_workspace: corruptCount,
    pending_integration_errors: 0,  // Phase 1: no integrations yet.
    last_published_at: lastPublishedAt,
    archive_size_bytes: archiveSizeBytes,
  }
}

async function readWorkspaceFilesOrEmpty(
  dir: string,
): Promise<ReadonlyArray<{ name: string; raw: unknown }>> {
  try {
    const entries = await readdir(dir)
    const jsonFiles = entries.filter((e) => e.endsWith('.json'))
    const out: Array<{ name: string; raw: unknown }> = []
    for (const name of jsonFiles) {
      try {
        const text = await readFile(join(dir, name), 'utf-8')
        out.push({ name, raw: JSON.parse(text) })
      } catch (err) {
        // Workspace-IO plan-review fold: distinguish transient ENOENT (file
        // disappeared between readdir and readFile, e.g. external `rm`) from
        // genuine corruption (truncated file, bad JSON). Only the latter
        // surfaces as `resorts_with_corrupt_workspace`. Conflating the two
        // would over-count corrupt files and erroneously block <PublishDialog>.
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue
        out.push({ name, raw: undefined })  // pushed → fails WorkspaceFile.safeParse → corrupt count
      }
    }
    return out
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
}

async function readPublishedDocOrNull(path: string): Promise<PublishedDataset | null> {
  try {
    const text = await readFile(path, 'utf-8')
    const parsed = PublishedDataset.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data : null
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}
```

**Note on per-field state aggregation (correction folded from Schema-API plan review):** the prior version of this note told the implementer to walk `wf.resort.<metric>` as `FieldValue<T>` — that was wrong. `Resort` (`packages/schema/src/resort.ts:6-22`) stores metric fields as **plain values** (`slopes_km: z.number()`, `altitude_m: z.object({min,max})`, etc.); `FieldValue<T>` lives only on the *projected* `ResortView`. Per-field state is computed from `wf.resort.field_sources[path]` (a `FieldSource` per `packages/schema/src/primitives.ts:41-49` carrying `source`, `observed_at`, `fetched_at`, `upstream_hash`, `attribution_block`).

Concrete aggregation rules for `health.ts` and `listResorts.ts`:

- **`resorts_with_stale_fields`:** count workspace files where ≥1 `METRIC_FIELDS` path has a `field_sources` entry whose `observed_at` is older than `FRESHNESS_TTL_DAYS.default`. Reference the canonical staleness computation at [`packages/schema/src/loadResortDatasetFromObject.ts` lines 100–133](../../../packages/schema/src/loadResortDatasetFromObject.ts#L100-L133) (`liveField<T>`'s `ageDays > FRESHNESS_TTL_DAYS.default` branch). The implementer can either inline the same `(now - observed_at) / day_ms` computation or import the threshold constant from the schema package.
- **`resorts_with_failed_fields`:** **always `0` in Phase 1.** `FieldStateFor.failed` (`packages/schema/src/resortView.ts:30`) carries a `reason: string` populated by upstream-adapter failures; Phase 1 ships with **zero adapters** (per spec §10.5 + parent-spec §3 — adapters land in Epic 5). No code path can produce a failed FieldStateFor in Tier 2. Implementer hardcodes `0` and the test cases assert `0` in every fixture. When Epic 5 lands, this becomes a real computation — leave a comment in `health.ts` calling that out.
- **`resorts_with_missing_provenance`:** count workspace files where ≥1 `METRIC_FIELDS` path has NO `field_sources` entry (i.e., `path in wf.resort.field_sources` is `false`). Already handled correctly by the sketch's `METRIC_FIELDS.filter((p) => !(p in wf.resort.field_sources))`.

There is **no `FieldStateFor<T>` projection function** in the schema package today (`packages/schema/src/resortView.ts:61` only exports `toFieldValue<T>(state: FieldStateFor<T>): FieldValue<T>` — admin-to-public direction, not source-data-to-FieldStateFor). Spec §4.1 line 244 references "ResortView projection's `FieldStateFor<T>` (lands in PR 4.1a — see §2.1 / §7)" but PR 4.1a only landed the *type* + the public-direction mapper. Since Phase 1's only use of `FieldStateFor` would have been the `'failed'` count (which is always 0), Tier 2 does NOT need to ship the missing projection function. Tier 3 PR 4.4a's `resortDetail` handler will need it (it returns `Record<MetricPath, FieldStateFor<unknown>>` per spec §4.2) — that's the right time to extract.

- [ ] **Step 4: Run tests to verify they pass.** All 5 cases pass. Coverage gate (100% lines / branches / functions / statements) holds — verify with `npm test --workspace=@snowboard-trip-advisor/admin-app -- --run health.test --coverage`.

- [ ] **Step 5: Run `npm run qa`.** Expect green.

- [ ] **Step 6: Commit.**

```bash
git add apps/admin/server/health.ts apps/admin/server/__tests__/health.test.ts
git commit -s -m "feat(admin): replace 501 stub for GET /api/health with real handler (PR 4.2)"
```

### 1.3 Task: `apps/admin/src/state/useHealth.ts` — wrap `apiClient.getHealth()` with `T | null + error`

**Why next.** The hook is the bridge between the real handler (just landed) and the Dashboard view (next task). Landing it third means Dashboard tests can rely on the hook returning real-shaped data.

**Files:**
- Create: `apps/admin/src/state/useHealth.ts`
- Create: `apps/admin/src/state/useHealth.test.ts`

- [ ] **Step 1: Write failing tests.** Cover (a) initial render returns `{ value: null, error: null }`; (b) after fetch resolves returns `{ value: <HealthResponse>, error: null }`; (c) after fetch rejects returns `{ value: null, error: <Error> }`; (d) `__resetForTests` clears the in-flight cache between tests; (e) two concurrent mounts share the in-flight fetch (verify via MSW request count).

```ts
// apps/admin/src/state/useHealth.test.ts (sketch)
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { server } from '../mocks/server'
import { __resetForTests, useHealth } from './useHealth'

// React-state plan-review fold (P1): symmetric reset in BOTH before/afterEach,
// matching Epic 3's apps/public/src/state/useDataset.test.tsx:52-57. Belt-and-
// braces against module-state leak if a future test forgets the beforeEach.
beforeEach(() => __resetForTests())
afterEach(() => {
  __resetForTests()
  server.resetHandlers()
})

describe('useHealth (PR 4.2)', () => {
  it('returns { value: null, error: null } on initial render', () => {
    const { result } = renderHook(() => useHealth())
    expect(result.current).toEqual({ value: null, error: null })
  })

  it('resolves to { value, error: null } after fetch', async () => {
    const { result } = renderHook(() => useHealth())
    await waitFor(() => expect(result.current.value).not.toBeNull())
    expect(result.current.error).toBeNull()
    expect(result.current.value?.resorts_total).toBeGreaterThanOrEqual(0)
  })

  it('rejects to { value: null, error } when MSW returns 500', async () => {
    // server.use(http.get('/api/health', () => HttpResponse.json({ error: ... }, { status: 500 })))
    const { result } = renderHook(() => useHealth())
    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.value).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail.** Expect "Cannot find module './useHealth'" or similar.

- [ ] **Step 3: Write minimal implementation.**

```ts
// apps/admin/src/state/useHealth.ts (sketch)
import { useEffect, useState } from 'react'

import { apiClient } from '../lib/apiClient'
import type { HealthResponse } from '@snowboard-trip-advisor/schema/api'

export type UseHealthResult =
  | { value: HealthResponse; error: null }
  | { value: null; error: Error }
  | { value: null; error: null }

// Module-level: keyed in-flight cache (React-state plan-review fold).
// Health has a single key ('singleton'); useResortList uses query-string keys.
// Same Map shape across both hooks for consistency. Cleared on settle so a
// second mount AFTER the first resolves triggers a fresh fetch — the analyst
// expects fresh data on reload, not a result cache.
const inFlight = new Map<string, Promise<HealthResponse>>()
const HEALTH_KEY = 'singleton'

export function useHealth(): UseHealthResult {
  const [value, setValue] = useState<HealthResponse | null>(null)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false
    let p = inFlight.get(HEALTH_KEY)
    if (p === undefined) {
      p = apiClient.getHealth().finally(() => { inFlight.delete(HEALTH_KEY) })
      inFlight.set(HEALTH_KEY, p)
    }
    p
      .then((v) => { if (!cancelled) setValue(v) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e : new Error(String(e))) })
    return () => { cancelled = true }
  }, [])

  if (error !== null) return { value: null, error }
  if (value !== null) return { value, error: null }
  return { value: null, error: null }
}

export function __resetForTests(): void {
  inFlight.clear()
}
```

- [ ] **Step 4: Run tests to verify they pass.** All test cases green.

- [ ] **Step 5: Run `npm run qa`.** Expect green.

- [ ] **Step 6: Commit.**

```bash
git add apps/admin/src/state/useHealth.ts apps/admin/src/state/useHealth.test.ts
git commit -s -m "feat(admin): add useHealth state hook (PR 4.2)"
```

### 1.4 Task: `apps/admin/src/views/Dashboard.tsx` — render health metrics + cold-start empty state

**Files:**
- Create: `apps/admin/src/views/Dashboard.tsx`
- Create: `apps/admin/src/views/Dashboard.test.tsx`

- [ ] **Step 1: Write failing tests.** Cover (a) loading state renders skeleton / placeholder; (b) resolved state renders all 8 `HealthResponse` fields visible to the user; (c) cold-start state (`resorts_total === 0`) renders the "No resorts yet" empty-state card with a pointer to spec §10.9 manual-creation instructions; (d) error state renders an error message; (e) `axe` clean across all 4 states; (f) click on a "Failed fields" card updates URL state (per spec §7.8: "Card click navigates via URL state").

```tsx
// apps/admin/src/views/Dashboard.test.tsx (sketch)
import { axe } from 'jest-axe'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { server } from '../mocks/server'
import { Dashboard } from './Dashboard'

describe('Dashboard (PR 4.2)', () => {
  it('renders 8 HealthResponse fields when resolved', async () => {
    const { container } = render(<Dashboard />)
    await waitFor(() => screen.getByText(/Resorts total/i))
    expect(screen.getByText(/Resorts total/i)).toBeInTheDocument()
    expect(screen.getByText(/Stale fields/i)).toBeInTheDocument()
    expect(screen.getByText(/Failed fields/i)).toBeInTheDocument()
    expect(screen.getByText(/Missing provenance/i)).toBeInTheDocument()
    expect(screen.getByText(/Corrupt workspace/i)).toBeInTheDocument()
    expect(screen.getByText(/Pending integration errors/i)).toBeInTheDocument()
    expect(screen.getByText(/Last published/i)).toBeInTheDocument()
    expect(screen.getByText(/Archive size/i)).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('renders "No resorts yet" empty-state card when resorts_total === 0', async () => {
    server.use(/* canned: /api/health → { resorts_total: 0, ... all zeros } */)
    render(<Dashboard />)
    await waitFor(() => screen.getByText(/No resorts yet/i))
    expect(screen.getByText(/manual-creation instructions/i)).toBeInTheDocument()
  })

  // ... loading state, error state, click-through tests
})
```

- [ ] **Step 2: Run tests to verify they fail.**

- [ ] **Step 3: Write minimal implementation.** Use `Card` + `StatusPill` from `@snowboard-trip-advisor/design-system`. Implementer references `apps/public/src/views/HomePage.tsx` (Epic 3) for the loading-skeleton pattern.

```tsx
// apps/admin/src/views/Dashboard.tsx (sketch — implementer adds explicit return types,
// consumes design-system components instead of raw HTML, uses tokens.css for styling)
import { useHealth } from '../state/useHealth'

export function Dashboard() {
  const { value, error } = useHealth()
  if (error !== null) return <ErrorPanel error={error} />
  if (value === null) return <DashboardSkeleton />
  if (value.resorts_total === 0) return <ColdStartEmptyState />
  return <HealthMetricsGrid health={value} />
}

// ColdStartEmptyState: <Card> with copy "No resorts yet. To add a resort
// in Phase 1, author data/admin-workspace/<slug>.json by hand — see
// docs/superpowers/specs/2026-05-01-epic-4-admin-app-design.md §10.9
// for the full Phase 1 manual-creation steps."
```

- [ ] **Step 4: Run tests to verify they pass.** Coverage gate holds.

- [ ] **Step 5: Run `npm run qa`.** Expect green.

- [ ] **Step 6: Commit.**

```bash
git add apps/admin/src/views/Dashboard.tsx apps/admin/src/views/Dashboard.test.tsx
git commit -s -m "feat(admin): add Dashboard view + cold-start empty state (PR 4.2)"
```

### 1.5 Task: `apps/admin/src/state/useURLState.ts` + App.tsx routing wire-up

**React-state plan-review fold (critical).** The prior version of this section had `App.tsx` subscribe to `popstate` only. Browsers do NOT fire `popstate` for `history.pushState` / `replaceState`, so any programmatic navigation (PR 4.3 row-click ships `pushState` per §2.4) would silently fail to re-render. Epic 3 solves this in [`apps/public/src/state/useURLState.ts` lines 16–63](../../../apps/public/src/state/useURLState.ts#L16-L63) with a module-scoped subscriber Set + a `notify()` call inside `setURLState`. Tier 2 mirrors that pattern in `apps/admin/src/state/useURLState.ts` (smaller surface — admin has no shareable-state-normalization invariant, so we skip the `normalizeIfNeeded` helper Epic 3 uses).

**Why this is one task, not two.** `useURLState.ts` exists solely to host the `setRoute` writer + the subscriber bridge that `App.tsx` consumes. Splitting them would force `App.tsx` to live without a subscriber for the duration of the in-between commit (untested half-state); combining keeps the URL-routing infrastructure landing as one atomic change. The task's commit step bundles 3 files (useURLState.ts, useURLState.test.ts, App.tsx + App.test.tsx).

**Files:**
- Create: `apps/admin/src/state/useURLState.ts`
- Create: `apps/admin/src/state/useURLState.test.ts`
- Modify: `apps/admin/src/App.tsx`
- Modify: `apps/admin/src/App.test.tsx`

- [ ] **Step 1: Write failing tests for `useURLState`.** Cover (a) initial render returns the parsed Route from `window.location.search`; (b) `popstate` event triggers re-render with new parsed Route; (c) `setRoute(state)` updates `window.location` AND triggers re-render in the SAME tick (programmatic-navigation channel); (d) two consumers see the same Route after `setRoute` (subscriber broadcast); (e) `__resetForTests` clears subscribers between tests.

```ts
// apps/admin/src/state/useURLState.test.ts (sketch)
import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { __resetForTests, setRoute, useURLState } from './useURLState'

beforeEach(() => {
  __resetForTests()
  window.history.replaceState({}, '', '/')
})
afterEach(() => __resetForTests())

describe('useURLState (PR 4.2)', () => {
  it('returns parsed Route from window.location.search', () => {
    window.history.replaceState({}, '', '/?route=dashboard')
    const { result } = renderHook(() => useURLState())
    expect(result.current).toEqual({ route: 'dashboard' })
  })

  it('re-renders on popstate', () => {
    const { result } = renderHook(() => useURLState())
    act(() => {
      window.history.pushState({}, '', '/?route=dashboard')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(result.current).toEqual({ route: 'dashboard' })
  })

  it('re-renders on programmatic setRoute (no popstate dispatched)', () => {
    const { result } = renderHook(() => useURLState())
    act(() => setRoute({ route: 'dashboard' }))
    expect(result.current).toEqual({ route: 'dashboard' })
    expect(window.location.search).toBe('')  // serializeURL omits default
  })

  it('two concurrent consumers both see the post-setRoute Route', () => {
    const { result: r1 } = renderHook(() => useURLState())
    const { result: r2 } = renderHook(() => useURLState())
    act(() => setRoute({ route: 'dashboard' }))
    expect(r1.current).toEqual({ route: 'dashboard' })
    expect(r2.current).toEqual({ route: 'dashboard' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail.**

- [ ] **Step 3: Write `useURLState.ts` minimal implementation.** Mirrors Epic 3 pattern at `apps/public/src/state/useURLState.ts:16-63` but smaller — admin has no URL-normalization invariant so we skip that helper. Sketch:

```ts
// apps/admin/src/state/useURLState.ts (sketch)
import { useSyncExternalStore } from 'react'

import { parseURL, serializeURL, type RouteState } from '../lib/urlState'

// Module-scoped subscriber Set: notified on BOTH popstate (browser back/forward)
// AND setRoute (programmatic navigation). Per Epic 3 pattern at
// apps/public/src/state/useURLState.ts:16-22.
const subscribers = new Set<() => void>()

function notify(): void {
  for (const cb of subscribers) cb()
}

function subscribe(cb: () => void): () => void {
  subscribers.add(cb)
  const onPop = (): void => {
    cachedSearch = null
    cb()
  }
  window.addEventListener('popstate', onPop)
  return () => {
    subscribers.delete(cb)
    window.removeEventListener('popstate', onPop)
  }
}

// useSyncExternalStore requires getSnapshot to return a stable reference when
// the underlying state hasn't changed. parseURL allocates a fresh object on
// every call → infinite render loop. Cache by location.search (same fix as
// Epic 3's useURLState.ts:71-80).
let cachedSearch: string | null = null
let cachedSnapshot: RouteState | null = null

function getSnapshot(): RouteState {
  const search = window.location.search
  if (cachedSearch === search && cachedSnapshot !== null) return cachedSnapshot
  cachedSearch = search
  cachedSnapshot = parseURL(search)
  return cachedSnapshot
}

export function useURLState(): RouteState {
  return useSyncExternalStore(subscribe, getSnapshot)
}

export function setRoute(state: RouteState): void {
  const serialized = serializeURL(state)
  const url = serialized.length > 0 ? serialized : window.location.pathname
  window.history.pushState({}, '', url)
  cachedSearch = null  // invalidate before notify so getSnapshot re-derives
  notify()
}

export function __resetForTests(): void {
  subscribers.clear()
  cachedSearch = null
  cachedSnapshot = null
}
```

- [ ] **Step 4: Extend the App.tsx test.** Add a case: when URL is `?route=dashboard` (or empty), `App` renders `<Dashboard />` inside the Shell's `<main>` landmark.

- [ ] **Step 5: Wire `useURLState` in App.tsx.**

```tsx
// apps/admin/src/App.tsx (sketch — diff against current Shell-only App.tsx)
import { useURLState } from './state/useURLState'
import { Shell } from './views/Shell'
import { Dashboard } from './views/Dashboard'

export function App() {
  const route = useURLState()

  return (
    <Shell>
      {route.route === 'dashboard' ? <Dashboard /> : null /* PR 4.3 adds 'resorts' branch */}
    </Shell>
  )
}
```

- [ ] **Step 6: Run all tests to verify they pass.** `npm test --workspace=@snowboard-trip-advisor/admin-app -- --run useURLState.test App.test` → expect PASS.

- [ ] **Step 7: Run `npm run qa`.** Expect green.

- [ ] **Step 8: Commit.**

```bash
git add apps/admin/src/state/useURLState.ts apps/admin/src/state/useURLState.test.ts apps/admin/src/App.tsx apps/admin/src/App.test.tsx
git commit -s -m "feat(admin): add useURLState hook + URL-state routing in App (PR 4.2)"
```

### 1.6 Task: PR 4.2 polish — doc-fix fold + open

The 3 doc-drift edits from §0.6 ride the §1.5 final commit (per the updated commit budget at the top of §1) — they're scope-adjacent (all reference the Tier 1 → Tier 2 boundary) and small enough not to warrant a separate commit. The §1.5 task's commit step bundles useURLState + App.tsx + the doc-drift edits.

- [ ] **Step 1: Apply the 3 documentation drift fixes from §0.6 BEFORE the §1.5 commit.** (If §1.5 is already committed, fold into a follow-up commit OR `git commit --amend` the §1.5 commit.)

```bash
# Spec §0 line 6 — "ADRs in flight" → "Related ADRs (merged):"
# (Implementer uses Edit tool against docs/superpowers/specs/2026-05-01-epic-4-admin-app-design.md:6)

# resortDetail.ts: "PR 4.2" → "PR 4.4a" (lines 13 and 18)
# (Implementer uses Edit tool against apps/admin/server/resortDetail.ts)

# listPublishes.ts: "PR 4.6a" → "PR 4.5a" (lines 13 and 18)
# (Implementer uses Edit tool against apps/admin/server/listPublishes.ts)
```

- [ ] **Step 2: Verify the post-fold state.** `git diff` (or staged diff if the §1.5 commit hasn't landed yet) shows 3 file changes (1 spec line, 2 server-stub files with 2 occurrence-edits each). The PR-4.2-replaced `health.ts` is NOT in this diff (the stub disappeared in §1.2's commit). Run `npm run qa` — expect green.

- [ ] **Step 3: Push branch + open PR.**

```bash
git push -u origin epic-4/pr-4.2-dashboard
gh pr create --title "Epic 4 PR 4.2 — Dashboard view + GET /api/health endpoint" \
  --body "$(cat <<'EOF'
## Summary

- Replaces `apps/admin/server/health.ts`'s 501 stub with the real `/api/health` handler aggregating workspace ∪ published resorts (per spec §4.8 + §10.9). Stale-field count uses `observed_at` age vs `FRESHNESS_TTL_DAYS.default`; failed-field count is hardcoded `0` in Phase 1 (no upstream adapters per spec §10.5).
- Ships `apps/admin/src/views/Dashboard.tsx` rendering 8 `HealthResponse` fields + the §10.9 cold-start empty-state card ("No resorts yet" with a pointer to the manual-creation instructions).
- Introduces `apps/admin/src/lib/urlState.ts` as a pure parse/serialize helper (per spec §6.1's F3 fold — not a hook). Phase 1 surface: single `dashboard` route literal; PR 4.3 extends.
- Introduces `apps/admin/src/state/useURLState.ts` (`useURLState` hook + `setRoute` writer + module-scoped subscriber broadcast) so programmatic `pushState` calls (PR 4.3 row-click) re-render — browsers don't fire `popstate` for `pushState`. Mirrors Epic 3's `apps/public/src/state/useURLState.ts` pattern.
- Adds `useHealth` state hook with `T | null + error` shape (per ai-clean-code §0.5 of the Tier 2 plan + spec §6.1: useHealth doesn't mandate Suspense + use()). Module-level cache uses `Map<string, Promise>` (race-free under interleaved mounts; entries delete on settle).
- Wires `useURLState` in `App.tsx` (replaces a prior-draft inline `useSyncExternalStore` that only listened to `popstate`).
- Folds 3 documentation drift fixes from the Tier 1 → Tier 2 gate verification: spec §0 line 6 (ADRs-in-flight wording stale post-merge), `resortDetail.ts` (stub mis-references PR 4.2 instead of 4.4a), `listPublishes.ts` (stub mis-references PR 4.6a instead of 4.5a).

**PR sizing acknowledgment** (per Tier 2 plan §1.0 + Tier 1 PR 4.1c precedent): this PR ships ~12 files (6 implementation + 6 test), exceeding the standard ≤8-file target. The `useURLState` addition is a fold from the plan-document review (React-state reviewer caught the popstate-only subscription bug); splitting the URL-state infrastructure across two PRs would leave the in-between commit untested (App.tsx without a programmatic-navigation channel = silent-failure UX).

## Spec / plan reference

- Spec [`docs/superpowers/specs/2026-05-01-epic-4-admin-app-design.md`](../blob/main/docs/superpowers/specs/2026-05-01-epic-4-admin-app-design.md) §7.8 (PR 4.2 deliverables) + §4.8 (health-endpoint contract) + §10.9 (cold-start, missing files, resort creation) + §6.1 (state hooks).
- Plan [`docs/superpowers/plans/2026-05-03-epic-4-tier-2-navigation-plan.md`](../blob/main/docs/superpowers/plans/2026-05-03-epic-4-tier-2-navigation-plan.md) §1 (lines covering this PR).

## Test plan

- [x] `npm run qa` clean: lint, drift checker, typecheck, coverage (100% lines/branches/functions/statements), tokens, hook tests, integration tests.
- [x] 5 health.test.ts cases pass (happy / missing-provenance / corrupt-workspace / missing-published / cold-start per spec §7.8).
- [x] useHealth.test.ts (loading / resolved / rejected / __resetForTests / shared in-flight via Map) pass.
- [x] useURLState.test.ts (popstate / programmatic setRoute / two-consumer subscriber broadcast / __resetForTests) pass.
- [x] Dashboard.test.tsx (8 metrics / cold-start card / loading skeleton / error state / axe) pass.
- [x] Manual `curl` probe (per `feedback_local_test_per_pr.md`): `npm run dev:admin`, then `curl http://127.0.0.1:5174/api/health` returns 200 with the full HealthResponse shape (verify against the contract snapshot).
- [x] Browser smoke (Playwright MCP): Dashboard renders for empty `?` and for `?route=dashboard`; cold-start state renders when workspace + published are both removed (`rm -rf data/admin-workspace data/published/current.v1.json` for the smoke; restore after).

## Quality gate

- [x] `npm run qa` passes locally
- [x] All commits signed off with DCO
- [x] Coverage 100%
- [x] No `/* istanbul ignore */` comments
- [x] No `--no-verify` used

## Scope discipline

- [x] Applicable AGENTS.md rules followed (explicit return types, no `any`, no non-null assertions, no raw `<button>` / `<a>` in `apps/**`).
- [x] Subagent Review Discipline triggers checked: NONE touched (per spec §7.8 + AGENTS.md L53-73).
- [x] Not a schema PR.

## What we are NOT building in this PR

- No `useResortDetail` Suspense hook (Tier 3 PR 4.4a).
- No router library — `App.tsx` consumes `useURLState` (subscribes to `popstate` + the in-process broadcast) per Epic 3 pattern.
- No `FieldStateFor<T>` projection function in the schema package (the spec assumed it landed in PR 4.1a but only the type shipped). Phase 1 doesn't need it because the only consumer (`resorts_with_failed_fields`) is hardcoded `0`. Tier 3 PR 4.4a's `resortDetail` handler will need the projection — extract there.
- No `apps/admin/server/**` `no-console` carve-out in `eslint.config.js` (folded as P1 follow-up — would trigger `eslint.config.js` subagent-review per AGENTS.md L53-73; out of Tier 2 scope). Inline `// eslint-disable-next-line no-console -- spec §10.3.1` is the per-occurrence discipline today.
- No CSS-in-JS — Dashboard styling consumes `packages/design-system/tokens.css` directly.
- No `Card` factory wrapping the design-system primitive.
- No tagged-union `RequestState` for `useHealth` — see Tier 2 plan §0.5 + ai-clean-code-adherence §4.

EOF
)"
```

- [ ] **Step 4: Post `@codex review`** as a PR comment. Wait ~5 minutes; fold every Codex finding on the same branch; reply to each thread with the fix-commit SHA.

- [ ] **Step 5: Run the local-acceptance test plan** per the body's "Test plan" — execute, do not just describe.

- [ ] **Step 6: Dispatch the §1.99 subagent reviewer brief** (the §0.6 spec edit triggers `docs/superpowers/specs/**` per AGENTS.md L57). Fold findings on the same branch.

- [ ] **Step 7: Surface to maintainer for merge.**

### 1.99 Subagent reviewer brief — PR 4.2

```
Subject: Subagent review — Epic 4 PR 4.2 (Dashboard view + GET /api/health endpoint).

Trigger. PR 4.2 includes a 1-line edit to docs/superpowers/specs/2026-05-01-epic-4-admin-app-design.md
(line 6: "ADRs in flight" → "Related ADRs (merged):") as part of the §0.6 doc-drift fold. That spec path
is in AGENTS.md L57's Subagent Review Discipline trigger list, so this brief is required even though
the spec narrative for PR 4.2 (spec §7.8) said "Subagent review trigger: NO" (the spec was written
before the doc-drift fold was scoped here).

Context. PR 4.2 lands the real /api/health handler (replacing PR 4.1b's 501 stub), the Dashboard view
that consumes it, the URL-state foundation (lib/urlState.ts pure parser/serializer + state/useURLState.ts
hook with subscribers Set + setRoute writer), and the useHealth state hook. Spec:
docs/superpowers/specs/2026-05-01-epic-4-admin-app-design.md §7.8 + §4.8 + §10.9 + §6.1. Plan §1 of
docs/superpowers/plans/2026-05-03-epic-4-tier-2-navigation-plan.md.

Your job. Independent review of three load-bearing things.

1. The spec edit on line 6 is the right wording change. The original text "ADRs in flight: ADR-0011 ...,
   ADR-0012 ..." was stale because both ADRs merged before Tier 1 began (PRs #63 + #64). The fold
   changes it to "Related ADRs (merged):". Verify the new text accurately describes the post-merge
   state and doesn't lose any information from the original. Cite the spec line numbers in your finding.

2. The Tier 1 → Tier 2 boundary documentation drift was correctly scoped. The fold also touches
   apps/admin/server/resortDetail.ts (PR 4.2 → PR 4.4a) and apps/admin/server/listPublishes.ts
   (PR 4.6a → PR 4.5a). Verify these stub-message PR refs match what spec §7.10 + §7.14 actually say.

3. The /api/health real handler (apps/admin/server/health.ts) correctly aggregates per spec §4.8:
   - resorts_total = workspace ∪ published union count
   - resorts_with_corrupt_workspace counts WorkspaceFile.parse() failures and excludes those files
     from per-field aggregates (per §10.3.1)
   - resorts_with_failed_fields = 0 hardcoded in Phase 1 (no upstream adapters per spec §10.5);
     verify NO code path in PR 4.2 produces a non-zero failed count
   - last_published_at + archive_size_bytes handle the missing-published-doc case per §10.9
   Cite handler-test cases that pin each assertion.

Cite file:line for every finding. Verdict: APPROVED or REQUEST CHANGES with P0/P1 list. Hard cap 60 lines.
```

---

## 2. PR 4.3 — Resorts table + GET /api/resorts endpoint

**Branch.** `epic-4/pr-4.3-resorts-table`. **Worktree.** `.worktrees/epic-4-pr-4.3/`. **Depends on.** PR 4.2 merged on `origin/main`. **Rebase from `origin/main`** after 4.2 lands; do NOT stack on the 4.2 branch (phantom-merge avoidance per AGENTS.md).

**Goal.** Replace `apps/admin/server/listResorts.ts`'s 501 stub with the real `/api/resorts` handler (workspace ∪ published union with `publish_state` discriminator per spec §4.1.1); ship `apps/admin/src/views/ResortsTable.tsx` rendering a sortable / filterable list using Epic 3's `Table` design-system primitive (already shipped); extend `apps/admin/src/lib/urlState.ts` with the `resorts` route + filter params.

**README.** Skip.

**Commit budget** (per `feedback_atomic_prs.md` ≤5 commits / PR). Suggested final commit map:

```bash
git commit -s -m "feat(admin): replace 501 stub for GET /api/resorts with real handler (PR 4.3)"
git commit -s -m "feat(admin): add useResortList state hook (PR 4.3)"
git commit -s -m "feat(admin): extend urlState with resorts route + filter params (PR 4.3)"
git commit -s -m "feat(admin): add ResortsTable view + empty-state row + row-click navigation (PR 4.3)"
git commit -s -m "feat(admin): wire Resorts route in App (PR 4.3)"
```

### 2.0 File inventory + per-file dependency declaration

**Implementation files (4 + 1 modify):**

| File | New / Modify | Imports (codebase) | Imports (external) | Public surface | Internal state |
|---|---|---|---|---|---|
| `apps/admin/server/listResorts.ts` | **Modify (replace stub)** | `ListResortsQuery`, `ListResortsResponse`, `ResortSummary` from `@snowboard-trip-advisor/schema/api`; `WorkspaceFile`, `PublishedDataset`, `METRIC_FIELDS` from `@snowboard-trip-advisor/schema`; `HandlerDeps` (export from this same file — already there) | `node:fs/promises`, `node:path` | `listResortsHandler(input, deps): Promise<ListResortsResponse>`, `ListResortsInput`, `HandlerDeps` (existing exports retained) | None |
| `apps/admin/src/state/useResortList.ts` | **New** | `apiClient`; `ListResortsQuery`, `ListResortsResponse` from `@snowboard-trip-advisor/schema/api` | `react` | `useResortList(query): UseResortListResult`, `__resetForTests(): void` | Module-level: `Map<string, Promise<ListResortsResponse>>` keyed by recursive-key-sorted JSON of the query (per React-state plan-review fold — race-free across interleaved different-key mounts; refetches on key change). |
| `apps/admin/src/views/ResortsTable.tsx` | **New** | `useResortList`; `Table` from `@snowboard-trip-advisor/design-system`; `setRoute`, `useURLState` from `../state/useURLState` | `react` | `ResortsTable()` default-export React FC | Component-local sort + filter state via `useState`; row-click calls `setRoute({ route: 'editor', slug })` (Tier 3 PR 4.4b adds the editor route handler in App.tsx). |
| `apps/admin/src/lib/urlState.ts` | **Modify (extend)** | (existing imports) | (existing) | `Route` discriminated union now includes `{ route: 'resorts'; country?: ISOCountryCode; hasFailures?: boolean }` | None |
| `apps/admin/src/App.tsx` | **Modify (add 'resorts' branch)** | (add `ResortsTable` import) | (existing) | (existing) | (existing) |

**Test files (4 + 2 modifies):**

| File | New / Modify | Notes |
|---|---|---|
| `apps/admin/server/__tests__/listResorts.test.ts` | **New** | 4 cases per spec §7.9: happy + draft-resort union per §4.1.1 + missing-published per §10.9 + cold-start (empty result list) |
| `apps/admin/src/state/useResortList.test.ts` | **New** | Loading / resolved / rejected / refetch-on-query-change / __resetForTests |
| `apps/admin/src/views/ResortsTable.test.tsx` | **New** | Renders rows / sort / filter / row-click updates URL state / empty-state row / axe |
| `apps/admin/src/lib/urlState.test.ts` | **Modify** | Add cases for `?route=resorts` + filter params (`?route=resorts&country=PL&hasFailures=true`) |
| `apps/admin/src/App.test.tsx` | **Modify** | Add: `?route=resorts` renders `<ResortsTable />` |

**Total files touched in PR 4.3: 8** (4 implementation new + 1 implementation modify + 1 test new + 2 test modify + 1 test new — 4 NEW pairs + 2 MODIFY pairs). Within atomic-PR target.

**Module-level state declared explicitly:**
- `apps/admin/src/state/useResortList.ts`: `Map<string, Promise<ListResortsResponse>>` keyed by `deepSortedStringify(query)` — per the React-state plan-review fold. Different-key concurrent mounts don't race (each gets its own Map entry; entries delete on settle). `__resetForTests` calls `inFlight.clear()`.
- `apps/admin/src/state/useURLState.ts` (new in PR 4.2 §1.5; PR 4.3 consumes it): `subscribers: Set<() => void>` + `cachedSearch / cachedSnapshot` (already declared in PR 4.2 §1.0).

### 2.1 Task: Replace `apps/admin/server/listResorts.ts` 501 stub with real handler

**Files:**
- Modify: `apps/admin/server/listResorts.ts`
- Create: `apps/admin/server/__tests__/listResorts.test.ts`

- [ ] **Step 1: Write failing tests** covering 4 cases per spec §7.9.

```ts
// apps/admin/server/__tests__/listResorts.test.ts (sketch)
// Workspace-IO pass-2 fold: test rig (mkdtemp + afterEach rm cleanup) mirrors
// §1.2's health.test.ts — see plan §1.2 step 1 sketch for the full beforeEach
// + afterEach + import-list pattern (`mkdtemp`, `mkdir`, `rm`, `writeFile`
// from `node:fs/promises`; `tmpdir` from `node:os`). Don't omit the cleanup —
// without it, repeated test runs leak workspace tmpdirs under /var/folders/.
describe('listResortsHandler (PR 4.3)', () => {
  it('happy path: workspace + published, returns merged set with publish_state taken from precedence-winner', async () => {
    // Workspace has slug A (set wf.resort.publish_state = 'published' explicitly);
    // published has slugs A + B (B's Resort has publish_state = 'published').
    // Per spec §4.1.1: workspace state takes precedence — so A's publish_state
    // comes from the WORKSPACE Resort (not the published one). Schema-API plan-
    // review fold: fixture MUST set wf.resort.publish_state explicitly per case
    // so the assertion is deterministic; otherwise the test silently passes on
    // whatever value the inline literal happens to set.
    // Expect items: [A (publish_state: 'published' from workspace), B (publish_state: 'published' from published)]
    // Verify last_updated: A.last_updated === workspace.modified_at (NOT published_at);
    //                     B.last_updated === publishedDoc.published_at
  })

  it('draft-resort path (§4.1.1): workspace-only slug surfaces with publish_state from workspace Resort', async () => {
    // Workspace has slug C with wf.resort.publish_state = 'draft' (explicit);
    // published has only slug A.
    // Per §4.1.1: "For workspace-only entries, emit publish_state: 'draft'".
    // The workspace Resort's publish_state field carries the value; the spec's
    // "emit 'draft'" rule means the WORKSPACE FIXTURE for a not-yet-published
    // resort sets publish_state='draft'. Tier 2 implementation reads it directly
    // from wf.resort.publish_state — no special-casing.
    // Expect items: [C (publish_state: 'draft'), A (publish_state: 'published')]
  })

  it('missing-published path (§10.9): workspace-only resorts surface, no published doc on disk', async () => {
    // Workspace has slug A; no published doc.
    // Expect items: [A (workspace, publish_state: 'draft' since not in published)]
  })

  it('cold-start path (§10.9): no workspace AND no published → empty items', async () => {
    // No workspace, no published doc.
    // Expect items: [], page: { offset: 0, limit: <default 50>, total: 0 }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail.** Expect "listResorts handler not implemented (lands in PR 4.3)" thrown by the stub.

- [ ] **Step 3: Write the real handler.** Replace `apps/admin/server/listResorts.ts`'s stub. Sketch:

```ts
// apps/admin/server/listResorts.ts (sketch — replaces 23-line stub)
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

import {
  METRIC_FIELDS,
  PublishedDataset,
  WorkspaceFile,
  type ResortSlug,
} from '@snowboard-trip-advisor/schema'
import type {
  ListResortsQuery,
  ListResortsResponse,
  ResortSummary,
} from '@snowboard-trip-advisor/schema/api'

export interface HandlerDeps { readonly workspaceRoot: string }
export interface ListResortsInput { readonly query: ListResortsQuery }

export async function listResortsHandler(
  input: ListResortsInput,
  deps: HandlerDeps,
): Promise<ListResortsResponse> {
  const workspaceFiles = await readWorkspaceFilesParsedOrEmpty(deps.workspaceRoot)
  const publishedDoc = await readPublishedDocOrNull(deps.workspaceRoot)

  // Union per §4.1.1: workspace takes precedence; published-only adds the rest.
  const workspaceSlugs = new Set<ResortSlug>(workspaceFiles.map((wf) => wf.slug))
  const summaries: ResortSummary[] = []

  for (const wf of workspaceFiles) {
    summaries.push(toSummaryFromWorkspace(wf))  // publish_state from wf.resort.publish_state
  }
  if (publishedDoc) {
    for (const r of publishedDoc.resorts) {
      if (!workspaceSlugs.has(r.slug)) {
        summaries.push(toSummaryFromPublished(r, publishedDoc.published_at))
      }
    }
  }

  // Apply filter (country / hasFailures) + page (offset / limit) per spec §4.1.
  const filtered = applyFilter(summaries, input.query.filter)
  const paged = applyPage(filtered, input.query.page)
  return {
    items: paged.items,
    page: { offset: paged.offset, limit: paged.limit, total: filtered.length },
  }
}

// Schema-API plan-review fold: ResortSummary requires `last_updated:
// ISODateTimeString` (`packages/schema/api/listResorts.ts:25`) — the source
// must be explicit per branch:
//   - workspace branch: `wf.modified_at` (when the analyst last edited)
//   - published branch: `publishedDoc.published_at` (when the dataset shipped)
// `publish_state` similarly:
//   - workspace branch: `wf.resort.publish_state` (precedence-winner)
//   - published branch: `r.publish_state` (from PublishedDataset.resorts[].publish_state)
//
// `stale_field_count` / `failed_field_count`: per the §1.2 step 3 note —
// stale = field_sources.observed_at older than FRESHNESS_TTL_DAYS.default;
// failed = always 0 in Phase 1 (no upstream adapters per spec §10.5).
//
// Helpers (readWorkspaceFilesParsedOrEmpty, readPublishedDocOrNull,
// toSummaryFromWorkspace, toSummaryFromPublished, applyFilter, applyPage)
// defined below or extracted to apps/admin/server/lib/* if reused. PR 4.4a
// is likely to share read helpers — Tier 3 plan extracts at that point per
// the §3 "NOT building" stance: do not pre-extract.
//
// Workspace-IO plan-review fold: `readWorkspaceFilesParsedOrEmpty` MUST mirror
// the §1.2 `readWorkspaceFilesOrEmpty` ENOENT-vs-corrupt distinction (transient
// ENOENT between readdir and readFile → `continue` silently; JSON.parse failure
// → push `{ raw: undefined }` so `WorkspaceFile.safeParse` fails the entry as
// corrupt). The corrupt-file `console.error` ALSO needs the same per-occurrence
// `// eslint-disable-next-line no-console -- spec §10.3.1` (the repo-wide
// `no-console: 'error'` rule applies to `apps/admin/server/**` — see §1.2).
```

**Note on shared read helpers.** The plan deliberately duplicates `readWorkspaceFilesOrEmpty` + `readPublishedDocOrNull` between `health.ts` (PR 4.2 §1.2) and `listResorts.ts` (PR 4.3 §2.1) per `ai-clean-code-adherence` §3 (Restrained DRY): "duplicate freely until the duplication has burned you twice." PR 4.4a (resortDetail + workspace.ts read helpers) is the third caller — that's when we extract. Do NOT extract pre-emptively in PR 4.3.

- [ ] **Step 4: Run tests to verify they pass.** Coverage 100%.

- [ ] **Step 5: Run `npm run qa`.** Expect green.

- [ ] **Step 6: Commit.**

```bash
git add apps/admin/server/listResorts.ts apps/admin/server/__tests__/listResorts.test.ts
git commit -s -m "feat(admin): replace 501 stub for GET /api/resorts with real handler (PR 4.3)"
```

### 2.2 Task: `apps/admin/src/state/useResortList.ts` — wrap `apiClient.listResorts(query)` with refetch-on-key

**Files:**
- Create: `apps/admin/src/state/useResortList.ts`
- Create: `apps/admin/src/state/useResortList.test.ts`

- [ ] **Step 1: Write failing tests.** Cover (a) initial render returns `{ value: null, error: null }`; (b) resolves with `ListResortsResponse`; (c) rejects with Error; (d) **refetches when query changes** (verify via MSW request count); (e) `__resetForTests` clears module-level state; (f) two concurrent mounts with the same query share the in-flight fetch (verify MSW request count = 1); (g) two concurrent mounts with DIFFERENT queries each fetch (request count = 2).

```ts
// apps/admin/src/state/useResortList.test.ts (sketch — React-state pass-2 fold:
// explicit beforeEach/afterEach mirror §1.3's symmetric reset pattern, since an
// implementer is likely to copy whichever sketch they read first; without an
// explicit sketch here the asymmetric-cleanup risk recurs.)
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { server } from '../mocks/server'
import { __resetForTests, useResortList } from './useResortList'

beforeEach(() => __resetForTests())
afterEach(() => {
  __resetForTests()
  server.resetHandlers()
})

// ... (a)-(g) test cases per the prose above
```

- [ ] **Step 2: Run tests to verify they fail.**

- [ ] **Step 3: Write minimal implementation.**

```ts
// apps/admin/src/state/useResortList.ts (sketch)
import { useEffect, useState } from 'react'

import { apiClient } from '../lib/apiClient'
import type { ListResortsQuery, ListResortsResponse } from '@snowboard-trip-advisor/schema/api'

export type UseResortListResult =
  | { value: ListResortsResponse; error: null }
  | { value: null; error: Error }
  | { value: null; error: null }

// React-state plan-review fold: keyed in-flight cache via Map<key, Promise>
// — race-free under interleaved mounts with different keys (the prior single
// `let inFlight` could be blown away by a different-key mount, breaking the
// shared-fetch property for in-progress requests).
const inFlight = new Map<string, Promise<ListResortsResponse>>()

// React-state plan-review fold: JSON.stringify's second arg is a *replacer*,
// NOT a sort hint. The prior `JSON.stringify(q, Object.keys(q).sort())`
// produced a property-allowlist — top-level keys allowed, but nested keys
// kept INSERTION order, so two semantically-equal queries hashed to different
// keys depending on caller construction order. Recursive-key-sorted JSON
// closes the gap; nested objects (e.g., query.filter, query.page) get sorted
// too.
function deepSortedStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v): unknown => {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      const sortedEntries = Object.keys(v).sort().map((k): [string, unknown] => [
        k, (v as Record<string, unknown>)[k],
      ])
      return Object.fromEntries(sortedEntries)
    }
    return v
  })
}

function queryKey(q: ListResortsQuery): string {
  return deepSortedStringify(q)
}

export function useResortList(query: ListResortsQuery): UseResortListResult {
  const [value, setValue] = useState<ListResortsResponse | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const key = queryKey(query)

  useEffect(() => {
    let cancelled = false
    let p = inFlight.get(key)
    if (p === undefined) {
      p = apiClient.listResorts(query).finally(() => { inFlight.delete(key) })
      inFlight.set(key, p)
    }
    p
      .then((v) => { if (!cancelled) setValue(v) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e : new Error(String(e))) })
    return () => { cancelled = true }
  }, [key])  // refetch on key change only

  if (error !== null) return { value: null, error }
  if (value !== null) return { value, error: null }
  return { value: null, error: null }
}

export function __resetForTests(): void {
  inFlight.clear()
}
```

- [ ] **Step 4: Run tests to verify they pass.**

- [ ] **Step 5: Run `npm run qa`.** Expect green.

- [ ] **Step 6: Commit.**

```bash
git add apps/admin/src/state/useResortList.ts apps/admin/src/state/useResortList.test.ts
git commit -s -m "feat(admin): add useResortList state hook (PR 4.3)"
```

### 2.3 Task: Extend `apps/admin/src/lib/urlState.ts` with resorts route + filter params

**Files:**
- Modify: `apps/admin/src/lib/urlState.ts`
- Modify: `apps/admin/src/lib/urlState.test.ts` (extend)

- [ ] **Step 1: Extend the failing tests.** Add cases: `?route=resorts` parses as `{ route: 'resorts' }`; `?route=resorts&country=PL` parses with country filter; `?route=resorts&country=ZZ` drops the invalid country; `?route=resorts&hasFailures=true` parses; `?route=resorts&hasFailures=yes` (Schema-API pass-2 advisory) parses with `hasFailures: undefined` (drop-invalid); `?route=editor&slug=kotelnica-bialczanska` parses as `{ route: 'editor', slug }`; `?route=editor` (no slug) drops to `{ route: 'dashboard' }`; `?route=editor&slug=Bad_Slug` (regex-invalid) drops to `{ route: 'dashboard' }`; serialize round-trip for all combinations.

- [ ] **Step 2: Run tests to verify they fail.**

- [ ] **Step 3: Extend `urlState.ts`.** Update `ROUTE_VALUES` to `['dashboard', 'resorts'] as const`. Extend `Route` to a discriminated union:

```ts
// apps/admin/src/lib/urlState.ts (extension sketch — diff against PR 4.2 baseline)
// Schema-API plan-review fold: re-use ISOCountryCode (branded) so parsed values
// are assignable to ListResortsQuery.filter.country without a cast at the
// apiClient call site (`packages/schema/api/listResorts.ts:9` —
// `country: ISOCountryCode.optional()`).
import { ISOCountryCode, ResortSlug } from '@snowboard-trip-advisor/schema'

// React-state pass-2 fold: ship the `editor` Route variant as a TYPING-ONLY
// addition in PR 4.3 so row-click in §2.4 can call setRoute({ route: 'editor',
// slug }) end-to-end. App.tsx in PR 4.3 has no render branch for `editor` (the
// editor view lands in Tier 3 PR 4.4b) — clicking a row pre-4.4b updates the
// URL but the visible view stays on ResortsTable until 4.4b ships. This is the
// intended Phase 1 transition: the URL contract precedes the view, so row-click
// is testable + the URL bar reflects the analyst's navigation intent.
export type Route =
  | { route: 'dashboard' }
  | { route: 'resorts'; country?: ISOCountryCode; hasFailures?: boolean }
  | { route: 'editor'; slug: ResortSlug }

export type RouteState = Route

// React-state pass-2 fold: ROUTE_VALUES extended with 'editor' (typing-only —
// App.tsx in PR 4.3 has no render branch; PR 4.4b adds it).
const ROUTE_VALUES = ['dashboard', 'resorts', 'editor'] as const
const RouteValue = z.enum(ROUTE_VALUES)

export function parseURL(search: string): RouteState {
  const params = new URLSearchParams(search)
  const raw = params.get('route') ?? 'dashboard'
  const parsed = RouteValue.safeParse(raw)
  const route = parsed.success ? parsed.data : 'dashboard'

  if (route === 'dashboard') return { route: 'dashboard' }

  if (route === 'editor') {
    const slug = params.get('slug')
    const slugParsed = slug !== null ? ResortSlug.safeParse(slug) : null
    // Drop-invalid: ?route=editor with missing/invalid slug → defaults to dashboard
    // (per Epic 3 pattern: invalid URL state silently rewrites to a valid subset).
    if (slugParsed?.success !== true) return { route: 'dashboard' }
    return { route: 'editor', slug: slugParsed.data }
  }

  // route === 'resorts'
  const country = params.get('country')
  const countryParsed = country !== null ? ISOCountryCode.safeParse(country) : null
  const hasFailures = params.get('hasFailures')

  return {
    route: 'resorts',
    country: countryParsed?.success === true ? countryParsed.data : undefined,
    hasFailures: hasFailures === 'true' ? true : hasFailures === 'false' ? false : undefined,
  }
}

export function serializeURL(state: RouteState): string {
  if (state.route === 'dashboard') return ''
  if (state.route === 'editor') {
    const params = new URLSearchParams()
    params.set('route', 'editor')
    params.set('slug', state.slug)
    return `?${params.toString()}`
  }
  // state.route === 'resorts'
  const params = new URLSearchParams()
  params.set('route', 'resorts')
  if (state.country !== undefined) params.set('country', state.country)
  if (state.hasFailures !== undefined) params.set('hasFailures', String(state.hasFailures))
  return `?${params.toString()}`
}
```

- [ ] **Step 4: Run tests to verify they pass.**

- [ ] **Step 5: Run `npm run qa`.** Expect green.

- [ ] **Step 6: Commit.**

```bash
git add apps/admin/src/lib/urlState.ts apps/admin/src/lib/urlState.test.ts
git commit -s -m "feat(admin): extend urlState with resorts route + filter params (PR 4.3)"
```

### 2.4 Task: `apps/admin/src/views/ResortsTable.tsx` — render rows + empty state + row-click navigation

**Files:**
- Create: `apps/admin/src/views/ResortsTable.tsx`
- Create: `apps/admin/src/views/ResortsTable.test.tsx`

- [ ] **Step 1: Write failing tests.** Cover (a) loading state; (b) renders 1 row per `ResortSummary` with all 7 columns visible (`slug`, `name`, `country`, `last_updated`, `stale_field_count`, `failed_field_count`, `publish_state`); (c) empty-state row when `items.length === 0` with §10.9 pointer; (d) sort by name / failed_field_count works (column-header click); (e) filter by country (dropdown / input); (f) row-click pushes editor route to URL state (note: editor route lands in Tier 3 PR 4.4b; PR 4.3 just pushes the URL — App.tsx in Tier 3 will route on it); (g) `axe` clean.

- [ ] **Step 2: Run tests to verify they fail.**

- [ ] **Step 3: Write minimal implementation.** Use `Table` design-system primitive (Epic 3 — already shipped at `packages/design-system/src/components/Table.tsx`). Sketch:

```tsx
// apps/admin/src/views/ResortsTable.tsx (sketch)
import type { ResortSlug } from '@snowboard-trip-advisor/schema'
import { Table } from '@snowboard-trip-advisor/design-system'
import { useResortList } from '../state/useResortList'
import { setRoute, useURLState } from '../state/useURLState'

export function ResortsTable() {
  // React-state plan-review fold: read filter/page from URL via useURLState
  // (subscribes to popstate AND programmatic setRoute via the broadcast
  // channel). Reading window.location.search directly would not re-render on
  // setRoute updates from sibling components.
  const route = useURLState()
  const query = route.route === 'resorts'
    ? {
        filter: { country: route.country, hasFailures: route.hasFailures },
        page: { offset: 0, limit: 50 },
      }
    : { page: { offset: 0, limit: 50 } }  // shouldn't happen — route guarded by App.tsx

  const { value, error } = useResortList(query)

  if (error !== null) return <ErrorPanel error={error} />
  if (value === null) return <ResortsTableSkeleton />
  if (value.items.length === 0) return <EmptyStateRow pointerToColdStart />

  // React-state plan-review fold: row-click goes through setRoute — NOT raw
  // pushState — so the broadcast channel notifies subscribers. PR 4.3 §2.3
  // extends the Route discriminated union with { route: 'editor'; slug } as a
  // typing-only addition; App.tsx in PR 4.3 has no render branch for editor
  // (Tier 3 PR 4.4b adds it). Pre-4.4b, clicking a row updates the URL bar
  // (testable + observable via window.location.search) but the visible view
  // stays on ResortsTable. Post-4.4b, the same setRoute call drives the
  // editor view to mount with no code change here.
  const handleRowClick = (row: { slug: ResortSlug }): void => {
    setRoute({ route: 'editor', slug: row.slug })
  }

  return <Table rows={value.items} columns={COLUMNS} onRowClick={handleRowClick} />
}
```

- [ ] **Step 4: Run tests to verify they pass.**

- [ ] **Step 5: Run `npm run qa`.** Expect green.

- [ ] **Step 6: Commit.**

```bash
git add apps/admin/src/views/ResortsTable.tsx apps/admin/src/views/ResortsTable.test.tsx
git commit -s -m "feat(admin): add ResortsTable view + empty-state row + row-click navigation (PR 4.3)"
```

### 2.5 Task: `apps/admin/src/App.tsx` — wire Resorts route

**Files:**
- Modify: `apps/admin/src/App.tsx`
- Modify: `apps/admin/src/App.test.tsx` (extend)

PR 4.2 §1.5 already wired `App.tsx` to use `useURLState()` (per the React-state plan-review fold). PR 4.3 extends the Route discriminated union (in PR 4.3 §2.3) and adds the `'resorts'` branch in `App.tsx`.

- [ ] **Step 1: Extend the failing test.** Add a case: when URL is `?route=resorts`, `App` renders `<ResortsTable />` inside the Shell's `<main>` landmark.

- [ ] **Step 2: Run test to verify it fails.**

- [ ] **Step 3: Extend `App.tsx`.** Add the `'resorts'` branch:

```tsx
// apps/admin/src/App.tsx (extension diff vs. PR 4.2 baseline)
import { ResortsTable } from './views/ResortsTable'
// ...
return (
  <Shell>
    {route.route === 'dashboard' ? <Dashboard /> : null}
    {route.route === 'resorts' ? <ResortsTable /> : null}
    {/* PR 4.4b will add 'editor' branch */}
  </Shell>
)
```

- [ ] **Step 4: Run tests to verify they pass.**

- [ ] **Step 5: Run `npm run qa`.** Expect green.

- [ ] **Step 6: Commit.**

```bash
git add apps/admin/src/App.tsx apps/admin/src/App.test.tsx
git commit -s -m "feat(admin): wire Resorts route in App (PR 4.3)"
```

### 2.6 Task: PR 4.3 polish + open

- [ ] **Step 1: Push branch + open PR.** Body cites spec §7.9 + plan §2.

- [ ] **Step 2: Post `@codex review`**, fold findings, reply with SHAs.

- [ ] **Step 3: Run the local-acceptance test plan** — `npm run qa`, `curl http://127.0.0.1:5174/api/resorts`, browser smoke (load `?route=resorts`, verify rows render, click a row, verify URL updates).

- [ ] **Step 4: Surface to maintainer for merge.**

---

## 3. What we are NOT building in Tier 2 (per ai-clean-code-adherence rubric)

Per the AI clean-code rubric: explicitly call out the abstractions you SKIPPED, so a future agent reading the plan does not re-litigate them.

- **No shared `apps/admin/server/lib/workspaceRead.ts` extraction.** PR 4.2's `health.ts` and PR 4.3's `listResorts.ts` both define `readWorkspaceFilesOrEmpty` + `readPublishedDocOrNull` locally. PR 4.4a (resortDetail + workspace.ts read helpers) is the third caller — that PR's plan extracts a single shared helper. Per ai-clean-code §3: duplicate freely until the duplication has burned you twice; two callers is one warning, not an extraction trigger.
- **No `useResortDetail` Suspense hook.** Tier 3 PR 4.4a; spec §6.1 mandates Suspense + use() only for that hook. Tier 2's `useHealth` + `useResortList` use the simpler `T | null + error` pattern per §0.5.
- **No tagged-union `RequestState<T>` for SPA call sites.** Two-state `T | null + error` collapses the 3-state union into two nullable fields per the ai-clean-code rubric's "Three-state union → T | null" row.
- **No `Card` factory wrapping the design-system primitive.** Dashboard composes `<Card>` directly.
- **No virtualization on the Resorts table.** Phase 1 has ≤50 resorts (default page limit per `packages/schema/api/listResorts.ts:14`). Virtualization is YAGNI for two-digit row counts.
- **No `Pagination` component.** Phase 1 default page is 50; the seed dataset has 2 resorts. Pagination UI is Phase 2 when Tier 5 onboards more resorts.
- **No router library.** App.tsx routes via `useURLState` (subscribes to `popstate` + the in-process `setRoute` broadcast) per Epic 3 pattern. React Router / TanStack Router are out of scope.
- **No `FieldStateFor<T>` projection function in the schema package.** Spec §4.1 line 244 references "ResortView projection's `FieldStateFor<T>` (lands in PR 4.1a)" but PR 4.1a only landed the *type*, not a `Resort.field_sources → FieldStateFor<T>` projection function. Tier 2 doesn't need it because `resorts_with_failed_fields` is hardcoded `0` (no Phase 1 adapters per spec §10.5). Tier 3 PR 4.4a's `resortDetail` handler returns `Record<MetricPath, FieldStateFor<unknown>>` per spec §4.2 — that's the right time to extract.
- **No `apps/admin/server/**` `no-console` carve-out in `eslint.config.js`.** The repo-wide `'no-console': 'error'` rule (`eslint.config.js:90`) only exempts `scripts/**/*.ts` (`eslint.config.js:659-661`). Tier 2 uses per-occurrence inline `// eslint-disable-next-line no-console -- spec §10.3.1` for the corrupt-file stderr logging. A general carve-out is a P1 follow-up — adding it would touch `eslint.config.js`, triggering the AGENTS.md L53-73 subagent-review discipline; out of Tier 2 scope.
- **No `useSyncExternalStore` for URL state IN the `lib/urlState.ts` helper module.** `urlState.ts` is a pure helper (parser/serializer only) per spec §6.1's F3 fold. The `useSyncExternalStore` subscription lives in `apps/admin/src/state/useURLState.ts` (added in PR 4.2 §1.5 per the React-state plan-review fold), mirroring Epic 3's `apps/public/src/state/useURLState.ts`. The `lib`/`state` split keeps the parser pure and the React-coupling localized.
- **No filter-state hook (`useResortListFilter`).** The filter state lives in URL state — `useResortList(query)` reads the query directly from `parseURL` output. Adding a separate filter hook would split a single source of truth into two.
- **No push-vs-replace transition inference in `setRoute`.** Tier 2 always uses `pushState` (the simpler default). Epic 3's `setURLState` infers push vs replace based on a `PUSH_KEYS` allowlist (`apps/public/src/state/useURLState.ts:12`-region) so filter-only changes don't pollute the back stack. Tier 2 doesn't pull this complexity in because (a) only one route literal exists pre-PR-4.3 (no replace-vs-push call to make); (b) PR 4.3 ships `?route=resorts&country=PL` as a single state and the analyst rarely toggles country in tight succession. When Tier 3 adds the editor route + Tier 4 adds publishes, a separate PR can introduce `PUSH_KEYS` + `inferTransition(prev, next)` if the back-button UX warrants it. Tracked here so a future implementer doesn't bake `pushState`-everywhere into the writer's contract.
- **No fixture builders extracted to `tests/fixtures/admin-workspace/`.** PR 4.2's `health.test.ts` and PR 4.3's `listResorts.test.ts` use inline `Resort.parse({...})` literals (per Tier 1 plan §1.5 / §2.5 precedent). The `./fixtures` subpath export was deferred in PR 4.0; extracting now would be premature DRY.
- **No CI Dockerfile guard.** Deferred to Epic 6 per spec §10.7 (the existing Dockerfile is broken and admin is dev-only — `127.0.0.1:5174` strict bind).
- **No analyst-notes UI / endpoints.** Deferred per [ADR-0012](../../adr/0012-defer-analyst-notes-to-post-epic-4-followup.md).
- **No Test/Sync UX or endpoints 4–5.** Deferred to Epic 5 per [ADR-0011](../../adr/0011-defer-test-sync-ux-to-epic-5.md).

---

## 4. Tier 2 → Tier 3 transition

After PR 4.3 merges:

1. **Verify the Tier 2 → Tier 3 gate (spec §7.4):**
   - Dashboard renders against real `/api/health`; ResortsTable against real `/api/resorts`.
   - Cold-start empty state visible per §10.9 (Dashboard "No resorts yet" card; ResortsTable empty-state row) when `data/admin-workspace/` is empty AND `data/published/current.v1.json` is missing.
   - Card-click + row-click navigation works in browser smoke (URL state updates).
   - Both real handlers tested against missing-`current.v1.json` fixtures.

2. **Begin drafting `docs/superpowers/plans/2026-05-XX-epic-4-tier-3-editor-plan.md`** covering PRs 4.4a + 4.4b + 4.4c + 4.4d. Per the rolling-plan approach: open the Tier 3 plan once Tier 2 PR 4.2 is in maintainer-review state (so Tier 3 work is unblocked once the foundation lands). PRs 4.4a and 4.4b are parallel-capable per spec §7.4 (different files; 4.4a server-only + 4.4b UI-only on canned MSW until 4.4d's bridge tier).

---

## 5. Rollback policy

Per [parent spec §10.4](../specs/2026-04-22-product-pivot-design.md) + [ADR-0009](../../adr/0009-dco-exemption-for-dependabot.md): rollback is `git revert <merge-sha>` directly on `main`. The pre-tool-use hook ([scripts/hooks/deny-dangerous-git.sh](../../../scripts/hooks/deny-dangerous-git.sh)) blocks force-push to `main`/`master`. Worktrees with downstream Tier 3+ work rebase against post-revert `main`. DCO sign-off applies to revert commits.
