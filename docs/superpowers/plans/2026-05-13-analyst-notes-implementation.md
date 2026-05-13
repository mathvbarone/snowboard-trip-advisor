# Analyst Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship per-resort, per-field Markdown analyst notes for the admin workspace as a 9-PR stack against the merged spec [`docs/superpowers/specs/2026-05-12-analyst-notes-followup-design.md`](../specs/2026-05-12-analyst-notes-followup-design.md).

**Architecture:** New `AnalystNote` Zod schema on `WorkspaceFile.notes`; new `GET/PUT /api/analyst-notes/:slug` handlers wrapped in a per-slug `withSlugLock` mutex; shared `renderAnalystNoteMarkdown` (`unified` + `rehype-sanitize`) used by both server (authoritative) and client (live preview); per-path `useAnalystNoteDraft` write hook mirroring K1 (PR 4.6c) machinery; lazy-loaded `AnalystNoteSection` inline expandable UI on every Resort `FieldRow`. The plan honors AGENTS.md PR Sizing Discipline — ≤300 LOC / ≤5 commits / ≤8 files per PR, with N.b3b (~400 LOC) and N.c2 (~450 LOC) documented inseparable-concern exceptions per spec §7.1.

**Tech Stack:** Zod v4 (schema), `unified` + `remark-parse` + `remark-gfm` + `remark-rehype` + `rehype-raw` + `rehype-external-links` + `rehype-sanitize` + `rehype-stringify` (Markdown pipeline), `fast-check` (fuzz), Vitest (test runner), React 19 (auto-batching), `useSyncExternalStore` (state plumbing — mirrors existing hooks), Hono-shaped Vite middleware (server).

---

## 0. How to use this plan

Each PR section below is self-contained:
- **Files:** create / modify / test paths.
- **Tasks:** bite-sized TDD steps (2–5 min each), checkbox-tracked.
- **Per-PR workflow:** Subagent Review gate (when triggered), Codex review babysitting, local test plan.

Implement PRs in dependency order (see §1.4). Within a PR, do steps top-to-bottom. **Do not batch steps.** Mark each step complete the moment it's done. If a step fails, stop and fix; do not advance.

All code shown in this plan is the engineer's value-add (mostly tests). For implementation code already specified in the spec, the plan references the spec by section anchor (e.g., "implement per spec §3.2") instead of re-quoting — drift between plan and spec is the failure mode. **Read the cited spec section before implementing.**

---

## 1. Cross-cutting discipline

### 1.1 TDD ordering (every task)

For every behaviour change:

1. Write the failing test (red).
2. Run the test, confirm it fails for the expected reason (no false greens, no syntax-error false reds).
3. Write the **minimum** implementation to make it pass.
4. Run the test, confirm it passes.
5. Run the surrounding test file (or `npm run qa` for cross-package work).
6. Commit.

Per saved-memory `feedback_tdd_in_plans_and_specs.md`: the deliverable list orders tests before implementation. Never write production code with no failing test pointing at it.

### 1.2 Atomic PRs (per saved-memory `feedback_atomic_prs.md`)

- One concern per PR. Targets: ≤300 LOC, ≤5 commits, ≤8 files.
- Documented exceptions in this plan: **N.b3b** (~400 LOC, single handler + dispatch + bridge integration), **N.c2** (~450 LOC, single per-path SlugStore + comprehensive K1-mirror tests). Both inseparable-concern; do **not** further split.
- Multi-step plans split into N PRs, not one bundled PR.
- Stack PRs against each other when there's a hard dependency order (§1.4).

### 1.3 Per-PR workflow (per saved-memories `feedback_codex_review_per_pr.md` + `feedback_local_test_per_pr.md`)

After implementation lands on the branch and tests pass locally:

1. Open PR with TDD + Subagent-Review (where triggered) summary in the body.
2. Post `@codex review` comment.
3. Wait ~5 min for Codex output.
4. **CRITICAL** — sweep unresolved findings via GraphQL `reviewThreads` query (NOT REST `/issues/<N>/comments` — that endpoint is not authoritative). Use:
   ```bash
   gh api graphql -f query='query($owner:String!,$repo:String!,$num:Int!){
     repository(owner:$owner,name:$repo){
       pullRequest(number:$num){
         reviewThreads(first:100){nodes{isResolved comments(first:10){nodes{author{login} body path line}}}}
       }
     }
   }' -F owner=mathvbarone -F repo=snowboard-trip-advisor -F num=$PR | \
     jq '.data.repository.pullRequest.reviewThreads.nodes
         | map(select(.isResolved == false))'
   ```
5. Fold all findings on the same branch in a single commit. Reply to each thread with the fix commit SHA.
6. Repeat 2–5 until Codex returns no MUST-FIX / SHOULD-FIX.
7. Generate a tailored local-test plan (`npm run qa`, build smoke, dev probes, Playwright MCP browser checks where UI ships) AND **execute it yourself**. Don't just describe steps; run them and report findings.
8. Request maintainer merge.

### 1.4 Dependency graph (per spec §7.1 / §7.2)

```
N.a  (schema)
  ├── N.b1 (sanitizer) ────────┐
  ├── N.b2 (API + apiClient) ──┤   parallel-capable
  └── N.b3a (withSlugLock) ────┘
                  │
                  └── N.b3b (handler) ── (depends on N.b1, N.b2, N.b3a)
                                              │
                                              │
                            N.c1 (read hook + flushAll) ── depends on N.b2
                                              │
                            N.c2 (write hook) ── depends on N.c1
                                              │
                            N.c3 (flushAll refactor) ── depends on N.c2
                                              │
                            N.c4 (UI + bridge) ── depends on N.c3 + N.b3b
```

N.b1, N.b2, N.b3a may run in parallel after N.a merges. Everything else is strictly serial.

### 1.5 Subagent Review trigger (per AGENTS.md §60)

PRs marked **YES (mech.)** trigger Subagent Review automatically (path-based: `packages/schema/**`, `docs/superpowers/specs/**`, `docs/adr/**`). PRs marked **YES (disc.)** invoke it discretionarily (document the reason in the PR body). Trigger BEFORE opening the PR for human review — fold the subagent's findings first, then open with the subagent-review-clean diff.

| PR | Mech. trigger | Disc. trigger |
|---|---|---|
| N.a | `packages/schema/**` | — |
| N.b1 | `packages/schema/**` + `docs/adr/**` + `docs/superpowers/specs/**` | — |
| N.b2 | `packages/schema/**` | — |
| N.b3a | — | Load-bearing concurrency primitive + retrofit of CODEOWNERS-protected handler |
| N.b3b | — | New server endpoint + cross-handler concurrency assertion |
| N.c1, N.c2, N.c3, N.c4 | — | — |

### 1.6 Coverage + qa gates

- 100% × 4 line/branch/function/statement coverage throughout.
- `npm run qa` runs pre-commit (per the SessionStart hook); must pass before any commit succeeds.
- `npm run test:hooks` and `npm run test:integration` are part of `qa`; bridge-integration tests in N.b3b and N.c4 land here.

### 1.7 DCO sign-off

Every commit needs a `Signed-off-by:` trailer. The `prepare-commit-msg` hook auto-appends it when `git config user.email` is set. Verify after the first commit; CI's `dco` check fails the PR otherwise.

---

## 2. File structure

Per ai-clean-code-adherence §5: every new file declares imports, public surface, and internal state up front. Per ai-clean-code-adherence §1: related logic, state, UI in the same file unless split is justified.

### 2.1 Files created

| Path | PR | Imports | Public surface | Module-level state |
|---|---|---|---|---|
| `packages/schema/src/analystNote.ts` | N.a | `zod`, `./branded` (`ISODateTimeString`) | `NotePath`, `AnalystNote`, `AnalystNotesMap` (Zod schemas + inferred types) | none |
| `packages/schema/src/markdownSanitizeSchema.ts` | N.b1 | `rehype-sanitize` (`defaultSchema`, `Schema` type) | `analystNoteSanitizeSchema: Schema`, `ID_CLOBBER_PREFIX: 'analyst-'` | none (frozen `Schema` literal) |
| `packages/schema/src/markdown.ts` | N.b1 | `unified`, `remark-parse`, `remark-gfm`, `remark-rehype`, `rehype-raw`, `rehype-external-links`, `rehype-sanitize`, `rehype-stringify`, `unist-util-visit`, `./markdownSanitizeSchema` | `renderAnalystNoteMarkdown(markdown: string): string`, `processor` (test-only export for plugin-order pin) | `processor` — frozen `unified()` pipeline built once at module load |
| `packages/schema/src/markdown.test.ts` | N.b1 | `vitest`, `./markdown` (processor, renderer), `parse5` or `cheerio` (AST assertions) | — | none |
| `packages/schema/src/markdown.fuzz.test.ts` | N.b1 | `vitest`, `fast-check`, `./markdown`, parse5 / cheerio | — | none |
| `packages/schema/api/analystNotes.ts` | N.b2 | `zod`, `../src/branded` (`ResortSlug`), `../src/analystNote` (`AnalystNote`, `NotePath`), `./resortDetail` (`ResortSlugParam` — REUSE, do not redefine) | `AnalystNotesGetResponse`, `AnalystNoteUpsertBody`, `AnalystNoteUpsertResponse` (+ inferred types) | none |
| `apps/admin/server/analystNotes.ts` | N.b3b | `node:path`, `node:fs/promises`, `@snowboard-trip-advisor/schema/markdown`, `@snowboard-trip-advisor/schema/api`, `./workspace` (`readWorkspaceFileForSlug`, `readPublishedDocOrNull`, `atomicWriteWorkspaceFile`, `withSlugLock`), error types | `analystNotesGet`, `analystNotesPut` | none |
| `apps/admin/src/state/useAnalystNotes.ts` | N.c1 | `react`, `@snowboard-trip-advisor/schema/api`, `../lib/apiClient` | `useAnalystNotes(slug)`, `prepopulateAnalystNotes`, `invalidateAnalystNotes` | `cachedPromises: Map<ResortSlug, Promise<...>>`, `cachedFulfilled: Map<ResortSlug, AnalystNotesGetResponse>`, `subscribers: Map<ResortSlug, Set<() => void>>` |
| `apps/admin/src/state/useAnalystNotes.hmr.ts` | N.c1 | `./useAnalystNotes` (resets) | HMR cleanup (Vite-only, dev path) | resets all three caches on hot-update |
| `apps/admin/src/state/flushAll.ts` | N.c1 | (none — pure module) | `registerSlugFlusher(slug, fn)`, `flushAllForSlug(slug)` | `flushers: Map<ResortSlug, Set<() => Promise<void> \| void>>` |
| `apps/admin/src/state/useAnalystNoteDraft.ts` | N.c2 | `react`, `../lib/apiClient`, `./useAnalystNotes` (prepopulate), `./flushAll` (registerSlugFlusher) | `useAnalystNoteDraft(slug, path)`, `setDraft`, `deleteNote`, `flushNow`, `flushAllForSlug` integration | `slugStores: Map<ResortSlug, SlugNotesStore>` (lazy-created on first read per slug; persists for process lifetime) |
| `apps/admin/src/state/useAnalystNoteDraft.hmr.ts` | N.c2 | `./useAnalystNoteDraft` | HMR cleanup | resets `slugStores` |
| `apps/admin/src/views/ResortEditor/AnalystNoteSection.tsx` | N.c4 | `react`, `@snowboard-trip-advisor/schema/markdown` (for client-side live preview), `../../state/useAnalystNotes`, `../../state/useAnalystNoteDraft`, design-system primitives (`Button`, `Textarea` [NEW], `Tooltip`) | `<AnalystNoteSection slug path />` (default export, lazy-loaded) | none |
| `docs/adr/0013-markdown-sanitizer-choice.md` | N.b1 | — | ADR document | n/a |

### 2.2 Files modified

