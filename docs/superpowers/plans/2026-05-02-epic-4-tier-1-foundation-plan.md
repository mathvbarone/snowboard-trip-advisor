# Epic 4 — Tier 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use [superpowers:subagent-driven-development](../skills/) (recommended) or [superpowers:executing-plans](../skills/) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **One PR per branch; one task = one commit.** TDD ordering is load-bearing, not advisory.

**Goal.** Land Tier 1 of Epic 4 (PRs 4.1a, 4.1b, 4.1c) per [the design spec](../specs/2026-05-01-epic-4-admin-app-design.md) §7.4. Tier 1 ships the typed `/api/*` wire contract, the Vite middleware skeleton with 501-stub handlers, and the 5 design-system primitives the editor will consume. **No real handler logic** — that lands in Tier 2+.

**Depends on.** [PR 4.0 (plumbing)](2026-05-02-epic-4-pr-4.0-plumbing-plan.md) merged on `origin/main`. PR 4.0 adds the workspace test dependencies, the `@snowboard-trip-advisor/schema/api` subpath export, the `metricFields.ts` literal-tuple typing fix (so `z.enum(METRIC_FIELDS)` narrows correctly), the `App.test.tsx` rewrite (so the new ESLint admin restriction lands without breaking existing tests), and the `vitest.config.ts` `coverage.include` pre-stage. Without PR 4.0, every Tier 1 PR fails on `npm install` / `npm run lint` / `npm run typecheck`.

**Architecture.** Three sequential atomic PRs, each with a single concern. PR 4.1a is contract-only (Zod schemas + apiClient); PR 4.1b is the Vite middleware skeleton + Shell composition with stubs; PR 4.1c is design-system fan-out (5 components, bundled per Epic 3 PR 3.2 precedent). The Tier 1 → Tier 2 gate (spec §7.4) is the boundary at which the foundation is verified before navigation work begins.

**Tech stack.** TypeScript 5.x, Zod v4 (`z.partialRecord`, `z.union`), React 19 (`use()` for Suspense — already in apps/public), Vite 7.x with Connect-style middleware, MSW for SPA test interception, vitest + jest-axe for unit coverage. No new runtime dependencies.

**Tier 1 → Tier 2 gate** (spec §7.4):
- `npm run dev:admin` boots on `127.0.0.1:5174 strictPort:true`.
- `fetch('/api/...')` returns `501` with the standard error envelope for all 6 endpoints.
- Shell renders the real Sidebar + DropdownMenu (not placeholders).
- Contract snapshot pinned at `packages/schema/api/__snapshots__/contract.snap`.
- `WorkspaceFile.parse()` enforces the `editor_modes` cross-key invariant.
- Tiered MSW harness present: `apps/admin/src/mocks/server.ts` (canned) + `apps/admin/src/mocks/realHandlers.ts` (bridge) both exist and have unit tests.

---

## 0. Pre-flight (read once before opening any PR)

### 0.1 Worktree + branch conventions

Per AGENTS.md "Worktree discipline" and project memory: each PR gets its own worktree under `.worktrees/<short-name>/`, branched from `origin/main` at the time of the PR's start. Stacked-PR phantom-merge avoidance (AGENTS.md "PR Sizing Discipline") — **rebase onto `main` after each predecessor merges**, do not stack branches.

Branch names per spec §7.5–7.7: `epic-4/pr-4.1a-foundation`, `epic-4/pr-4.1b-middleware`, `epic-4/pr-4.1c-design-system`.

### 0.2 Per-task discipline (every task)

- **TDD.** Test file edits land in the same commit as their implementation. The test must fail with a meaningful message before the impl exists.
- **DCO.** Every commit carries `Signed-off-by:` (`git commit -s` or the `prepare-commit-msg` hook auto-appends it; do not pass `--no-verify`).
- **Pre-commit `npm run qa`** runs automatically. Hook failures are **fixed**, never bypassed.
- **One commit per task** unless a task spans test + impl + commit naturally — then one commit per task is still the rule. If you discover a refactor mid-task, finish the task as planned and open a separate cleanup commit (or PR) for the refactor.
- **Code snippets are illustrative.** Every code block in this plan is **a sketch**, not copy-paste-ready. The implementer is responsible for adding (a) explicit return-type annotations on every function (`@typescript-eslint/explicit-function-return-type` is `'error'` repo-wide — verified at `eslint.config.js:68`); (b) explicit `void` / `Promise<void>` returns on test bodies; (c) `?? defaultValue` instead of non-null assertions (`@typescript-eslint/no-non-null-assertion` is `'error'` per `eslint.config.js:74`); (d) consuming the existing design-system `<Button>`, `<Input>`, `<a>`-equivalent primitives instead of raw HTML elements in any `apps/**` file (`eslint.config.js:235-261` bans raw `<button>`, `<input>`, `<a>`, `<dialog>`, `<select>`, `<textarea>` in `apps/**`). Snippets that show raw `<button>` are illustrating SHAPE; the actual code consumes `<Button>` from `@snowboard-trip-advisor/design-system`.

### 0.3 Per-PR discipline (after the last task lands)

1. Push the branch; open the PR via `gh pr create`.
2. Post `@codex review` as a PR comment (per project memory: `feedback_codex_review_per_pr.md`).
3. Wait ~5 minutes; fold every Codex finding on the same branch; reply to each thread with the fix-commit SHA.
4. Run a tailored local-acceptance test plan (qa, build smoke, dev probes; for 4.1c, axe matrix in a browser via Playwright MCP). Per project memory: execute the steps yourself, do not just describe them.
5. Dispatch the spec's mandated subagent reviewer (§7.2 trigger matrix) BEFORE requesting maintainer review. Fold findings.
6. Surface to maintainer for merge.

### 0.4 Subagent-review trigger matrix (Tier 1)

| PR | Triggered paths (from spec §7.2) | Reviewer brief in this plan |
|---|---|---|
| 4.1a | `packages/schema/**`, `eslint.config.js` | §1.99 |
| 4.1b | `apps/admin/vite.config.ts`, `apps/admin/vite-plugin-admin-api.ts` | §2.99 |
| 4.1c | `packages/design-system/**` | §3.99 |

---

## 1. PR 4.1a — Foundation: schema/api + apiClient + FieldStateFor + contract snapshot

**Branch.** `epic-4/pr-4.1a-foundation`. **Worktree.** `.worktrees/epic-4-pr-4.1a/`. **Depends on.** [PR 4.0 (plumbing)](2026-05-02-epic-4-pr-4.0-plumbing-plan.md) merged on `origin/main`. Without it: workspace deps missing (`vitest`/`msw` etc. don't resolve), `@snowboard-trip-advisor/schema/api` subpath doesn't exist, `z.enum(METRIC_FIELDS)` widens to `string`, App.test.tsx still imports `schema/node` (the new ESLint rule fails on it).

**README.** Skip. **Subagent review.** YES (`packages/schema/**`, `eslint.config.js`).

**Acceptance gate** (spec §7.5):
- `npm run qa` green.
- Contract snapshot present at `packages/schema/api/__snapshots__/contract.snap` and picked up by `npm run coverage`.
- `apiClient` unit tests pass (MSW-backed).
- ESLint rules block `apps/admin/src/**` from importing `@snowboard-trip-advisor/schema/node` and from raw `fetch(`. **Checked-in test** (`tests/eslint/admin-restrictions.test.ts`) verifies the rule fires + the apiClient inline-disable is the ONLY one.
- `FieldStateFor<T>` (TS) + `FieldState` (Zod) + `toFieldValue<T>` exported and tested (the Epic 2 deferred comment in [resortView.ts:2-5](../../../packages/schema/src/resortView.ts) is removed).

**Commit budget** (per `feedback_atomic_prs.md` ≤5 commits / PR). Per-task `git commit` blocks below are *teaching steps* — the implementer commits at task granularity for incremental TDD evidence, then **before push** consolidates to 5 logical units via `git reset --soft <root-sha> && git commit -s` chains. Final commit map for PR 4.1a:

  1. `feat(schema): add FieldStateFor + FieldState + WorkspaceFile + toFieldValue` (§1.1 + §1.2)
  2. `feat(schema/api): add /api/* envelope + rate-limit class + 6 endpoint schemas` (§1.3 + §1.4)
  3. `feat(schema/api): add barrel + contract snapshot regression gate` (§1.5)
  4. `build(eslint): restrict apps/admin/src/** imports + ban raw fetch + checked-in enforcement test` (§1.6)
  5. `feat(admin): add typed apiClient for /api/*` (§1.7)

**Squash recipe** (no `-i` — flat reset + replay):
```bash
# Identify the merge-base with origin/main:
BASE=$(git merge-base HEAD origin/main)
# Soft-reset to the base; all changes stay staged:
git reset --soft "$BASE"
# Replay 5 commits in the bundle order above (each `git add <files>` then `git commit -s`):
git add packages/schema/src/{resortView,resortView.test,workspaceFile,workspaceFile.test,index}.ts
git commit -s -m "feat(schema): add FieldStateFor + FieldState + WorkspaceFile + toFieldValue (PR 4.1a)"
# (... and so on for the other 4 commits ...)
```
Run `git diff <merge-base> HEAD --stat` after the squash to confirm the file set matches the per-task work; `git log --oneline` should show 5 commits.

### 1.0 File inventory + per-file dependency declaration (per ai-clean-code-adherence §5)

| File | Imports | Public surface | Internal state |
|---|---|---|---|
| `packages/schema/src/resortView.ts` (modify) | `branded`, `primitives`, `zod`, existing `FieldValue<T>` | adds `FieldStateFor<T>` (TS type), `FieldState` (Zod schema mirror), `toFieldValue<T>` | none |
| `packages/schema/src/resortView.test.ts` (modify) | `vitest`, the new types | (tests) | none |
| `packages/schema/src/workspaceFile.ts` (create) | `zod`, `branded.ResortSlug`, `branded.ISODateTimeString`, `metricFields.METRIC_FIELDS`, `resort.Resort`, `liveSignal.ResortLiveSignal` | exports `WorkspaceFile` Zod schema | none |
| `packages/schema/src/workspaceFile.test.ts` (create) | `vitest`, `WorkspaceFile`, fixtures | (tests) | none |
| `packages/schema/api/errorEnvelope.ts` (create) | `zod` | exports `ErrorEnvelope`, `ErrorCode` (`z.enum`) | none |
| `packages/schema/api/rateLimitClass.ts` (create) | none (literal constants) | exports `RATE_LIMIT_CLASS` const + `RateLimitClass` type | none |
| `packages/schema/api/listResorts.ts` (create) | `zod`, `branded`, `primitives` | exports `ListResortsQuery`, `ListResortsResponse`, `ResortSummary` | none |
| `packages/schema/api/resortDetail.ts` (create) | `zod`, `branded.ResortSlug`, `resort.Resort`, `liveSignal.ResortLiveSignal`, `metricFields.METRIC_FIELDS`, `resortView.FieldState` (the Zod schema from §1.1) | exports `ResortSlugParam`, `ResortDetailResponse` (whose `field_states: z.record(z.enum(METRIC_FIELDS), FieldState)`) | none |
| `packages/schema/api/resortUpsert.ts` (create) | `zod`, `branded.ResortSlug`, `resort.Resort`, `liveSignal.ResortLiveSignal`, `metricFields.METRIC_FIELDS` | exports `ResortUpsertBody` (re-exports `ResortDetailResponse` from `./resortDetail`) | none |
| `packages/schema/api/publish.ts` (create) | `zod`, `branded.ResortSlug`, `branded.ISODateTimeString` | exports `PublishSlugParam` (`union(ResortSlug, literal('__all__'))`), `PublishBody`, `PublishResponse` | none |
| `packages/schema/api/listPublishes.ts` (create) | `zod`, `branded.ISODateTimeString` | exports `ListPublishesQuery`, `ListPublishesResponse`, `PublishMetadata` | none |
| `packages/schema/api/health.ts` (create) | `zod`, `branded.ISODateTimeString` | exports `HealthQuery`, `HealthResponse` (with `last_published_at: ISODateTimeString.nullable()` per spec §4.8 / §10.9) | none |
| `packages/schema/api/index.ts` (create) | every sibling | barrel re-export | none |
| `packages/schema/api/contract.test.ts` (create) | `vitest`, `index`, snapshot | (tests) | none |
| `packages/schema/api/__snapshots__/contract.snap` (create) | n/a | n/a | n/a |
| `packages/schema/src/index.ts` (modify) | the new types | adds `WorkspaceFile`, `FieldStateFor`, `toFieldValue` to barrel | none |
| `apps/admin/src/lib/apiClient.ts` (create) | `@snowboard-trip-advisor/schema/api/*` | exports 6 typed methods + `ApiClientError` | none (no module-level cache) |
| `apps/admin/src/lib/apiClient.test.ts` (create) | `vitest`, MSW, `apiClient` | (tests) | none |
| `eslint.config.js` (modify) | (existing) | extended `no-restricted-imports` rules | none |

**Internal state.** None. The `apiClient` is a set of pure async functions; no module-level cache, no factory. Per ai-clean-code-adherence §2: **direct fetch calls — no `createApiClient({ fetcher })` factory**. MSW intercepts `fetch` at the test boundary; do not inject the fetcher.

### 1.1 Task: `FieldStateFor<T>` + `toFieldValue<T>` types in `resortView.ts`

**Files.** Test: [packages/schema/src/resortView.test.ts](../../../packages/schema/src/resortView.test.ts) (modify, append). Modify: [packages/schema/src/resortView.ts](../../../packages/schema/src/resortView.ts) (remove deferred-comment block lines 2-5; add the two types).

**Why.** The admin editor needs a 4-state discriminated state per field (`Live | Stale | Failed | Manual`) and an admin→public projection helper. Spec §2.2 + §7.5 mandate these land in 4.1a alongside the schema/api surface so endpoint 2's `ResortDetailResponse.field_states` can reference them.

- [ ] **Step 1: Append failing tests to `resortView.test.ts`** covering:
  - `FieldStateFor<T>` discriminated-union variants: `{ state: 'live'; value: T; source: SourceKey; observed_at: ISODateTimeString }`, `{ state: 'stale'; value: T; source: SourceKey; observed_at: ISODateTimeString; age_days: number }`, `{ state: 'failed'; reason: string; observed_at: ISODateTimeString }`, `{ state: 'manual'; value: T; author?: string; observed_at: ISODateTimeString }`. One narrowing test per branch (TS `assertNever` exhaustive switch — fails compile if a branch is added without test).
  - `FieldState` Zod schema mirror — every TS variant round-trips through `FieldState.parse(value)`. The Zod schema is needed because `ResortDetailResponse.field_states` (in `resortDetail.ts`, §1.4) is wire-shape and must serialize through the contract-snapshot test (§1.5). Cases: each `state` variant parses; unknown `state` discriminator rejected; missing required field per branch rejected.
  - `toFieldValue<T>(state: FieldStateFor<T>): FieldValue<T>` — `live` → `fresh`, `stale` → `stale`, `failed` → `never_fetched`, `manual` → `fresh` (with `source: 'manual'` per the existing `SourceKey` union — verify it has a `'manual'` member; if not, this task surfaces that gap and the type is added in this same task).

- [ ] **Step 2: Run** `npm test --workspace=@snowboard-trip-advisor/schema -- resortView` — expect FAIL with "Cannot find name 'FieldStateFor'" or equivalent.

- [ ] **Step 3: Implement** in `resortView.ts`:
  - Remove the `// PR 2.4 ... DEFERRED to Epic 4 PR 4.4` comment block (lines 2-5).
  - Add the discriminated-union TS type `FieldStateFor<T>` and a Zod `FieldState` schema (`z.discriminatedUnion('state', [...])`) that mirrors it. The TS type is `FieldStateFor<T>`, the Zod schema is `FieldState` (intentionally separate — TS type is generic over `T`, Zod schema serializes a runtime payload where the value is `unknown`; the `field_states` map is `Record<MetricPath, FieldState>` at the wire layer).
  - Add the projection function `toFieldValue` and any `SourceKey` extension required.
  - Re-export `FieldStateFor` (TS type), `FieldState` (Zod schema), and `toFieldValue` from `packages/schema/src/index.ts`.

- [ ] **Step 4: Run** `npm test --workspace=@snowboard-trip-advisor/schema -- resortView` — expect PASS. Run `npm run typecheck` from repo root — expect PASS.

- [ ] **Step 5: Commit.**
  ```bash
  git add packages/schema/src/resortView.ts packages/schema/src/resortView.test.ts packages/schema/src/index.ts
  git commit -s -m "feat(schema): add FieldStateFor<T> + toFieldValue<T> for admin editor (PR 4.1a)"
  ```

### 1.2 Task: `WorkspaceFile` Zod schema with cross-key refinement

**Files.** Test: `packages/schema/src/workspaceFile.test.ts` (create). Create: `packages/schema/src/workspaceFile.ts`.

**Why.** Spec §10.2: workspace files carry `editor_modes` (sparse `Partial<Record<MetricPath, 'manual' | 'auto'>>`) alongside `resort` and `live_signal`. The `.refine()` enforcing `Object.keys(editor_modes) ⊆ Object.keys(resort.field_sources)` is **load-bearing** (P0-2 fold from spec review) — without it, the SPA's `useModeToggle` could persist a mode for a non-existent field and the UI would render correctly while the workspace file silently disagreed with the published-doc projection.

- [ ] **Step 1: Write failing tests** covering the five cases from spec §7.5:
  ```ts
  // packages/schema/src/workspaceFile.test.ts
  import { describe, expect, it } from 'vitest'
  import { WorkspaceFile } from './workspaceFile'
  import { fixtureResort } from './fixtures'  // existing fixture w/ ≥1 field_source

  describe('WorkspaceFile', () => {
    it('parses a workspace with editor_modes ⊆ field_sources', () => {
      const r = fixtureResort({ field_sources: { 'snow_depth_cm': { /*...*/ } } })
      const wf = WorkspaceFile.parse({
        schema_version: 1,
        slug: 'kotelnica-bialczanska',
        resort: r,
        live_signal: null,
        modified_at: '2026-05-02T10:00:00Z',
        editor_modes: { 'snow_depth_cm': 'manual' },
      })
      expect(wf.editor_modes).toEqual({ 'snow_depth_cm': 'manual' })
    })

    it('defaults editor_modes to {} when missing', () => {
      const wf = WorkspaceFile.parse({ /* no editor_modes */ })
      expect(wf.editor_modes).toEqual({})
    })

    it('rejects ghost paths in editor_modes', () => {
      // resort has only snow_depth_cm in field_sources; editor_modes references lift_count
      const result = WorkspaceFile.safeParse({ /* editor_modes: { lift_count: 'manual' } */ })
      expect(result.success).toBe(false)
      expect(result.error?.issues[0].message).toContain('lift_count')
      expect(result.error?.issues[0].path).toEqual(['editor_modes'])
    })

    it('rejects empty-string keys in editor_modes (defensive)', () => {
      const result = WorkspaceFile.safeParse({ /* editor_modes: { '': 'manual' } */ })
      expect(result.success).toBe(false)
    })

    it('parses cleanly without a published-doc context (cold-start §10.9)', () => {
      const wf = WorkspaceFile.parse({ /* draft resort, never published */ })
      expect(wf.schema_version).toBe(1)
    })

    it('passthrough preserves unknown top-level keys (forward-compat for analyst-notes)', () => {
      const input = { /* ...required..., notes: { 'snow_depth_cm': { md: 'note' } } */ }
      const wf = WorkspaceFile.parse(input) as { notes?: unknown }
      expect(wf.notes).toEqual(input.notes)
    })
  })
  ```

- [ ] **Step 2: Run** `npm test --workspace=@snowboard-trip-advisor/schema -- workspaceFile` — expect FAIL ("Cannot find module './workspaceFile'").

- [ ] **Step 3: Implement** `workspaceFile.ts` per spec §10.2 code block:
  ```ts
  import { z } from 'zod'
  import { ISODateTimeString, ResortSlug } from './branded'
  import { ResortLiveSignal } from './liveSignal'
  import { METRIC_FIELDS } from './metricFields'
  import { Resort } from './resort'

  export const WorkspaceFile = z.object({
    schema_version: z.literal(1),
    slug: ResortSlug,
    resort: Resort,
    live_signal: ResortLiveSignal.nullable(),
    modified_at: ISODateTimeString,
    // Sparse map: only metric paths that have been actively toggled appear.
    // Zod v4's z.record(z.enum(...), v) is exhaustive; z.partialRecord is sparse.
    editor_modes: z
      .partialRecord(z.enum(METRIC_FIELDS), z.enum(['manual', 'auto']))
      .default({}),
  }).passthrough().refine(
    (wf) => Object.keys(wf.editor_modes).every(
      (path) => path in wf.resort.field_sources,
    ),
    (wf) => ({
      message: `editor_modes contains paths not in resort.field_sources: ${
        Object.keys(wf.editor_modes)
          .filter((p) => !(p in wf.resort.field_sources))
          .join(', ')
      }`,
      path: ['editor_modes'],
    }),
  )

  export type WorkspaceFile = z.infer<typeof WorkspaceFile>
  ```

- [ ] **Step 4: Run** `npm test --workspace=@snowboard-trip-advisor/schema -- workspaceFile` — expect PASS. Then `npm run coverage --workspace=@snowboard-trip-advisor/schema` — expect 100% on `workspaceFile.ts`.

- [ ] **Step 5: Update `packages/schema/src/index.ts`** to barrel-export `WorkspaceFile`. Run `npm run typecheck` — expect PASS.

- [ ] **Step 6: Commit.**
  ```bash
  git add packages/schema/src/workspaceFile.ts packages/schema/src/workspaceFile.test.ts packages/schema/src/index.ts
  git commit -s -m "feat(schema): add WorkspaceFile schema with editor_modes cross-key invariant (PR 4.1a)"
  ```

### 1.3 Task: `errorEnvelope.ts` + `rateLimitClass.ts`

**Files.** Test: `packages/schema/api/errorEnvelope.test.ts`, `packages/schema/api/rateLimitClass.test.ts`. Create: `packages/schema/api/errorEnvelope.ts`, `packages/schema/api/rateLimitClass.ts`.

**Why.** Single shared error shape per spec §4.10; rate-limit class metadata for Phase-2 enforcement per spec §10.5 + C3 P1 fold. Both are referenced by every endpoint schema, so they ship first.

- [ ] **Step 1: Write failing tests.**

  `errorEnvelope.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest'
  import { ErrorEnvelope } from './errorEnvelope'

  describe('ErrorEnvelope', () => {
    it.each([
      'invalid-request', 'invalid-resort', 'not-found',
      'not-implemented', 'publish-validation-failed',
      'workspace-corrupt', 'internal',
    ])('accepts code %s', (code) => {
      const r = ErrorEnvelope.safeParse({ error: { code, message: 'x' } })
      expect(r.success).toBe(true)
    })

    it('rejects unknown codes', () => {
      const r = ErrorEnvelope.safeParse({ error: { code: 'gibberish', message: 'x' } })
      expect(r.success).toBe(false)
    })

    it('permits optional details payload', () => {
      const r = ErrorEnvelope.parse({
        error: { code: 'invalid-request', message: 'x', details: [{ path: ['a'], message: 'y' }] },
      })
      expect(r.error.details).toBeDefined()
    })
  })
  ```

  `rateLimitClass.test.ts`:
  ```ts
  import { describe, expect, it } from 'vitest'
  import { RATE_LIMIT_CLASS } from './rateLimitClass'

  describe('RATE_LIMIT_CLASS', () => {
    it('classifies all 6 Epic 4 endpoints', () => {
      expect(RATE_LIMIT_CLASS).toEqual({
        listResorts: 'read', resortDetail: 'read',
        resortUpsert: 'write', publish: 'write',
        listPublishes: 'read', health: 'read',
      })
    })
  })
  ```

- [ ] **Step 2: Run** `npm test --workspace=@snowboard-trip-advisor/schema -- errorEnvelope rateLimitClass` — expect FAIL.

- [ ] **Step 3: Implement.**

  `errorEnvelope.ts`:
  ```ts
  import { z } from 'zod'

  export const ErrorCode = z.enum([
    'invalid-request', 'invalid-resort', 'not-found',
    'not-implemented', 'publish-validation-failed',
    'workspace-corrupt', 'internal',
  ])
  export type ErrorCode = z.infer<typeof ErrorCode>

  export const ErrorEnvelope = z.object({
    error: z.object({
      code: ErrorCode,
      message: z.string(),
      details: z.unknown().optional(),
    }),
  })
  export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>
  ```

  `rateLimitClass.ts`:
  ```ts
  // Phase 1: advisory only (spec §10.5). Phase 2 wires enforcement.
  export const RATE_LIMIT_CLASS = {
    listResorts: 'read',
    resortDetail: 'read',
    resortUpsert: 'write',
    publish: 'write',
    listPublishes: 'read',
    health: 'read',
  } as const

  export type RateLimitClass = typeof RATE_LIMIT_CLASS[keyof typeof RATE_LIMIT_CLASS]
  ```

- [ ] **Step 4: Run** the same test command — expect PASS.

- [ ] **Step 5: Commit.**
  ```bash
  git add packages/schema/api/errorEnvelope.ts packages/schema/api/errorEnvelope.test.ts \
          packages/schema/api/rateLimitClass.ts packages/schema/api/rateLimitClass.test.ts
  git commit -s -m "feat(schema): add ErrorEnvelope + RATE_LIMIT_CLASS for /api/* surface (PR 4.1a)"
  ```

### 1.4 Task: Endpoint schemas (6 files)

**Files.** For each endpoint, one schema file + one test file under `packages/schema/api/`.

**Why.** Spec §2.2 + §4.x: every endpoint has a Zod request/response pair. The contract-snapshot test in §1.5 below pins these.

The 6 endpoints + their key shapes (full prose in spec §4.1–§4.8):

| File | Request schema | Response schema | Notable |
|---|---|---|---|
| `listResorts.ts` | `ListResortsQuery` (filter + page, all optional) | `ListResortsResponse` (`items: ResortSummary[]`, page metadata) | `ResortSummary.publish_state: z.enum(['draft', 'published'])` per §4.1.1 |
| `resortDetail.ts` | `ResortSlugParam` (`{ slug: ResortSlug }`) | `ResortDetailResponse` (`{ resort, live_signal, field_states: Record<MetricPath, FieldStateFor<unknown>> }`) | `field_states` typed via the `FieldStateFor` from §1.1 |
| `resortUpsert.ts` | `ResortUpsertBody` (`{ resort?, live_signal?, editor_modes? }` — at least one required via `.refine()`) | re-export `ResortDetailResponse` | `editor_modes` is `z.partialRecord(z.enum(METRIC_FIELDS), z.enum(['manual','auto']))` — SPARSE per §4.3 |
| `publish.ts` | `PublishSlugParam` (`z.union([ResortSlug, z.literal('__all__')])`) + `PublishBody` (`{ confirm: true }`) | `PublishResponse` (`{ version_id, archive_path, published_at, resort_count }`) | The slug is a UNION — SPA passes `'__all__'` per §4.6 / §1.1 divergence |
| `listPublishes.ts` | `ListPublishesQuery` (page) | `ListPublishesResponse` (`items: PublishMetadata[]`) | `PublishMetadata.published_by` is host-fingerprint string per §4.7 |
| `health.ts` | `HealthQuery` (empty object) | `HealthResponse` (8 numeric fields incl. `resorts_with_corrupt_workspace`) | The `resorts_with_corrupt_workspace` count is the load-bearing P0-4 fold (§4.8 / §10.3.1) |

Each endpoint schema follows the same TDD + commit cycle. **Loop the steps below per file** (6 iterations); commit per endpoint so review can read them one at a time.

- [ ] **Step 1: Write failing tests.** Per endpoint, the test asserts:
  - happy parse round-trip with a representative fixture.
  - rejection on missing required fields.
  - For `resortUpsert.ts` specifically: empty body `{}` rejected with `'invalid-request'`-shaped error; sparse `editor_modes` accepted (single-key `{ snow_depth_cm: 'manual' }` parses with no `resort` / `live_signal`).
  - For `publish.ts` specifically: slug `'__all__'` accepted; slug `'kotelnica-bialczanska'` accepted; slug `'has_underscore'` rejected (regex). **This is the targeted Phase-1-divergence assertion** (per spec §1.1 + §4.6) — the contract-snapshot in §1.5 is the regression gate; this test is the failing-first behavioral pin.
  - For `health.ts` specifically: `resorts_with_corrupt_workspace` is required (number ≥ 0); **`last_published_at: null` parses cleanly** (per spec §4.8 / §10.9 missing-published-doc handling — the schema field is `ISODateTimeString.nullable()`, not `optional()`); a non-ISO string is rejected.
  - For `resortDetail.ts` specifically: `field_states` is a `Record<MetricPath, FieldState>` (Zod schema from §1.1) — fixture round-trips through `ResortDetailResponse.parse` for every `FieldState` variant.

- [ ] **Step 2: Run** `npm test --workspace=@snowboard-trip-advisor/schema -- <endpoint>` — expect FAIL.

- [ ] **Step 3: Implement** per spec §4.x. Each schema imports only what it needs from `branded`, `primitives`, `resort`, `liveSignal`, `metricFields`, `resortView`. NO cross-imports between endpoint schemas (each file is self-contained).

- [ ] **Step 4: Run** the test — expect PASS.

- [ ] **Step 5: Bundle into ONE commit per the §0.2 commit-budget guidance** (`feedback_atomic_prs.md` ≤5 commits per PR; per-endpoint commits would push 4.1a to 13 commits). The 6 endpoint schemas are mechanical and reviewable as a single diff:
  ```bash
  git add packages/schema/api/{listResorts,resortDetail,resortUpsert,publish,listPublishes,health}.{ts,test.ts}
  git commit -s -m "feat(schema/api): add 6 Epic-4 endpoint Zod pairs (PR 4.1a)"
  ```

After all 6 endpoints land:

- [ ] **Step 6: Create `packages/schema/api/index.ts`** that barrel-re-exports every endpoint, plus `ErrorEnvelope`, `ErrorCode`, `RATE_LIMIT_CLASS`, `RateLimitClass`. **Do not commit yet** — the barrel + the §1.5 contract snapshot land as one commit (the snapshot tests the barrel; they're co-located at the cohesion boundary).

### 1.5 Task: Contract-snapshot test (regression gate)

**Files.** Test: `packages/schema/api/contract.test.ts`. Snapshot: `packages/schema/api/__snapshots__/contract.snap` (auto-generated by vitest on first run).

**Why.** Spec §4.9 invariant 1 + 3: every endpoint schema is registered in `index.ts` and the snapshot test catches additions/removals/shape changes that need maintainer review. Spec §4.9 invariant 3 explicitly: byte-equality with the snapshot.

**Note on TDD.** Snapshot tests are **regression gates, not behavioral TDD**. The behavioral assertions (`PublishSlugParam` union, every endpoint parses) are pinned in the per-endpoint tests in §1.4 — those followed the failing-first cycle. The snapshot's job is to catch unintended drift. Step 1 below verifies the barrel exists by attempting to import it; if §1.4 step 6's barrel was forgotten, the test fails on import, which IS a failing-first signal for the barrel itself.

- [ ] **Step 1: Write the test.** Use Zod v4's built-in `z.toJSONSchema(...)` to produce a stable, well-defined JSON shape (per Zod v4 docs; introduced in v4.0). This avoids the brittleness of `_def` JSON-stringification (functions, non-enumerables, internal-only properties).
  ```ts
  // packages/schema/api/contract.test.ts
  import { describe, expect, it } from 'vitest'
  import { z } from 'zod'
  import * as api from './index'

  function serializeExport(name: string, value: unknown): { name: string; jsonSchema: unknown } {
    if (value && typeof value === 'object' && '_zod' in value) {
      // It's a Zod schema (v4's brand). Serialize via the documented JSON-Schema bridge.
      return { name, jsonSchema: z.toJSONSchema(value as z.ZodTypeAny) }
    }
    if (value && typeof value === 'object') {
      // Plain const exports (e.g., RATE_LIMIT_CLASS). JSON-stringify is safe.
      return { name, jsonSchema: JSON.parse(JSON.stringify(value)) }
    }
    return { name, jsonSchema: { kind: 'non-object', typeof: typeof value } }
  }

  describe('schema/api contract snapshot', () => {
    it('captures every export from index.ts', () => {
      const exports = Object.entries(api)
        .map(([name, value]) => serializeExport(name, value))
        .sort((a, b) => a.name.localeCompare(b.name))
      expect(exports).toMatchSnapshot()
    })
  })
  ```

  Behavioral assertions on `PublishSlugParam` (the union shape) live in §1.4's `publish.test.ts`; they followed the TDD failing-first cycle there. The JSON-Schema serialization here is the regression gate that catches **shape changes** (e.g., a Phase 2 PR that drops the `__all__` literal will appear as a snapshot diff).

  **Verify Zod v4 brand at runtime.** Zod v4 schemas have a `_zod` symbol (replacing v3's `_def`-only marker). If `z.toJSONSchema` throws on an `import * as api` value, the cause is likely a non-schema export (a constant table, a TS-type-only re-export). The two `if` branches above handle both cases.

- [ ] **Step 2: Run** `npm test --workspace=@snowboard-trip-advisor/schema -- contract` — expect FAIL on first run if the barrel doesn't exist (`Cannot find module './index'`); after the §1.4 step 6 barrel is in place, the snapshot is generated. **For genuine first-time generation, run with `--update`:** `npm test --workspace=@snowboard-trip-advisor/schema -- contract --update` (vitest writes the snapshot file). Subsequent runs compare against the committed snapshot.

- [ ] **Step 3: Inspect** `__snapshots__/contract.snap` and confirm every endpoint + `ErrorEnvelope` + `RATE_LIMIT_CLASS` are represented; review the captured Zod `_def` shapes for `PublishSlugParam` to confirm the union shape made it into the snapshot.

- [ ] **Step 4: Run** `npm run coverage` from repo root — confirm the contract test runs as part of standard coverage (no separate `test:contract-snap` script, per F1 P1 fold).

- [ ] **Step 5: Commit** the barrel + snapshot together (one commit per §1.4 step 6's note):
  ```bash
  git add packages/schema/api/index.ts packages/schema/api/contract.test.ts packages/schema/api/__snapshots__/contract.snap
  git commit -s -m "feat(schema/api): add /api/* barrel + contract snapshot (PR 4.1a)"
  ```

### 1.6 Task: ESLint extensions + checked-in enforcement test

**Files.** Test: `tests/eslint/admin-restrictions.test.ts` (create — repo-level test directory). Modify: [eslint.config.js](../../../eslint.config.js).

**Why.** Spec §3.2 + §7.5: enforce that `apps/admin/src/**` cannot import `@snowboard-trip-advisor/schema/node` (Node-only module) and cannot make raw `fetch(` calls. SPA must go through the typed `apiClient`. Mirrors `apps/public`'s existing restrictions. **The lint rule itself needs a checked-in test** — without one, a future Edit could silently disable the restriction (the §1.99 reviewer brief specifically asks the reviewer to verify this).

- [ ] **Step 1: Read the existing rule block** in `eslint.config.js` for `apps/public/src/**` and identify the `no-restricted-imports` + `no-restricted-syntax` patterns. The admin rule mirrors it with two changes: target `apps/admin/src/**` and ALLOW imports from `@snowboard-trip-advisor/schema/api`.

- [ ] **Step 2: Write the failing test** at `tests/eslint/admin-restrictions.test.ts`:
  ```ts
  import { ESLint } from 'eslint'
  import { readFile } from 'node:fs/promises'
  import { describe, expect, it } from 'vitest'

  // Programmatic ESLint runner using the repo's actual flat config — this
  // ensures the test fails the same way `npm run lint` does, not via a
  // private subset.
  async function lintFixture(code: string, filePath: string): Promise<ESLint.LintResult[]> {
    const eslint = new ESLint({ overrideConfigFile: 'eslint.config.js', cwd: process.cwd() })
    return eslint.lintText(code, { filePath })
  }

  describe('admin-app ESLint restrictions', () => {
    it.each([
      ['raw fetch( in SPA code', `export const x = fetch('/api/foo')`, 'no-restricted-syntax'],
      ['schema/node import', `import { publishDataset } from '@snowboard-trip-advisor/schema/node'`, 'no-restricted-imports'],
      ['node:fs import', `import { readFile } from 'node:fs/promises'`, 'no-restricted-imports'],
      ['apps/admin/server import', `import { listResortsHandler } from 'apps/admin/server/listResorts'`, 'no-restricted-imports'],
    ])('blocks %s', async (_name, code, ruleId) => {
      const [result] = await lintFixture(code, 'apps/admin/src/__lint_fixture__.ts')
      expect(result.messages.some((m) => m.ruleId === ruleId)).toBe(true)
    })

    it('exempts apps/admin/src/lib/apiClient.ts from the raw-fetch rule via inline disable', async () => {
      // The apiClient is the one allowed call site; the inline `eslint-disable-line
      // no-restricted-syntax` comment suppresses the rule there. This test verifies the
      // exemption mechanism works (the comment in apiClient.ts does suppress the report).
      const code = `// eslint-disable-next-line no-restricted-syntax\nexport const x = fetch('/api/foo')`
      const [result] = await lintFixture(code, 'apps/admin/src/lib/apiClient.ts')
      expect(result.messages.some((m) => m.ruleId === 'no-restricted-syntax')).toBe(false)
    })

    it('inline-disables for no-restricted-syntax in apps/admin/src/** are an enumerated allowlist', async () => {
      // P1-10 + second-review fold: the bridge test (mocks/realHandlers.test.ts) ALSO needs
      // a raw fetch( call to simulate a SPA call against the bridge handlers — that file is
      // the only OTHER allowed exemption. Any new occurrence outside this allowlist is a SPA
      // file silently bypassing the rule.
      //
      // Mechanical check: walk apps/admin/src/ recursively, grep for 'eslint-disable.*no-restricted-syntax',
      // assert the matching files are exactly { 'apps/admin/src/lib/apiClient.ts', 'apps/admin/src/mocks/realHandlers.test.ts' }.
      // Implementation via node:fs recursive readdir (matches the pattern used by check:agent-discipline-sync).
    })
  })
  ```

- [ ] **Step 3: Run** the test — expect FAIL (the ESLint rules don't exist yet).

- [ ] **Step 4: Extend** `eslint.config.js` to add the admin rule:
  ```js
  // eslint.config.js — append to the rules array
  {
    files: ['apps/admin/src/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@snowboard-trip-advisor/schema/node'],
            message: 'Node-only; admin SPA must not import the Node entry point.' },
          { group: ['node:*'],
            message: 'Node-only; admin SPA must not import Node built-ins.' },
          { group: ['apps/admin/server/**'],
            message: 'Server modules are Node-only; SPA must not import them directly.' },
        ],
      }],
      'no-restricted-syntax': ['error', {
        selector: 'CallExpression[callee.name="fetch"]',
        message: 'Use the typed apiClient (apps/admin/src/lib/apiClient.ts), not raw fetch.',
      }],
    },
  },
  ```

- [ ] **Step 5: Run** the test — expect PASS. Run `npm run lint` from repo root — expect PASS on the existing tree.

- [ ] **Step 6: Commit.**
  ```bash
  git add eslint.config.js tests/eslint/admin-restrictions.test.ts
  git commit -s -m "build(eslint): restrict apps/admin/src/** imports + ban raw fetch (PR 4.1a)"
  ```

### 1.7 Task: `apiClient.ts` typed wrapper

**Files.** Test: `apps/admin/src/lib/apiClient.test.ts`. Create: `apps/admin/src/lib/apiClient.ts`.

**Why.** Spec §7.5 + §4.9 invariant 2: every SPA-side request goes through the typed client; the client is generated from the Zod schemas in `packages/schema/api/*`. The client is a flat module — direct fetch calls + Zod validate the response — per ai-clean-code-adherence §2 (no factory).

**Test environment note (jsdom).** `apps/admin` tests run under `environment: 'jsdom'` (configured in [apps/admin/vite.config.ts:21](../../../apps/admin/vite.config.ts)). jsdom provides `window.location.href = 'http://localhost/'` by default, so `fetch('/api/...')` resolves to `http://localhost/api/...` and MSW v2's `setupServer` intercepts correctly. No base-URL configuration needed in `apiClient.ts`. **If a test ever moves to `environment: 'node'`, relative-URL fetch will reject** — the apiClient comment block calls this out so a future env change surfaces the dependency.

- [ ] **Step 1: Write failing tests** with MSW intercepts:
  ```ts
  // apps/admin/src/lib/apiClient.test.ts
  import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
  import { setupServer } from 'msw/node'
  import { http, HttpResponse } from 'msw'
  import { apiClient, ApiClientError } from './apiClient'

  const server = setupServer()
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  describe('apiClient', () => {
    it('listResorts() returns parsed ListResortsResponse', async () => {
      server.use(http.get('/api/resorts', () =>
        HttpResponse.json({ items: [], page: { offset: 0, limit: 50, total: 0 } })
      ))
      const r = await apiClient.listResorts({})
      expect(r.items).toEqual([])
    })

    it('getResort(slug) returns parsed ResortDetailResponse', async () => {
      // (canned fixture covers resort + live_signal + field_states)
    })

    it('upsertResort(slug, body) PUTs partial body and returns ResortDetailResponse', async () => {
      // covers editor_modes-only sparse update
    })

    it('publish() calls POST /api/resorts/__all__/publish (no slug arg)', async () => {
      let calledUrl: string | null = null
      server.use(http.post('/api/resorts/__all__/publish', ({ request }) => {
        calledUrl = request.url
        return HttpResponse.json({
          version_id: 'v1', archive_path: 'data/published/history/v1.json',
          published_at: '2026-05-02T10:00:00Z', resort_count: 1,
        })
      }))
      await apiClient.publish()
      expect(calledUrl).toContain('/api/resorts/__all__/publish')
    })

    it('listPublishes() returns parsed list', async () => { /* ... */ })
    it('getHealth() returns parsed HealthResponse including resorts_with_corrupt_workspace', async () => { /* ... */ })

    it('throws ApiClientError carrying the error envelope on 4xx', async () => {
      server.use(http.get('/api/resorts', () =>
        HttpResponse.json({ error: { code: 'invalid-request', message: 'x' } }, { status: 400 })
      ))
      await expect(apiClient.listResorts({})).rejects.toThrow(ApiClientError)
    })

    it('throws on response Zod parse failure (server returned wrong shape)', async () => {
      server.use(http.get('/api/resorts', () => HttpResponse.json({ items: 'not-an-array' })))
      await expect(apiClient.listResorts({})).rejects.toThrow()
    })

    it('serializeQuery flattens nested filter + page via JSON-encoded URLSearchParams entries', async () => {
      // Phase-1 wire format pin (P1-3 fold): the dispatch-side parser in PR 4.1b
      // (vite-plugin-admin-api.ts) does the inverse — JSON.parse each param value.
      let capturedURL = ''
      server.use(http.get('/api/resorts', ({ request }) => {
        capturedURL = request.url
        return HttpResponse.json({ items: [], page: { offset: 0, limit: 50, total: 0 } })
      }))
      await apiClient.listResorts({ filter: { country: 'AT' }, page: { offset: 10, limit: 5 } })
      const url = new URL(capturedURL)
      expect(url.searchParams.get('filter')).toBe(JSON.stringify({ country: 'AT' }))
      expect(url.searchParams.get('page')).toBe(JSON.stringify({ offset: 10, limit: 5 }))
    })

    it('serializeQuery omits undefined fields', async () => {
      let capturedURL = ''
      server.use(http.get('/api/resorts', ({ request }) => {
        capturedURL = request.url
        return HttpResponse.json({ items: [], page: { offset: 0, limit: 50, total: 0 } })
      }))
      await apiClient.listResorts({})
      expect(new URL(capturedURL).search).toBe('')
    })
  })
  ```

- [ ] **Step 2: Run** `npm test --workspace=@snowboard-trip-advisor/admin-app -- apiClient` — expect FAIL.

- [ ] **Step 3: Implement** `apiClient.ts` as a flat module of async functions:
  ```ts
  // apps/admin/src/lib/apiClient.ts
  // Phase 1 publish convention: publish() takes no slug arg; the SPA hard-codes
  // the sentinel '__all__' in the URL path. Phase 2 widens this when per-resort
  // publish lands (spec §4.6 / B4 P1 fold). Do NOT promote the slug to a parameter.
  import {
    ErrorEnvelope, HealthResponse, ListPublishesQuery, ListPublishesResponse,
    ListResortsQuery, ListResortsResponse, PublishBody, PublishResponse,
    ResortDetailResponse, ResortUpsertBody,
  } from '@snowboard-trip-advisor/schema/api'
  import type { ResortSlug } from '@snowboard-trip-advisor/schema'

  export class ApiClientError extends Error {
    constructor(
      public readonly status: number,
      public readonly envelope: ErrorEnvelope,
    ) {
      super(envelope.error.message)
      this.name = 'ApiClientError'
    }
  }

  async function request<T>(
    method: string,
    path: string,
    body: unknown,
    parser: (r: unknown) => T,
  ): Promise<T> {
    const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } }
    if (body !== undefined) init.body = JSON.stringify(body)
    // Tests run under jsdom (apps/admin/vite.config.ts), so relative URLs resolve
    // via window.location. If env moves to 'node', use an absolute base URL.
    const res = await fetch(path, init)  // eslint-disable-line no-restricted-syntax -- this IS the apiClient
    const json: unknown = await res.json()
    if (!res.ok) throw new ApiClientError(res.status, ErrorEnvelope.parse(json))
    return parser(json)
  }

  export const apiClient = {
    listResorts: (q: ListResortsQuery) =>
      request('GET', '/api/resorts' + serializeQuery(q), undefined, (j) => ListResortsResponse.parse(j)),
    getResort: (slug: ResortSlug) =>
      request('GET', `/api/resorts/${slug}`, undefined, (j) => ResortDetailResponse.parse(j)),
    upsertResort: (slug: ResortSlug, body: ResortUpsertBody) =>
      request('PUT', `/api/resorts/${slug}`, body, (j) => ResortDetailResponse.parse(j)),
    publish: () =>
      request('POST', '/api/resorts/__all__/publish', { confirm: true } satisfies PublishBody, (j) => PublishResponse.parse(j)),
    listPublishes: (q: ListPublishesQuery) =>
      request('GET', '/api/publishes' + serializeQuery(q), undefined, (j) => ListPublishesResponse.parse(j)),
    getHealth: () =>
      request('GET', '/api/health', undefined, (j) => HealthResponse.parse(j)),
  } as const

  // Phase-1 wire format: each top-level key is JSON-encoded. The middleware
  // dispatch helper (vite-plugin-admin-api.ts, PR 4.1b) does the inverse.
  // Pinned by `apiClient.test.ts`'s serializeQuery cases.
  function serializeQuery(q: Record<string, unknown>): string {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(q)) {
      if (value !== undefined) params.set(key, JSON.stringify(value))
    }
    const s = params.toString()
    return s ? `?${s}` : ''
  }
  ```

  Note the **lint exception comment** on the `fetch(` call — this is the one allowed call site; the §1.6 ESLint rule exempts it via inline disable. The §1.6 test (`apiClient.ts is the ONLY file with a no-restricted-syntax disable`) verifies no other SPA file silently bypasses the rule.

  **jsdom dependency note** — add a one-line block comment to `apiClient.ts` near the `fetch(` call: `// Tests run under jsdom (apps/admin/vite.config.ts) so relative URLs resolve via window.location. If env moves to 'node', use an absolute base URL.`

- [ ] **Step 4: Run** the test command — expect PASS.

- [ ] **Step 5: Commit.**
  ```bash
  git add apps/admin/src/lib/apiClient.ts apps/admin/src/lib/apiClient.test.ts
  git commit -s -m "feat(admin): add typed apiClient for /api/* (PR 4.1a)"
  ```

### 1.8 Task: PR 4.1a polish + open

- [ ] **Step 1: Run** `npm run qa` from repo root in the worktree — expect green. If not, fix the failing gate (lint, typecheck, coverage, tokens, hooks-tests, integration-tests) before proceeding. **Never `--no-verify`.**

- [ ] **Step 2: Push the branch.**
  ```bash
  git push -u origin epic-4/pr-4.1a-foundation
  ```

- [ ] **Step 3: Open the PR.**
  ```bash
  gh pr create --title "Epic 4 PR 4.1a — Foundation: schema/api + apiClient + FieldStateFor + contract snapshot" \
    --body "$(cat <<'EOF'
  ## Summary

  Lands Tier 1 entry per [Epic 4 spec §7.5](docs/superpowers/specs/2026-05-01-epic-4-admin-app-design.md). Contract-only: 6 endpoint Zod pairs, `apiClient`, `WorkspaceFile` schema with `editor_modes` cross-key invariant, `FieldStateFor<T>` + `toFieldValue<T>` projection helpers, contract-snapshot test. No real handler logic.

  ## Verification

  - `npm run qa` green.
  - `__snapshots__/contract.snap` represents every export from `packages/schema/api/index.ts`.
  - apiClient unit tests cover happy + error envelopes + response Zod failure for all 6 endpoints.
  - ESLint blocks `apps/admin/src/**` from importing `schema/node` and from raw `fetch(` (apiClient is the one exception).

  ## Subagent review trigger

  YES — `packages/schema/**`, `eslint.config.js`. Reviewer brief lives in [docs/superpowers/plans/2026-05-02-epic-4-tier-1-foundation-plan.md §1.99](docs/superpowers/plans/2026-05-02-epic-4-tier-1-foundation-plan.md).

  ## Test plan
  - [x] qa green locally
  - [ ] @codex review folded
  - [ ] subagent review APPROVED
  EOF
  )"
  ```

- [ ] **Step 4: Post `@codex review`** as a PR comment via `gh pr comment <PR#> --body "@codex review"`. Wait ~5 minutes; fold every Codex finding on the same branch; reply to each thread with the fix-commit SHA. Per project memory `feedback_codex_review_per_pr.md`.

- [ ] **Step 5: Run local acceptance.** Per `feedback_local_test_per_pr.md`: execute, do not just describe.
  ```bash
  npm run qa
  npm run build --workspace=@snowboard-trip-advisor/schema  # verify schema/api typecheck
  npm test --workspace=@snowboard-trip-advisor/admin-app -- apiClient  # apiClient passes
  npm run typecheck  # whole-tree typecheck after eslint config change
  ```
  Report findings on the PR.

- [ ] **Step 6: Dispatch the subagent reviewer per §1.99 below.** Fold findings; surface to maintainer.

### 1.99 Subagent reviewer brief — PR 4.1a

```
Subject: Subagent review — Epic 4 PR 4.1a (schema/api + apiClient).

Context. PR 4.1a lands the Zod schema surface for the admin /api/*, the typed
apiClient, and the WorkspaceFile schema with the editor_modes cross-key
invariant. Spec: docs/superpowers/specs/2026-05-01-epic-4-admin-app-design.md
§2.2 / §4 / §7.5 / §10.2. Plan section 1 of
docs/superpowers/plans/2026-05-02-epic-4-tier-1-foundation-plan.md.

Your job: independent review of three load-bearing things.

1. WorkspaceFile.refine() ENFORCES editor_modes ⊆ resort.field_sources at parse
   time, the error message names the offending paths, and z.partialRecord (NOT
   z.record) is used per spec §4.3 sparse-map note.

2. publish.ts schema's :slug path-param is z.union([ResortSlug, z.literal('__all__')]),
   and the contract.test.ts snapshot CAPTURES that union shape so a Phase 2
   collapse back to plain ResortSlug is a visible diff (spec §1.1 + §4.6).

3. eslint.config.js extension blocks raw fetch( and schema/node imports from
   apps/admin/src/**, with a single allowed call site at apiClient.ts. Verify
   no other call sites exist and the rule cannot be silently disabled by a
   future Edit (the inline disable comment on apiClient's fetch should be the
   only one in the SPA tree).

Cite file:line for every finding. Verdict: APPROVED or REQUEST CHANGES with
P0/P1 list. Hard cap 60 lines.
```

---

## 2. PR 4.1b — Vite middleware skeleton + admin Shell composition

**Branch.** `epic-4/pr-4.1b-middleware`. **Worktree.** `.worktrees/epic-4-pr-4.1b/`. **Depends on.** PR 4.0 merged + PR 4.1a merged. **Rebase from `origin/main`** after 4.1a lands; do NOT stack on the 4.1a branch (phantom-merge avoidance per AGENTS.md).

**README.** Skip. **Subagent review.** YES (`apps/admin/vite.config.ts`, `apps/admin/vite-plugin-admin-api.ts`).

**Acceptance gate** (spec §7.6):
- `npm run dev:admin` boots on `127.0.0.1:5174`.
- `fetch('/api/resorts')` returns 501 with the standard error envelope.
- `App.test.tsx` passes; integration test `tests/integration/apps/admin/shell.test.tsx` (NEW) verifies Shell renders without errors.
- `realHandlers.test.ts` verifies the bridge handler invokes a real handler with the test-supplied workspace dir.

**Commit budget** (per `feedback_atomic_prs.md` ≤5 commits / PR). Final commit map for PR 4.1b:

  1. `feat(admin): add vite-plugin-admin-api with flat dispatch + 6 stub handlers + workspace helper` (§2.1 + §2.2)
  2. `build(admin): bind 127.0.0.1:5174 strictPort + register adminApiPlugin + index.html lang/description` (§2.3)
  3. `feat(admin): add Shell placeholder + App composition` (§2.4)
  4. `feat(admin): add tiered MSW harness (canned + bridge)` (§2.5 + §2.6)
  5. `test(admin): add Shell render integration test` (§2.7)

Squash recipe identical in shape to §1's: `git reset --soft <merge-base>` then replay 5 staged-commit pairs.

### 2.0 File inventory + per-file dependency declaration

| File | Imports | Public surface | Internal state |
|---|---|---|---|
| `apps/admin/vite-plugin-admin-api.ts` (create) | `vite` (Plugin, Connect-ish types), `@snowboard-trip-advisor/schema/api/*`, `./server/*` | exports `adminApiPlugin(): Plugin`, exports `dispatch(req, res, next, deps)` for unit tests | none (handler set is built from imports at module load — no mutable cache) |
| `apps/admin/vite.config.ts` (modify) | adds `adminApiPlugin` import | (config object) | none |
| `apps/admin/index.html` (modify) | n/a | adds `<html lang>`, `<meta name="description">` | n/a |
| `apps/admin/server/listResorts.ts` (create — STUB) | `node:fs/promises`, `@snowboard-trip-advisor/schema/api/listResorts` | exports `listResortsHandler(query, deps): Promise<...>` returning 501-shaped error | none |
| `apps/admin/server/resortDetail.ts` (create — STUB) | similar | similar | none |
| `apps/admin/server/resortUpsert.ts` (create — STUB) | similar | similar | none |
| `apps/admin/server/publish.ts` (create — STUB) | similar | similar | none |
| `apps/admin/server/listPublishes.ts` (create — STUB) | similar | similar | none |
| `apps/admin/server/health.ts` (create — STUB) | similar | similar | none |
| `apps/admin/server/workspace.ts` (create) | `node:fs/promises`, `node:path` | exports `ensureWorkspaceDir(root): Promise<void>` (the `mkdir -p` lazy create per §10.9) | none |
| `apps/admin/server/__tests__/dispatch.test.ts` (create) | `vitest`, `vite`, `vite-plugin-admin-api`, `node:fs/promises` | (tests) | none |
| `apps/admin/server/__tests__/workspace.test.ts` (create) | `vitest`, `node:fs/promises`, `node:os` | (tests) | none |
| `apps/admin/src/views/Shell.tsx` (create — placeholder) | `react` | exports `<Shell>` placeholder | none |
| `apps/admin/src/App.tsx` (modify) | `./views/Shell` | composes Shell | none |
| `apps/admin/src/main.tsx` (no-op verify) | (existing) | (entry point) | n/a |
| `apps/admin/src/test-setup.ts` (modify) | `msw/node`, `./mocks/server` | adds MSW lifecycle | n/a (test-only) |
| `apps/admin/src/mocks/server.ts` (create) | `msw`, `@snowboard-trip-advisor/schema/api/*` | exports canned MSW handlers + `setupServer` instance | none (the MSW server has its own internal state, but it's not module-mutable from outside this file) |
| `apps/admin/src/mocks/realHandlers.ts` (create) | `msw`, `@snowboard-trip-advisor/schema/api/*`, `apps/admin/server/*` | exports `bridgeHandlers(workspaceDir: string): MswHandler[]` | none — `workspaceDir` is the parameter; no module-level cache |
| `apps/admin/src/mocks/realHandlers.test.ts` (create) | `vitest`, `node:fs/promises`, `node:os`, `msw/node`, `realHandlers`, fixture `apiClient` | (tests) | none |
| `tests/integration/apps/admin/shell.test.tsx` (create) | `vitest`, `@testing-library/react`, `apps/admin/src/App` | (integration tests) | none |

**Internal state.** Watch closely. The dispatch helper in `vite-plugin-admin-api.ts` MUST NOT carry a module-level handler cache; it builds the handler set from imports each time the middleware is invoked. (Per ai-clean-code-adherence §2 + §5: module-level mutable state is a hidden coupling — call it out or skip it. We're skipping it.)

### 2.1 Task: `vite-plugin-admin-api.ts` — flat dispatch + Connect adapter

**Files.** Test: `apps/admin/server/__tests__/dispatch.test.ts`. Create: `apps/admin/vite-plugin-admin-api.ts`.

**Why.** Spec §10.1 + §7.6: the middleware is one Vite plugin that registers a Connect handler on `/api/*`, parses request via Zod, dispatches to a `server/*` handler, encodes response. The plugin lifecycle adapter is coverage-excluded (can only run inside Vite); the dispatch helper that does request → handler routing IS unit-tested.

**Design choice (P1-5 fold).** Per ai-clean-code-adherence §2 (flat, explicit): the **dispatch helper takes a parsed input shape, NOT a Connect-style req/res pair**. The Vite middleware adapter (which deals with Connect req/res) and the MSW bridge adapter (which deals with `Request`/`Response` from §2.6) are both short wrappers around the same `dispatch(input, deps)`. Splitting the concerns prevents `adaptMswToConnect` from being a 50-line stub.

**Per-endpoint corruption strategy (P1-4 note).** Spec §10.3.1 reserves `workspace-corrupt` for endpoints 2 / 3 / 6 (single-slug paths return 500 with the failing slug). Endpoints 1 / 8 (list / health) **degrade gracefully** — they skip corrupt files, log to stderr, and surface the count via `HealthResponse.resorts_with_corrupt_workspace`. **The dispatch helper does NOT make this distinction** — corruption strategy is the handler's concern; dispatch only re-encodes thrown errors. The 4.1b stubs return 501 unconditionally; real handlers in 4.2 / 4.3 / 4.4a / 4.4c implement the per-endpoint behavior.

- [ ] **Step 1: Write failing tests** for the `dispatch` helper:
  ```ts
  // apps/admin/server/__tests__/dispatch.test.ts
  import { afterEach, beforeEach, describe, expect, it } from 'vitest'
  import { mkdtemp, rm, stat } from 'node:fs/promises'
  import { tmpdir } from 'node:os'
  import { join } from 'node:path'
  import { dispatch } from '../../vite-plugin-admin-api'

  describe('dispatch', () => {
    let workspaceRoot: string
    beforeEach(async () => { workspaceRoot = await mkdtemp(join(tmpdir(), 'dispatch-')) })
    afterEach(async () => { await rm(workspaceRoot, { recursive: true, force: true }) })

    it('routes GET /api/resorts to listResortsHandler (501 stub in 4.1b)', async () => {
      const r = await dispatch({ method: 'GET', pathname: '/api/resorts', search: '', body: undefined }, { workspaceRoot })
      expect(r.status).toBe(501)
      expect(r.body).toMatchObject({ error: { code: 'not-implemented' } })
    })

    it('routes PUT /api/resorts/:slug to resortUpsertHandler with parsed slug', async () => {
      const r = await dispatch({
        method: 'PUT', pathname: '/api/resorts/kotelnica-bialczanska', search: '',
        body: { editor_modes: { snow_depth_cm: 'manual' } },
      }, { workspaceRoot })
      expect(r.status).toBe(501)
    })

    it('returns 400 invalid-request on body Zod parse fail (empty PUT body)', async () => {
      const r = await dispatch({
        method: 'PUT', pathname: '/api/resorts/kotelnica-bialczanska', search: '', body: {},
      }, { workspaceRoot })
      expect(r.status).toBe(400)
      expect(r.body).toMatchObject({ error: { code: 'invalid-request' } })
    })

    it('returns 400 invalid-request on URL-param Zod parse fail (slug regex)', async () => {
      const r = await dispatch({
        method: 'GET', pathname: '/api/resorts/has_underscore', search: '', body: undefined,
      }, { workspaceRoot })
      expect(r.status).toBe(400)
    })

    it('routes POST /api/resorts/__all__/publish (Phase-1 sentinel)', async () => {
      const r = await dispatch({
        method: 'POST', pathname: '/api/resorts/__all__/publish', search: '',
        body: { confirm: true },
      }, { workspaceRoot })
      expect(r.status).toBe(501)  // STUB; real publish handler lands in PR 4.5a
    })

    it('returns 500 internal on unhandled handler throw', async () => {
      // Inject a deps override that makes the handler throw a non-coded Error.
      // Verify dispatch encodes it as { error: { code: 'internal' } } with status 500.
    })

    it('passes workspaceRoot through to handler deps', async () => {
      // Assert via spy on a stub handler that deps.workspaceRoot === workspaceRoot.
    })

    it('lazy-creates data/admin-workspace/ on first invocation (§10.9)', async () => {
      await dispatch({ method: 'GET', pathname: '/api/health', search: '', body: undefined }, { workspaceRoot })
      const s = await stat(join(workspaceRoot, 'data', 'admin-workspace'))
      expect(s.isDirectory()).toBe(true)
    })

    it('returns null result when path does not match /api/* prefix (caller passes to next())', async () => {
      const r = await dispatch({
        method: 'GET', pathname: '/index.html', search: '', body: undefined,
      }, { workspaceRoot })
      expect(r).toBeNull()  // dispatch returns null; the Vite Connect adapter then calls next()
    })
  })

  // resolveWorkspaceRoot: P0-7 fold from second review — `cd apps/admin && npm run dev`
  // must still resolve the repo-root data/admin-workspace/ dir, not apps/admin/data/admin-workspace/.
  describe('resolveWorkspaceRoot', () => {
    let originalCwd: string
    beforeEach(() => { originalCwd = process.cwd() })
    afterEach(() => { process.chdir(originalCwd); delete process.env.ADMIN_WORKSPACE_ROOT })

    it('walks up from cwd to find the workspace-declaring package.json', async () => {
      const { resolveWorkspaceRoot } = await import('../../vite-plugin-admin-api')
      process.chdir('apps/admin')
      const root = resolveWorkspaceRoot()
      expect(root.endsWith('snowboard-trip-advisor') || root.includes('.worktrees')).toBe(true)
    })

    it('honors ADMIN_WORKSPACE_ROOT env override (test-rig escape hatch)', async () => {
      const { resolveWorkspaceRoot } = await import('../../vite-plugin-admin-api')
      process.env.ADMIN_WORKSPACE_ROOT = '/tmp/some-fixture-root'
      expect(resolveWorkspaceRoot()).toBe('/tmp/some-fixture-root')
    })
  })
  ```

- [ ] **Step 2: Run** the test — expect FAIL.

- [ ] **Step 3: Implement** `vite-plugin-admin-api.ts`:
  - Top-level route table as a `const` (no factory):
    ```ts
    type Route = {
      method: 'GET' | 'PUT' | 'POST'
      pathPattern: string  // e.g. '/api/resorts/:slug/publish'
      paramSchema?: z.ZodTypeAny       // for :slug, etc.
      bodySchema?: z.ZodTypeAny        // request body
      handler: (parsedBody: unknown, parsedParams: Record<string, string>, deps: HandlerDeps) => Promise<unknown>
    }
    const ROUTES: ReadonlyArray<Route> = [
      { method: 'GET', pathPattern: '/api/resorts', /* listResortsHandler */ },
      { method: 'GET', pathPattern: '/api/resorts/:slug', paramSchema: ResortSlugParam, /* resortDetailHandler */ },
      { method: 'PUT', pathPattern: '/api/resorts/:slug', paramSchema: ResortSlugParam, bodySchema: ResortUpsertBody, /* resortUpsertHandler */ },
      { method: 'POST', pathPattern: '/api/resorts/:slug/publish', paramSchema: PublishSlugParam, bodySchema: PublishBody, /* publishHandler */ },
      { method: 'GET', pathPattern: '/api/publishes', /* listPublishesHandler */ },
      { method: 'GET', pathPattern: '/api/health', /* healthHandler */ },
    ] as const
    ```
  - `dispatch(input, deps): Promise<DispatchResult | null>`:
    - Match `input.method + input.pathname` against `ROUTES` (path-pattern matcher: replace `:param` with `([^/]+)` regex).
    - Return `null` if no match (lets caller fall through).
    - Parse `parsedParams` via `paramSchema?.parse` — Zod error → 400 invalid-request envelope.
    - Parse `input.body` via `bodySchema?.parse` — Zod error → 400 invalid-request envelope.
    - Lazy `await ensureWorkspaceDir(deps.workspaceRoot)` (uses `apps/admin/server/workspace.ts` from §2.2). Since dispatch may be called many times, use a one-shot module-level Promise OR call `ensureWorkspaceDir` unconditionally and rely on `mkdir { recursive: true }`'s idempotence.

      **Decision: call `ensureWorkspaceDir` unconditionally per dispatch.** Per ai-clean-code-adherence §5: a one-shot Promise is module-level mutable state — the loud hidden dependency. `mkdir -p` is idempotent + cheap; the unconditional call is simpler and has no observable performance cost in Phase 1's loopback / single-analyst topology.
    - Invoke the handler; catch:
      - Zod error → 400 invalid-request envelope (with Zod issue list in `details`).
      - `Error & { code }` where `code` is in `ErrorCode` enum → that code's status code (500 for internal/workspace-corrupt, 400 for invalid-resort/invalid-request, 404 for not-found, 501 for not-implemented, 400 for publish-validation-failed).
      - Anything else → 500 internal envelope.
    - Return `{ status, body }`.
  - `adminApiPlugin(): Plugin` exports the Vite Plugin object. Its `configureServer(server)` registers a Connect middleware:
    ```ts
    /* v8 ignore start -- Vite Plugin lifecycle runs only at Vite boot;
       cannot be exercised without booting Vite. The dispatch helper above
       is the unit-tested core. */
    return {
      name: 'admin-api',
      configureServer(server): void {
        server.middlewares.use('/api/', async (req, res, next): Promise<void> => {
          const body = await readJsonBody(req)
          const url = new URL(req.url ?? '/', 'http://127.0.0.1')  // ?? not ! — repo bans non-null assertions
          const result = await dispatch({
            method: req.method ?? 'GET',
            pathname: url.pathname,
            search: url.search,
            body,
          }, { workspaceRoot: resolveWorkspaceRoot() })
          if (result === null) { next(); return }
          res.statusCode = result.status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(result.body))
        })
      },
    }
    /* v8 ignore stop */
    ```
  - Export `dispatch`, `adminApiPlugin`, and the input/result types.

  **`resolveWorkspaceRoot()` (P0 #7 from second review).** `process.cwd()` is wrong if the analyst runs `cd apps/admin && npm run dev` — the workspace dir would land under `apps/admin/data/admin-workspace/` instead of repo-root `data/admin-workspace/`. The plugin needs to find the repo root deterministically. Implementation:
  ```ts
  // Top-level helper in vite-plugin-admin-api.ts
  // Resolves the repo root by walking upward from process.cwd() looking for
  // a sentinel file (the root package.json with "workspaces"). Idempotent.
  // ADMIN_WORKSPACE_ROOT env var override allows test rigs to pin a tmpdir.
  function resolveWorkspaceRoot(): string {
    const override = process.env.ADMIN_WORKSPACE_ROOT
    if (override !== undefined) return override
    let dir = process.cwd()
    for (let i = 0; i < 10; i++) {  // bounded depth; loopback-only Phase 1
      const pkgPath = join(dir, 'package.json')
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { workspaces?: unknown }
        if (Array.isArray(pkg.workspaces)) return dir
      }
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
    throw new Error('Could not resolve repo root from process.cwd()')
  }
  ```
  Add a dispatch.test.ts case asserting `resolveWorkspaceRoot()` returns the repo root regardless of `cwd` (set `process.chdir(...)` to `apps/admin` in the test, restore in afterEach).

- [ ] **Step 4: Run** the test — expect PASS.

- [ ] **Step 5: Commit.**
  ```bash
  git add apps/admin/vite-plugin-admin-api.ts apps/admin/server/__tests__/dispatch.test.ts
  git commit -s -m "feat(admin): add vite-plugin-admin-api with flat dispatch helper (PR 4.1b)"
  ```

### 2.2 Task: 7 stub handlers (`apps/admin/server/*.ts`) returning 501

**Files.** 6 endpoint stubs + `workspace.ts` helper + `workspace.test.ts`.

**Why.** Spec §7.6: every endpoint has a handler module from PR 4.1b (returning 501) so the dispatch wiring is end-to-end testable. Real implementations replace these in Tier 2+.

`workspace.ts` ships in this PR (not deferred to 4.4c) because the dispatch helper invokes its `ensureWorkspaceDir` on first request per §10.9 lazy-create. Atomic-write helpers DO NOT ship in 4.1b — those land in 4.4c.

- [ ] **Step 1: Write failing tests for `workspace.ts`.**
  ```ts
  // apps/admin/server/__tests__/workspace.test.ts
  import { afterEach, beforeEach, describe, expect, it } from 'vitest'
  import { mkdtemp, rm, stat } from 'node:fs/promises'
  import { tmpdir } from 'node:os'
  import { join } from 'node:path'
  import { ensureWorkspaceDir } from '../workspace'

  describe('ensureWorkspaceDir', () => {
    let root: string
    beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'ws-test-')) })
    afterEach(async () => { await rm(root, { recursive: true, force: true }) })

    it('creates data/admin-workspace/ when absent', async () => {
      await ensureWorkspaceDir(root)
      const s = await stat(join(root, 'data', 'admin-workspace'))
      expect(s.isDirectory()).toBe(true)
    })

    it('is idempotent (mkdir -p semantics)', async () => {
      await ensureWorkspaceDir(root)
      await expect(ensureWorkspaceDir(root)).resolves.toBeUndefined()
    })
  })
  ```

- [ ] **Step 2: Run** the test — expect FAIL.

- [ ] **Step 3: Implement** `workspace.ts`:
  ```ts
  // apps/admin/server/workspace.ts
  // Phase 1 lazy-create per spec §10.9 — matches publishDataset.ts:30's pattern
  // for data/published/history/ (mkdir -p semantics; idempotent).
  import { mkdir } from 'node:fs/promises'
  import { join } from 'node:path'

  export async function ensureWorkspaceDir(root: string): Promise<void> {
    await mkdir(join(root, 'data', 'admin-workspace'), { recursive: true })
  }
  ```

- [ ] **Step 4: Run** the test — expect PASS.

- [ ] **Step 5: Implement the 6 stub handlers.** Each handler is ~10 lines:
  ```ts
  // apps/admin/server/listResorts.ts (template — repeat for the other 5)
  import type { ListResortsQuery, ListResortsResponse } from '@snowboard-trip-advisor/schema/api/listResorts'

  export type ListResortsDeps = { workspaceRoot: string }

  export async function listResortsHandler(
    _q: ListResortsQuery, _deps: ListResortsDeps,
  ): Promise<ListResortsResponse> {
    // STUB — real impl in PR 4.3.
    const err = new Error('listResorts handler not implemented (lands in PR 4.3)')
    ;(err as Error & { code?: string }).code = 'not-implemented'
    throw err
  }
  ```
  The dispatch helper catches `code === 'not-implemented'` and emits 501 with the standard envelope.

- [ ] **Step 6: Update the dispatch helper's route table** to wire each stub. Update `dispatch.test.ts` if any stub-routing case was missed.

- [ ] **Step 7: Run** `npm test --workspace=@snowboard-trip-advisor/admin-app -- server/` — expect all PASS.

- [ ] **Step 8: Commit.**
  ```bash
  git add apps/admin/server/ apps/admin/vite-plugin-admin-api.ts
  git commit -s -m "feat(admin): add 6 stub handlers + ensureWorkspaceDir for /api/* (PR 4.1b)"
  ```

### 2.3 Task: Vite config binding + index.html

**Files.** Modify: [apps/admin/vite.config.ts](../../../apps/admin/vite.config.ts), [apps/admin/index.html](../../../apps/admin/index.html).

**Why.** Spec §2.5 + §3.1: bind `127.0.0.1:5174` `strictPort: true`. `index.html` gets `lang` + `description` meta. No CSP per spec §10.6 (admin is dev-only).

- [ ] **Step 1: Modify `apps/admin/vite.config.ts`** to add `server: { host: '127.0.0.1', port: 5174, strictPort: true }` and register `adminApiPlugin()` in `plugins: [react(), adminApiPlugin()]`.

- [ ] **Step 2: Modify `apps/admin/index.html`** — add `<html lang="en">` and `<meta name="description" content="Admin app for Snowboard Trip Advisor (dev-only).">`. NO `<meta http-equiv="Content-Security-Policy">` (spec §10.6).

- [ ] **Step 3: Verify boot.** Run `npm run dev:admin` (in a second shell or via `run_in_background`); curl `http://127.0.0.1:5174/api/resorts`; expect a 501 JSON response with `error.code === 'not-implemented'`. Stop the dev server.

- [ ] **Step 4: Commit.**
  ```bash
  git add apps/admin/vite.config.ts apps/admin/index.html
  git commit -s -m "build(admin): bind 127.0.0.1:5174 strictPort + register adminApiPlugin (PR 4.1b)"
  ```

### 2.4 Task: Shell placeholder + App.tsx wiring

**Files.** Test: append to `apps/admin/src/App.test.tsx`. Create: `apps/admin/src/views/Shell.tsx`. Modify: `apps/admin/src/App.tsx`.

**Why.** Spec §7.6: Shell is a placeholder until 4.1c lands the real Sidebar/DropdownMenu. App.tsx replaces the stub with `<Shell>{children}</Shell>`.

- [ ] **Step 1: Append failing test** to `App.test.tsx`:
  ```ts
  it('renders inside the Shell wrapper', () => {
    render(<App />)
    expect(screen.getByRole('banner')).toBeInTheDocument()  // HeaderBar landmark
    expect(screen.getByRole('navigation')).toBeInTheDocument()  // Sidebar landmark
    expect(screen.getByRole('main')).toBeInTheDocument()
  })
  ```

- [ ] **Step 2: Run** `npm test --workspace=@snowboard-trip-advisor/admin-app -- App` — expect FAIL.

- [ ] **Step 3: Create `apps/admin/src/views/Shell.tsx`** as a flat placeholder:
  ```tsx
  // apps/admin/src/views/Shell.tsx
  // Placeholder shell — 4.1c replaces the inner placeholders with the real
  // Sidebar + DropdownMenu (HeaderBar). The landmark roles (banner, nav, main)
  // are stable across the placeholder→real transition so App.test.tsx doesn't churn.
  // Text content is placeholder; landmarks are the contract.
  import type { ReactNode } from 'react'

  export function Shell({ children }: { children: ReactNode }): ReactNode {
    return (
      <div className="app-shell">
        <header role="banner">Admin (placeholder header)</header>
        <nav aria-label="Primary">Admin (placeholder nav)</nav>
        <main>{children}</main>
      </div>
    )
  }
  ```

- [ ] **Step 4: Modify `apps/admin/src/App.tsx`** to render `<Shell><DashboardPlaceholder /></Shell>` where `DashboardPlaceholder` is an inline `<div>Admin coming soon</div>` until 4.2 lands the real Dashboard.

- [ ] **Step 5: Run** the test — expect PASS.

- [ ] **Step 6: Commit.**
  ```bash
  git add apps/admin/src/views/Shell.tsx apps/admin/src/App.tsx apps/admin/src/App.test.tsx
  git commit -s -m "feat(admin): add Shell placeholder + landmark composition (PR 4.1b)"
  ```

### 2.5 Task: MSW canned harness (`mocks/server.ts`) + admin test-setup

**Files.** Create: `apps/admin/src/mocks/server.ts`. Modify: `apps/admin/src/test-setup.ts`.

**Why.** Spec §6.3 + §7.6 P0-3 fold: SPA-side test interception. `server.ts` returns canned data for read-only / SPA-composition tests; per-suite `server.use(...)` overrides apply.

- [ ] **Step 1: Create `apps/admin/src/mocks/server.ts`** with the file-level header from spec §7.6 + concrete canned fixtures that round-trip through the schema/api Zod parsers (P1-6 fold). The Tier 1 plan **does not depend on `packages/schema/src/fixtures` exporting builders** (PR 4.0 deferred the `./fixtures` subpath export); inline the literal `Resort.parse({...})` and `ResortLiveSignal.parse({...})` calls instead. Reference the existing `packages/schema/src/fixtures/current.v1.test.ts` to see the canonical fixture shapes the schema package considers valid:
  ```ts
  // apps/admin/src/mocks/server.ts
  // Test-time MSW handlers returning CANNED data. Used by SPA unit tests
  // (apiClient.test.ts, view tests) and read-only integration tests where no
  // filesystem side effects are exercised. NOT runtime — runtime is
  // vite-plugin-admin-api.ts dispatching to apps/admin/server/*. For
  // integration tests that need real handler invocation, see mocks/realHandlers.ts.
  import {
    HealthResponse, ListPublishesResponse, ListResortsResponse,
    PublishResponse, ResortDetailResponse,
  } from '@snowboard-trip-advisor/schema/api'
  import { http, HttpResponse } from 'msw'
  import { setupServer } from 'msw/node'

  // Concrete canned fixtures — each round-trips through its schema Zod parser
  // so a schema-shape change surfaces as a test failure, not a silently-broken canned blob.
  // Inline literals (no fixtureResort builder; see plan §2.5 step 1 note).
  const cannedResortDetail = ResortDetailResponse.parse({
    resort: {
      slug: 'kotelnica-bialczanska',
      // ... fill from packages/schema/src/fixtures/current.v1.test.ts canonical shape
      // The implementer reads that file and copies the durable-fields literal.
    },
    live_signal: null,  // start with null; per-suite tests override via server.use(http.get(...))
    field_states: {},   // empty per-field state map; per-suite tests override
  })

  const cannedPublishResponse = PublishResponse.parse({
    version_id: 'v_canned_2026-05-02T10-00-00Z',
    archive_path: 'data/published/history/v_canned_2026-05-02T10-00-00Z.json',
    published_at: '2026-05-02T10:00:00Z',
    resort_count: 1,
  })

  const cannedHealth = HealthResponse.parse({
    resorts_total: 0, resorts_with_stale_fields: 0, resorts_with_failed_fields: 0,
    resorts_with_missing_provenance: 0, resorts_with_corrupt_workspace: 0,
    pending_integration_errors: 0, last_published_at: null, archive_size_bytes: 0,
  })

  export const cannedHandlers = [
    http.get('/api/resorts', () =>
      HttpResponse.json(ListResortsResponse.parse({ items: [], page: { offset: 0, limit: 50, total: 0 } }))),
    http.get('/api/resorts/:slug', () => HttpResponse.json(cannedResortDetail)),
    http.put('/api/resorts/:slug', () => HttpResponse.json(cannedResortDetail)),
    http.post('/api/resorts/:slug/publish', () => HttpResponse.json(cannedPublishResponse)),
    http.get('/api/publishes', () =>
      HttpResponse.json(ListPublishesResponse.parse({ items: [], page: { offset: 0, limit: 20, total: 0 } }))),
    http.get('/api/health', () => HttpResponse.json(cannedHealth)),
  ]

  export const server = setupServer(...cannedHandlers)
  ```

  **Note.** Each `Schema.parse(...)` at module load doubles as a self-test: a fixture that drifts from the schema fails CI on import, surfacing the gap rather than masking it. The fixture builders (`fixtureResort` / `fixtureResortLiveSignal`) are NOT yet exported from `packages/schema` (PR 4.0 deferred the `./fixtures` subpath); a future post-Tier-1 PR can extract these inline literals into a shared builder if more than one canned-test file needs them.

- [ ] **Step 2: Modify `apps/admin/src/test-setup.ts`** to add MSW lifecycle:
  ```ts
  // existing setup …
  import { afterAll, afterEach, beforeAll } from 'vitest'
  import { server } from './mocks/server'

  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())
  ```

- [ ] **Step 3: Run** `npm test --workspace=@snowboard-trip-advisor/admin-app` — confirm canned MSW lifecycle is active (no "MSW not running" warnings, no `onUnhandledRequest` failures from the existing apiClient tests).

- [ ] **Step 4: Commit.**
  ```bash
  git add apps/admin/src/mocks/server.ts apps/admin/src/test-setup.ts
  git commit -s -m "feat(admin): add canned MSW harness (mocks/server.ts) + test lifecycle (PR 4.1b)"
  ```

### 2.6 Task: MSW bridge harness (`mocks/realHandlers.ts`) + test

**Files.** Test: `apps/admin/src/mocks/realHandlers.test.ts`. Create: `apps/admin/src/mocks/realHandlers.ts`.

**Why.** Spec §6.3 P0-3 fold: side-effect-bearing integration tests need MSW handlers that invoke the **real** `apps/admin/server/*` handlers with a per-test workspace tmpdir. This catches "I forgot to wire SPA → middleware → handler" regressions that canned MSW would mask. Lands in 4.1b so 4.4d / 4.5b / 4.6b can consume it without re-wiring.

- [ ] **Step 1: Write failing tests.**
  ```ts
  // apps/admin/src/mocks/realHandlers.test.ts
  import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
  import { mkdtemp, rm } from 'node:fs/promises'
  import { tmpdir } from 'node:os'
  import { join } from 'node:path'
  import { setupServer } from 'msw/node'
  import { bridgeHandlers } from './realHandlers'

  describe('bridgeHandlers', () => {
    let workspaceDir: string
    let server: ReturnType<typeof setupServer>

    beforeAll(async () => {
      workspaceDir = await mkdtemp(join(tmpdir(), 'bridge-'))
      server = setupServer(...bridgeHandlers(workspaceDir))
      server.listen({ onUnhandledRequest: 'error' })
    })
    afterAll(async () => { server.close(); await rm(workspaceDir, { recursive: true, force: true }) })
    afterEach(() => server.resetHandlers(...bridgeHandlers(workspaceDir)))

    it('GET /api/health invokes the real handler with the test workspaceDir', async () => {
      const res = await fetch('/api/health')  // eslint-disable-line no-restricted-syntax
      // 4.1b stub returns 501 — confirm the bridge is wired AND the real handler ran (not the canned)
      expect(res.status).toBe(501)
      const json = await res.json() as { error: { code: string } }
      expect(json.error.code).toBe('not-implemented')  // proves the real stub handler ran
    })

    it('decodes request via Zod and returns 400 invalid-request on bad body (PUT empty body)', async () => {
      const res = await fetch('/api/resorts/kotelnica-bialczanska', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}',
      })
      expect(res.status).toBe(400)
    })

    it('threads workspaceDir to the handler so writes land in the per-test fixture', async () => {
      // After Tier 2+ real handlers exist, this test will verify the per-test
      // workspace dir is the one that grows, not the repo's data/admin-workspace/.
      // For 4.1b STUB handlers, this test asserts that the deps argument arrives
      // at the handler with the correct workspaceRoot.
    })
  })
  ```

- [ ] **Step 2: Run** the test — expect FAIL.

- [ ] **Step 3: Implement** `realHandlers.ts`. Since §2.1's `dispatch` takes a parsed input shape (not Connect req/res), the bridge is straightforward: read MSW's `Request` body, normalize to `DispatchInput`, call `dispatch`, encode result as `HttpResponse.json`.

  ```ts
  // apps/admin/src/mocks/realHandlers.ts
  // Test-time MSW bridge handlers that decode the request via Zod, invoke the
  // real apps/admin/server/* handler with a per-test workspace fixture dir, and
  // encode the response. Used by side-effect-bearing integration tests
  // (4.4d edit roundtrip, 4.5b publish, 4.6b full-flow). NOT runtime. For
  // canned-data SPA unit tests, see mocks/server.ts.
  import { dispatch } from '../../vite-plugin-admin-api'
  import { http, HttpResponse } from 'msw'

  export function bridgeHandlers(workspaceDir: string) {
    // The bridge invokes the SAME dispatch helper the runtime Vite middleware does.
    // Per ai-clean-code-adherence §1: the route table + schema-decode logic lives in
    // ONE place (vite-plugin-admin-api.ts); both adapters wrap it. The adapter logic
    // is ~15 lines because dispatch takes a parsed input shape, not Connect req/res.
    return [
      http.all('/api/*', async ({ request }) => {
        const url = new URL(request.url)
        const body = await readJsonBody(request)
        const result = await dispatch(
          { method: request.method, pathname: url.pathname, search: url.search, body },
          { workspaceRoot: workspaceDir },
        )
        if (result === null) return HttpResponse.json({ error: { code: 'not-found', message: 'no route' } }, { status: 404 })
        return HttpResponse.json(result.body, { status: result.status })
      }),
    ]
  }

  async function readJsonBody(request: Request): Promise<unknown> {
    if (request.method === 'GET' || request.method === 'HEAD') return undefined
    const text = await request.text()
    return text === '' ? undefined : JSON.parse(text)
  }
  ```

  **No `adaptMswToConnect`** — the dispatch refactor in §2.1 obviated it. The bridge is now ~15 lines of glue.

- [ ] **Step 4: Run** the test — expect PASS.

- [ ] **Step 5: Commit.**
  ```bash
  git add apps/admin/src/mocks/realHandlers.ts apps/admin/src/mocks/realHandlers.test.ts
  git commit -s -m "feat(admin): add MSW bridge handlers for side-effect integration tests (PR 4.1b)"
  ```

### 2.7 Task: Integration test — Shell renders

**Files.** Create: `tests/integration/apps/admin/shell.test.tsx`.

**Why.** Spec §7.6 acceptance gate. Confirms App + Shell + StrictMode wire together without throwing.

- [ ] **Step 1: Create the test.** Use a relative path import (cross-package deep imports via `@snowboard-trip-advisor/admin-app/<file>` are banned by `eslint.config.js:218-228`; the `apps/admin/package.json` does not declare an `exports` map). The integration tests directory imports apps via relative paths — match the existing `tests/integration/apps/public/` pattern.
  ```tsx
  // tests/integration/apps/admin/shell.test.tsx
  import { render, screen } from '@testing-library/react'
  import { describe, expect, it } from 'vitest'

  // Default-import: App.tsx exports default. Match apps/admin/src/App.test.tsx's import shape.
  import App from '../../../apps/admin/src/App'

  describe('admin Shell', () => {
    it('renders without errors', (): void => {
      render(<App />)
      expect(screen.getByRole('main')).toBeInTheDocument()
    })

    it('renders the placeholder header + nav landmarks', (): void => {
      render(<App />)
      expect(screen.getByRole('banner')).toBeInTheDocument()
      expect(screen.getByRole('navigation')).toBeInTheDocument()
    })
  })
  ```

- [ ] **Step 2: Run** `npm run test:integration` — expect PASS.

- [ ] **Step 3: Commit.**
  ```bash
  git add tests/integration/apps/admin/shell.test.tsx
  git commit -s -m "test(admin): add Shell render integration test (PR 4.1b)"
  ```

### 2.8 Task: PR 4.1b polish + open

- [ ] **Step 1: Run** `npm run qa` — expect green.
- [ ] **Step 2: Boot smoke.** `npm run dev:admin & sleep 3 && curl -sS http://127.0.0.1:5174/api/resorts | jq .` — expect `{ "error": { "code": "not-implemented", ... } }`. Then `curl -sS -X POST http://127.0.0.1:5174/api/resorts/__all__/publish -H 'Content-Type: application/json' -d '{"confirm":true}'` — expect 501.  Kill the dev server.
- [ ] **Step 3: Push branch + open PR.** Same template as 1.8 step 3, scoped to 4.1b.
- [ ] **Step 4: Post `@codex review`**, fold findings, reply with SHAs.
- [ ] **Step 5: Run local acceptance.**
  ```bash
  npm run qa
  npm run dev:admin  # background; curl 6 endpoints; verify 501 + envelope; stop server
  npm run test:integration -- shell
  ```
- [ ] **Step 6: Dispatch subagent reviewer per §2.99.** Fold; surface to maintainer.

### 2.99 Subagent reviewer brief — PR 4.1b

```
Subject: Subagent review — Epic 4 PR 4.1b (Vite middleware skeleton + Shell).

Context. PR 4.1b lands the Vite plugin (vite-plugin-admin-api.ts) with a flat
dispatch helper, 7 stub handlers (6 endpoints + workspace.ts), the placeholder
Shell, and the tiered MSW harness (server.ts canned + realHandlers.ts bridge).
Spec: docs/superpowers/specs/2026-05-01-epic-4-admin-app-design.md §3.1 (binding),
§6.3 (testing strategy), §7.6 (PR 4.1b deliverables), §10.1 (middleware process
model), §10.9 (cold-start lazy-create). Plan section 2 of
docs/superpowers/plans/2026-05-02-epic-4-tier-1-foundation-plan.md.

Your job: independent review of three load-bearing things.

1. The `dispatch` helper IS the unit-tested adapter, the Vite plugin lifecycle
   adapter (configureServer) is the ONLY coverage-excluded code (with /* v8
   ignore */ + WHY rationale per ai-clean-code-adherence §4). Verify there is
   no other coverage exclusion. Verify the dispatch route table has no module-
   level mutable state.