| Path | PRs | What changes |
|---|---|---|
| `packages/schema/src/workspaceFile.ts` | N.a | Add `notes: AnalystNotesMap.default({})` to the object schema. Existing `.loose()` + `superRefine` unchanged. |
| `packages/schema/src/index.ts` (barrel) | N.a | Re-export `AnalystNote`, `NotePath`, `AnalystNotesMap` types. **Do NOT** re-export from `./markdown` (that lives behind the `./markdown` sub-export per spec §4.2). |
| `packages/schema/package.json` | N.b1 | Add `"./markdown": "./src/markdown.ts"` to `exports` map (bare-string form per existing `./node` / `./api` pattern). Add `unified`, `remark-*`, `rehype-*`, `unist-util-visit` as dependencies (NOT devDependencies — runtime use). Add `fast-check` as devDependency. |
| `packages/schema/src/exports-map.test.ts` | N.b1 | Extend snapshot to cover the new `./markdown` entry; assert bare-string shape. |
| `packages/schema/api/index.ts` (barrel) | N.b2 | Re-export `AnalystNotesGetResponse`, `AnalystNoteUpsertBody`, `AnalystNoteUpsertResponse` and inferred types. |
| Contract snapshot (`packages/schema/api/__snapshots__/*` or similar) | N.b2 | Regen via `npm run` snapshot command (verify path during execution). |
| `apps/admin/src/lib/apiClient.ts` | N.b2 | Add `getAnalystNotes(slug, {signal})` + `upsertAnalystNote(slug, body, {signal})`. Mirror existing `getResortDetail` / `upsertResort` shapes. |
| `apps/admin/server/workspace.ts` | N.b3a | Add `withSlugLock(slug, fn)` per spec §5.5 (~13 LOC). |
| `apps/admin/server/resortUpsert.ts` | N.b3a | Move read-merge-write into `withSlugLock`; carry `notes: workspaceFile?.notes ?? {}` in candidate (spec §5.6). |
| `apps/admin/server/resortUpsert.test.ts` | N.b3a | Add notes-preservation candidate-construction test (spec §5.6). |
| `apps/admin/server/dispatch.ts` | N.b3b | Register two new routes: `GET /api/analyst-notes/:slug` + `PUT /api/analyst-notes/:slug` (spec §3.4). |
| `apps/admin/src/state/useWorkspaceState.ts` | N.c3 | Replace direct `flushNow(slug)` consumer wiring with `registerSlugFlusher(slug, () => slugStore.flushAll())` at SlugStore-creation time. |
| `apps/admin/src/views/Shell.tsx` | N.c3 | `onModEnter` refactors from `useWorkspaceState.flushNow(slug)` to `void flushAllForSlug(route.slug)` (spec §5.4). |
| `apps/admin/src/views/ResortEditor/FieldRow.tsx` | N.c4 | Add notes affordance (`<Button variant="ghost" size="sm">📝 N</Button>`); lazy-load `<AnalystNoteSection>` via `React.lazy` + `<Suspense fallback={null}>` when `notesExpanded` state is true (spec §6.6). |
| `docs/superpowers/specs/2026-04-22-product-pivot-design.md` | N.b1 | §3.9 amendment per spec §11.1 (replaces "no `dangerouslySetInnerHTML`" wording with the sanctioned-boundary phrasing). |

### 2.3 What we are NOT building (per ai-clean-code-adherence §rubric)

- **No factory for the unified pipeline.** `processor` is a module-level frozen `unified()` value. Tests import it directly for the plugin-order pin. Spec §4.5's docblock pins the security invariant.
- **No `createApiClient({ fetcher })` wrapper.** `apiClient.ts` already uses the real `fetch`; new methods follow that pattern. Tests mock at the `global.fetch` boundary, not via injection.
- **No `useAnalystNoteState` wrapper hook** that bundles the read + write hooks. UI calls `useAnalystNotes(slug)` and `useAnalystNoteDraft(slug, path)` directly — visible at the call site.
- **No three-state tagged union for note state.** The write hook uses discrete fields (`status: 'dirty' | 'saving' | 'saved' | 'save-failed'`) per spec §5.1 because consumers genuinely branch on all four; this is the project's existing pattern (mirror of `useWorkspaceState`). Not a clean-code violation — match the surrounding code (ai-clean-code-adherence §rubric: "Existing repo patterns you are extending still win").
- **No `AnalystNoteEditor` + `AnalystNotePreview` split.** One `AnalystNoteSection.tsx` file holds source pane + preview pane stacked. ~250 LOC including imports.
- **No `Idempotency-Key`.** PUTs are naturally idempotent (spec §3.5).
- **No `schema_version` bump on `WorkspaceFile`.** `.loose()` + `.default({})` is the forward-compat mechanism (spec §2.3).
- **No multi-author audit field.** Phase 2.
- **No tab/window-focus refresh.** Phase 2 (spec §5.2.1).
- **No `flushAllForSlug` on route-change.** 500 ms tail latency on navigate-away is a documented Phase 2 question (spec §5.2 step 4).

---

## 3. PR N.a — Schema foundation

**Branch:** `analyst-notes/n.a-schema`
**Depends on:** `main` (this spec merged at `591d2bd`).
**LOC estimate:** ~80
**Subagent Review:** YES (mechanical — `packages/schema/**`).

### 3.1 Files

- **Create:** [packages/schema/src/analystNote.ts](packages/schema/src/analystNote.ts)
- **Create:** [packages/schema/src/analystNote.test.ts](packages/schema/src/analystNote.test.ts)
- **Modify:** [packages/schema/src/workspaceFile.ts](packages/schema/src/workspaceFile.ts)
- **Modify:** [packages/schema/src/workspaceFile.test.ts](packages/schema/src/workspaceFile.test.ts) — add Epic-4 backward-compat test
- **Modify:** [packages/schema/src/index.ts](packages/schema/src/index.ts) — barrel re-exports

### 3.2 Tasks

- [ ] **Step 1: Write failing test — `NotePath` accepts dot-separated lowercase identifiers**

```ts
// packages/schema/src/analystNote.test.ts
import { describe, it, expect } from 'vitest'
import { NotePath, AnalystNote, AnalystNotesMap } from './analystNote'

describe('NotePath', () => {
  it.each([
    ['slopes_km', true],
    ['altitude_m.min', true],
    ['region', true],
    ['Slopes_KM', false],            // capital — reject
    ['1slopes', false],              // leading digit — reject
    ['', false],                     // empty — reject
    ['.slopes', false],              // leading dot — reject
    ['slopes.', false],              // trailing dot — reject
    ['slopes..km', false],           // double dot — reject
    ['__proto__', false],            // prototype-pollution guard
    ['nested.__proto__', false],     // nested guard
    ['constructor', false],          // prototype-pollution guard
    ['toString', false],             // prototype-pollution guard
  ])('NotePath.safeParse(%s) → %s', (input, ok) => {
    expect(NotePath.safeParse(input).success).toBe(ok)
  })
})
```

- [ ] **Step 2: Run test, verify it fails with "Cannot find module './analystNote'"**

```bash
npm --workspace=packages/schema run test -- analystNote.test.ts
```

- [ ] **Step 3: Implement `NotePath`, `AnalystNote`, `AnalystNotesMap` per spec §2.1 verbatim**

Copy the code block from spec §2.1 (lines 60–118 of the spec). Locked decisions: 10 KB UTF-8 cap on `markdown`, prototype-pollution guard `FORBIDDEN_PATH_SEGMENTS`, `AnalystNotesMap.default({})`.

- [ ] **Step 4: Run NotePath tests, verify pass**

```bash
npm --workspace=packages/schema run test -- analystNote.test.ts
```

- [ ] **Step 5: Write failing test — `AnalystNote` enforces 10 KB UTF-8 cap**

```ts
describe('AnalystNote.markdown', () => {
  it('accepts 10,000-byte UTF-8 body', () => {
    const note = {
      schema_version: 1, created_at: '2026-05-13T00:00:00.000Z',
      updated_at: '2026-05-13T00:00:00.000Z', markdown: 'a'.repeat(10_000),
    }
    expect(AnalystNote.safeParse(note).success).toBe(true)
  })

  it('rejects 10,001-byte UTF-8 body', () => {
    const note = {
      schema_version: 1, created_at: '2026-05-13T00:00:00.000Z',
      updated_at: '2026-05-13T00:00:00.000Z', markdown: 'a'.repeat(10_001),
    }
    expect(AnalystNote.safeParse(note).success).toBe(false)
  })

  it('rejects 4-byte emoji that pushes byte length over the cap', () => {
    // '🎿' is 4 UTF-8 bytes; 2_500 copies = 10_000 bytes; 2_501 = 10_004
    const note = {
      schema_version: 1, created_at: '2026-05-13T00:00:00.000Z',
      updated_at: '2026-05-13T00:00:00.000Z', markdown: '🎿'.repeat(2_501),
    }
    expect(AnalystNote.safeParse(note).success).toBe(false)
  })
})
```

- [ ] **Step 6: Run + verify pass** (implementation already done in step 3)

```bash
npm --workspace=packages/schema run test -- analystNote.test.ts
```

- [ ] **Step 7: Write failing test — `AnalystNotesMap` defaults to empty object**

```ts
describe('AnalystNotesMap', () => {
  it('defaults to empty object when key missing', () => {
    expect(AnalystNotesMap.parse(undefined)).toStrictEqual({})
  })
})
```

- [ ] **Step 8: Run + verify pass**

- [ ] **Step 9: Write failing test — `WorkspaceFile` accepts Epic-4-era fixtures without notes**

```ts
// packages/schema/src/workspaceFile.test.ts (extend, do not replace)
import { readFileSync } from 'node:fs'
import { WorkspaceFile } from './workspaceFile'

it('parses Epic-4-era workspace fixtures without notes; notes defaults to empty map', () => {
  const epicFourFixture = JSON.parse(readFileSync(
    'tests/fixtures/admin-workspace/kotelnica-bialczanska.json',  // verify path during execution
    'utf-8',
  ))
  const wf = WorkspaceFile.parse(epicFourFixture)
  expect(wf.notes).toStrictEqual({})
})
```

If the fixture path doesn't exist, locate an Epic-4 fixture: `git ls-files | grep admin-workspace.*json`. Update the path in the test.

- [ ] **Step 10: Run test, verify it fails with "Cannot read properties of undefined (reading 'notes')" or Zod parse error**

- [ ] **Step 11: Modify `workspaceFile.ts` per spec §2.2 — add `notes: AnalystNotesMap` to the object schema**

Locate the `z.object({...})` call. Add `notes: AnalystNotesMap` as a top-level key. The `.loose()` + `.superRefine` block stays unchanged.

- [ ] **Step 12: Run workspace-file tests, verify pass**

```bash
npm --workspace=packages/schema run test -- workspaceFile.test.ts
```

- [ ] **Step 13: Update barrel `packages/schema/src/index.ts` — re-export `NotePath`, `AnalystNote`, `AnalystNotesMap` (types + values)**

Check that no test in this workspace yet imports the new names from the barrel; barrel re-export is forward-looking for N.c1+.

- [ ] **Step 14: Run full schema-package test suite**

```bash
npm --workspace=packages/schema run test
```

Expected: PASS, including any contract / barrel / exports-map tests already pinned.

- [ ] **Step 15: Run full `npm run qa`**

```bash
npm run qa
```

Expected: PASS (lint + typecheck + coverage + tokens + hooks + integration).

- [ ] **Step 16: Commit + open PR**

```bash
git add packages/schema/src/analystNote.ts packages/schema/src/analystNote.test.ts \
        packages/schema/src/workspaceFile.ts packages/schema/src/workspaceFile.test.ts \
        packages/schema/src/index.ts
git commit -m "Analyst notes PR N.a — schema foundation (AnalystNote + WorkspaceFile.notes)"
```

- [ ] **Step 17: Verify DCO trailer landed on the first commit** (one-time check — confirms the `prepare-commit-msg` hook is wired correctly before depending on it for 9 PRs)

```bash
git log -1 --format='%(trailers)'
```

Expected output contains `Signed-off-by: <name> <email>`. If empty, fix git identity (`git config user.email`) + re-run the commit before opening the PR; CI's `dco` check fails otherwise.

### 3.3 Subagent Review

Mechanical. Dispatch a schema-domain reviewer before opening PR:

> Review `packages/schema/src/analystNote.ts` + the `workspaceFile.ts` diff against spec §2 of `docs/superpowers/specs/2026-05-12-analyst-notes-followup-design.md`. Check: prototype-pollution guard list completeness, UTF-8 byte counting uses TextEncoder (not Buffer.byteLength), `AnalystNotesMap.default({})` is on the map (not the value), backward-compat with Epic-4 fixtures, Zod v4 idioms.

Fold findings; do not open PR until clean.

### 3.4 Codex + local test

Per §1.3. Local test plan: `npm --workspace=packages/schema run test`, `npm run qa`. No UI or browser checks for N.a.

---

## 4. PR N.b1 — Sanitizer + ADR-0013 + parent-spec amendment

**Branch:** `analyst-notes/n.b1-sanitizer`
**Depends on:** N.a (uses `AnalystNote` for type annotation on testbed inputs in fuzz tests).
**LOC estimate:** ~250
**Subagent Review:** YES (mechanical — `packages/schema/**` + `docs/adr/**` + `docs/superpowers/specs/**`).

### 4.1 Files

- **Create:** [packages/schema/src/markdownSanitizeSchema.ts](packages/schema/src/markdownSanitizeSchema.ts)
- **Create:** [packages/schema/src/markdown.ts](packages/schema/src/markdown.ts)
- **Create:** [packages/schema/src/markdown.test.ts](packages/schema/src/markdown.test.ts)
- **Create:** [packages/schema/src/markdown.fuzz.test.ts](packages/schema/src/markdown.fuzz.test.ts)
- **Create:** [docs/adr/0013-markdown-sanitizer-choice.md](docs/adr/0013-markdown-sanitizer-choice.md)
- **Modify:** [packages/schema/package.json](packages/schema/package.json) — exports map + deps
- **Modify:** [packages/schema/src/exports-map.test.ts](packages/schema/src/exports-map.test.ts) — pin new entry
- **Modify:** [docs/superpowers/specs/2026-04-22-product-pivot-design.md](docs/superpowers/specs/2026-04-22-product-pivot-design.md) — §3.9 amendment

### 4.2 Tasks

- [ ] **Step 1: Install dependencies**

```bash
npm --workspace=packages/schema install \
  unified remark-parse remark-gfm remark-rehype \
  rehype-raw rehype-external-links rehype-sanitize rehype-stringify \
  unist-util-visit
npm --workspace=packages/schema install --save-dev fast-check parse5
```

Verify exact versions land in `packages/schema/package.json`. Pin to exact versions (no `^`) for the security-boundary deps — spec §4.7.

- [ ] **Step 2: Write failing test — plugin-order pin**

```ts
// packages/schema/src/markdown.test.ts
import { describe, it, expect } from 'vitest'
import { processor } from './markdown'

describe('renderAnalystNoteMarkdown', () => {
  it('plugin order is the documented security invariant', () => {
    const names = processor.attachers.map((a) => a[0].name)
    expect(names).toStrictEqual([
      'remarkParse', 'remarkGfm', 'remarkRehype', 'rehypeRaw',
      'rehypeExternalLinks', 'rehypeSanitize', 'rehypeStripStrayInputs',
      'rehypeAnchorRewrite', 'rehypeStringify',
    ])
  })
})
```

- [ ] **Step 3: Run, verify fail — "Cannot find module './markdown'"**

```bash
npm --workspace=packages/schema run test -- markdown.test.ts
```

- [ ] **Step 4: Implement `markdownSanitizeSchema.ts` per spec §4.4**

Copy the Schema definition from spec §4.4 wholesale. Include `ID_CLOBBER_PREFIX = 'analyst-'`. Freeze the schema at module load:

```ts
import { defaultSchema, type Schema } from 'rehype-sanitize'

export const ID_CLOBBER_PREFIX = 'analyst-'

// Build per spec §4.4 — ADD tags, ADD attributes, protocols, clobberPrefix.
export const analystNoteSanitizeSchema: Schema = Object.freeze({
  // ... per spec §4.4
}) as Schema
```

- [ ] **Step 5: Implement `markdown.ts` — `processor`, `rehypeStripStrayInputs`, `rehypeAnchorRewrite`, `renderAnalystNoteMarkdown`**

Pull the docblock + function body from spec §4.5 verbatim. Custom passes from spec §4.1 — `rehypeStripStrayInputs` strips `<input>` elements whose attributes don't exactly match `type="checkbox"` AND `disabled` present; `rehypeAnchorRewrite` rewrites `<a href="#X">` to `<a href="#analyst-X">`. Use `unist-util-visit`.

Plugin order MUST match the test in step 2.

- [ ] **Step 6: Run plugin-order test, verify pass**

```bash
npm --workspace=packages/schema run test -- markdown.test.ts
```

- [ ] **Step 7: Write failing test — OWASP XSS corpus**

```ts
import { renderAnalystNoteMarkdown } from './markdown'
import * as parse5 from 'parse5'

function html(md: string): string {
  return renderAnalystNoteMarkdown(md)
}

function hasElement(htmlString: string, tag: string): boolean {
  return new RegExp(`<${tag}[\\s>/]`, 'i').test(htmlString)
}

describe('OWASP XSS corpus', () => {
  it.each([
    ['<script>alert(1)</script>', 'script'],
    ['<img src=x onerror=alert(1)>', 'script'],   // onerror stripped
    ['[click](javascript:alert(1))', 'script'],
    ['<iframe src="javascript:alert(1)"></iframe>', 'iframe'],
    ['<style>body{background:url(javascript:alert(1))}</style>', 'style'],
    ['<details ontoggle="alert(1)" open>x</details>', 'script'],
    ['<svg onload="alert(1)"></svg>', 'script'],
    ['<math><annotation-xml encoding="text/html"><script>alert(1)</script></annotation-xml></math>', 'script'],
    ['<iframe srcdoc="<script>alert(1)</script>"></iframe>', 'iframe'],
    ['<noscript><p title="--></noscript><script>alert(1)</script>">x</p></noscript>', 'script'],
    ['<template><script>alert(1)</script></template>', 'script'],
    ['<a href="javascript&#58;alert(1)">x</a>', 'script'],
    ['[x][y]\n\n[y]: javascript:alert(1)', 'script'],
  ])('strips %s — no %s element survives', (input, tag) => {
    const out = html(input)
    expect(hasElement(out, tag)).toBe(false)
    expect(/on[a-z]+=/i.test(out)).toBe(false)
    expect(/javascript:/i.test(out)).toBe(false)
  })
})
```

- [ ] **Step 8: Run, verify all 13 cases pass** (sanitizer + plugin order do the work)

- [ ] **Step 9: Write failing test — GFM correctness**

```ts
describe('GFM', () => {
  it('renders tables', () => {
    const out = html('| a | b |\n|---|---|\n| 1 | 2 |')
    expect(out).toContain('<table>')
    expect(out).toContain('<th>a</th>')
  })

  it('renders task list with disabled checkbox', () => {
    const out = html('- [x] done')
    // GFM task-list shape: input type=checkbox disabled checked
    expect(out).toMatch(/<input[^>]*type="checkbox"[^>]*disabled/i)
  })

  it('renders strikethrough', () => {
    expect(html('~~old~~')).toContain('<del>')
  })

  it('renders autolinks', () => {
    expect(html('https://example.com')).toContain('<a href="https://example.com"')
  })

  it('renders fenced code with language', () => {
    expect(html('```js\nx\n```')).toMatch(/<code class="language-js">/)
  })
})
```

- [ ] **Step 10: Run, verify pass**

- [ ] **Step 11: Write failing test — bare `<input>` removed by `rehypeStripStrayInputs`**

```ts
describe('rehypeStripStrayInputs', () => {
  it('removes <input type="text">', () => {
    expect(html('<input type="text" name="x">')).not.toMatch(/<input/i)
  })

  it('removes <input type="checkbox"> without disabled', () => {
    expect(html('<input type="checkbox" name="exfil">')).not.toMatch(/<input/i)
  })

  it('preserves <input type="checkbox" disabled> (GFM shape)', () => {
    // Task list emits this shape; verify the post-pass keeps it.
    expect(html('- [ ] todo')).toMatch(/<input[^>]*type="checkbox"[^>]*disabled/i)
  })
})
```

- [ ] **Step 12: Run, verify pass**

- [ ] **Step 13: Write failing test — c2-widening (kbd / details / sub / sup / abbr / figure)**

```ts
describe('allowlist widening (c2)', () => {
  it.each([
    ['<kbd>Cmd+K</kbd>', '<kbd>'],
    ['<details open>x</details>', '<details'],
    ['<sub>2</sub>', '<sub>'],
    ['<sup>3</sup>', '<sup>'],
    ['<abbr title="ETA">ETA</abbr>', '<abbr'],
    ['<figure><figcaption>x</figcaption></figure>', '<figure>'],
  ])('preserves %s → contains %s', (input, expected) => {
    expect(html(input)).toContain(expected)
  })
})
```

- [ ] **Step 14: Run, verify pass**

- [ ] **Step 15: Write failing test — DOM-clobbering prefix**

```ts
describe('DOM clobbering', () => {
  it('prefixes heading ids', () => {
    expect(html('# Hello {#hello}')).not.toMatch(/<h1 id="hello"/)
    // depending on remark-gfm support for {#id} — fallback: raw HTML
  })

  it('prefixes raw <h2 id="head">', () => {
    expect(html('<h2 id="head">x</h2>')).toContain('id="analyst-head"')
  })

  it('rewrites internal anchors via rehypeAnchorRewrite', () => {
    expect(html('[link](#section)')).toContain('href="#analyst-section"')
  })
})
```

- [ ] **Step 16: Run, verify pass**

- [ ] **Step 17: Write failing test — empty + non-string contract**

```ts
describe('renderAnalystNoteMarkdown contract', () => {
  it('returns empty string for empty input', () => {
    expect(renderAnalystNoteMarkdown('')).toBe('')
  })

  it('throws TypeError for non-string input', () => {
    expect(() => renderAnalystNoteMarkdown(null as never)).toThrow(TypeError)
    expect(() => renderAnalystNoteMarkdown(undefined as never)).toThrow(TypeError)
    expect(() => renderAnalystNoteMarkdown(42 as never)).toThrow(TypeError)
  })
})
```

- [ ] **Step 18: Run, verify pass**

- [ ] **Step 19: Write failing test — fuzz (AST-level property)**