2. apps/admin/vite.config.ts binds 127.0.0.1:5174 strictPort:true; index.html
   has lang + description and NO CSP meta (spec §10.6); the admin app is not
   imported anywhere outside its own workspace.

3. mocks/realHandlers.ts re-uses dispatch (does not duplicate route logic);
   bridgeHandlers(workspaceDir) threads the per-test workspace tmpdir to the
   handler; the file-level header comment matches spec §7.6 verbatim and makes
   the test-only intent unambiguous. The test asserts the bridge actually
   invokes the real handler stub (501 response with not-implemented code).

Cite file:line for every finding. Verdict: APPROVED or REQUEST CHANGES with
P0/P1 list. Hard cap 60 lines.
```

---

## 3. PR 4.1c — Design-system additions: Sidebar, StatusPill, Tabs, Popover, DropdownMenu

**Branch.** `epic-4/pr-4.1c-design-system`. **Worktree.** `.worktrees/epic-4-pr-4.1c/`. **Depends on.** PR 4.0 + PR 4.1b merged. **Rebase from `origin/main`** after 4.1b lands.

**README.** Evaluation only (admin internal). **Subagent review.** YES (`packages/design-system/**`).

**PR sizing acknowledgment.** This PR ships 5 components ≈ 12 files, exceeding the standard ≤8-files target. Epic 3 PR 3.2 precedent applies (spec §7.7) — design-system fan-out is one concern; splitting into 5 PRs would multiply CI cost and review fragmentation without improving reviewability.

**Acceptance gate** (spec §7.7):
- `npm run qa` green.
- Each new component renders + axe-clean per variant.
- Shell shows the actual chrome (not placeholders).

**Commit budget** (per `feedback_atomic_prs.md` ≤5 commits / PR). Final commit map for PR 4.1c:

  1. `feat(design-system): add Sidebar + StatusPill components` (§3.1 + §3.2)
  2. `feat(design-system): add Tabs + Popover primitives` (§3.3 + §3.4)
  3. `feat(design-system): add DropdownMenu component (consumes Popover)` (§3.5)
  4. `feat(design-system): re-export new components + primitives via barrel` (§3.6 step 1)
  5. `feat(admin): wire real Sidebar + DropdownMenu into Shell` (§3.6 step 2)

Squash recipe identical in shape to §1's: `git reset --soft <merge-base>` then replay 5 staged-commit pairs.

### 3.0 File inventory + per-file dependency declaration

| File | Imports | Public surface | Internal state |
|---|---|---|---|
| `packages/design-system/src/components/Sidebar.tsx` (create) | `react`, `./design-tokens` (existing) | exports `<Sidebar items, activeHref?>` | none |
| `packages/design-system/src/components/Sidebar.test.tsx` (create) | `vitest`, `@testing-library/react`, `jest-axe`, `Sidebar` | (tests) | none |
| `packages/design-system/src/components/StatusPill.tsx` (create) | `react`, tokens | exports `<StatusPill variant>` | none |
| `packages/design-system/src/components/StatusPill.test.tsx` (create) | similar + `jest-axe` for all 4 variants | (tests) | none |
| `packages/design-system/src/primitives/Tabs.tsx` (create) | `react`, tokens | exports `<Tabs>`, `<TabList>`, `<Tab>`, `<TabPanel>` | per-instance ID counter via `useId` (NOT module-level) |
| `packages/design-system/src/primitives/Tabs.test.tsx` (create) | similar + keyboard nav assertions | (tests) | none |
| `packages/design-system/src/primitives/Popover.tsx` (create) | `react`, tokens | exports `<Popover anchor, open, onOpenChange>` | none |
| `packages/design-system/src/primitives/Popover.test.tsx` (create) | similar + focus-trap assertions | (tests) | none |
| `packages/design-system/src/components/DropdownMenu.tsx` (create) | `react`, `./Popover` (the primitive from this same PR) | exports `<DropdownMenu trigger, items>` | none |
| `packages/design-system/src/components/DropdownMenu.test.tsx` (create) | similar + keyboard menu nav | (tests) | none |
| `packages/design-system/src/index.ts` (modify) | the new types | barrel adds | none |
| `apps/admin/src/views/Shell.tsx` (modify) | `@snowboard-trip-advisor/design-system/Sidebar`, `DropdownMenu` | replaces placeholder | none |

### 3.1 Task: `Sidebar` component

**Files.** Test: `packages/design-system/src/components/Sidebar.test.tsx`. Create: `packages/design-system/src/components/Sidebar.tsx`.

**Why.** Spec §5.1: left-rail navigation with `aria-label` group, active-route highlight prop. Used in `Shell` (rewired in §3.6 below).

- [ ] **Step 1: Write failing tests:**
  - Renders an `<nav aria-label="Primary">` containing the supplied items.
  - Sets `aria-current="page"` on the item matching `activeHref`.
  - axe-clean (`expect(await axe(container)).toHaveNoViolations()`).
  - Items are real `<a href>` (not `<button>`), so middle-click / cmd-click open in new tab.
  - Empty `items` renders an empty nav (no crash).

- [ ] **Step 2: Run** `npm test --workspace=@snowboard-trip-advisor/design-system -- Sidebar` — expect FAIL.

- [ ] **Step 3: Implement** as a flat function component:
  ```tsx
  import { type ReactNode } from 'react'

  export type SidebarItem = { href: string; label: ReactNode }

  export function Sidebar({
    items,
    activeHref,
  }: {
    items: ReadonlyArray<SidebarItem>
    activeHref?: string
  }): ReactNode {
    return (
      <nav aria-label="Primary">
        <ul>
          {items.map((it): ReactNode => (
            <li key={it.href}>
              <a href={it.href} aria-current={it.href === activeHref ? 'page' : undefined}>
                {it.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    )
  }
  ```

- [ ] **Step 4: Run** the test — expect PASS.

- [ ] **Step 5: Commit.**
  ```bash
  git add packages/design-system/src/components/Sidebar.tsx packages/design-system/src/components/Sidebar.test.tsx
  git commit -s -m "feat(design-system): add Sidebar component (PR 4.1c)"
  ```

### 3.2 Task: `StatusPill` component (4 variants axe-clean)

**Files.** Test: `packages/design-system/src/components/StatusPill.test.tsx`. Create: `packages/design-system/src/components/StatusPill.tsx`.

**Why.** Spec §5.1: 4 named variants `Live | Stale | Failed | Manual`. Drives the editor's per-field status. Must axe-clean for all 4.

**Token mapping (no new tokens — consume existing semantic colors).** Per ai-clean-code-adherence "don't add features beyond what the task requires": `tokens.ts` already exports `success` / `warning` / `danger` / `accent` semantic colors per theme. Map StatusPill variants to existing tokens:
- `Live` → `success` (green, "everything is fresh and adapter-fed").
- `Stale` → `warning` (amber, "data is older than the staleness window").
- `Failed` → `danger` (red, "adapter call errored or schema rejected").
- `Manual` → `accent` (blue, "analyst override; not adapter-driven").

If contrast for any variant fails axe in the live theme, the implementer adds the variant-specific token (`--ds-status-{variant}-bg/fg`) and regenerates `tokens.css`. Default path is to consume existing tokens; new tokens are a fallback, not a deliverable.

- [ ] **Step 1: Write failing tests** — one render + one axe assertion per variant. Each variant maps to one of the four existing semantic tokens; assertion covers the className + the contrast (axe).

- [ ] **Step 2: Run + FAIL.**

- [ ] **Step 3: Implement.** Flat function — no variant factory; single `switch` on `variant` for the className. Map variants to existing semantic tokens (`success`/`warning`/`danger`/`accent`). If any variant's contrast fails axe (only revealed at run-time), add the variant-specific token to `tokens.ts` and regenerate `tokens.css` via `npm run tokens:generate` in the same task.

- [ ] **Step 4: Run + PASS.**

- [ ] **Step 5: Commit** `feat(design-system): add StatusPill component (4 variants axe-clean) (PR 4.1c)`.

### 3.3 Task: `Tabs` primitive (keyboard navigation)

**Files.** Test: `packages/design-system/src/primitives/Tabs.test.tsx`. Create: `packages/design-system/src/primitives/Tabs.tsx`.

**Why.** Spec §5.1: top-of-panel tab affordance, keyboard-navigable per ARIA pattern (Left/Right, Home/End). Used by 4.4b's editor (Durable / Live tabs).

- [ ] **Step 1: Write failing tests:**
  - Renders `role="tablist"`, `role="tab"` per child, `role="tabpanel"` for the active panel.
  - `aria-selected` flips on click.
  - Left-arrow on focused tab moves focus to previous tab; wraps from first to last.
  - Right-arrow moves focus next; wraps last to first.
  - Home / End jump to first / last.
  - axe-clean.

- [ ] **Step 2: Run + FAIL.**

- [ ] **Step 3: Implement** as `Tabs` + `TabList` + `Tab` + `TabPanel` compound components.

  **State propagation via Context, mirroring Epic 3's `ToggleButtonGroup.tsx`.** Per ai-clean-code-adherence: "Existing repo patterns you are extending still win over greenfield principles — match the surrounding code." `ToggleButtonGroup` is the canonical compound-component pattern in this repo; `Tabs` mirrors its shape. The state (`activeIdx` + `setActiveIdx`) is lifted into `<Tabs>` via `useState`, exposed to descendants through a small internal Context provider. `TabPanel` reads `activeIdx` from Context and renders `null` if not active.

  Why Context here, not prop-drilling: `<Tabs>` → `<TabList>` → `<Tab>` is 3 levels; adding `<TabPanel>` siblings to `<Tabs>` makes it 2 levels in one branch and 3 in another — prop-drilling that asymmetry produces awkward APIs. Context is the standard React pattern for compound widgets. The ai-clean-code rule against external stores does NOT apply to component-local Context (no module-level state, no global subscription).

- [ ] **Step 4: Run + PASS.**

- [ ] **Step 5: Commit** `feat(design-system): add Tabs primitive with keyboard nav (PR 4.1c)`.

### 3.4 Task: `Popover` primitive

**Files.** Test: `packages/design-system/src/primitives/Popover.test.tsx`. Create: `packages/design-system/src/primitives/Popover.tsx`.

**Why.** Spec §5.1: anchored floating panel; used in 4.4b's `FieldRow` for the per-field actions dropdown. Distinct from `DropdownMenu` (which composes this).

- [ ] **Step 1: Write failing tests:**
  - Renders nothing when `open={false}`.
  - Renders content when `open={true}`.
  - Dismiss on Escape calls `onOpenChange(false)`.
  - Outside-click dismisses.
  - Focus is trapped inside the popover when open (per WAI-ARIA practice — first focusable element receives focus on open).
  - axe-clean.

- [ ] **Step 2: Run + FAIL.**

- [ ] **Step 3: Implement.** Use the existing `Modal.tsx` primitive (`packages/design-system/src/primitives/Modal.tsx`) as a reference for focus-trap + dismiss patterns. Popover differs from Modal in having an anchor element (positioned relative) rather than centered overlay. Use `useRef` + `useEffect` for keyboard / outside-click listeners; cleanup on close.

- [ ] **Step 4: Run + PASS.**

- [ ] **Step 5: Commit** `feat(design-system): add Popover primitive (PR 4.1c)`.

### 3.5 Task: `DropdownMenu` component

**Files.** Test: `packages/design-system/src/components/DropdownMenu.test.tsx`. Create: `packages/design-system/src/components/DropdownMenu.tsx`.

**Why.** Spec §5.1: keyboard-navigable menu used in HeaderBar for user identity + Sources/Integrations/History links. Distinct from `Popover` (menu items vs. arbitrary content).

- [ ] **Step 1: Write failing tests:**
  - Renders `<button aria-haspopup="menu" aria-expanded>` trigger.
  - Click trigger opens; `<ul role="menu">` contains items as `<li role="menuitem">`.
  - Down-arrow on open focuses first item; cycles via Down/Up.
  - Enter on a focused item invokes its `onSelect` and closes.
  - Escape closes.
  - axe-clean.

- [ ] **Step 2: Run + FAIL.**

- [ ] **Step 3: Implement.** Compose `Popover` (the primitive from §3.4) + a flat menu list. State (open/closed, focused index) is `useState` + `useRef`. NO external positioning library — semantic absolute positioning is fine for Phase 1.

- [ ] **Step 4: Run + PASS.**

- [ ] **Step 5: Commit** `feat(design-system): add DropdownMenu component (PR 4.1c)`.

### 3.6 Task: design-system barrel + Shell rewire

**Files.** Modify: `packages/design-system/src/index.ts`, `apps/admin/src/views/Shell.tsx`.

**No `App.test.tsx` churn.** Landmarks `banner`/`navigation`/`main` are stable across the placeholder→real-chrome transition (the §2.4 placeholder Shell already uses real `<header role="banner">`, `<nav aria-label="Primary">`, `<main>` — only the contents inside the landmarks change in this PR). The test from §2.4 step 1 (`renders inside the Shell wrapper`) keeps passing without modification.

- [ ] **Step 1: Update the design-system barrel** to re-export `Sidebar`, `StatusPill`, `Tabs` + sub-components, `Popover`, `DropdownMenu`.

- [ ] **Step 2: Modify `apps/admin/src/views/Shell.tsx`** to consume the real `<Sidebar>` and `<DropdownMenu>` (in HeaderBar). **Use the existing design-system `<Button>`** for the DropdownMenu trigger — `eslint.config.js:235-261` bans raw `<button>` in `apps/**/*.{ts,tsx}` (the existing apps-block rule), so the DropdownMenu trigger MUST be a DS `<Button>`, not a raw `<button>`:
  ```tsx
  import { Button, DropdownMenu, Sidebar } from '@snowboard-trip-advisor/design-system'
  import type { ReactNode } from 'react'

  const SIDEBAR_ITEMS = [
    { href: '/', label: 'Dashboard' },
    { href: '/resorts', label: 'Resorts' },
    { href: '/publishes', label: 'Publishes' },
  ] as const

  export function Shell({ children }: { children: ReactNode }): ReactNode {
    return (
      <div className="app-shell">
        <header role="banner">
          Admin
          <DropdownMenu
            trigger={<Button>Account</Button>}
            items={[
              { onSelect: (): void => {}, label: 'Sources' },
              { onSelect: (): void => {}, label: 'Integrations' },
              { onSelect: (): void => {}, label: 'History' },
            ]}
          />
        </header>
        <Sidebar items={SIDEBAR_ITEMS} />
        <main>{children}</main>
      </div>
    )
  }
  ```

  Note on `<Sidebar>`'s internal `<a href>`: those raw anchors live in `packages/design-system/src/components/Sidebar.tsx`, NOT in `apps/admin/**`. The `apps/**`-scoped raw-HTML rule does not apply to design-system code (`packages/design-system/**` is exempt by file scope). `<Sidebar>` consuming raw `<a>` is intentional; it's the design-system primitive that wraps the raw element with the right ARIA attributes, so consumers in `apps/**` consume `<Sidebar>` (not raw `<a>`).

- [ ] **Step 3: Run** `npm run qa` — expect green; specifically:
  - `App.test.tsx` still passes (landmarks `banner`, `navigation`, `main` are stable).
  - `tests/integration/apps/admin/shell.test.tsx` still passes.

- [ ] **Step 4: Commit.**
  ```bash
  git add packages/design-system/src/index.ts apps/admin/src/views/Shell.tsx
  git commit -s -m "feat(admin): wire real Sidebar + DropdownMenu into Shell (PR 4.1c)"
  ```

### 3.7 Task: PR 4.1c polish + open

- [ ] **Step 1: Run** `npm run qa` — expect green.

- [ ] **Step 2: Run** `npm run test --workspace=@snowboard-trip-advisor/design-system` — verify all 5 new component suites pass.

- [ ] **Step 3: Visual + a11y smoke via Playwright MCP** (per `feedback_local_test_per_pr.md`: execute, do not just describe). Run these tool calls in order from the plan-executing session:

  1. `Bash` (background): `npm run dev:admin` — start dev server.
  2. `mcp__playwright__browser_navigate` with `url: "http://127.0.0.1:5174/"` — load the admin SPA.
  3. `mcp__playwright__browser_snapshot` — capture accessibility tree; verify presence of:
     - `role="navigation"` containing the 3 sidebar items (Dashboard / Resorts / Publishes).
     - `role="banner"` containing the `<button>Account</button>` DropdownMenu trigger.
  4. `mcp__playwright__browser_click` on the Account button — verify menu opens.
  5. `mcp__playwright__browser_snapshot` — verify the menu items (Sources / Integrations / History) appear with `role="menuitem"`.
  6. `mcp__playwright__browser_press_key` with `key: "Escape"` — verify menu closes.
  7. `mcp__playwright__browser_take_screenshot` — capture for visual reference; attach to the PR comment.
  8. Kill the dev server.

  **a11y enforcement is unit-test-side, not Playwright-side.** Per spec §7.7 acceptance gate ("each new component renders + axe-clean per variant"), every design-system component's `*.test.tsx` runs `jest-axe` against every variant. That's the load-bearing a11y gate. The Playwright probe is a visual + interaction smoke; injecting `axe-core` into the live Vite-served page would require either a CDN fetch (flaky) or an `@axe-core/playwright` adapter (separate test suite under `tests/e2e/`, deferred to Epic 6 per spec §6.3 line 447). Skip axe in the MCP probe.

- [ ] **Step 4: Push branch + open PR.** Body cites the PR-sizing-acknowledgment from spec §7.7 (Epic 3 PR 3.2 precedent).

- [ ] **Step 5: Post `@codex review`**, fold findings, reply with SHAs.

- [ ] **Step 6: Dispatch subagent reviewer per §3.99.** Fold; surface to maintainer.

### 3.99 Subagent reviewer brief — PR 4.1c

```
Subject: Subagent review — Epic 4 PR 4.1c (design-system additions).

Context. PR 4.1c lands 5 design-system components/primitives (Sidebar,
StatusPill, Tabs, Popover, DropdownMenu) and rewires the admin Shell to consume
them. Spec: docs/superpowers/specs/2026-05-01-epic-4-admin-app-design.md §5.1 +
§7.7. Plan section 3 of
docs/superpowers/plans/2026-05-02-epic-4-tier-1-foundation-plan.md.

Your job: independent review of three load-bearing things.

1. axe-clean coverage. Each component test runs jest-axe across every variant
   that affects color/contrast. StatusPill specifically must axe-clean across
   all 4 variants (Live, Stale, Failed, Manual). Cite each axe-test by file:line.

2. Keyboard navigation conforms to WAI-ARIA practices: Tabs (Left/Right/Home/End
   arrows wrap), DropdownMenu (Down/Up cycle, Enter selects, Escape closes),
   Popover (focus-trap on open, Escape closes). Cite the test cases.

3. The components match existing repo patterns — no Context-driven external
   state stores, no factories, no module-level mutable state. Verify by reading
   ToggleButtonGroup.tsx and Modal.tsx as the canonical patterns; the new
   components should mirror the same shape.

Cite file:line for every finding. Verdict: APPROVED or REQUEST CHANGES with
P0/P1 list. Hard cap 60 lines.
```

---

## 4. What we are NOT building in Tier 1 (per ai-clean-code-adherence rubric)

Per the AI clean-code rubric: explicitly call out the abstractions you SKIPPED, so a future agent reading the plan does not re-litigate them.

- **No `createApiClient({ fetcher })` factory.** The apiClient is a flat module of 6 async functions. MSW intercepts `fetch` at the test boundary; injecting a fetcher is the wrong trade-off (complicates runtime to simplify tests). Spec §3.2 + ai-clean-code §2.
- **No tagged-union `RequestState<T> = { kind: 'idle' } | { kind: 'loading' } | ...` for SPA call sites.** Tier 2 hooks (`useResortList`, `useHealth`) will use `T | null` + an error ref — the editor's `usePublish` (Tier 4 PR 4.5a) is the only call site that genuinely distinguishes 4+ states (`idle/publishing/success/error`), and that hook will introduce its own union. Per ai-clean-code §4 + the rubric's "Three-state union → T | null".
- **No module-level handler cache in `vite-plugin-admin-api.ts`.** The route table is a top-level `const`; no factory rebuilds it; no mutable cache. Per ai-clean-code §5: module-level mutable state is the loudest hidden dependency.
- **No abstraction layer over `fetch` in `apiClient.ts` beyond a single `request()` helper.** The 6 endpoint methods each call `request` directly with their typed parser. No interceptor chain, no retry library, no auth-token middleware (no auth in Phase 1).
- **No CSS-in-JS / styled-components for the new design-system pieces.** Match Epic 3's existing pattern: plain CSS files alongside the component (`Sidebar.css`, etc.), tokens consumed from `tokens.ts`. Adding a new styling layer for 5 components is YAGNI.
- **No router library.** App.tsx routes by URL state via the existing Epic-3 pattern (port to `apps/admin/src/lib/urlState.ts` lands in PR 4.2, not Tier 1). React Router / TanStack Router are out of scope for Phase 1.
- **No real handler logic.** The 6 endpoint handlers are 501-stubs in 4.1b. Real reads land in 4.2/4.3/4.4a; real writes land in 4.4c/4.5a.
- **No CI Dockerfile guard.** Deferred to Epic 6 per spec §10.7 + C4 fold (the existing Dockerfile is broken — `docker build` cannot ship a guard). Tier 1's CODEOWNERS-triggered subagent review on `Dockerfile` is the Phase 1 control.
- **No analyst-notes UI / endpoints.** Deferred per [ADR-0012](../../adr/0012-defer-analyst-notes-to-post-epic-4-followup.md). The `WorkspaceFile` Zod schema's `.passthrough()` makes the follow-up additive.
- **No Test/Sync UX or endpoints 4–5.** Deferred to Epic 5 per [ADR-0011](../../adr/0011-defer-test-sync-ux-to-epic-5.md).

---

## 5. Tier 1 → Tier 2 transition

After PR 4.1c merges:

1. Verify the Tier 1 → Tier 2 gate (spec §7.4 / plan header).
2. Update [the spec's executive summary](../specs/2026-05-01-epic-4-admin-app-design.md) ADR-in-flight wording (§0 line 6) to "merged to main" — this is one of the three follow-ups noted at spec-merge time. One-line edit; can fold into the next Tier-2 PR's polish or a separate trivial doc PR.
3. Begin drafting `docs/superpowers/plans/2026-05-XX-epic-4-tier-2-navigation-plan.md` covering PRs 4.2 + 4.3. Per the rolling-plan approach: Tier 2 plan opens once Tier 1 PR 4.1a is in maintainer-review state (so Tier-2 work is unblocked once the foundation lands); Tier 2 plan merges before Tier 1 PR 4.1c does NOT need to hold (independent doc-PRs).

---

## 6. Rollback policy

Per [parent spec §10.4](../specs/2026-04-22-product-pivot-design.md) + [ADR-0009](../../adr/0009-dco-exemption-for-dependabot.md): rollback is `git revert <merge-sha>` directly on `main`. The pre-tool-use hook ([scripts/hooks/deny-dangerous-git.sh](../../../scripts/hooks/deny-dangerous-git.sh)) blocks force-push to `main`/`master`. Worktrees with downstream Tier 2+ work rebase against post-revert `main`. DCO sign-off applies to revert commits.