```ts
// packages/schema/src/markdown.fuzz.test.ts
import { describe, it } from 'vitest'
import fc from 'fast-check'
import { renderAnalystNoteMarkdown } from './markdown'
import * as parse5 from 'parse5'

function findAllElements(node: parse5.DefaultTreeAdapterMap['node']): parse5.DefaultTreeAdapterMap['element'][] {
  const result: parse5.DefaultTreeAdapterMap['element'][] = []
  function walk(n: parse5.DefaultTreeAdapterMap['node']): void {
    if ('tagName' in n) result.push(n)
    if ('childNodes' in n) for (const c of n.childNodes) walk(c)
  }
  walk(node)
  return result
}

describe('renderAnalystNoteMarkdown fuzz', () => {
  it('no script-execution path survives random input', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 5000 }), (input: string): void => {
        const out = renderAnalystNoteMarkdown(input)
        const doc = parse5.parse(out)
        const elements = findAllElements(doc)

        for (const el of elements) {
          // No banned tags
          expect(['script', 'iframe', 'object', 'embed', 'form', 'style', 'noscript', 'template'])
            .not.toContain(el.tagName)

          // No on* handlers
          for (const attr of el.attrs) {
            expect(/^on[a-z]+$/i.test(attr.name)).toBe(false)
          }

          // No javascript:/vbscript:/data: in href/src/cite
          for (const attr of el.attrs) {
            if (['href', 'src', 'cite', 'xlink:href'].includes(attr.name)) {
              // Fuzz inputs can produce malformed percent-escapes (e.g. an
              // otherwise-safe `https://example.com/%` survives sanitization).
              // decodeURIComponent throws URIError on those — don't false-fail.
              // The dangerous schemes don't contain `%`, so the raw-value
              // check below catches them regardless of decode failure.
              const raw = attr.value.toLowerCase().trim()
              let decoded = raw
              try { decoded = decodeURIComponent(attr.value).toLowerCase().trim() } catch { /* malformed escape — fall back to raw */ }
              for (const scheme of ['javascript:', 'vbscript:', 'data:']) {
                expect(raw.startsWith(scheme)).toBe(false)
                expect(decoded.startsWith(scheme)).toBe(false)
              }
            }
          }

          // Every <input> has type="checkbox" AND disabled (GFM shape)
          if (el.tagName === 'input') {
            const attrs = new Map(el.attrs.map((a) => [a.name, a.value]))
            expect(attrs.get('type')).toBe('checkbox')
            expect(attrs.has('disabled')).toBe(true)
          }
        }
      }),
      { numRuns: 1000 },
    )
  })
})
```

- [ ] **Step 20: Run, verify pass with 1000 fuzz runs**

```bash
npm --workspace=packages/schema run test -- markdown.fuzz.test.ts
```

- [ ] **Step 21: Add `./markdown` to `package.json` exports map**

```jsonc
"exports": {
  ".": "./src/index.ts",
  "./node": "./src/node.ts",
  "./api": "./api/index.ts",
  "./markdown": "./src/markdown.ts"
}
```

Bare-string shape (NOT conditional-object). Per spec §4.2.

- [ ] **Step 22: Extend `packages/schema/src/exports-map.test.ts` to pin the new entry**

```ts
it('exposes ./markdown as ./src/markdown.ts (bare-string form)', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
  expect(pkg.exports['./markdown']).toBe('./src/markdown.ts')
})
```

(File is at `packages/schema/src/exports-map.test.ts`, not the package root — verified.)

- [ ] **Step 23: Run exports-map test, verify pass**

- [ ] **Step 24: Author `docs/adr/0013-markdown-sanitizer-choice.md` per spec §4.8**

Structure (six sections per spec §4.8): decision summary, rejected alternatives, allowlist tag-by-tag justification, threat model, out of scope, lift conditions. Status: `Accepted` (lands with implementation). Reference: this plan + spec §4.

- [ ] **Step 25: Amend parent spec §3.9 per spec §11.1**

Open [docs/superpowers/specs/2026-04-22-product-pivot-design.md](docs/superpowers/specs/2026-04-22-product-pivot-design.md). Find §3.9 paragraph that reads "no `dangerouslySetInnerHTML`; Markdown-to-AST parser + sanitizer" and replace with the spec §11.1 text verbatim.

- [ ] **Step 26: Run `npm run check:agent-discipline-sync`**

Required since this PR touches `docs/superpowers/specs/**` + `docs/adr/**`.

```bash
npm run check:agent-discipline-sync
```

Expected: PASS. If FAIL (drift gate), AGENTS.md / CLAUDE.md pointer integrity is off — fix the drift in the same branch.

- [ ] **Step 27: Run full `npm run qa`**

```bash
npm run qa
```

- [ ] **Step 28: Commit + open PR**

```bash
git add packages/schema/src/markdown*.ts packages/schema/src/markdownSanitizeSchema.ts \
        packages/schema/package.json packages/schema/src/exports-map.test.ts \
        docs/adr/0013-markdown-sanitizer-choice.md \
        docs/superpowers/specs/2026-04-22-product-pivot-design.md
git commit -m "Analyst notes PR N.b1 — sanitizer pipeline + ADR-0013 + parent-spec amendment"
```

### 4.3 Subagent Review

Mechanical (three triggers fire). Dispatch a security-focused reviewer:

> Review `packages/schema/src/markdown.ts` + `markdownSanitizeSchema.ts` + ADR-0013 + the parent-spec §3.9 amendment against spec §4 of `docs/superpowers/specs/2026-05-12-analyst-notes-followup-design.md`. Check: plugin order matches the §4.3 invariant exactly, `rehypeStripStrayInputs` runs AFTER `rehype-sanitize`, allowlist matches §4.4, ADR-0013 covers all six sections, parent-spec amendment text is verbatim. Flag any allowlist widening beyond §4.4.

### 4.4 Codex + local test

Per §1.3. Local test plan: schema unit tests, fuzz test (1000 runs), `npm run qa`, no UI.

---

## 5. PR N.b2 — API contract + apiClient

**Branch:** `analyst-notes/n.b2-api`
**Depends on:** N.a (uses `NotePath`, `AnalystNote` from `./src/analystNote`).
**LOC estimate:** ~120
**Subagent Review:** YES (mechanical — `packages/schema/**`).

### 5.1 Files

- **Create:** [packages/schema/api/analystNotes.ts](packages/schema/api/analystNotes.ts)
- **Create:** [packages/schema/api/analystNotes.test.ts](packages/schema/api/analystNotes.test.ts)
- **Modify:** [packages/schema/api/index.ts](packages/schema/api/index.ts) — barrel re-exports
- **Modify:** contract snapshot file (verify path via `git ls-files | grep -i 'snapshot.*api'` during execution)
- **Modify:** [apps/admin/src/lib/apiClient.ts](apps/admin/src/lib/apiClient.ts) — `getAnalystNotes` + `upsertAnalystNote`
- **Modify:** [apps/admin/src/lib/apiClient.test.ts](apps/admin/src/lib/apiClient.test.ts) — coverage for new methods

### 5.2 Tasks

- [ ] **Step 1: Write failing test — `AnalystNotesGetResponse` shape**

```ts
// packages/schema/api/analystNotes.test.ts
import { describe, it, expect } from 'vitest'
import { AnalystNotesGetResponse, AnalystNoteUpsertBody, AnalystNoteUpsertResponse } from './analystNotes'

describe('AnalystNotesGetResponse', () => {
  it('accepts valid envelope with rendered notes', () => {
    const payload = {
      slug: 'kotelnica-bialczanska',
      notes: {
        slopes_km: {
          schema_version: 1,
          markdown: 'note',
          html: '<p>note</p>',
          created_at: '2026-05-13T00:00:00.000Z',
          updated_at: '2026-05-13T00:00:00.000Z',
        },
      },
    }
    expect(AnalystNotesGetResponse.safeParse(payload).success).toBe(true)
  })

  it('rejects payload missing html on rendered note', () => {
    const payload = {
      slug: 'kotelnica-bialczanska',
      notes: { slopes_km: { schema_version: 1, markdown: 'x', created_at: '2026-05-13T00:00:00.000Z', updated_at: '2026-05-13T00:00:00.000Z' } },
    }
    expect(AnalystNotesGetResponse.safeParse(payload).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run, verify fail (module not found)**

- [ ] **Step 3: Implement `api/analystNotes.ts` per spec §3.1**

Copy schemas from spec §3.1 verbatim. `ResortSlugParam` REUSES the existing export from `./resortDetail` — do NOT redefine.

- [ ] **Step 4: Run, verify pass**

- [ ] **Step 5: Write failing tests — `AnalystNoteUpsertBody` semantics**

```ts
describe('AnalystNoteUpsertBody', () => {
  it('accepts {path, markdown: string} for upsert', () => {
    expect(AnalystNoteUpsertBody.safeParse({ path: 'slopes_km', markdown: 'x' }).success).toBe(true)
  })

  it('accepts {path, markdown: null} for delete', () => {
    expect(AnalystNoteUpsertBody.safeParse({ path: 'slopes_km', markdown: null }).success).toBe(true)
  })

  it('accepts {path, markdown: ""} for upsert-empty (NOT delete)', () => {
    expect(AnalystNoteUpsertBody.safeParse({ path: 'slopes_km', markdown: '' }).success).toBe(true)
  })

  it('rejects 10_001-byte markdown', () => {
    expect(AnalystNoteUpsertBody.safeParse({ path: 'x', markdown: 'a'.repeat(10_001) }).success).toBe(false)
  })

  it('rejects invalid NotePath (capital)', () => {
    expect(AnalystNoteUpsertBody.safeParse({ path: 'Slopes', markdown: 'x' }).success).toBe(false)
  })
})
```

- [ ] **Step 6: Run, verify pass**

- [ ] **Step 7: Update barrel `packages/schema/api/index.ts` — re-export the three schemas + inferred types**

- [ ] **Step 8: Regen contract snapshot**

Locate the snapshot test/file:

```bash
git ls-files packages/schema | grep -i snapshot
```

Run whatever script regenerates it (likely `npm --workspace=packages/schema run test -- -u`). Verify the new types appear in the snapshot diff. Inspect `git diff packages/schema` — the snapshot diff must be **additive only**: new entries for the three new schemas, NO existing entries mutated. If an existing entry changed, the snapshot regen tripped over an unintended change and must be investigated before continuing.

- [ ] **Step 9: Write failing test — `apiClient.getAnalystNotes` happy path**

The existing `apps/admin/src/lib/apiClient.test.ts` uses MSW + `HttpResponse.json` (NOT raw `global.fetch` mocks); MSW lifecycle is wired in `apps/admin/src/test-setup.ts` (PR 4.1b §2.5). Per-test overrides via `server.use(...)`. The real `request()` reads `await res.text()` then `JSON.parse(text)` — raw `{ json: async () => ... }` mocks would fail with `res.text is not a function`. Match the surrounding pattern:

```ts
// apps/admin/src/lib/apiClient.test.ts (extend — server + http/HttpResponse already imported at top)
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import { apiClient, ApiClientError } from './apiClient'

describe('apiClient.getAnalystNotes (PR N.b2)', () => {
  it('GETs /api/analyst-notes/:slug and returns parsed response', async (): Promise<void> => {
    const payload = {
      slug: 'kotelnica-bialczanska',
      notes: {
        slopes_km: {
          schema_version: 1, markdown: 'x', html: '<p>x</p>',
          created_at: '2026-05-13T00:00:00.000Z',
          updated_at: '2026-05-13T00:00:00.000Z',
        },
      },
    }
    server.use(http.get('/api/analyst-notes/kotelnica-bialczanska', () => HttpResponse.json(payload)))
    const result = await apiClient.getAnalystNotes('kotelnica-bialczanska' as never)
    expect(result).toStrictEqual(payload)
  })

  it('threads AbortSignal through to the request', async (): Promise<void> => {
    const controller = new AbortController()
    let receivedSignal: AbortSignal | null = null
    server.use(http.get('/api/analyst-notes/x', ({ request }) => {
      receivedSignal = request.signal
      return HttpResponse.json({ slug: 'x', notes: {} })
    }))
    await apiClient.getAnalystNotes('x' as never, { signal: controller.signal })
    expect(receivedSignal).not.toBeNull()
  })
})
```

- [ ] **Step 10: Run, verify fail (method not defined)**

- [ ] **Step 11: Implement `getAnalystNotes` + `upsertAnalystNote` in `apiClient.ts` mirroring the existing `getResortDetail` / `upsertResort` shapes**

Verify the existing method shape (look at how options + signal threading + error parsing work) and mirror exactly. Both new methods return Zod-parsed responses per the imported types from `@snowboard-trip-advisor/schema/api`.

- [ ] **Step 12: Run apiClient tests, verify pass**

- [ ] **Step 13: Write failing test — `upsertAnalystNote` upsert + delete + error**

`ApiClientError` constructor is `new ApiClientError(status, envelope)` where `envelope: ErrorEnvelope` (imported from `@snowboard-trip-advisor/schema/api`) — check `apiClient.ts` for the exact `ErrorEnvelope` shape (it's wrapped: `{ error: { code, message, details? } }`, NOT a bare `{ code, message }`). Mirror the existing `upsertResort` error-envelope tests in `apiClient.test.ts`:

```ts
describe('apiClient.upsertAnalystNote (PR N.b2)', () => {
  it('PUTs JSON body with upsert payload', async (): Promise<void> => {
    let receivedMethod = ''
    let receivedBody: unknown = null
    const response = {
      slug: 'x', path: 'slopes_km',
      note: { schema_version: 1, markdown: 'note', html: '<p>note</p>',
              created_at: '2026-05-13T00:00:00.000Z', updated_at: '2026-05-13T00:00:00.000Z' },
    }
    server.use(http.put('/api/analyst-notes/x', async ({ request }) => {
      receivedMethod = request.method
      receivedBody = await request.json()
      return HttpResponse.json(response)
    }))
    const result = await apiClient.upsertAnalystNote('x' as never, { path: 'slopes_km' as never, markdown: 'note' })
    expect(receivedMethod).toBe('PUT')
    expect(receivedBody).toStrictEqual({ path: 'slopes_km', markdown: 'note' })
    expect(result).toStrictEqual(response)
  })

  it('returns null note on delete confirmation', async (): Promise<void> => {
    server.use(http.put('/api/analyst-notes/x', () =>
      HttpResponse.json({ slug: 'x', path: 'slopes_km', note: null }),
    ))
    const result = await apiClient.upsertAnalystNote('x' as never, { path: 'slopes_km' as never, markdown: null })
    expect(result.note).toBeNull()
  })

  it('rejects with ApiClientError carrying parsed envelope on 400', async (): Promise<void> => {
    server.use(http.put('/api/analyst-notes/x', () =>
      HttpResponse.json(
        { error: { code: 'invalid-request', message: 'bad path' } },
        { status: 400 },
      ),
    ))
    await expect(apiClient.upsertAnalystNote('x' as never, { path: 'Slopes' as never, markdown: 'x' }))
      .rejects.toBeInstanceOf(ApiClientError)
  })
})
```

- [ ] **Step 14: Run, verify pass** (implementation done in step 11)

- [ ] **Step 15: Run full `npm run qa`**

- [ ] **Step 16: Commit + open PR**

```bash
git add packages/schema/api/analystNotes.ts packages/schema/api/analystNotes.test.ts \
        packages/schema/api/index.ts packages/schema/api/__snapshots__/* \
        apps/admin/src/lib/apiClient.ts apps/admin/src/lib/apiClient.test.ts
git commit -m "Analyst notes PR N.b2 — API contract + apiClient methods"
```

### 5.3 Subagent Review

Mechanical. Dispatch:

> Review `packages/schema/api/analystNotes.ts` + the `apiClient.ts` diff against spec §3.1 + §3.5 + §3.6. Check: `ResortSlugParam` is reused (not redefined), `RenderedAnalystNote` extends `AnalystNote` with `html`, AbortSignal threading, no `Idempotency-Key`. Contract snapshot must be regenerated and reflected in the PR.

### 5.4 Codex + local test

Per §1.3. Local: schema-api tests, apiClient tests, `npm run qa`.

---

## 6. PR N.b3a — `withSlugLock` + `resortUpsert` retrofit

**Branch:** `analyst-notes/n.b3a-lock`
**Depends on:** N.a (needs `WorkspaceFile.notes` field on the parsed shape so the retrofit carries it forward).
**LOC estimate:** ~140
**Subagent Review:** YES (discretionary — concurrency primitive + CODEOWNERS-protected handler retrofit).

### 6.1 Files

- **Modify:** [apps/admin/server/workspace.ts](apps/admin/server/workspace.ts) — add `withSlugLock`
- **Modify:** [apps/admin/server/resortUpsert.ts](apps/admin/server/resortUpsert.ts) — wrap reads + write in lock; carry `notes`
- **Modify:** [apps/admin/server/__tests__/workspace.test.ts](apps/admin/server/__tests__/workspace.test.ts) — lock unit tests (verify exact path during execution)
- **Modify:** [apps/admin/server/__tests__/resortUpsert.test.ts](apps/admin/server/__tests__/resortUpsert.test.ts) — notes-preservation test

### 6.2 Tasks

- [ ] **Step 1: Write failing test — `withSlugLock` serializes concurrent ops for the same slug**

```ts
// apps/admin/server/__tests__/workspace.test.ts (extend)
import { withSlugLock } from '../workspace'

describe('withSlugLock', () => {
  it('serializes two concurrent ops on the same slug', async () => {
    const log: string[] = []
    const slow = withSlugLock('a' as never, async () => {
      log.push('start-1')
      await new Promise((r) => setTimeout(r, 30))
      log.push('end-1')
      return 1
    })
    const fast = withSlugLock('a' as never, async () => {
      log.push('start-2')
      log.push('end-2')
      return 2
    })
    await Promise.all([slow, fast])
    expect(log).toStrictEqual(['start-1', 'end-1', 'start-2', 'end-2'])
  })

  it('does NOT serialize across distinct slugs', async () => {
    const log: string[] = []
    await Promise.all([
      withSlugLock('a' as never, async () => {
        log.push('start-a'); await new Promise((r) => setTimeout(r, 20)); log.push('end-a')
      }),
      withSlugLock('b' as never, async () => {
        log.push('start-b'); log.push('end-b')
      }),
    ])
    // 'b' must complete before 'a' (no cross-slug serialization)
    expect(log.indexOf('end-b')).toBeLessThan(log.indexOf('end-a'))
  })

  it('releases the lock after rejection so next op can proceed', async () => {
    let secondRan = false
    const first = withSlugLock('a' as never, async () => { throw new Error('boom') })
    const second = withSlugLock('a' as never, async () => { secondRan = true })
    await expect(first).rejects.toThrow('boom')
    await second
    expect(secondRan).toBe(true)
  })

  it('cleans up the map entry on identity match (no leak)', async () => {
    // Access the internal map via re-export OR via probe behavior:
    // after the op settles, a fresh op should construct a new entry.
    // Indirect: run 1000 ops and assert no measurable memory growth.
    // Direct: if workspace.ts exports `slugLocks` for tests, assert size === 0 post-settle.
    for (let i = 0; i < 100; i++) {
      await withSlugLock(`s${i}` as never, async () => {})
    }
    // Internal probe (verify export name during execution):
    // expect(slugLocks.size).toBe(0)
  })
})
```

- [ ] **Step 2: Run, verify fail (function not exported)**

```bash
npm --workspace=apps/admin run test -- workspace.test
```

- [ ] **Step 3: Implement `withSlugLock` in `apps/admin/server/workspace.ts` per spec §5.5 verbatim**

Critical: the `slugLocks.get(slug) === next` identity check at cleanup. The `void next.catch(() => {})` line. The `finally` block.

- [ ] **Step 4: Run lock tests, verify pass**

- [ ] **Step 5: Write failing test — `resortUpsert` preserves `notes` across edits**

```ts
// apps/admin/server/__tests__/resortUpsert.test.ts (extend)
it('preserves analyst notes across resort field edits', async () => {
  // Arrange: workspace fixture with non-empty notes
  const workspaceDir = await mkdtempForTest()  // existing helper
  await writeFixture(workspaceDir, 'k-b.json', {
    schema_version: 1,
    slug: 'kotelnica-bialczanska',
    resort: { /* minimal valid resort */ },
    live_signal: null,
    modified_at: '2026-05-13T00:00:00.000Z',
    editor_modes: {},
    notes: {
      slopes_km: {
        schema_version: 1, markdown: 'precious note', created_at: '...', updated_at: '...',
      },
    },
  })

  // Act: drive a resort field edit through resortUpsert
  await resortUpsert(
    { params: { slug: 'kotelnica-bialczanska' }, body: { /* field edit */ } },
    { workspaceRoot: dirname(workspaceDir) },
  )

  // Assert: notes survived
  const after = JSON.parse(await readFile(join(workspaceDir, 'k-b.json'), 'utf-8'))
  expect(after.notes.slopes_km.markdown).toBe('precious note')
})
```

(Adapt arrangement helpers to the existing test conventions — see surrounding tests in `resortUpsert.test.ts` for the exact pattern.)

- [ ] **Step 6: Run, verify fail (notes wiped by current implementation)**

- [ ] **Step 7: Retrofit `resortUpsert.ts` per spec §5.6**

Move the `Promise.all([readWorkspaceFileForSlug, readPublishedDocOrNull])` INSIDE `withSlugLock(slug, async () => { ... })`. Add `notes: workspaceFile?.notes ?? {}` to the candidate object. Path derivation lines stay outside the lock (deterministic, no I/O).

- [ ] **Step 8: Run notes-preservation test + full `resortUpsert.test.ts`, verify pass**

- [ ] **Step 9: Run `apps/admin` test suite for cross-handler regression**

```bash
npm --workspace=apps/admin run test
```

- [ ] **Step 10: Run full `npm run qa`**

- [ ] **Step 11: Commit + open PR**

```bash
git add apps/admin/server/workspace.ts apps/admin/server/resortUpsert.ts \
        apps/admin/server/__tests__/workspace.test.ts \
        apps/admin/server/__tests__/resortUpsert.test.ts
git commit -m "Analyst notes PR N.b3a — withSlugLock + resortUpsert retrofit"
```

### 6.3 Subagent Review

Discretionary (concurrency + handler retrofit). Document in PR body:

> Discretionary Subagent Review per AGENTS.md §60 paragraph 4: this PR introduces a load-bearing concurrency primitive (`withSlugLock`, intra-process promise mutex) and retrofits a CODEOWNERS-protected handler (`resortUpsert`) to use it.

Dispatch:

> Review `apps/admin/server/workspace.ts` + `resortUpsert.ts` diff against spec §5.5 + §5.6. Check: cleanup identity-check uses `slugLocks.get(slug) === next` (NOT the bug pattern `slugLocks.set(slug, next.catch(() => {}))`); `void next.catch(() => {})` suppresses unhandled-rejection without rebinding; the `notes: workspaceFile?.notes ?? {}` carry-forward is present in the candidate; reads were moved INSIDE the lock-wrapped function.

### 6.4 Codex + local test

Per §1.3. Local: `apps/admin` server tests, integration tests, `npm run qa`.

---

## 7. PR N.b3b — `analystNotes` handler

**Branch:** `analyst-notes/n.b3b-handler`
**Depends on:** N.b1 (renderer), N.b2 (types), N.b3a (withSlugLock).
**LOC estimate:** **~400** — documented inseparable-concern exception per spec §7.1 (single handler + dispatch wiring + bridge integration are inseparable; split would orphan the bridge integration's pre-condition).
**Subagent Review:** YES (discretionary — new server endpoint + cross-handler concurrency assertion).

### 7.1 Files

- **Create:** [apps/admin/server/analystNotes.ts](apps/admin/server/analystNotes.ts)
- **Create:** [apps/admin/server/__tests__/analystNotes.test.ts](apps/admin/server/__tests__/analystNotes.test.ts)
- **Create:** [apps/admin/server/__tests__/analystNotes.bridge.test.ts](apps/admin/server/__tests__/analystNotes.bridge.test.ts) — concurrent `resortUpsert` + `analystNotesPut` determinism (verify exact path/glob during execution)
- **Modify:** [apps/admin/server/dispatch.ts](apps/admin/server/dispatch.ts) — route registration
- **Modify:** [apps/admin/server/__tests__/dispatch.test.ts](apps/admin/server/__tests__/dispatch.test.ts) — dispatch coverage

### 7.2 Tasks

#### GET handler (TDD)

- [ ] **Step 1: Write failing test — GET 404 when slug exists in neither workspace nor published**

```ts
it('returns 404 when slug not in workspace or published', async () => {
  await expect(analystNotesGet({ params: { slug: 'nope' } as never }, deps))
    .rejects.toMatchObject({ status: 404, code: 'not-found' })
})
```

- [ ] **Step 2: Run, verify fail**

- [ ] **Step 3: Write failing test — GET returns workspace notes with rendered html**

```ts
it('returns rendered notes from workspace file', async () => {
  await writeFixture(workspaceDir, 'k-b.json', { /* with notes.slopes_km.markdown = '# title' */ })
  const result = await analystNotesGet({ params: { slug: 'kotelnica-bialczanska' } as never }, deps)
  expect(result.notes.slopes_km.html).toBe('<h1>title</h1>')
  expect(result.notes.slopes_km.markdown).toBe('# title')
})
```

- [ ] **Step 4: Write failing test — GET cold-start returns empty notes from published-only resort**

```ts
it('returns empty notes when only published has the slug', async () => {
  await writeFixture(publishedDir, 'current.v1.json', { /* published doc with slug */ })
  const result = await analystNotesGet({ params: { slug: 'k-b' } as never }, deps)
  expect(result.notes).toStrictEqual({})
})
```

- [ ] **Step 5: Write failing test — GET 500 on workspace-corrupt**

```ts
it('returns 500 workspace-corrupt on JSON parse failure', async () => {
  await writeFile(join(workspaceDir, 'k-b.json'), '{invalid json')
  await expect(analystNotesGet({ params: { slug: 'k-b' } as never }, deps))
    .rejects.toMatchObject({ status: 500, code: 'workspace-corrupt' })
})
```

- [ ] **Step 6: Write failing test — GET 500 internal on render exception**

Use an adversarial input that would break the renderer (e.g., extreme nesting). Trigger via a fixture with that markdown body and assert the 500 + `internal` code envelope.

- [ ] **Step 7: Implement `analystNotesGet` per spec §3.2 GET section**

Pattern after `apps/admin/server/listResorts.ts:16-17` for `HandlerDeps`. Steps 1–7 of spec §3.2 GET.

- [ ] **Step 8: Run GET tests, verify all pass**

#### PUT handler (TDD)

- [ ] **Step 9: Write failing test — PUT 400 on invalid body**

```ts
it('returns 400 invalid-request on bad path', async () => {
  await expect(analystNotesPut(
    { params: { slug: 'k-b' } as never, body: { path: 'Slopes', markdown: 'x' } as never },
    deps,
  )).rejects.toMatchObject({ status: 400, code: 'invalid-request' })
})
```

- [ ] **Step 10: Write failing test — PUT upserts a new note (hot path)**

```ts
it('upserts a new note on existing workspace file', async () => {
  await writeFixture(workspaceDir, 'k-b.json', { /* without slopes_km note */ })
  const result = await analystNotesPut(
    { params: { slug: 'k-b' } as never, body: { path: 'slopes_km', markdown: '# title' } as never },
    deps,
  )
  expect(result.note.markdown).toBe('# title')
  expect(result.note.html).toBe('<h1>title</h1>')

  // Verify on-disk
  const after = JSON.parse(await readFile(join(workspaceDir, 'k-b.json'), 'utf-8'))
  expect(after.notes.slopes_km.markdown).toBe('# title')
})
```

- [ ] **Step 11: Write failing test — PUT cold-start materializes workspace file from published**

```ts
it('materializes workspace file from published doc on first PUT', async () => {
  // No workspace file. Published has the slug.
  await writeFixture(publishedDir, 'current.v1.json', { resorts: [{ slug: 'k-b', ... }], live_signals: [] })
  await analystNotesPut(
    { params: { slug: 'k-b' } as never, body: { path: 'slopes_km', markdown: 'x' } as never },
    deps,
  )
  const wf = JSON.parse(await readFile(join(workspaceDir, 'k-b.json'), 'utf-8'))
  expect(wf.resort).toBeDefined()
  expect(wf.notes.slopes_km.markdown).toBe('x')
})
```

- [ ] **Step 12: Write failing test — PUT no-op delete short-circuit on published-only slug**

```ts
it('no-ops a delete against a published-only resort without materializing workspace file', async () => {
  await writeFixture(publishedDir, 'current.v1.json', { resorts: [{ slug: 'k-b' }], live_signals: [] })
  const result = await analystNotesPut(
    { params: { slug: 'k-b' } as never, body: { path: 'slopes_km', markdown: null } as never },
    deps,
  )
  expect(result.note).toBeNull()
  // Critical: no workspace file written
  await expect(stat(join(workspaceDir, 'k-b.json'))).rejects.toThrow()
})
```

- [ ] **Step 13: Write failing test — PUT delete on existing note removes key + persists**

```ts
it('deletes an existing note', async () => {
  await writeFixture(workspaceDir, 'k-b.json', { /* with slopes_km note */ })
  const result = await analystNotesPut(
    { params: { slug: 'k-b' } as never, body: { path: 'slopes_km', markdown: null } as never },
    deps,
  )
  expect(result.note).toBeNull()
  const after = JSON.parse(await readFile(join(workspaceDir, 'k-b.json'), 'utf-8'))
  expect(after.notes.slopes_km).toBeUndefined()
})
```

- [ ] **Step 14: Write failing test — PUT preserves `created_at` on upsert of existing note**

```ts
it('preserves created_at when upserting over an existing note', async () => {
  await writeFixture(workspaceDir, 'k-b.json', {
    /* with notes.slopes_km.created_at = '2026-01-01T00:00:00.000Z' */
  })
  const result = await analystNotesPut(
    { params: { slug: 'k-b' } as never, body: { path: 'slopes_km', markdown: 'updated' } as never },
    deps,
  )
  expect(result.note.created_at).toBe('2026-01-01T00:00:00.000Z')
  expect(new Date(result.note.updated_at).getTime()).toBeGreaterThan(new Date('2026-01-01').getTime())
})
```

- [ ] **Step 15: Write failing test — PUT 500 internal renders BEFORE write (recovery-preserving)**

Critical per spec §3.2 PUT step 6 ("Render BEFORE write"). Force a render exception and assert no workspace file change:

```ts
it('does not write the workspace file when render throws', async () => {
  await writeFixture(workspaceDir, 'k-b.json', { /* original notes */ })
  const before = await readFile(join(workspaceDir, 'k-b.json'), 'utf-8')

  // Inject an adversarial markdown that breaks renderer
  await expect(analystNotesPut(
    { params: { slug: 'k-b' } as never, body: { path: 'slopes_km', markdown: ADVERSARIAL } as never },
    deps,
  )).rejects.toMatchObject({ status: 500, code: 'internal' })

  const after = await readFile(join(workspaceDir, 'k-b.json'), 'utf-8')
  expect(after).toBe(before)  // unchanged
})
```

(If a real adversarial input is hard to find, stub `renderAnalystNoteMarkdown` via vi.mock to throw for one call. Document in the test why.)

- [ ] **Step 16: Implement `analystNotesPut` per spec §3.2 PUT section**

Critical order:
1. Validate body.
2. Derive paths.
3. `withSlugLock(slug, async () => { ... })`:
   - Read workspace + published (Promise.all).
   - 404 if neither has slug.
   - No-op delete short-circuit BEFORE cold-start.
   - Cold-start: explicit `WorkspaceFile.parse({...})` (the round-trip applies the `notes` default).
   - Apply patch.
   - Stamp `modified_at`.
   - `safeParse` → throw on fail.
   - **Render BEFORE write** — compute `html`, throw 500 internal on render exception.
   - `atomicWriteWorkspaceFile`.
   - Return `{ slug, path, note: { ...parsed.notes[path], html } | null }`.

- [ ] **Step 17: Run all PUT tests, verify pass**

#### Dispatcher integration

- [ ] **Step 18: Write failing test — `dispatch.ts` routes new endpoints**

```ts
// in dispatch.test.ts (extend)
it('routes GET /api/analyst-notes/:slug to analystNotesGet', async () => {
  const result = await dispatch({ method: 'GET', path: '/api/analyst-notes/k-b' }, deps)
  // expect call shape / not 404 / etc.
})

it('routes PUT /api/analyst-notes/:slug to analystNotesPut with body validation', async () => {
  const result = await dispatch(
    { method: 'PUT', path: '/api/analyst-notes/k-b', body: { path: 'slopes_km', markdown: 'x' } },
    deps,
  )
  expect(result.path).toBe('slopes_km')
})
```

- [ ] **Step 19: Add two route entries to `dispatch.ts` per spec §3.4 verbatim**

GET has NO `bodySchema` field (omit; setting `null` crashes per spec §3.4). PUT uses `AnalystNoteUpsertBody`.

- [ ] **Step 20: Run dispatch tests, verify pass**

#### Cross-handler bridge integration

- [ ] **Step 21: Write failing test — concurrent `resortUpsert` + `analystNotesPut` are serialized by `withSlugLock`**

```ts
// apps/admin/server/__tests__/analystNotes.bridge.test.ts
it('concurrent resortUpsert + analystNotesPut on same slug serialize via withSlugLock', async () => {
  // Drive both handlers concurrently; verify the final on-disk state reflects
  // both writes (neither was lost) and the order is consistent (no torn merge).
  const upsertP = resortUpsert(/* edits resort.slopes_km */, deps)
  const notesP = analystNotesPut(/* writes notes.slopes_km */, deps)
  await Promise.all([upsertP, notesP])

  const final = JSON.parse(await readFile(join(workspaceDir, 'k-b.json'), 'utf-8'))
  // Both writes survived:
  expect(final.resort.slopes_km).toBeDefined()
  expect(final.notes.slopes_km).toBeDefined()
})
```

This is the test that "split would orphan" — its pre-condition is BOTH handlers wrapped in the same `withSlugLock` (N.b3a + N.b3b). Belongs in N.b3b.

- [ ] **Step 22: Run bridge test, verify pass**

- [ ] **Step 23: Run full `npm run qa`**

- [ ] **Step 24: Commit + open PR**

```bash
git add apps/admin/server/analystNotes.ts \
        apps/admin/server/__tests__/analystNotes.test.ts \
        apps/admin/server/__tests__/analystNotes.bridge.test.ts \
        apps/admin/server/dispatch.ts \
        apps/admin/server/__tests__/dispatch.test.ts
git commit -m "Analyst notes PR N.b3b — analystNotes handler + dispatch + cross-handler bridge"
```

### 7.3 Subagent Review

Discretionary. Document in PR body. Dispatch:

> Review `apps/admin/server/analystNotes.ts` + `dispatch.ts` diff + the bridge integration test against spec §3.2 + §3.3 + §3.4 + §10.1. Check: render-BEFORE-write order (recovery-preserving), no-op delete short-circuit before cold-start (avoids phantom workspace materialization), cold-start uses explicit `WorkspaceFile.parse({...})` round-trip, `HandlerDeps = { workspaceRoot }` only (paths derived in-handler per `resortDetail.ts:33-34`), `safeParse` → `.data` pattern (NOT `parse()` which has no `.data` wrapper), every error path maps to an existing `ErrorCode` (no enum extension).

### 7.4 Codex + local test

Per §1.3. Local: `apps/admin` tests, `npm run test:integration`, `npm run qa`. Add a dev-server smoke that hits both endpoints with `curl`.

---

## 8. PR N.c1 — `useAnalystNotes` read hook + `flushAll` registry

**Branch:** `analyst-notes/n.c1-read-hook`
**Depends on:** N.b2 (apiClient types).
**LOC estimate:** ~285
**Subagent Review:** NO.

### 8.1 Files

- **Create:** [apps/admin/src/state/useAnalystNotes.ts](apps/admin/src/state/useAnalystNotes.ts)
- **Create:** [apps/admin/src/state/useAnalystNotes.hmr.ts](apps/admin/src/state/useAnalystNotes.hmr.ts)
- **Create:** [apps/admin/src/state/useAnalystNotes.test.tsx](apps/admin/src/state/useAnalystNotes.test.tsx)
- **Create:** [apps/admin/src/state/flushAll.ts](apps/admin/src/state/flushAll.ts)
- **Create:** [apps/admin/src/state/flushAll.test.ts](apps/admin/src/state/flushAll.test.ts)
- **Modify:** [apps/admin/vite.config.ts](apps/admin/vite.config.ts) — extend HMR coverage-exclusion glob to include `useAnalystNotes.hmr.ts` (no root `vite.config.ts` exists; the admin SPA's config owns this exclusion)

### 8.2 Tasks

#### `useAnalystNotes` read hook (mirrors `useResortDetail`)

- [ ] **Step 1: Read `apps/admin/src/state/useResortDetail.ts` + `useResortDetail.hmr.ts` + `useResortDetail.test.tsx` for the exact mirror pattern**

Take 5 min to internalize the Suspense + dual-cache + `useSyncExternalStore` shape. The new hook is a per-slug variant of the same structure.

- [ ] **Step 2: Write failing test — first read for a slug triggers fetch + suspends**

```tsx
// useAnalystNotes.test.tsx
import { Suspense } from 'react'
import { render, screen, waitFor } from '@testing-library/react'

it('suspends on first read; resolves with notes response', async () => {
  mockFetch({ slug: 'k-b', notes: {} })
  function Probe(): JSX.Element {
    const data = useAnalystNotes('k-b')
    return <div>{data.slug}</div>
  }
  render(<Suspense fallback={<span>loading</span>}><Probe /></Suspense>)
  expect(screen.getByText('loading')).toBeInTheDocument()
  await waitFor(() => screen.getByText('k-b'))
})
```

- [ ] **Step 3: Run, verify fail (module not found)**

- [ ] **Step 4: Write failing test — second read for the same slug returns cached value (no refetch)**

- [ ] **Step 5: Write failing test — `prepopulateAnalystNotes(slug, response)` updates the cache + notifies subscribers**

- [ ] **Step 6: Write failing test — `invalidateAnalystNotes(slug)` clears cache + notifies**

- [ ] **Step 7: Write failing test — ADR-0010 rejected-promise pinning** (an in-flight rejection sticks until next invalidate; subsequent renders re-suspend rather than re-throw the same error infinitely)

Mirror the existing `useResortDetail.test.tsx` ADR-0010 test verbatim, adapted for `useAnalystNotes`.

- [ ] **Step 8: Implement `useAnalystNotes.ts` mirroring `useResortDetail.ts` structure**

Module-level state:
- `cachedPromises: Map<ResortSlug, Promise<AnalystNotesGetResponse>>`
- `cachedFulfilled: Map<ResortSlug, AnalystNotesGetResponse>`
- `subscribers: Map<ResortSlug, Set<() => void>>`

Public surface:
- `useAnalystNotes(slug): AnalystNotesGetResponse` (Suspense throw if promise unresolved)
- `prepopulateAnalystNotes(slug, response)`
- `invalidateAnalystNotes(slug)`

- [ ] **Step 9: Run all hook tests, verify pass**

- [ ] **Step 10: Implement `useAnalystNotes.hmr.ts` — resets all three module-level Maps on `import.meta.hot`**

Mirror `useResortDetail.hmr.ts`. Add the file to `apps/admin/vite.config.ts`'s coverage exclusion glob (or wherever HMR siblings are excluded — check existing entries; verify that the admin Vite config is where the exclusion lives, since each workspace has its own `vite.config.ts`).

- [ ] **Step 11: Run `npm run qa` to confirm coverage gates still 100% × 4**

#### `flushAll` registry

- [ ] **Step 12: Write failing test — `registerSlugFlusher` returns deregistration fn**

```ts
// flushAll.test.ts
it('registers and deregisters a flusher', () => {
  const fn = vi.fn()
  const dispose = registerSlugFlusher('k-b' as never, fn)
  expect(flushAllForSlug('k-b' as never)).resolves.toBeUndefined()
  // (after running) expect fn called once
  dispose()
  // flusher gone — calling flushAllForSlug should not call it again
})
```

- [ ] **Step 13: Write failing test — `flushAllForSlug` calls all registered flushers in parallel via Promise.all**

```ts
it('runs all registered flushers concurrently via Promise.all', async () => {
  const order: string[] = []
  registerSlugFlusher('k-b' as never, async () => {
    await new Promise((r) => setTimeout(r, 30))
    order.push('slow')
  })
  registerSlugFlusher('k-b' as never, async () => {
    order.push('fast')
  })
  await flushAllForSlug('k-b' as never)
  expect(order).toStrictEqual(['fast', 'slow'])  // fast finished first under parallel
})
```

- [ ] **Step 14: Write failing test — `flushAllForSlug` resolves even when one flusher rejects** (Promise.all doesn't short-circuit on cleanup but does reject; verify behavior matches spec)

Per spec §5.4 (using `Promise.all` internally): if one rejects, `flushAllForSlug` rejects too. The test should pin whichever behavior the spec intends. Read §5.4 carefully — the spec just says "Promise.all"; per AGENTS.md "do not leave promises unhandled", the expected behavior is rejection-propagation. Caller wraps in try/catch (see N.c3's Shell.tsx `void flushAllForSlug(...)`).

- [ ] **Step 15: Implement `flushAll.ts` per spec §5.4**

```ts
const flushers: Map<ResortSlug, Set<() => Promise<void> | void>> = new Map()

export function registerSlugFlusher(slug: ResortSlug, fn: () => Promise<void> | void): () => void {
  const set = flushers.get(slug) ?? new Set()
  set.add(fn)
  flushers.set(slug, set)
  return (): void => {
    set.delete(fn)
    if (set.size === 0) flushers.delete(slug)
  }
}

export async function flushAllForSlug(slug: ResortSlug): Promise<void> {
  const set = flushers.get(slug)
  if (set === undefined) return
  await Promise.all([...set].map((fn) => Promise.resolve(fn())))
}
```

- [ ] **Step 16: Run flushAll tests, verify pass**

- [ ] **Step 17: Run full `npm run qa`**

- [ ] **Step 18: Commit + open PR**

```bash
git add apps/admin/src/state/useAnalystNotes.ts apps/admin/src/state/useAnalystNotes.hmr.ts \
        apps/admin/src/state/useAnalystNotes.test.tsx \
        apps/admin/src/state/flushAll.ts apps/admin/src/state/flushAll.test.ts \
        apps/admin/vite.config.ts
git commit -m "Analyst notes PR N.c1 — useAnalystNotes read hook + flushAll registry"
```

### 8.3 Codex + local test

Per §1.3. Local: `apps/admin` tests, `npm run qa`.

---

## 9. PR N.c2 — `useAnalystNoteDraft` write hook

**Branch:** `analyst-notes/n.c2-write-hook`
**Depends on:** N.c1 (`flushAll` registry, `prepopulateAnalystNotes`).
**LOC estimate:** **~450** — documented inseparable-concern exception per spec §7.1 (SlugStore state machine + 12+ K1-mirror tests are inseparable).
**Subagent Review:** NO.

### 9.1 Files

- **Create:** [apps/admin/src/state/useAnalystNoteDraft.ts](apps/admin/src/state/useAnalystNoteDraft.ts)
- **Create:** [apps/admin/src/state/useAnalystNoteDraft.hmr.ts](apps/admin/src/state/useAnalystNoteDraft.hmr.ts)
- **Create:** [apps/admin/src/state/useAnalystNoteDraft.test.tsx](apps/admin/src/state/useAnalystNoteDraft.test.tsx)

### 9.2 Tasks

This is the most subtle hook. The spec §5.2 + §5.3 read every per-path state-machine invariant. Each TDD step below maps to one invariant. **Do not skip steps and bundle.** The state machine has cross-cutting behavior under race conditions; the only way to verify it is fresh-test, run-it-fails, then implement.

- [ ] **Step 1: Read `apps/admin/src/state/useWorkspaceState.ts` start-to-finish for the K1 (PR 4.6c) mirror pattern**

This is the parent pattern. The new hook is a per-path generalization. Internalize:
- SlugStore + per-path state
- `rev` counter + flightRev capture
- `lastSent` invariant
- AbortController + controller-identity guard
- Debounce timer on the SlugStore (not the component)

- [ ] **Step 2: Write failing test — initial mount seeds `draft` + `lastSent` from `useAnalystNotes`**

```tsx
it('seeds draft and lastSent from server cache on first mount', () => {
  prepopulateAnalystNotes('k-b' as never, {
    slug: 'k-b',
    notes: { slopes_km: { schema_version: 1, markdown: 'existing', html: '...', created_at: '...', updated_at: '...' } },
  })
  const { result } = renderHook(() => useAnalystNoteDraft('k-b' as never, 'slopes_km' as never))
  expect(result.current.draft).toBe('existing')
  expect(result.current.lastSent).toBe('existing')
  expect(result.current.status).toBe('saved')
})

it('seeds draft="" and lastSent=null when no note exists server-side', () => {
  prepopulateAnalystNotes('k-b' as never, { slug: 'k-b', notes: {} })
  const { result } = renderHook(() => useAnalystNoteDraft('k-b' as never, 'slopes_km' as never))
  expect(result.current.draft).toBe('')
  expect(result.current.lastSent).toBeNull()
})
```

- [ ] **Step 3: Run, verify fail**

- [ ] **Step 4: Write failing tests — `setDraft` debounces 500 ms then flushes via apiClient**

```tsx
it('debounces setDraft and flushes via apiClient.upsertAnalystNote', async () => {
  vi.useFakeTimers()
  // ... setDraft('x'), advance 499 ms, expect no fetch; advance 1 ms more, expect 1 fetch
})
```

- [ ] **Step 5: Write failing test — structural-equality short-circuit (`draft === lastSent` → no fetch)**

Per spec §5.2 flush step. Including:
- Disjunct 1: `draft === lastSent && status !== 'save-failed' && status !== 'saving'`
- Disjunct 2: `lastSent === null && draft === '' && status !== 'save-failed' && status !== 'saving'`

Three sub-tests:
1. Normal "no pending change" short-circuit fires when status is dirty.
2. **Reverted-draft race**: in-flight upsert A; revert to lastSent=B; flush → must abort A and send a fresh PUT for B (not short-circuit). This is the load-bearing test per spec §5.2.
3. **Post-delete baseline**: deletion succeeds → `lastSent=null, draft=''`; next `mod+enter` → no PUT (second disjunct fires). Without this, the empty post-delete state would PUT `{markdown:''}` and resurrect the note as empty-upsert.

- [ ] **Step 6: Write failing test — failed-delete retry routing**

```tsx
it('routes failed-delete retry through deleteNote (not upsert PUT empty)', async () => {
  // Set up: deleteNote() fails (network error), status = 'save-failed', lastFlightKind = 'delete', draft = ''
  // Trigger: flushNow()
  // Expect: PUT { markdown: null }, NOT PUT { markdown: '' }
})
```

- [ ] **Step 7: Write failing test — rev-counter race guard on upsert success path**

```tsx
it('skips prepopulate when newer setDraft happened during flight', async () => {
  // setDraft('a') → flush in flight
  // setDraft('b') mid-flight (rev increments)
  // 'a' flight resolves → prepopulate must NOT fire (would clobber 'b')
})
```

- [ ] **Step 8: Write failing test — controller-identity guard on AbortError**

```tsx
it('does not clear abortController on AbortError when a newer controller is installed', async () => {
  // setDraft('a') → flight 1 starts with controller1
  // deleteNote() aborts flight 1, installs controller2
  // flight 1's AbortError handler must verify state.abortController === controller1 before clearing
})
```

- [ ] **Step 9: Write failing test — `deleteNote()` cancels pending debounce timer first**

Per spec §5.2 step 3 first bullet — the typing → Delete race within the 500 ms debounce window.

```tsx
it('cancels pending debounce timer when deleteNote is called mid-debounce', async () => {
  vi.useFakeTimers()
  // setDraft('x') at t=0
  // deleteNote() at t=200 (within debounce window)
  // advance to t=600
  // Expect: ONE fetch (PUT null), NOT ONE fetch + ONE timer-fired PUT empty
})
```

- [ ] **Step 10: Write failing test — `deleteNote` does NOT mutate `lastSent` until success**

Per spec §5.2 step 3 — keep lastSent at pre-delete value during in-flight delete so the failed-delete retry routing can detect the state.

- [ ] **Step 11: Write failing test — `flushAll` registration sits on the SlugStore**

```tsx
it('flushAllForSlug flushes a dirty path even after the consumer component unmounts', async () => {
  // Mount component → setDraft('x') (timer armed)
  // Unmount component before debounce fires
  // Call flushAllForSlug(slug) externally
  // Expect: PUT { markdown: 'x' } fires (the SlugStore-anchored flusher still works)
})
```

Per spec §5.4 paragraph 2 — the R9.1 race fix.

- [ ] **Step 12: Write failing test — unmount does NOT abort in-flight saves**

Spec §5.2 step 4 — analyst-walks-away convention.

- [ ] **Step 13: Implement `useAnalystNoteDraft.ts` per spec §5.1 + §5.2 + §5.3 + §5.4**

The full state machine. Use spec §5.1's per-path NotesPathState shape verbatim:

```ts
type NotesPathState = {
  draft: string
  lastSent: string | null
  status: 'idle' | 'dirty' | 'saving' | 'saved' | 'save-failed'
  debounceTimer: ReturnType<typeof setTimeout> | undefined
  abortController: AbortController | undefined
  rev: number
  lastFlightKind: 'upsert' | 'delete' | null
}
```

SlugStore registers its `flushAll(): Promise<void>` with `registerSlugFlusher` lazily on first read.

- [ ] **Step 14: Run all state-machine tests one by one, verify each passes**

Don't batch the run — verify each invariant individually so it's clear which one fails first if the implementation breaks one.

- [ ] **Step 15: Implement `useAnalystNoteDraft.hmr.ts` — reset `slugStores`**

- [ ] **Step 16: Run full `npm run qa`**

- [ ] **Step 17: Commit + open PR**

```bash
git add apps/admin/src/state/useAnalystNoteDraft.ts \
        apps/admin/src/state/useAnalystNoteDraft.hmr.ts \
        apps/admin/src/state/useAnalystNoteDraft.test.tsx
git commit -m "Analyst notes PR N.c2 — useAnalystNoteDraft per-path write hook"
```

### 9.3 Codex + local test

Per §1.3. Local: `apps/admin` tests, especially `useAnalystNoteDraft.test.tsx`, `npm run qa`.

---

## 10. PR N.c3 — `flushAll` refactor

**Branch:** `analyst-notes/n.c3-flush-refactor`
**Depends on:** N.c2 (the registration pattern is set; refactor follows).
**LOC estimate:** ~60
**Subagent Review:** NO.

### 10.1 Files

- **Modify:** [apps/admin/src/state/useWorkspaceState.ts](apps/admin/src/state/useWorkspaceState.ts) — register via `flushAll` instead of direct `flushNow`
- **Modify:** [apps/admin/src/state/useWorkspaceState.test.ts](apps/admin/src/state/useWorkspaceState.test.ts) — coverage
- **Modify:** [apps/admin/src/views/Shell.tsx](apps/admin/src/views/Shell.tsx) — `onModEnter` → `void flushAllForSlug(...)`
- **Modify:** [apps/admin/src/views/__tests__/Shell.test.tsx](apps/admin/src/views/__tests__/Shell.test.tsx) — coverage (verify exact path)

### 10.2 Tasks

- [ ] **Step 1: Write failing test — `useWorkspaceState` SlugStore registers via `flushAll`**

```tsx
it('registers a flusher with flushAllForSlug on first read for a slug', () => {
  renderHook(() => useWorkspaceState('k-b' as never))
  // Spy on flushers map (test-only export, or verify indirectly via flushAllForSlug)
  // Expect the SlugStore's flushAll registered
})
```

- [ ] **Step 2: Run, verify fail**

- [ ] **Step 3: Refactor `useWorkspaceState.ts` SlugStore-creation to call `registerSlugFlusher(slug, slugStore.flushAll)`**

Keep the existing `flushNow(slug)` PUBLIC API for direct callers (none should remain after N.c3 step 5; verify with grep) but the registration is the new wiring path.

- [ ] **Step 4: Write failing test — `Shell.tsx onModEnter` calls `flushAllForSlug(route.slug)`**

```tsx
it('mod+enter triggers flushAllForSlug for the current route slug', async () => {
  render(<Shell />)
  // simulate route at /resorts/k-b
  // fire mod+enter
  // expect fetch called for both /api/workspace/k-b AND /api/analyst-notes/k-b (if any drafts exist)
})
```

- [ ] **Step 5: Refactor `Shell.tsx onModEnter` from `useWorkspaceState.flushNow(slug)` to `void flushAllForSlug(route.slug)` per spec §5.4**

Search for the existing `onModEnter` site:

```bash
grep -n "flushNow" apps/admin/src/views/Shell.tsx
```

Replace the direct call. Keep the React 19 auto-batch comment if present.

- [ ] **Step 6: Run all tests touched, verify pass**

- [ ] **Step 7: Search for any other direct `useWorkspaceState.flushNow` consumers and remove them**

```bash
grep -rn "flushNow" apps/admin/src --include="*.ts" --include="*.tsx"
```

If none other than tests, good. If any, evaluate whether to refactor (probably yes — `flushAllForSlug` is the new contract).

- [ ] **Step 8: Run full `npm run qa`**

- [ ] **Step 9: Commit + open PR**

```bash
git add apps/admin/src/state/useWorkspaceState.ts \
        apps/admin/src/state/useWorkspaceState.test.ts \
        apps/admin/src/views/Shell.tsx \
        apps/admin/src/views/__tests__/Shell.test.tsx
git commit -m "Analyst notes PR N.c3 — flushAll refactor (useWorkspaceState + Shell mod+enter)"
```

### 10.3 Codex + local test

Per §1.3. Local: `apps/admin` tests, dev-server smoke, Playwright MCP browser check that `mod+enter` still triggers workspace saves end-to-end.

---

## 11. PR N.c4 — UI: `AnalystNoteSection` + `FieldRow` affordance + bridge integration

**Branch:** `analyst-notes/n.c4-ui`
**Depends on:** N.c3 (uses `flushAllForSlug`), N.b3b (the API endpoints exist for live preview integration testing).
**LOC estimate:** ~280
**Subagent Review:** NO.

### 11.1 Files

- **Create:** [apps/admin/src/views/ResortEditor/AnalystNoteSection.tsx](apps/admin/src/views/ResortEditor/AnalystNoteSection.tsx)
- **Create:** [apps/admin/src/views/ResortEditor/AnalystNoteSection.test.tsx](apps/admin/src/views/ResortEditor/AnalystNoteSection.test.tsx)
- **Create:** [packages/design-system/src/components/Textarea.tsx](packages/design-system/src/components/Textarea.tsx) + test + export (per spec §6.2 — `Textarea` primitive is NEW)
- **Modify:** [apps/admin/src/views/ResortEditor/FieldRow.tsx](apps/admin/src/views/ResortEditor/FieldRow.tsx) — affordance + lazy-load
- **Modify:** [apps/admin/src/views/ResortEditor/FieldRow.test.tsx](apps/admin/src/views/ResortEditor/FieldRow.test.tsx) — coverage
- **Create:** [apps/admin/src/views/ResortEditor/AnalystNoteSection.bridge.test.tsx](apps/admin/src/views/ResortEditor/AnalystNoteSection.bridge.test.tsx) — full-flow integration test (verify exact path/glob during execution)

### 11.2 Tasks

#### Design-system `Textarea` primitive (NEW)

- [ ] **Step 1: Write failing tests for `Textarea`** — multi-line input, monospace, controlled value, `Tab` inserts 2 spaces, focus + blur events, `aria-label` support, token-only styling (no raw colors — passes `npm run tokens:check`).

- [ ] **Step 2: Implement `Textarea` mirroring the existing `Input` primitive**

`Input` doesn't support multi-line per spec §6.2. Use the same styling tokens, `forwardRef`, controlled-value pattern. Tab interception is custom logic.

- [ ] **Step 3: Run primitive tests + `npm run tokens:check`, verify pass**

#### `AnalystNoteSection` (lazy-loaded UI)

- [ ] **Step 4: Write failing test — `AnalystNoteSection` reads via `useAnalystNotes` + writes via `useAnalystNoteDraft`**

```tsx
it('reads the existing note and shows it in the source pane', async () => {
  prepopulateAnalystNotes('k-b' as never, {
    slug: 'k-b',
    notes: { slopes_km: { schema_version: 1, markdown: '# title', html: '<h1>title</h1>', created_at: '...', updated_at: '...' } },
  })
  render(<AnalystNoteSection slug={'k-b' as never} path={'slopes_km' as never} />)
  expect(screen.getByRole('textbox', { name: /note source/i })).toHaveValue('# title')
})
```

- [ ] **Step 5: Write failing test — typing in source pane debounces 500 ms + flushes**

- [ ] **Step 6: Write failing test — preview pane renders client-side ~150 ms after keystroke**

Test via fake timers; client-side render uses the same `renderAnalystNoteMarkdown` for parity.

- [ ] **Step 7: Write failing test — `mod+enter` forces immediate flush via `flushAllForSlug`**

- [ ] **Step 8: Write failing test — `Escape` collapses the row without explicit discard**

- [ ] **Step 9: Write failing test — Delete button + `mod+backspace` send `PUT { markdown: null }`**

- [ ] **Step 10: Write failing test — sanitized preview labeled `aria-label="sanitized preview of the note above"`**

- [ ] **Step 11: Implement `AnalystNoteSection.tsx` per spec §6**

Source pane (`Textarea`), Preview pane (`dangerouslySetInnerHTML` with client-side `renderAnalystNoteMarkdown(draft)`), Delete button, keyboard shortcuts. Use `useAnalystNoteDraft` for write state; `useAnalystNotes` for read.

`export default function AnalystNoteSection(...)` — default export so `React.lazy` works directly.

- [ ] **Step 12: Run AnalystNoteSection tests, verify pass**

#### `FieldRow` affordance + lazy load

- [ ] **Step 13: Write failing test — `FieldRow` renders notes affordance with character count**

```tsx
it('renders 📝 N where N is rendered HTML text-character count', () => {
  prepopulateAnalystNotes(/* note with html === '<p>hello</p>' (5 chars) */)
  render(<FieldRow slug="k-b" path="slopes_km" /* ... */ />)
  expect(screen.getByRole('button', { name: /note/i })).toHaveTextContent('📝 5')
})

it('renders 📝 0 (outlined) when no note exists', () => {
  // ... default fixture without note
  expect(screen.getByRole('button', { name: /add note/i })).toHaveTextContent('📝 0')
})
```

- [ ] **Step 14: Write failing test — clicking affordance lazy-loads `AnalystNoteSection`**

```tsx
it('lazy-loads AnalystNoteSection on first expand', async () => {
  // ... mock React.lazy or assert via the import-meta-graph testing pattern
  render(<FieldRow .../>)
  fireEvent.click(screen.getByRole('button', { name: /add note/i }))
  await waitFor(() => screen.getByRole('textbox', { name: /note source/i }))
})

it('does not load AnalystNoteSection before first expand', () => {
  render(<FieldRow .../>)
  // Verify no Suspense fallback rendered AND no chunk fetched (look at fetch calls)
})
```

- [ ] **Step 15: Write failing test — read-only below `md` breakpoint per PR 4.6a rule** (affordance disabled)

First inspect [apps/admin/src/lib/useResponsiveTabOrder.ts](apps/admin/src/lib/useResponsiveTabOrder.ts) (the existing PR 4.6a responsive helper per spec §6.5) — its testable shape determines how the test drives the breakpoint. Mirror an existing FieldRow / ResortEditor responsive test (`grep -rn "below.*md" apps/admin/src/views`).

```tsx
it('affordance is disabled below md', () => {
  setViewport(640)  // below md — use whatever helper useResponsiveTabOrder's tests use
  render(<FieldRow .../>)
  expect(screen.getByRole('button', { name: /note/i })).toBeDisabled()
})
```

- [ ] **Step 16: Implement `FieldRow.tsx` modify per spec §6.1 + §6.4 + §6.6**

```tsx
const AnalystNoteSection = React.lazy(() => import('./AnalystNoteSection'))

// inside FieldRow render:
<Button onClick={() => setNotesExpanded(!notesExpanded)} disabled={!isMd} aria-label={notesText ? 'Edit note' : 'Add note'}>
  📝 {textCharCount}
</Button>
{notesExpanded && (
  <Suspense fallback={null}>
    <AnalystNoteSection slug={slug} path={path} />
  </Suspense>
)}
```

- [ ] **Step 17: Run FieldRow tests, verify pass**

#### Bridge integration (full flow)

- [ ] **Step 18: Write failing test — full flow: open → type → debounce → save → see preview → delete**

```tsx
// AnalystNoteSection.bridge.test.tsx
it('full flow with real msw-style server', async () => {
  // Start MSW or a real test server.
  // Render the ResortEditor for a slug with an existing resort but no note.
  // Click "📝 0" affordance.
  // Type "hello" in the source pane.
  // Advance fake timers past 500 ms.
  // Assert: PUT /api/analyst-notes/k-b fired with { path: 'slopes_km', markdown: 'hello' }.
  // Assert: preview pane shows '<p>hello</p>'.
  // Assert: affordance label updated to "📝 5".
  // Click delete button.
  // Assert: PUT /api/analyst-notes/k-b fired with { path: 'slopes_km', markdown: null }.
  // Assert: affordance label returned to "📝 0".
})
```

This is the bridge integration that justifies N.c4's LOC budget — split would orphan the precondition (UI + read hook + write hook + server endpoint must all coexist).

- [ ] **Step 19: Run bridge test, verify pass**

- [ ] **Step 20: Run full `npm run qa`**

- [ ] **Step 21: Run dev server + Playwright MCP smoke for the full user flow**

```bash
npm run dev:admin  # background
```

Use Playwright MCP to:
1. Navigate to a resort editor page **without** clicking the notes affordance. Open the network tab via `browser_network_requests`; assert the `unified` / `markdown.ts` chunk is NOT in the fetched bundle list (lazy-load verification — closes spec §6.6 + §10.4).
2. Click the notes affordance on a field row. Confirm the chunk fetches NOW (first-open).
3. Type markdown including a code fence and an autolink.
4. Wait 600 ms, observe preview pane shows rendered HTML.
5. Verify the saved icon flips to "saved" state.
6. Reload the page; verify note persists.
7. Click delete; verify affordance returns to outlined `📝 0`.

Capture screenshots for the PR description.

- [ ] **Step 22: Commit + open PR**

```bash
git add apps/admin/src/views/ResortEditor/AnalystNoteSection.tsx \
        apps/admin/src/views/ResortEditor/AnalystNoteSection.test.tsx \
        apps/admin/src/views/ResortEditor/AnalystNoteSection.bridge.test.tsx \
        apps/admin/src/views/ResortEditor/FieldRow.tsx \
        apps/admin/src/views/ResortEditor/FieldRow.test.tsx \
        packages/design-system/src/components/Textarea.tsx \
        packages/design-system/src/components/Textarea.test.tsx \
        packages/design-system/src/index.ts
git commit -m "Analyst notes PR N.c4 — AnalystNoteSection UI + FieldRow affordance + bridge"
```

### 11.3 Codex + local test

Per §1.3. Local: full UI test suite, dev-server smoke + Playwright MCP per step 21, `npm run qa`, bundle-size check (admin SPA gains ~150 KB gzip — verify lazy-load actually works: open the editor without clicking notes affordance, assert chunk NOT fetched in the network tab).

---

## 12. Verification before completion (every PR)

Per `superpowers:verification-before-completion`: evidence before assertions. Before declaring a PR done:

- [ ] `npm run qa` exits 0 (run; show the output).
- [ ] Codex review returned zero unresolved findings (sweep via GraphQL `reviewThreads` per §1.3 step 4; assert empty array).
- [ ] Subagent Review (where triggered) returned ✅ Approved.
- [ ] Local test plan executed (not just described); findings reported.
- [ ] PR description lists: TDD ordering, Subagent Review status, Codex review status, local test plan results.
- [ ] All commits carry DCO `Signed-off-by:` trailer (CI's `dco` check passes).
- [ ] PR title under 70 chars; body uses `<70` chars per line.

---

## 13. Plan-document-reviewer checklist (the reviewer's lens)

When the plan-document-reviewer dispatches after this plan is drafted, it verifies:

1. **TDD ordering** — every task list orders tests before implementation. ✓ (§3–§11 all follow red-green-refactor-commit cadence).
2. **Spec ↔ plan alignment** — every PR cites the spec section it implements. ✓ (every PR section references spec by anchor).
3. **Dependency graph correct** — each PR's "Depends on" matches §1.4. ✓.
4. **LOC ceilings honored** — atomic-PR rule per saved memory; N.b3b + N.c2 documented exceptions. ✓.
5. **Subagent Review triggers** — mechanical fire on `packages/schema/**`, `docs/superpowers/specs/**`, `docs/adr/**`; discretionary called out in PR body. ✓.
6. **ai-clean-code-adherence** — file list under one screen per PR; no abstractions justified by "future-proofing"; module-level state declared; no factories. ✓ (§2 declares per-file state; §2.3 lists rejected abstractions).
7. **Per-PR workflow** — Codex review babysitting + GraphQL reviewThreads sweep + local test plan executed. ✓ (§1.3 codifies; every PR cites).
8. **Verification before completion** — evidence-before-assertions per the skill. ✓ (§12).
