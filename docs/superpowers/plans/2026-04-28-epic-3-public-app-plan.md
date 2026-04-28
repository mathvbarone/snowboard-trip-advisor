# Epic 3 — Public App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `apps/public` — the public-facing data-transparency comparison tool — across 8 PRs (3.1a → 3.6) with TDD-ordered deliverables, 100% coverage, and DCO sign-off on every commit.

**Architecture:** Vite SPA at `apps/public/` consumes the v1 published dataset via runtime `fetch`, validates with the existing Zod validator, and renders a cards landing + matrix + detail-drawer view. URL is the source of truth for shareable state; `localStorage` holds private trip dates only. CSS-only theme via `prefers-color-scheme`; hand-built design system on top of `tokens.ts`. Detail drawer is non-modal and overlays whatever view is active.

**Tech Stack:** React 19, Vite, Vitest workspace mode + jsdom + MSW + jest-axe, Zod 4, `@fontsource/*` (latin-ext preloaded), Radix Primitives (FocusScope, DismissableLayer, Dialog, Tooltip — wrapped at the design-system boundary).

**Spec:** [`docs/superpowers/specs/2026-04-28-epic-3-public-app-design.md`](../specs/2026-04-28-epic-3-public-app-design.md). All section references in this plan (§N.M) refer to that document unless noted.

---

## Pre-flight (read once, before Task 1)

1. `CLAUDE.md` — enforcement layers (TDD, 100% coverage, DCO, no-`--no-verify`, no `console`, raw-HTML-element ban, color-literal ban, package DAG via `no-restricted-imports`).
2. The Epic 3 spec (linked above) — §0–§3 in full; §4–§6 skim; §7 PR breakdown to find the PR you're about to execute; §10 operational concerns; §1.1 parent-spec divergences.
3. The parent spec at `docs/superpowers/specs/2026-04-22-product-pivot-design.md` — only §2 (public app surface) and §6 (design system); the Epic 3 spec is the authoritative deviation source.
4. `packages/schema/src/loadResortDataset.ts`, `validatePublishedDataset.ts`, `resortView.ts`, `metricFields.ts`, `published.ts`, `primitives.ts`, `branded.ts` — what already exists. Read once.
5. `packages/design-system/src/tokens.ts` — token shapes you will consume.
6. `config/csp.ts` — current shape (single-flat-record exporter). PR 3.1b refactors it.
7. `apps/public/{vite.config.ts, src/App.tsx, src/main.tsx, src/test-setup.ts}` — placeholder you will replace.

Each Task references back to the spec sections you need at execution time, so you don't re-read the whole spec per PR.

---

## Top-level file structure

After folding the ai-clean-code-adherence audit, Epic 3 ships ~50 new files. Layout:

```
apps/public/
├── index.html                          [PR 3.1b]
├── public/hero.jpg                     [PR 3.2 — self-hosted hero image]
├── src/
│   ├── main.tsx                        [PR 3.1b — fonts + injectFontPreloads + mount]
│   ├── App.tsx                         [PR 3.1b stub → PR 3.1c real composition: <Shell>+<ShellErrorBoundary>+<Suspense>+URL→view dispatch+drawer mounts]
│   ├── views/
│   │   ├── cards.tsx                   [PR 3.1c placeholder → PR 3.2 real CardsView]
│   │   ├── matrix.tsx                  [PR 3.4 — lazy chunk]
│   │   ├── detail.tsx                  [PR 3.1c stub-throw → PR 3.5 body — frozen interface §5.5]
│   │   ├── ResortCard.tsx              [PR 3.2]
│   │   ├── Hero.tsx                    [PR 3.2]
│   │   ├── FilterBar.tsx               [PR 3.2 (no view toggle) → PR 3.4 fills slot]
│   │   ├── ShortlistDrawer.tsx         [PR 3.3]
│   │   ├── ShareUrlDialog.tsx          [PR 3.3]
│   │   ├── MergeReplaceDialog.tsx      [PR 3.3]
│   │   ├── DroppedSlugsBanner.tsx      [PR 3.1c stub → PR 3.6 final wiring]
│   │   ├── matrix.module.css           [PR 3.4 — drawer-on-matrix downgrade rule]
│   │   └── states/
│   │       ├── DatasetLoading.tsx      [PR 3.1c]
│   │       ├── DatasetUnavailable.tsx  [PR 3.1c]
│   │       └── NoResorts.tsx           [PR 3.1c]
│   ├── lib/
│   │   ├── router.ts                   [PR 3.1c — urlToView pure]
│   │   ├── urlState.ts                 [PR 3.1c — Zod URLStateSchema; parseURL/serializeURL; PUSH_KEYS; head-6]
│   │   ├── datasetFetch.ts             [PR 3.1c — Section 3 contract]
│   │   ├── datasetPlugin.ts            [PR 3.1b — serveDatasetMiddleware + copyDataset pure helpers]
│   │   ├── csp.ts                      [PR 3.1b — generateNonce + injectNonce pure helpers]
│   │   ├── injectFontPreloads.ts       [PR 3.1b]
│   │   ├── deepLinks.ts                [PR 3.5]
│   │   ├── errors.ts                   [PR 3.1c — DatasetFetchError, DatasetValidationError, onDatasetError]
│   │   └── lang.ts                     [PR 3.1c — countryToPrimaryLang BCP 47 map per §6.6]
│   ├── state/
│   │   ├── useURLState.ts              [PR 3.1c — useSyncExternalStore + module-scoped pubsub + popstate]
│   │   ├── useLocalStorageState.ts     [PR 3.1c]
│   │   ├── useDataset.ts               [PR 3.1c — use(loadOnce()); module-level cached + __resetForTests + HMR cache reset]
│   │   ├── useShortlist.ts             [PR 3.1c skeleton → PR 3.3 hardening (mirror; setEqual collision)]
│   │   ├── useMediaQuery.ts            [PR 3.1c]
│   │   ├── useDocumentMeta.ts          [PR 3.1c — title + canonical]
│   │   ├── useScrollReset.ts           [PR 3.1c stub → PR 3.6 final wiring]
│   │   └── useDroppedSlugs.ts          [PR 3.1c]
│   ├── mocks/server.ts                 [PR 3.1b — MSW server with default /data/current.v1.json handler]
│   └── test-setup.ts                   [PR 3.1b — matchMedia stub, jest-axe extend, MSW lifecycle (incl. removeAllListeners)]
└── vite.config.ts                      [PR 3.1b — registers datasetPlugin() + cspDevPlugin()]
```

```
packages/design-system/src/
├── components/
│   ├── Shell.tsx                       [PR 3.1c]
│   ├── Skeleton.tsx                    [PR 3.1c]
│   ├── EmptyStateLayout.tsx            [PR 3.1c]
│   ├── Button.tsx                      [PR 3.2]
│   ├── IconButton.tsx                  [PR 3.2]
│   ├── Input.tsx                       [PR 3.2]
│   ├── Select.tsx                      [PR 3.2]
│   ├── Chip.tsx                        [PR 3.2]
│   ├── Pill.tsx                        [PR 3.2]
│   ├── Card.tsx                        [PR 3.2]
│   ├── SourceBadge.tsx                 [PR 3.2]
│   ├── FieldValueRenderer.tsx          [PR 3.2]
│   ├── HeaderBar.tsx                   [PR 3.2]
│   ├── ToggleButtonGroup.tsx           [PR 3.4]
│   └── Table.tsx                       [PR 3.4]
├── primitives/
│   ├── Tooltip.tsx                     [PR 3.2 — Radix wrapper]
│   ├── Modal.tsx                       [PR 3.3 — Radix Dialog wrapper]
│   └── Drawer.tsx                      [PR 3.3 — non-modal: FocusScope + DismissableLayer; full prop superset]
├── icons/
│   ├── sources/{opensnow,snowforecast,resort-feed,booking,airbnb,manual}.tsx   [PR 3.2]
│   └── ui/{star,close,info,chevron-down}.tsx                                  [PR 3.2]
├── format.ts                           [PR 3.1c — destructured-primitive formatter functions]
└── index.ts                            [extended in 3.1c, 3.2, 3.3, 3.4]
```

Cross-cutting (root + workspace):

```
config/csp.ts                           [PR 3.1b — refactor to cspHeader({ mode, nonce? })]
eslint.config.js                        [PR 3.1a — no-restricted-imports for loadResortDataset path-taking]
package.json                            [PR 3.1a — engines.node ≥ 20.11; PR 3.6 — npm run analyze]
packages/schema/src/published.ts        [PR 3.1a — resorts.min(1)]
packages/schema/src/validatePublishedDataset.ts   [PR 3.1a — emit dataset_empty]
packages/schema/src/loadResortDataset.ts          [PR 3.1c — refactored Node wrapper]
packages/schema/src/loadResortDatasetFromObject.ts [PR 3.1c NEW — pure browser-safe]
packages/schema/src/index.ts            [PR 3.1c — export both]
docs/adr/0004 / 0005 / 0006 / 0007       [PR 3.1a — 4 ADRs]
tests/integration/apps/public/{cards-empty,cards-loaded,matrix,detail-open}.test.ts   [PR 3.6]
scripts/check-bundle-budget.ts          [PR 3.6]
scripts/check-preload-hrefs.ts          [PR 3.6 — spec §10.7]
scripts/check-dist-dataset.ts           [PR 3.6 — spec §10.2 nginx contract verification]
.github/workflows/quality-gate.yml      [PR 3.6 — bundle-analyze step in warn mode]
vitest.workspace.ts                     [PR 3.6 — adds tests/integration/apps/public/* projects if not already enumerated]
packages/design-system/tokens.css       [REGENERATED any time tokens.ts changes — pre-commit hook + tokens:check enforce]
```

**Token-regeneration note:** `tokens.css` is generated from `tokens.ts` by `scripts/generate-tokens.ts`. Whenever a Task adds new entries to `tokens.ts` (new colors, motion tokens, etc.), run `npm run tokens:generate` and commit `tokens.css` alongside the `tokens.ts` change. The pre-commit hook + CI's `tokens:check` step (`npm run tokens:generate && git diff --exit-code packages/design-system/tokens.css`) will fail the PR otherwise.

---

## What we are NOT building

Calling out tempting abstractions we deliberately skipped, per the ai-clean-code-adherence audit:

- **No `apps/public/src/components/AppShell.tsx` wrapper file.** Composition lives in `App.tsx` directly. We resisted the "App.tsx mounts; AppShell.tsx composes" split because they change in lockstep.
- **No `apps/public/src/lib/format.ts` glue file.** Call sites import from `@snowboard-trip-advisor/design-system` directly. The "app-specific format glue" had no concrete app-specific logic.
- **No state library** (Zustand / Jotai / Redux). Custom hooks + URL-as-source-of-truth handle the cross-component state for a 5-route app.
- **No router library.** URL parsing in `lib/urlState.ts` + dispatch in `lib/router.ts`.
- **No CSS-in-JS framework.** CSS modules + design tokens (CSS custom properties).
- **No CSS framework** (Pico / Tailwind / Radix Themes). Hand-built design system per ADR-0006.
- **No `useTheme` hook / `data-theme` attribute / inline-script first-paint dance.** CSS-only theme via `prefers-color-scheme` overrides in generated `tokens.css`.
- **No service worker / offline shell.** Phase 2.
- **No Storybook / visual regression / `@axe-core/playwright`.** Epic 6.
- **No Sentry / observability wiring.** `onDatasetError` no-op seam in place; Epic 6 lights it up.
- **No polling / revalidate-on-focus.** Epic 6 polish.
- **No manual theme toggle UI.** Phase 2 (CSS invariant kept ready).
- **No i18n translation framework.** `lang` attr per resort name only via §6.6 BCP 47 map. Phase 2 if more.
- **No `Slider` component.** Bucketed `<Select>` for the price filter (ADR-0004 mini-decision).
- **No tagged-union dataset state in `useDataset`.** Suspense + ErrorBoundary handle pending / resolved / rejected; the hook just throws or returns.
- **No reference-counted singleton dataset cache.** Module-level `cached` promise with explicit `__resetForTests` and HMR-clear is sufficient.
- **No factory-shaped Vite plugins.** `datasetPlugin()` / `cspDevPlugin()` are plain functions; their internals are pure helpers in `lib/`.
- **No "reusable" component patterns** (`Foo` + `PageFoo`). One component per concern; reuse if a second caller emerges.

---

## Pre-flight per Task (apply at the start of every Task)

Before executing any Task below:

1. **Verify dependencies merged.** Each Task lists "Depends on: Task N merged." Confirm those PRs are in `main` (`git fetch && git log origin/main --oneline -10`) before branching.
2. **Sync local main.** `git checkout main && git pull --ff-only`.
3. **Create the branch off the synced main.** Branch name pattern: `epic-3/pr-3.<X>-<short-slug>`.
4. **Re-read the relevant spec sections** named in the Task header (e.g., spec §7.5 for Task 1). The plan deliberately avoids duplicating the spec — read it for the per-PR contract, gates, and edge cases.

## Cross-cutting reminders (every Task)

- **TDD always.** Failing test → run (verify fail) → minimal implementation → run (verify pass) → commit.
- **Pre-commit hook runs `npm run qa`.** Don't bypass with `--no-verify` (PreToolUse hook also blocks it).
- **DCO sign-off** on every commit: `git commit -s -m "..."`.
- **Coverage 100% per file.** If a branch can't be tested, restructure the design rather than excluding. Coverage exclusions only in workspace `vite.config.ts` with a written rationale (§10.4 has the precedent).
- **No `console`** outside `scripts/**`. Use `import.meta.env.DEV`-gated `window.__sta_debug` for dev diagnostics (§3.2 spec, §10.5).
- **Subagent Review Discipline (CLAUDE.md).** When a Task touches a CODEOWNERS-listed path (per §7.2 trigger matrix), dispatch an independent `general-purpose` subagent reviewer with: (a) load-bearing invariants of the touched paths, (b) specific things to grep for, (c) "be critical, not validating" instruction. Fold findings before requesting maintainer review.
- **README evaluation** (CLAUDE.md "Documentation Discipline"). Each PR description records the README evaluation outcome even if no edit lands. Foundation/test-infra PRs (3.1a/3.1b/3.1c/3.6) typically skip; product-facing PRs (3.2/3.3/3.4/3.5) typically update.
- **One PR per Task.** Open the PR at the end of the Task; fold subagent-review findings into the same branch; ship after maintainer approval.
- **Frequent commits.** Commit at every test-pass green state. Don't wait for the whole Task.

---

## Execution dependency graph (from spec §7.4)

```
3.1a → 3.1b → 3.1c
                 ├─ 3.2 → 3.3 → 3.4
                 └─ 3.5  (parallel with 3.2/3.3/3.4 because of frozen interface §5.5)
                                                 ↓
                                                3.6
```

Parallel pairs after 3.1c lands: {3.2, 3.5}; after 3.2: {3.3, 3.5}; after 3.3: {3.4, 3.5}; 3.6 needs all of {3.2, 3.3, 3.4, 3.5}. Rollback rules: 3.4 revert leaves 3.5 unblocked; 3.1c revert pauses every downstream PR.

---

## Task 1 — PR 3.1a: Config / CI / ADRs

**Spec ref:** §7.5. **Subagent triggers:** `packages/schema/**`, `eslint.config.js`, `docs/adr/**`, root `package.json`. **Branch:** `epic-3/pr-3.1a-config-ci-adrs`. **README:** skip (foundation; note evaluation in PR description).

**Files:**
- Create: `docs/adr/0004-public-app-form-controls-native.md`, `docs/adr/0005-css-theme-no-js.md`, `docs/adr/0006-public-app-no-css-framework.md`, `docs/adr/0007-axe-library-jest-axe-with-vitest.md`.
- Modify: `packages/schema/src/published.ts`, `packages/schema/src/validatePublishedDataset.ts`, `packages/schema/src/published.test.ts`, `packages/schema/src/publishDataset.test.ts`, `packages/schema/src/publishDataset.lockTimeout.test.ts`, `packages/schema/src/validatePublishedDataset.test.ts`, `eslint.config.js`, `package.json`.

**Imports per file:** all changes are local edits or new ADR markdown — no new module imports introduced by this Task.

### Steps

- [ ] **Step 1.1: Branch off main.**
  ```bash
  git checkout main && git pull && git checkout -b epic-3/pr-3.1a-config-ci-adrs
  ```

- [ ] **Step 1.2: Write the 4 ADRs.**

  For each ADR, follow the existing `docs/adr/0001-pivot-to-data-transparency.md` MADR-style template (Status / Context / Decision / Consequences). Content per spec §8 + §1 row rationale per ADR. Each ADR is one short markdown file.

  ```bash
  npm run qa
  ```
  Expected: green (no code changes).

  Commit:
  ```bash
  git add docs/adr/0004-*.md docs/adr/0005-*.md docs/adr/0006-*.md docs/adr/0007-*.md
  git commit -s -m "docs(adr): 0004-0007 — Epic 3 design rationale (form controls, theme, no CSS framework, jest-axe)"
  ```

- [ ] **Step 1.3: Migrate fixture-using tests to one-resort minimum.**

  In `published.test.ts`, `publishDataset.test.ts`, `publishDataset.lockTimeout.test.ts`, replace any `resorts: []` test fixture with a one-resort fixture (use the same shape as `data/published/current.v1.json`'s first entry). The tests should still describe their original behavior.

  Then run:
  ```bash
  npm run --workspace=@snowboard-trip-advisor/schema test
  ```
  Expected: all currently-passing tests still pass; no new failures yet.

  Commit:
  ```bash
  git add packages/schema/src/{published,publishDataset,publishDataset.lockTimeout}.test.ts
  git commit -s -m "test(schema): migrate empty-array fixtures to one-resort minimum (prep for min(1))"
  ```

- [ ] **Step 1.4: Write the failing `dataset_empty` validator test.**

  In `packages/schema/src/validatePublishedDataset.test.ts`, add:

  ```ts
  it('rejects empty resorts array with dataset_empty issue code', () => {
    const result = validatePublishedDataset({
      schema_version: 1,
      resorts: [],
      live_signals: [],
      // ...other required envelope fields, copy from existing test fixture
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === 'dataset_empty')).toBe(true)
    }
  })
  ```

  Run:
  ```bash
  npm run --workspace=@snowboard-trip-advisor/schema test -- validatePublishedDataset
  ```
  Expected: FAIL — `dataset_empty` not found in issues (or empty array passes validation entirely).

- [ ] **Step 1.5: Implement `min(1)` + `dataset_empty` issue code.**

  In `packages/schema/src/published.ts`, find the `resorts` Zod field and add `.min(1, { message: 'dataset_empty' })`.

  In `packages/schema/src/validatePublishedDataset.ts`, ensure the issue-code emission path catches the `min(1)` Zod failure and emits `code: 'dataset_empty'` (not opaque `zod_parse_failed`). Inspect the existing issue-code mapping logic — likely a switch on `error.issues[i].code` or path-based discrimination.

  Run:
  ```bash
  npm run --workspace=@snowboard-trip-advisor/schema test
  ```
  Expected: PASS — including the new test.

  Commit:
  ```bash
  git add packages/schema/src/{published,validatePublishedDataset}.ts packages/schema/src/validatePublishedDataset.test.ts
  git commit -s -m "feat(schema): add min(1) rule on resorts emitting dataset_empty issue code"
  ```

- [ ] **Step 1.6: Add the ESLint `no-restricted-imports` rule.**

  In `eslint.config.js`, add a rule that bans imports of `'@snowboard-trip-advisor/schema'`'s `loadResortDataset` (path-taking variant) from any file under `apps/public/**`. Use the existing `no-restricted-imports` block as a reference; the syntax is something like:

  ```js
  {
    files: ['apps/public/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{
          name: '@snowboard-trip-advisor/schema',
          importNames: ['loadResortDataset'],
          message: 'Use loadResortDatasetFromObject in apps/public to keep node:fs/promises out of the browser bundle. See spec §2.2.',
        }],
      }],
    },
  },
  ```

  No test exists for this rule yet (apps/public doesn't import the function in any current file). To make this testable today, add a test fixture under `tests/integration/eslintConfig.test.ts` (the existing fixture-driven lint test) that asserts the rule fires on a fixture file simulating an `apps/public` import.

  Run:
  ```bash
  npm run lint
  npm run test:integration   # if eslintConfig test runs there
  ```
  Expected: PASS.

  Commit:
  ```bash
  git add eslint.config.js tests/integration/eslintConfig.test.ts
  git commit -s -m "chore(eslint): ban loadResortDataset path-taking variant from apps/public/**"
  ```

- [ ] **Step 1.7: Pin Node engines.**

  In root `package.json`, add `"engines": { "node": ">=20.11" }` (or update existing `engines` if pinned lower).

  Run:
  ```bash
  npm run qa
  ```
  Expected: green.

  Commit:
  ```bash
  git add package.json
  git commit -s -m "chore: pin engines.node ≥ 20.11 (required by import.meta.dirname in PR 3.1b plugins)"
  ```

- [ ] **Step 1.8: Acceptance gate (lift from spec §7.5).**

  - `npm run qa` green.
  - `npm run --workspace=@snowboard-trip-advisor/schema test` shows `dataset_empty` issue code asserted in `validatePublishedDataset.test.ts`.
  - ADR index reflects 0004–0007.
  - `eslint.config.js` rule fires on the fixture import in `tests/integration/eslintConfig.test.ts`.
  - Root `package.json` has `engines.node ≥ 20.11`.

- [ ] **Step 1.9: Subagent review.**

  Dispatch a `general-purpose` subagent. Brief: "Review epic-3/pr-3.1a-config-ci-adrs. Triggers: packages/schema/**, eslint.config.js, docs/adr/**. Verify the 4 ADRs are MADR-shaped, the validator's `dataset_empty` issue code is named (not opaque), the ESLint rule's message is actionable, and the engines pin is justified. Be critical, not validating."

  Fold findings into the same branch.

- [ ] **Step 1.10: Open the PR and request maintainer review.**

  ```bash
  git push -u origin epic-3/pr-3.1a-config-ci-adrs
  gh pr create --title "Epic 3 PR 3.1a — Config / CI / ADRs" --body "$(...spec §7.5; subagent review attached...)"
  ```

  PR description includes README-evaluation outcome ("foundation; no README change").

  After merge, return to main:
  ```bash
  git checkout main && git pull
  ```

---

## Task 2 — PR 3.1b: Vite plugins + entry + test infra

**Spec ref:** §7.6. **Subagent triggers:** `apps/public/vite.config.ts`, `config/csp.ts`. **Depends on:** Task 1 merged. **Branch:** `epic-3/pr-3.1b-vite-plugins`. **README:** skip.

**Files:**

- Modify: `config/csp.ts`, `config/csp.test.ts`, `apps/public/vite.config.ts`, `apps/public/index.html`, `apps/public/src/main.tsx`, `apps/public/src/App.tsx` (still a stub at this PR), `apps/public/src/test-setup.ts`, `apps/public/package.json` (add `@fontsource/*`, `msw`, `jest-axe`).
- Create: `apps/public/src/lib/datasetPlugin.ts`, `apps/public/src/lib/datasetPlugin.test.ts`, `apps/public/src/lib/csp.ts`, `apps/public/src/lib/csp.test.ts`, `apps/public/src/__tests__/cspDevPlugin.test.ts`, `apps/public/src/lib/injectFontPreloads.ts`, `apps/public/src/lib/injectFontPreloads.test.ts`, `apps/public/src/mocks/server.ts`.

**Imports declared per file** (called out for context-window-friendliness per ai-clean-code-adherence):

- `config/csp.ts` → no imports; pure CSP-directive serializer.
- `apps/public/src/lib/datasetPlugin.ts` → imports `node:fs/promises` (`readFile`), `node:path` (`dirname`, `resolve`), `node:fs` (`mkdir`, `copyFile`); exports `serveDatasetMiddleware(srcPath: string): RequestHandler` and `copyDataset(src: string, dest: string): Promise<void>`.
- `apps/public/src/lib/csp.ts` → imports nothing (uses globalThis `crypto`); exports `generateNonce(): string` (uses `crypto.getRandomValues`) and `injectNonce(html: string, nonce: string): string` (pure string transform).
- `apps/public/src/lib/injectFontPreloads.ts` → imports nothing; exports `injectFontPreloads(urls: ReadonlyArray<string>): void` (DOM mutation, browser-only).
- `apps/public/vite.config.ts` → imports `@vitejs/plugin-react`, `vite` (`defineConfig`, `Plugin`), `vitest/node` (`InlineConfig`), `node:fs/promises` (`readFile`), `node:path` (`resolve`, `dirname`), `./src/lib/datasetPlugin`, `./src/lib/csp`, `../../config/csp`.
- `apps/public/src/main.tsx` → imports `react` (`StrictMode`), `react-dom/client` (`createRoot`), `./App`, four `@fontsource/...` CSS modules + two `?url`-suffixed woff2 imports, `./lib/injectFontPreloads`.
- `apps/public/src/test-setup.ts` → imports `vitest` (`vi`, `expect`, `beforeAll`, `afterEach`, `afterAll`), `jest-axe` (`toHaveNoViolations`), `./mocks/server`.
- `apps/public/src/mocks/server.ts` → imports `msw/node` (`setupServer`), `msw` (`http`, `HttpResponse`), `node:fs/promises` (`readFile`), `node:path` (`resolve`).

### Steps

- [ ] **Step 2.1: Branch off main.**
  ```bash
  git checkout main && git pull && git checkout -b epic-3/pr-3.1b-vite-plugins
  ```

- [ ] **Step 2.2: Add app dependencies.**

  In `apps/public/package.json`, add to `dependencies`: `@fontsource/dm-serif-display`, `@fontsource/dm-sans`, `@fontsource/jetbrains-mono`. To `devDependencies`: `msw`, `jest-axe` (and `@types/jest-axe`).

  ```bash
  npm install --workspace=@snowboard-trip-advisor/public-app
  ```

  Commit:
  ```bash
  git add apps/public/package.json package-lock.json
  git commit -s -m "chore(public): add @fontsource, msw, jest-axe dependencies"
  ```

- [ ] **Step 2.3: Refactor `config/csp.ts` — write failing tests first.**

  Update `config/csp.test.ts` (existing) to match the new `cspHeader({ mode, nonce? }): string` signature. Tests assert: dev mode includes `ws://localhost:*`, `wss://localhost:*`, `http://localhost:*` in `connect-src` and `'nonce-{nonce}'` in `script-src`; prod mode excludes all of these and uses `script-src 'self'`. Both modes keep `style-src 'self' 'unsafe-inline'` and `img-src 'self' data: https:`.

  Run:
  ```bash
  npm run test config/csp.test.ts
  ```
  Expected: FAIL — function signature mismatch.

  Implement the refactor in `config/csp.ts`. Run again. Expected: PASS.

  Commit:
  ```bash
  git add config/csp.ts config/csp.test.ts
  git commit -s -m "refactor(csp): cspHeader({ mode, nonce? }) — dev/prod branches; full directive lists per spec §6.4"
  ```

- [ ] **Step 2.4: Write tests for `lib/datasetPlugin.ts` pure helpers.**

  Create `apps/public/src/lib/datasetPlugin.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest'
  import { serveDatasetMiddleware, copyDataset } from './datasetPlugin'
  // tests:
  // - serveDatasetMiddleware on success: setHeader('Content-Type', 'application/json; charset=utf-8') + 'Cache-Control: no-cache'; res.end(buf)
  // - serveDatasetMiddleware on ENOENT: calls next(err)
  // - copyDataset against tmpdir: creates parent dir; copies bytes; idempotent on re-run
  ```

  Run: FAIL (file doesn't exist).

  Implement `apps/public/src/lib/datasetPlugin.ts`. Run: PASS.

  Commit:
  ```bash
  git add apps/public/src/lib/datasetPlugin{.ts,.test.ts}
  git commit -s -m "feat(public): datasetPlugin pure helpers (serveDatasetMiddleware + copyDataset)"
  ```

- [ ] **Step 2.5: Write tests for `lib/csp.ts` pure helpers.**

  Create `apps/public/src/lib/csp.test.ts`:
  - `generateNonce()` returns a base64 string of length ≥ 20; two consecutive calls produce different values; uses `crypto.getRandomValues` (assert via `vi.spyOn(globalThis.crypto, 'getRandomValues')`).
  - `injectNonce(html, nonce)` is pure: same input → identical output; rewrites every `<script>` tag without `src=` to carry `nonce={nonce}`; injects `<meta name="csp-nonce" content={nonce}>` once.

  Run: FAIL. Implement `apps/public/src/lib/csp.ts`. Run: PASS.

  Commit:
  ```bash
  git add apps/public/src/lib/csp{.ts,.test.ts}
  git commit -s -m "feat(public): csp pure helpers (generateNonce + injectNonce)"
  ```

- [ ] **Step 2.6: Write tests for `lib/injectFontPreloads.ts`.**

  Create `apps/public/src/lib/injectFontPreloads.test.ts` (in jsdom env):
  - Given two URLs, appends two `<link>` tags to `<head>` with `rel="preload"`, `as="font"`, `type="font/woff2"`, `crossorigin`, and the matching `href`.
  - Idempotent on re-call (does not duplicate).

  Run: FAIL. Implement. Run: PASS.

  Commit:
  ```bash
  git add apps/public/src/lib/injectFontPreloads{.ts,.test.ts}
  git commit -s -m "feat(public): injectFontPreloads — appends WOFF2 preload <link> tags"
  ```

- [ ] **Step 2.7: Wire `apps/public/vite.config.ts`.**

  Replace the existing bare-bones config with `defineConfig` registering both plugins. Use the spec §2.4 code as the model. Plugin signatures:
  - `datasetPlugin()`: `configureServer(server)` mounts middleware at `/data/current.v1.json` via `serveDatasetMiddleware(SRC)`; `writeBundle(opts)` validates `opts.dir` then calls `copyDataset(SRC, resolve(opts.dir, 'data/current.v1.json'))`.
  - `cspDevPlugin()`: single `configureServer` middleware that intercepts HTML requests, calls `server.transformIndexHtml(...)`, then `injectNonce`, sets the CSP header with the matching nonce, and ends the response. **Do NOT use the `transformIndexHtml` hook directly** — it has no `req` access (per spec §2.4 + ADR / Codex review fix).

  The 5-line lifecycle adapters are coverage-excluded in this same file under `coverage.exclude` with the rationale: `// Vite lifecycle hooks not exercisable in jsdom unit tests; pure helpers in src/lib/{datasetPlugin,csp}.ts unit-tested directly.`

  Commit:
  ```bash
  git add apps/public/vite.config.ts
  git commit -s -m "feat(public): wire datasetPlugin + cspDevPlugin; coverage-exclude lifecycle adapters"
  ```

- [ ] **Step 2.8: Write the `cspDevPlugin` smoke test.**

  Create `apps/public/src/__tests__/cspDevPlugin.test.ts`:

  ```ts
  // Invokes the configureServer-installed middleware twice with stub req/res/next.
  // Asserts:
  //   - Both responses set 'Content-Security-Policy' header
  //   - The script-src 'nonce-{X}' value differs across invocations
  //   - The response body's <script> tags carry the matching nonce (parse with regex)
  ```

  Run: FAIL (probably — depending on plugin invocation pattern). Iterate the plugin code until PASS.

  Commit:
  ```bash
  git add apps/public/src/__tests__/cspDevPlugin.test.ts apps/public/vite.config.ts
  git commit -s -m "test(public): cspDevPlugin smoke — nonce differs across requests; matches script tags"
  ```

- [ ] **Step 2.9: Update `apps/public/index.html`.**

  Per spec §6.3 + §7.6: `<html lang="en">`; `<meta name="description" content="Snowboard Trip Advisor — data-transparency comparison for European ski resorts.">`; two `<meta name="theme-color">` with `media` (dark `#0b0d10`, light `#ffffff` per `tokens.ts`); `<link rel="canonical" href="">` placeholder.

  Commit:
  ```bash
  git add apps/public/index.html
  git commit -s -m "feat(public): index.html — lang, description, theme-color media tags, canonical placeholder"
  ```

- [ ] **Step 2.10: Update `apps/public/src/main.tsx`.**

  Add the @fontsource CSS imports + woff2 `?url` imports for `latin-ext` subset (DM Sans 400 + JetBrains Mono 500 per spec §6.3). Call `injectFontPreloads([dmSans400, jetBrains500])` before the `createRoot(...).render(<StrictMode><App /></StrictMode>)`.

  Run:
  ```bash
  npm run --workspace=@snowboard-trip-advisor/public-app build
  ```
  Expected: succeeds; emits `dist/data/current.v1.json` and hashed font assets.

  Commit:
  ```bash
  git add apps/public/src/main.tsx
  git commit -s -m "feat(public): main.tsx — fonts (latin-ext subset), preloads, mount"
  ```

- [ ] **Step 2.11: Wire test infra — `mocks/server.ts` + `test-setup.ts`.**

  Create `apps/public/src/mocks/server.ts`:

  ```ts
  // Default handler reads from data/published/current.v1.json on server-startup;
  // tests override per-suite via server.use(http.get(...)).
  ```

  Update `apps/public/src/test-setup.ts` (existing minimal file):
  - `import 'jest-axe/extend-expect'` or `expect.extend(toHaveNoViolations)`.
  - `vi.stubGlobal('matchMedia', vi.fn().mockImplementation((q) => ({ matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() })))`.
  - MSW lifecycle: `beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))`, `afterEach(() => { server.resetHandlers(); server.events.removeAllListeners() })`, `afterAll(() => server.close())`.

  Run:
  ```bash
  npm run --workspace=@snowboard-trip-advisor/public-app test
  ```
  Expected: PASS (existing test stays green).

  Commit:
  ```bash
  git add apps/public/src/{mocks/server.ts,test-setup.ts}
  git commit -s -m "test(public): MSW server with default handler; matchMedia stub; jest-axe extend; lifecycle"
  ```

- [ ] **Step 2.12: Run full QA + build + dev smoke.**

  ```bash
  npm run qa
  npm run --workspace=@snowboard-trip-advisor/public-app build
  ```

  Manual smoke (one-shot, document outcome in PR description):
  ```bash
  npm run --workspace=@snowboard-trip-advisor/public-app dev &
  curl -I http://localhost:5173/    # twice
  curl -I http://localhost:5173/    # nonce values should differ
  curl -i http://localhost:5173/data/current.v1.json | head -5   # 200 + JSON content-type
  kill %1
  ```

  Expected: green qa; build emits `dist/data/current.v1.json`; two `curl -I` calls return distinct `'nonce-...'` values in the CSP header.

- [ ] **Step 2.13: Acceptance gate (lift from spec §7.6).**

  - `npm run qa` green.
  - `npm run --workspace=@snowboard-trip-advisor/public-app dev` boots without errors.
  - `cspDevPlugin.test.ts` asserts the nonce differs across two middleware invocations (P0 #4 from spec round 1).
  - `npm run --workspace=@snowboard-trip-advisor/public-app build` emits `dist/data/current.v1.json` (verified by Step 2.12 manual smoke).
  - Font preloads in `index.html` use `-latin-ext-` paths (not `-latin-`) — verified by `injectFontPreloads.test.ts` and inspection of `dist/index.html`.

- [ ] **Step 2.14: Subagent review.**

  Dispatch `general-purpose` reviewer. Brief: "Review epic-3/pr-3.1b-vite-plugins. Triggers: apps/public/vite.config.ts, config/csp.ts. Verify the cspDevPlugin uses the middleware-only pattern (no `transformIndexHtml` hook), `serveDatasetMiddleware` sets `Content-Type: application/json; charset=utf-8` (matches §10.2 nginx contract), the dev CSP includes `wss://localhost:*`, font preload paths use `latin-ext` (not `latin`), and MSW lifecycle includes `server.events.removeAllListeners()`. Be critical, not validating."

  Fold findings.

- [ ] **Step 2.15: Open PR.**

  ```bash
  git push -u origin epic-3/pr-3.1b-vite-plugins
  gh pr create --title "Epic 3 PR 3.1b — Vite plugins + entry + test infra" --body "..."
  ```

---

## Task 3 — PR 3.1c: Foundation lib + state + states + Shell composition

**Spec ref:** §7.7 + §5.5 (frozen interface). **Subagent triggers:** `packages/schema/**`, `packages/design-system/**`. **Depends on:** Task 2 merged. **Branch:** `epic-3/pr-3.1c-foundation`. **README:** skip.

**Files (NEW unless marked Modify):**

- `packages/schema/src/loadResortDatasetFromObject.ts`, `loadResortDatasetFromObject.test.ts`.
- Modify `packages/schema/src/loadResortDataset.ts` (4-line Node wrapper) + `loadResortDataset.test.ts` (slim happy-path).
- Modify `packages/schema/src/index.ts` — re-export both.
- `packages/design-system/src/format.ts` + `format.test.ts` — destructured-primitive formatters.
- `packages/design-system/src/components/{Shell,Skeleton,EmptyStateLayout}.tsx` + tests.
- Modify `packages/design-system/src/index.ts` — re-export new components + `format.ts`.
- `apps/public/src/lib/{router,urlState,datasetFetch,errors,deepLinks,lang}.ts` + each one's `.test.ts`.
  - **Note:** no `lib/format.ts` per the ai-clean-code-adherence audit; consumers import from `@snowboard-trip-advisor/design-system` directly.
  - `lib/deepLinks.ts` ships an empty/skeleton form here (real builders land in PR 3.5); the file exists so `views/detail.tsx` can import it without a dangling reference.
- `apps/public/src/state/{useURLState,useLocalStorageState,useDataset,useShortlist,useMediaQuery,useDocumentMeta,useScrollReset,useDroppedSlugs}.ts` + each one's `.test.ts`.
- `apps/public/src/views/{cards,detail}.tsx` + tests; `apps/public/src/views/states/{DatasetLoading,DatasetUnavailable,NoResorts}.tsx` + tests; `apps/public/src/views/DroppedSlugsBanner.tsx` (stub).
- Modify `apps/public/src/App.tsx` — replace stub with the full composition (Shell + ShellErrorBoundary + Suspense + URL→view dispatch + DetailDrawer mount + ShortlistDrawer placeholder).

**Imports per file (highlights):**

- `loadResortDatasetFromObject.ts` → imports from `./validatePublishedDataset`, `./resortView`, `./primitives`, `./resort`, `./liveSignal`, `./branded` (no `node:fs/promises`).
- `loadResortDataset.ts` (refactored) → imports `node:fs/promises` (`readFile`), `./loadResortDatasetFromObject`. Public surface: `loadResortDataset(path, opts)`.
- `apps/public/src/state/useDataset.ts` → imports `react` (`use`), `../lib/datasetFetch`, `../lib/errors`. **Module-level state:** `let cached: Promise<...> | null = null`. Public surface: `useDataset()`, `invalidateDataset()`, `__resetForTests()`. HMR cleanup branch (`if (import.meta.hot) ...`) coverage-excluded with rationale in `apps/public/vite.config.ts`.
- `apps/public/src/state/useURLState.ts` → imports `react` (`useSyncExternalStore`), `../lib/urlState`. **Module-level state:** `subscribers: Set<() => void>`. Public surface: `useURLState(): URLState`, `setURLState(partial: Partial<URLState>): void`. JSDoc `@warning` on `setURLState` re §10.5.
- `apps/public/src/lib/urlState.ts` → imports `zod`, `@snowboard-trip-advisor/schema` (`METRIC_FIELDS`, `ResortSlug`, `ISOCountryCode`). Public surface: `URLStateSchema`, `URLState` type, `parseURL(search): URLState`, `serializeURL(state): string`, `PUSH_KEYS`.
- `apps/public/src/lib/lang.ts` → imports `@snowboard-trip-advisor/schema` (type-only `ISOCountryCode`). Public surface: `countryToPrimaryLang(country: ISOCountryCode): string`. Internal: `COUNTRY_TO_PRIMARY_LANG` const map.
- `apps/public/src/views/detail.tsx` → frozen interface per spec §5.5: `export interface DetailDrawerProps { slug: ResortSlug }; export default function DetailDrawer(_: DetailDrawerProps): JSX.Element`. Body throws `'detail route stub — lands in PR 3.5'`.
- `apps/public/src/App.tsx` → imports `react` (`Suspense`, `lazy`, `Fragment`, `Component`, `startTransition`), `@snowboard-trip-advisor/design-system` (`Shell`), `./state/useURLState`, `./state/useDataset`, `./state/useDocumentMeta`, `./state/useScrollReset`, `./state/useDroppedSlugs`, `./views/cards`, `./views/states/{DatasetLoading,DatasetUnavailable,NoResorts}`, `./views/DroppedSlugsBanner`, `./views/ShortlistDrawer` (PR 3.3 stub OK to predict), `./lib/errors`. `MatrixView` and `DetailDrawer` are `lazy()`-imported.

### Steps

- [ ] **Step 3.1: Branch off main.** Same pattern.

- [ ] **Step 3.2: Schema split — TDD-first (procedural detail).**

  Procedure (`git mv`-style migration, no duplicate test bodies in intermediate commits):

  1. **Test (NEW file):** Create `packages/schema/src/loadResortDatasetFromObject.test.ts` covering all projection branches by invoking `loadResortDatasetFromObject(jsonObject, opts)` directly (no path). Tests cover: durable-fresh field, live-fresh, live-stale, live-never_fetched, validator-failure path returns `{ ok: false, issues }`. Run: FAIL — file not found.
  2. **Impl (NEW file):** Create `loadResortDatasetFromObject.ts` with the projection logic (copy from `loadResortDataset.ts`'s body except the `JSON.parse(await readFile(...))` head). Run: PASS.
  3. **Refactor (existing file):** Replace `loadResortDataset.ts`'s body with the 4-line Node wrapper: `const raw: unknown = JSON.parse(await readFile(path, 'utf8')); return loadResortDatasetFromObject(raw, opts)`.
  4. **Trim (existing test):** In `loadResortDataset.test.ts`, **keep only** the one happy-path test that asserts the wrapper round-trip works against the live `data/published/current.v1.json` (i.e., `await loadResortDataset(FIXTURE_PATH) === ok: true with views.length === 2`). **Delete** the projection-branch tests that moved to `loadResortDatasetFromObject.test.ts` (no duplication; coverage stays at 100%). **Add one Node-wrapper-specific test:** `await expect(loadResortDataset('/nonexistent/path.json')).rejects.toThrow()` — covers the `readFile` ENOENT path that the pure function doesn't.
  5. **Re-export:** `index.ts` adds `loadResortDatasetFromObject` named export.
  6. Run: `npm run --workspace=@snowboard-trip-advisor/schema test` — PASS at 100% coverage.
  7. Commit:
     ```bash
     git add packages/schema/src/{loadResortDatasetFromObject,loadResortDataset}.{ts,test.ts} packages/schema/src/index.ts
     git commit -s -m "refactor(schema): split loadResortDataset into pure (FromObject) + Node wrapper"
     ```

- [ ] **Step 3.3: design-system `format.ts` — TDD-first.**

  - **Test:** `format.test.ts` covers `formatNumber`, `formatMoney`, `formatPercent`, `formatMonths`, `formatDateRelative` with destructured-primitive signatures. Each takes plain primitives (e.g. `formatMoney({ amount: number, currency: string })`); never imports schema branded types.
  - **Impl:** `format.ts`. Update `index.ts` re-export.
  - Run: green.
  - Commit: `feat(design-system): format.ts — destructured-primitive formatters (no schema imports)`.

- [ ] **Step 3.4: design-system `Shell` + `Skeleton` + `EmptyStateLayout` — TDD-first.**

  Each component: write `*.test.tsx` first asserting render contract + `jest-axe` per state (default + focus). Implement. Re-export from `index.ts`. Commit per component.

- [ ] **Step 3.5: `apps/public/src/lib/lang.ts` — TDD-first.**

  Test asserts: every entry in `COUNTRY_TO_PRIMARY_LANG` matches `/^[a-z]{2,3}(-[A-Z]{2,4})?$/`; CZ → `cs`; PL → `pl`; AT → `de`; CH → `de`; FR → `fr`; IT → `it`; ES → `es`; SE → `sv`; unknown country falls back to `'en'`. Implement. Commit.

- [ ] **Step 3.6: `apps/public/src/lib/urlState.ts` — TDD-first.**

  Tests cover: round-trip `parseURL ∘ serializeURL`; unknown keys ignored; defaults omitted on serialize; `&shortlist` head-truncated to 6 on both parse + serialize; `&highlight` validated against `z.enum(METRIC_FIELDS)` (invalid dropped); deviation-from-§2.1 cases (`view=cards|matrix` only — no `detail`; `&detail=<slug>` overlay; `&sort` includes `snow_depth_desc`). Dev-only `window.__sta_debug.urlParseFailures` populated on parse failure (only when `import.meta.env.DEV`).

  Implement. Commit.

- [ ] **Step 3.7: `apps/public/src/lib/router.ts` + `errors.ts` + `datasetFetch.ts` + `deepLinks.ts` (skeleton) — TDD-first each.**

  - `router.ts`: `urlToView({ view }) → 'cards' | 'matrix'`. Pure.
  - `errors.ts`: `DatasetFetchError` (with `kind: 'fetch' | 'parse'`), `DatasetValidationError` (with `issues`), `onDatasetError(err): void` no-op.
  - `datasetFetch.ts`: `fetchDataset(now?: Date): Promise<LoadResult>` per spec §4.2 (handles network error → `DatasetFetchError('Network error', 'fetch', undefined, { cause })`; non-OK → `DatasetFetchError(`HTTP ${status}`, 'fetch', status)`; JSON parse error → `DatasetFetchError('Malformed JSON', 'parse', status, { cause })`; otherwise delegates to `loadResortDatasetFromObject`). Tests use MSW handlers.
  - `deepLinks.ts`: skeleton — exports `BookingDeepLink` + `AirbnbDeepLink` types and stub builder functions that throw `'lands in PR 3.5'`. `views/detail.tsx` will import the types but PR 3.1c's stub-throw body never calls them. (This file exists at PR 3.1c so PR 3.5's diff is just a body fill, not a new file.)

  Commit each file.

- [ ] **Step 3.8: State hooks — TDD-first per hook.**

  Order: `useLocalStorageState` → `useMediaQuery` → `useURLState` → `useDataset` → `useDocumentMeta` → `useShortlist` (skeleton) → `useScrollReset` (stub) → `useDroppedSlugs`.

  Per hook: tests in `*.test.ts`, hook in `*.ts`. Use the Section-6 contracts from the spec. Module-level state in `useURLState` (`subscribers`) and `useDataset` (`cached`) is declared in JSDoc on the file. `useDataset` exports `__resetForTests` and includes the HMR cache-reset block (`if (import.meta.hot) import.meta.hot.accept(() => { cached = null })`). Add the HMR block to `apps/public/vite.config.ts`'s `coverage.exclude` with the rationale string from §10.4.

  Add the JSDoc-presence test to `useURLState.test.ts` (per §10.5): reads the source text, asserts `@warning` block present on `setURLState`'s JSDoc.

  Add the contamination regression test to `useDataset.test.ts` (per §7.7): two consecutive renders, MSW request-log shows independent fetches.

  Commit per hook.

- [ ] **Step 3.9: `apps/public/src/views/states/{DatasetLoading,DatasetUnavailable,NoResorts}.tsx` — TDD-first per file.**

  `DatasetUnavailable.test.tsx` covers all four error display branches (always copy + retry; `kind: 'fetch'` copy; `kind: 'parse'` copy; `instanceof DatasetValidationError` copy + 20-issue cap with `+N more`). Both `import.meta.env.DEV` branches via `vi.stubEnv('DEV', false)`. `role="alert"` + focus-on-mount asserted.

  `NoResorts.test.tsx` exercises via a filter-yields-zero scenario (so the file is reachable for 100% coverage post-validator-min(1)).

  Commit each.

- [ ] **Step 3.10: `apps/public/src/views/{cards,detail,DroppedSlugsBanner,ShortlistDrawer}.tsx` — TDD-first per file.**

  - `cards.tsx`: renders `views.length` count from `useDataset()`; `cards.test.tsx` asserts the count for the seed dataset (2 resorts). PR 3.2 replaces.
  - `detail.tsx`: spec §5.5 frozen interface; body throws. `detail.test.tsx` asserts `expect(() => render(<DetailDrawer slug={someSlug as ResortSlug} />)).toThrow('detail route stub — lands in PR 3.5')`.
  - `DroppedSlugsBanner.tsx`: stub returns `null`; `DroppedSlugsBanner.test.tsx` asserts the null render. Real wiring in PR 3.6.
  - **`ShortlistDrawer.tsx`** (stub returns `null`): exists so `App.tsx`'s import resolves at this PR. `ShortlistDrawer.test.tsx` asserts the null render. Full implementation lands in PR 3.3 Step 5.5.

  Commit each.

- [ ] **Step 3.11: Replace `apps/public/src/App.tsx` with the real composition.**

  Per spec §4.4 + §3.7 example. Inline `class ShellErrorBoundary` (collapsed from the dropped `components/AppShell.tsx`). Lifecycle pair: `static getDerivedStateFromError(error)` returns `{ hasError: true, error }`; `componentDidCatch(err)` calls `onDatasetError(err)`. `render()` checks `state.hasError` and either renders `<DatasetUnavailable />` or wraps children in `<Fragment key={retryKey}>`.

  `App.test.tsx`: asserts the render lifecycle order (mount → fallback shows; promise resolves → content shows; promise rejects → error UI replaces). Both error-boundary lifecycle methods asserted (componentDidCatch invokes `onDatasetError` once). Retry path via `startTransition` + `key` bump. Skip-link click moves focus to `<main id="main">`.

  Commit:
  ```bash
  git add apps/public/src/{App.tsx,App.test.tsx}
  git commit -s -m "feat(public): App composition — Shell + ErrorBoundary + Suspense + URL→view dispatch"
  ```

- [ ] **Step 3.12: Full QA + dev smoke.**

  ```bash
  npm run qa                                      # green
  npm run --workspace=@snowboard-trip-advisor/public-app dev   # browser shows DatasetLoading → CardsView placeholder
  ```

  Manually probe error path: temporarily break the dataset path, reload — `<DatasetUnavailable>` renders with Retry. Restore, retry — content reappears. Document in PR description.

- [ ] **Step 3.13: Acceptance gate (lift from spec §7.7).**

  - `npm run qa` green.
  - Foundation states (`<DatasetLoading>`, `<DatasetUnavailable>`, `<NoResorts>`) render as expected (asserted in their respective test files).
  - Nav-to-detail in App.tsx is gated by URL state; `views/detail.test.tsx` asserts the throw line.
  - `useDataset` contamination regression passes (independent fetch counts asserted via MSW request log).
  - `App.tsx` lazy-imports `views/detail` at the path the frozen interface promises (`./views/detail`).

- [ ] **Step 3.14: Subagent review.** Brief covers `packages/schema/**` (split + min(1) ripple verified), `packages/design-system/**` (Shell/Skeleton/EmptyStateLayout/format.ts), and the frozen interface contract preserved (§5.5). Fold findings.

- [ ] **Step 3.15: Open PR.**

---

## Task 4 — PR 3.2: CardsView + design-system component fan-out

**Spec ref:** §7.8. **Subagent triggers:** `packages/design-system/**`. **Depends on:** Task 3 merged. **Branch:** `epic-3/pr-3.2-cards-view`. **README:** evaluate (cards landing is product-facing — likely a one-paragraph addition).

**Files:**

- `packages/design-system/src/components/{Button,IconButton,Input,Select,Chip,Pill,Card,SourceBadge,FieldValueRenderer,HeaderBar}.tsx` + each one's `.test.tsx`.
- `packages/design-system/src/icons/sources/{opensnow,snowforecast,resort-feed,booking,airbnb,manual}.tsx` + tests.
- `packages/design-system/src/icons/ui/{star,close,info,chevron-down}.tsx` + tests.
- `packages/design-system/src/primitives/Tooltip.tsx` + test.
- Modify `packages/design-system/src/index.ts` — re-export all of the above.
- `apps/public/src/views/cards.tsx` (replace 3.1c placeholder) + test, `views/ResortCard.tsx` + test, `views/Hero.tsx` + test, `views/FilterBar.tsx` + test.
- `apps/public/public/hero.jpg` — self-hosted.

**Imports per file (highlights):**

- `SourceBadge.tsx` → imports `@snowboard-trip-advisor/schema` (type-only `SourceKey`), `../icons/sources/{...}`. Public: `<SourceBadge source>`. Internal const: `SOURCE_GLYPHS satisfies Record<SourceKey, IconComponent>` (compile-time exhaustive).
- `FieldValueRenderer.tsx` → imports `@snowboard-trip-advisor/schema` (type-only `FieldValue`), `./SourceBadge`, `./Pill`, `../primitives/Tooltip`, `../format`. Public: `<FieldValueRenderer<T> field formatter unit? missingLabel? missingTooltip?>`.
- `apps/public/src/views/ResortCard.tsx` → imports `@snowboard-trip-advisor/schema` (type-only `ResortView`), `@snowboard-trip-advisor/design-system` (`Card`, `IconButton`, `Pill`, `Button`, `FieldValueRenderer`, icons), `../state/useShortlist`, `../lib/lang`. The star `<IconButton>` carries `data-detail-trigger="<slug>"` per §5.5.
- `apps/public/src/views/FilterBar.tsx` → imports `@snowboard-trip-advisor/design-system` (`Select`, `Chip`), `../state/useURLState`, `../state/useDataset`. Accepts `slot?: ReactNode` prop (filled by PR 3.4 with the view toggle); renders `null` for the slot at this PR.

### Steps

- [ ] **Step 4.1: Add design-system Radix dependency.**

  In `packages/design-system/package.json`, add to `dependencies`: `@radix-ui/react-tooltip`. (Modal + Drawer's Radix deps land in Task 5; isolated here to keep Task 4's tooltip self-contained.)

  ```bash
  npm install --workspace=@snowboard-trip-advisor/design-system
  ```

  Commit: `chore(design-system): add @radix-ui/react-tooltip`.

- [ ] **Step 4.2: `Button` — TDD-first.**

  Test variants: `primary | secondary | ghost`; `disabled` state; `aria-pressed` if used as toggle; axe-clean per state. Impl. Re-export from `index.ts`. Commit: `feat(design-system): Button (primary/secondary/ghost)`.

- [ ] **Step 4.3: `IconButton` — TDD-first.**

  Test: `aria-label` required; square hit-area; passes through `data-*` attributes (needed for §5.5 `data-detail-trigger`). Impl. Re-export. Commit.

- [ ] **Step 4.4: `Pill` — TDD-first.**

  Test: variant `stale` adds the stale indicator; default and `stale` axe-clean. Impl. Commit.

- [ ] **Step 4.5: `Chip` — TDD-first.**

  Test: `aria-pressed` on toggle; click-to-toggle; disabled. Impl. Commit.

- [ ] **Step 4.6: `Card` — TDD-first.**

  Test: variants (`elevated | flat`); composition (header / body / footer slots if used). Impl. Commit.

- [ ] **Step 4.7: `Select` (native) — TDD-first.**

  Test: native `<select>` rendered; `value` / `onChange` propagation; `disabled`; axe per state. Per ADR-0004 the native control's a11y trade-off is documented in JSDoc. Impl. Commit.

- [ ] **Step 4.8: `Input` (native) — TDD-first.**

  Test: text and date variants; `disabled`; `aria-invalid`; axe per state. JSDoc references ADR-0004 for native-date-input quirks. Impl. Commit.

- [ ] **Step 4.9: Source glyphs — `icons/sources/{opensnow,snowforecast,resort-feed,booking,airbnb,manual}.tsx`.**

  One commit per source glyph file. Test per file: `currentColor` for stroke/fill; size token prop accepted; no hex literals (lint rule will catch). Impl. After all six land, re-export the const map `SOURCE_GLYPHS satisfies Record<SourceKey, IconComponent>` from a barrel `icons/sources/index.ts`. Commit: `feat(design-system): bundled source glyphs (6) with currentColor + size prop`.

- [ ] **Step 4.10: UI glyphs — `icons/ui/{star,close,info,chevron-down}.tsx`.**

  One commit covering all four (small files; not user-facing nuance). Same `currentColor` + size-prop pattern. Commit.

- [ ] **Step 4.11: `primitives/Tooltip.tsx` — TDD-first.**

  Test: focus shows tooltip; Escape dismisses; `role="tooltip"`; axe-clean. Wrap `@radix-ui/react-tooltip`. Commit.

- [ ] **Step 4.12: `SourceBadge` — TDD-first.**

  Test: each `SourceKey` renders the matching glyph + display name; the const map satisfies `Record<SourceKey, IconComponent>` (asserted by TypeScript at compile-time, NOT a runtime test); never fetches favicons (CSP + zero-tracking — assert via `vi.spyOn(global, 'fetch')` not called). Impl. Commit.

- [ ] **Step 4.13: `FieldValueRenderer<T>` — TDD-first.**

  Test the three states from `FieldValue<T>`: `fresh` → value + SourceBadge + observed_at tooltip; `stale` → same + `<Pill variant="stale">` + age-days tooltip; `never_fetched` → `missingLabel` + `missingTooltip`. `formatter` typed-key dispatch into design-system `format.ts` (not a function prop). Impl. Commit.

- [ ] **Step 4.14: `HeaderBar` — TDD-first.**

  Test: brand link + Shortlist link slot + view-toggle slot (PR 3.4 fills it). Impl. Commit.

- [ ] **Step 4.15: `apps/public/src/views/Hero.tsx` — TDD-first.**

  Test asserts heading semantic (`<h1>`); bg-image is decorative (CSS background, not `<img alt>`); axe-clean. Implement (commit hero photo at `apps/public/public/hero.jpg`, ≤200 KB, self-hosted). Commit.

- [ ] **Step 4.16: `apps/public/src/views/FilterBar.tsx` — TDD-first.**

  Tests: country chip group hidden when `new Set(views.map((v) => v.country)).size <= 1` — exercised with an in-test single-country fixture (the seed dataset has 2 countries; chip-hidden branch unreachable without the fixture); sort `<Select>` drives `&sort=` URL via `setURLState`; bucketed price `<Select>` drives an internal `priceBucket` state (not URL-shared per §3.1; private filter UX); `slot?: ReactNode` prop renders `null` until PR 3.4 fills it. Run: FAIL. Implement. Run: PASS. Commit.

- [ ] **Step 4.17: `apps/public/src/views/ResortCard.tsx` — TDD-first.**

  Tests: composition (`<Card>` wraps hero photo + heading); `<h2 lang={countryToPrimaryLang(resort.country)}>` (CZ → `cs`, PL → `pl` per §6.6 — assert against both seed resorts); four `<FieldValueRenderer>` (durable: altitude_m, slopes_km; live: snow_depth_cm, lift_pass_day); `<Pill>` for snow conditions when present; star `<IconButton data-detail-trigger={resort.slug} aria-pressed={isShortlisted}>` for shortlist toggle; "Browse lodging near X" `<Button>` with `rel="noopener noreferrer"` + `referrerpolicy="no-referrer"`; axe-clean. Run: FAIL. Implement (uses `useShortlist` for star state). Run: PASS. Commit.

- [ ] **Step 4.18: Replace `apps/public/src/views/cards.tsx` placeholder with the real CardsView — TDD-first.**

  Test: renders `<Hero>` + `<FilterBar>` + cards grid; sort applied from URL state (`useURLState`); country filter applied as `views.filter((v) => countries.length === 0 || countries.includes(v.country))`; axe-clean. Run: FAIL (current cards.tsx is the 3.1c placeholder). Replace impl. Run: PASS. Commit.

- [ ] **Step 4.19: README + integration smoke.**

  Update `README.md` to mention the cards landing route under product overview (one paragraph). Update PR description with README evaluation outcome.

  ```bash
  npm run qa
  npm run --workspace=@snowboard-trip-advisor/public-app dev
  # Manual check: navigate http://localhost:5173/?sort=snow_depth_desc
  # Both seed resorts render with FieldValueRenderer + SourceBadge + observed_at tooltip.
  ```

- [ ] **Step 4.20: Acceptance gate (lift from spec §7.8).**

  - `npm run qa` green.
  - `cards.test.tsx` asserts cards re-sort live on `&sort=` change.
  - `ResortCard.test.tsx` asserts star toggles `aria-pressed`.
  - `ResortCard.test.tsx` asserts both seed slugs render with the four named live + durable fields each.

- [ ] **Step 4.21: Subagent review** + open PR.

---

## Task 5 — PR 3.3: Shortlist & sharing

**Spec ref:** §7.9. **Subagent triggers:** `packages/design-system/**`. **Depends on:** Task 4 merged (or 3 merged + Drawer not yet a consumer of cards-path components beyond Card/IconButton). **Branch:** `epic-3/pr-3.3-shortlist`. **README:** evaluate (shortlist is product-facing).

**Files:**

- `packages/design-system/src/primitives/{Modal,Drawer}.tsx` + tests.
- Modify `packages/design-system/src/index.ts`.
- `apps/public/src/views/{ShortlistDrawer,MergeReplaceDialog,ShareUrlDialog}.tsx` + tests.
- Modify `apps/public/src/state/useShortlist.ts` + `useShortlist.test.ts` — full rules: hydration-only mirror, `setEqual` collision detection, head-6 truncation, dedupe.

**Imports per file (highlights):**

- `Modal.tsx` → imports `@radix-ui/react-dialog`. Wrapper: focus trap + scroll lock + Escape. Public: `<Modal open onOpenChange title>`.
- `Drawer.tsx` → imports `@radix-ui/react-focus-scope`, `@radix-ui/react-dismissable-layer`. Public: `<Drawer open onOpenChange position="left"|"right" defaultOpen? initialFocus? onAnimationEnd?>` (full prop superset per §5.5 + §7.9).
- `apps/public/src/views/ShortlistDrawer.tsx` → imports `@snowboard-trip-advisor/design-system` (`Drawer`, `Button`, `IconButton`), `../state/useShortlist`, `../state/useURLState`. Renders the shortlist list with per-row remove + "Open Matrix" CTA (`hidden <md`).
- `apps/public/src/views/MergeReplaceDialog.tsx` → imports `Modal`, `Button`. Wrapped in `<form onSubmit>` so Enter submits.
- `apps/public/src/views/ShareUrlDialog.tsx` → imports `Modal`, `Button`, `Input`. Clipboard happy path + fallback `<input>` for unsupported `navigator.clipboard`.

### Steps

- [ ] **Step 5.1: Add design-system Radix dependencies.**

  In `packages/design-system/package.json`, add to `dependencies`: `@radix-ui/react-dialog`, `@radix-ui/react-focus-scope`, `@radix-ui/react-dismissable-layer`.

  ```bash
  npm install --workspace=@snowboard-trip-advisor/design-system
  ```

  Commit: `chore(design-system): add Radix Dialog + FocusScope + DismissableLayer`.

- [ ] **Step 5.2: `primitives/Modal.tsx` — TDD-first.**

  Tests: focus trap (`Tab` cycles within); scroll lock (`document.body.style.overflow === 'hidden'` while open); Escape dismisses; focus returns to trigger; axe-clean in open + closed states. Run: FAIL. Implement (Radix `Dialog` wrapper). Run: PASS. Commit.

- [ ] **Step 5.3: `primitives/Drawer.tsx` — TDD-first.**

  Tests: non-modal (cards behind clickable via mouse; assert pointer-events propagate); keyboard focus inside when keyboard-active (FocusScope `trapped` only when `data-keyboard-nav`); Escape dismisses; outside-click dismisses; focus return to trigger; full prop superset exercised (`defaultOpen` opens on mount; `initialFocus` ref receives focus on open; `onAnimationEnd` fires after slide); `<Drawer>` mounts at xs/sm/md/lg via `vi.spyOn(window, 'matchMedia')` per breakpoint (per spec §7.9 acceptance gate); `prefers-reduced-motion` collapses slide via the design-token CSS-var override (assert via `vi.spyOn(window, 'matchMedia')` returning `matches: true` for `(prefers-reduced-motion: reduce)`); axe-clean per state. Run: FAIL. Implement (Radix `FocusScope` + `DismissableLayer`). Run: PASS. Commit.

- [ ] **Step 5.4: Harden `useShortlist` — TDD-first.**

  Tests: hydration only when URL has no `&shortlist=` (mirror read on first mount only); `setEqual([a,b,c],[c,b,a]) === true` ⇒ no dialog trigger (URL-order silently adopted); `[a,b]` vs `[b,c]` ⇒ dialog trigger; mirror writes on URL change; `sta-shortlist-last-known` localStorage key (not `sta-shortlist-mirror` — see spec §6.1). Run: FAIL (3.1c shipped a skeleton). Implement. Run: PASS. Commit.

- [ ] **Step 5.5: `views/ShortlistDrawer.tsx` — TDD-first.**

  Tests: drawer opens via Shortlist link in HeaderBar; per-row remove via `<IconButton>`; "Open Matrix" CTA hidden `<md` (`vi.spyOn(matchMedia)` returning `matches: false` for `(min-width: 900px)`) — and removed from tab order, not just disabled (assert via `tabIndex` or `display: none`); axe-clean in open state. Run: FAIL. Implement (replaces 3.1c stub). Run: PASS. Commit.

- [ ] **Step 5.6: `views/MergeReplaceDialog.tsx` — TDD-first.**

  Tests: opens when `useShortlist` collision-detection fires; `<form onSubmit>` wraps controls (Enter submits); preview of merged shortlist rendered with the `setEqual`-tested order; "Merge" / "Replace" / "Keep mine" buttons work as specced (§3.5); axe-clean. Run: FAIL. Implement (uses `<Modal>`). Run: PASS. Commit.

- [ ] **Step 5.7: `views/ShareUrlDialog.tsx` — TDD-first.**

  Tests: clipboard happy path mocked via `vi.spyOn(navigator.clipboard, 'writeText')`; fallback `<input>` rendered when `navigator.clipboard` is undefined (`vi.stubGlobal('navigator', { ...navigator, clipboard: undefined })`); copy-success feedback (toast or transient message); axe-clean. Run: FAIL. Implement (uses `<Modal>`). Run: PASS. Commit.

- [ ] **Step 5.8: README + integration smoke.**

  Update README.md with shortlist + share URL feature mention (product-facing, one paragraph). Document README outcome in PR description.

  ```bash
  npm run qa
  npm run --workspace=@snowboard-trip-advisor/public-app dev
  # Manual check: star-toggle a card → drawer opens → close → URL retains &shortlist=<slug>; share link → MergeReplaceDialog on paste in fresh tab.
  ```

- [ ] **Step 5.9: Acceptance gate (lift from spec §7.9).**

  - `npm run qa` green.
  - star → drawer ↔ URL ↔ localStorage three-way coherence asserted in tests.
  - share-URL paste in fresh session triggers MergeReplaceDialog when local exists; same-set/different-order does NOT trigger.
  - Drawer renders at every named breakpoint (xs/sm/md/lg).

- [ ] **Step 5.10: Subagent review** + open PR.

---

## Task 6 — PR 3.4: MatrixView + view toggle

**Spec ref:** §7.10. **Subagent triggers:** `packages/design-system/**`. **Depends on:** Task 5 merged. **Branch:** `epic-3/pr-3.4-matrix-view`. **README:** evaluate.

**Files:**

- `packages/design-system/src/components/{Table,ToggleButtonGroup}.tsx` + tests.
- `apps/public/src/views/matrix.tsx` (lazy chunk) + test.
- `apps/public/src/views/matrix.module.css` — drawer-on-matrix downgrade rule per §3.3.
- Modify `apps/public/src/views/FilterBar.tsx` — fill `slot` prop with `<ToggleButtonGroup>` for cards/matrix.

**Imports per file (highlights):**

- `Table.tsx` → no Radix; sticky header via CSS `position: sticky`. No horizontal scroll affordance (per §5.1 spec — dropped from contract).
- `ToggleButtonGroup.tsx` → imports `react`. Public: `<ToggleButtonGroup options selected onChange>`. `aria-pressed` per option (NOT `role="tab"` per parent §2.4).
- `matrix.tsx` → imports `@snowboard-trip-advisor/design-system` (`Table`), `../state/useURLState` (for `&highlight=`), `../state/useShortlist`, `../state/useMediaQuery` (`md` breakpoint). Lazy `default` export.

### Steps

- [ ] **6.1: `Table` + `ToggleButtonGroup` design-system components.**

- [ ] **6.2: `matrix.tsx` lazy chunk — TDD-first.**

  Tests: empty shortlist → "Add resorts to compare"; non-empty → table with shortlisted resorts × `MetricPath` rows; `&highlight=snow_depth_cm` highlights the column; viewport `<md` → redirect message; lazy chunk fetched only when navigating to matrix (asserted via MSW request log on the chunk URL — Vite dev serves `/src/views/matrix.tsx`).

- [ ] **6.3: Update FilterBar.**

  Fill the `slot` prop with `<ToggleButtonGroup>`. Test asserts view toggle pushes `&view=` (PUSH transition — back closes).

- [ ] **6.4: `matrix.module.css`.**

  Add the `<lg` + `&detail=` downgrade rule. Acceptance gate (per §7.11): `matrix.module.css.test.ts` reads the module text and asserts the `@media` rule string is present (JSDOM does not evaluate `@media`).

- [ ] **6.5: README + integration smoke.**

  Update README.md with matrix view feature mention. PR description records README outcome.

  ```bash
  npm run qa
  npm run --workspace=@snowboard-trip-advisor/public-app dev
  # Manual check: cards landing → click "Matrix" toggle → matrix renders; back-button returns to cards.
  ```

- [ ] **6.6: Acceptance gate (lift from spec §7.10).**

  - `npm run qa` green.
  - `matrix.test.tsx` asserts the chunk fetch via MSW request log (lazy chunk loaded only when navigating).
  - `useURLState.test.ts` asserts back-button navigation (`PopStateEvent`) returns from `?view=matrix` to `?view=cards`.
  - Bundle visualizer (manual check at this PR; CI integration in PR 3.6) shows matrix in its own chunk.
  - `matrix.module.css.test.ts` reads the module text and asserts the `<lg + &detail` downgrade rule's `@media` rule string is present.

- [ ] **6.7: Subagent review** + open PR.

---

## Task 7 — PR 3.5: DetailDrawer body (parallelizable with 3.2/3.3/3.4)

**Spec ref:** §7.11. **Subagent triggers:** none (apps-only); subagent review optional. **Depends on:** Task 3 merged. **Branch:** `epic-3/pr-3.5-detail-drawer`. **README:** evaluate.

**Files:**

- Modify `apps/public/src/lib/deepLinks.ts` — replace 3.1c stubs with real Booking + Airbnb deep-link builders.
- Modify `apps/public/src/lib/deepLinks.test.ts` — full builder coverage.
- Replace `apps/public/src/views/detail.tsx` body (interface unchanged).
- Modify `apps/public/src/views/detail.test.tsx` — replace stub-throw test with full happy-path tests.

**Imports declared per file:**

- `deepLinks.ts` → no external imports; pure URL construction. Public: `bookingDeepLink({ slug, name, override?, trip? })`, `airbnbDeepLink({ slug, name, override?, trip? })`. All user-controlled segments `encodeURIComponent`-wrapped.
- `views/detail.tsx` → imports `@snowboard-trip-advisor/schema` (`ResortSlug`, type-only `ResortView`), `@snowboard-trip-advisor/design-system` (`Drawer`, `Button`, `Card`, `FieldValueRenderer`), `../state/useDataset`, `../state/useURLState`, `../lib/deepLinks`, `../lib/lang`. Default export `DetailDrawer({ slug }: DetailDrawerProps)`.

### Steps

- [ ] **7.1: `deepLinks.ts` builders — TDD-first.**

  Tests: round-trip `encodeURIComponent` parity; malicious slug `';drop table--` doesn't escape into URL; both builders return URLs starting with the canonical base.

- [ ] **7.2: `views/detail.tsx` body — TDD-first (test-update precedes impl-replace).**

  **Test first:** in `views/detail.test.tsx`, replace the existing 3.1c stub-throw assertion with the full happy-path tests: drawer mounts when slug exists; close → URL clears (`&detail=` removed via `pushState`); focus returns to `[data-detail-trigger="<slug>"]`; axe-clean in drawer-open state; deep-link href includes the slug `encodeURIComponent`-encoded; honesty micro-copy text present; security attrs (`rel="noopener noreferrer"` + `referrerpolicy="no-referrer"`) present on every external `<a>`.

  Run: FAIL — body still throws.

  **Impl second:** drop the throw in `views/detail.tsx`. Implement the drawer composition per §2.2 + §7.11: `<Drawer position="right" open onOpenChange={close}>` containing hero photo, name (`lang={countryToPrimaryLang(resort.country)}`), country, "Snow conditions" section (live `<FieldValueRenderer>` rows), "Terrain stats" (durable rows), "Trip note" (analyst-note text — plain text Phase 1), "Browse lodging near X" CTA (`<Button>` with `rel="noopener noreferrer"` + `referrerpolicy="no-referrer"`; `href` from `bookingDeepLink(...)`), honesty micro-copy below. **Do NOT modify `App.tsx`** — the frozen interface (§5.5) means the lazy-import line stays untouched.

  Run: PASS. Commit.

- [ ] **7.3: README + integration smoke + bundle advisory.**

  Update README.md with detail view feature mention. Open detail drawer in dev browser; verify slide animation, focus trap behavior, deep-link CTA opens new tab with the right URL.

  ```bash
  npm run --workspace=@snowboard-trip-advisor/public-app build
  # Inspect dist/ — detail chunk should be its own file separate from initial chunk.
  ```

  Attach `npm run analyze` advisory output to PR description (warn-mode CI gate lands in PR 3.6).

- [ ] **7.4: Acceptance gate (lift from spec §7.11).**

  - `npm run qa` green.
  - Opening detail produces a lazy chunk fetch (asserted via MSW request log in `detail.test.tsx`).
  - Bundle visualizer shows detail in its own chunk.
  - `App.tsx` is byte-identical to its post-PR-3.1c state (`git diff main -- apps/public/src/App.tsx` returns nothing).

- [ ] **7.5: PR open** (subagent review optional — apps-only, no §7.2 trigger).

---

## Task 8 — PR 3.6: Integration tests + bundle analysis

**Spec ref:** §7.12. **Subagent triggers:** `.github/workflows/**`. **Depends on:** Tasks 4 / 5 / 6 / 7 merged. **Branch:** `epic-3/pr-3.6-integration`. **README:** skip.

**Files:**

- Create `tests/integration/apps/public/cards-empty.test.ts`, `cards-loaded.test.ts`, `matrix.test.ts`, `detail-open.test.ts`.
- Modify `apps/public/src/views/DroppedSlugsBanner.tsx` — final wiring (replace 3.1c stub).
- Modify `apps/public/src/state/useScrollReset.ts` — final wiring.
- Modify `apps/public/src/views/DroppedSlugsBanner.test.tsx`, `apps/public/src/state/useScrollReset.test.ts` — final scenarios.
- Create `scripts/check-bundle-budget.ts` + `scripts/check-bundle-budget.test.ts`.
- Modify root `package.json` — add `npm run analyze` script.
- Modify `.github/workflows/quality-gate.yml` — add `npm run analyze` step (warn mode).

### Steps

- [ ] **8.1: Final wiring of DroppedSlugsBanner + useScrollReset.**

  Tests cover: DroppedSlugsBanner renders the dropped-slugs aside when `useDroppedSlugs()` returns a non-empty set; `useScrollReset` fires `window.scrollTo(0, 0)` only on `view` transitions (not sort/filter).

- [ ] **8.2: Integration tests.**

  Each integration test in `tests/integration/apps/public/`:
  - Sets up MSW with the seed-fixture handler.
  - Renders `<App />` at the appropriate URL.
  - Awaits Suspense resolution via `findBy*`.
  - Asserts focus order across composed routes (Shell skip-link → HeaderBar → FilterBar → main content → drawer affordances).
  - Runs `jest-axe` on the rendered tree.

  Order:
  - `cards-empty.test.ts`: `?country=XX` (filter yields zero) → `<NoResorts>` renders (defence-in-depth) + axe.
  - `cards-loaded.test.ts`: default URL → cards render + focus order + axe.
  - `matrix.test.ts`: `?view=matrix&shortlist=kotelnica-bialczanska,spindleruv-mlyn&highlight=snow_depth_cm` → matrix renders with column highlight + axe.
  - `detail-open.test.ts`: `?detail=kotelnica-bialczanska` → drawer renders over cards + close → focus returns to `[data-detail-trigger]` + axe.

- [ ] **8.3: `scripts/check-bundle-budget.ts` — TDD-first.**

  - Test: given a `rollup-plugin-visualizer` JSON output fixture, computes initial-chunk gzip total; over 100 KB → logs `WARN: initial chunk gzip = X KB exceeds 100 KB advisory budget` and exits 0; under → exits 0 silently.
  - Implement. Commit.

- [ ] **8.4: `scripts/check-preload-hrefs.ts` — TDD-first (per spec §10.7).**

  Required by spec §10.7 ("PR 3.6 ships a CI smoke test that asserts each emitted preload href resolves to a real file in `dist/`"). Catches the silent-404 mode where Vite renames the woff2 asset but the import URL doesn't update.

  - Test: given a fixture `dist/index.html` and matching/missing files in fixture `dist/`, parses every `<link rel="preload" as="font">` href, resolves against `dist/`, asserts existence; on missing → exits 1 with the offending href; on all-present → exits 0.
  - Implement. Commit.

- [ ] **8.5: `scripts/check-dist-dataset.ts` — TDD-first (per spec §10.2 nginx contract verification).**

  Required by spec §10.2 ("Verification at Epic 3 close: PR 3.6's CI step asserts `dist/data/current.v1.json` exists post-build").

  - Test: given a fixture `dist/`, asserts `dist/data/current.v1.json` exists and parses as valid JSON matching the published-dataset shape (sanity-check the schema's envelope keys, not full validation).
  - Implement. Commit.

- [ ] **8.6: Add `npm run analyze` script + wire all three checks.**

  Root `package.json` adds:
  ```json
  "analyze": "npm run --workspace=@snowboard-trip-advisor/public-app build && tsx scripts/check-bundle-budget.ts apps/public/dist/stats.json && tsx scripts/check-preload-hrefs.ts apps/public/dist && tsx scripts/check-dist-dataset.ts apps/public/dist"
  ```

  (Adjust the `rollup-plugin-visualizer` invocation in `apps/public/vite.config.ts` to emit `stats.json` at build time when `process.env.ANALYZE === '1'` or always, depending on plugin config.)

  Run:
  ```bash
  npm run analyze
  ```
  Expected: all three checks exit 0 (one warns if over budget).

  Commit: `chore: npm run analyze (bundle budget + preload-href + dist-dataset checks)`.

- [ ] **8.7: CI workflow update.**

  In `.github/workflows/quality-gate.yml`, add a step after `npm run qa`: `npm run analyze`.

  - `check-bundle-budget` runs in `warn` mode (logs over-budget; exits 0 — never blocks merge in Phase 1; Epic 6 follow-up flips to error).
  - `check-preload-hrefs` and `check-dist-dataset` run in `error` mode (exits 1 on failure — these catch deploy-breakage, not budget drift, so they should block).

  Subagent review trigger fires here (`.github/workflows/**` per spec §7.2).

  Commit.

- [ ] **8.8: Final QA + integration suite + analyze.**

  ```bash
  npm run qa
  npm run test:integration
  npm run analyze
  ```

  All green. Attach the `dist/stats.html` visualizer report to PR description.

- [ ] **8.9: Acceptance gate (lift from spec §7.12 + §10.2 + §10.7).**

  - `npm run qa` green.
  - `npm run test:integration` green; axe-clean per route composition.
  - `npm run analyze` green: budget in warn-mode, preload-hrefs + dist-dataset in error-mode.
  - Bundle visualizer report attached.

- [ ] **8.10: Subagent review** (workflow change) + open PR.

---

## Plan completion

After PR 3.6 merges, Epic 3 is shipped:

- 8 PRs landed in dependency order.
- 100% coverage maintained throughout.
- All commits DCO-signed; no `--no-verify` ever used.
- Visual fidelity verified manually against `docs/reference/01.png` + `02.png` (visual regression deferred to Epic 6 per parent spec §6.5).
- Bundle budget tracked (warn mode); Epic 6 follow-up flips to error.

**Next epic:** Epic 4 (`apps/admin`) — see parent spec §3 + §9.

---

## Plan review checklist (run before declaring this plan ready)

Per the writing-plans skill + ai-clean-code-adherence rubric:

- [x] File list per PR fits readably; total new files ~50 against ~5000+ LOC of new code (density ≈ 100 LOC/file — appropriate for a UI app, not bloat).
- [x] No more than 2 layers of abstraction below `App.tsx` (`views/` siblings; `views/states/` subfolder).
- [x] Per-file imports listed for every non-trivial file in PR 3.1b–3.1c (the foundation PRs); subsequent PRs follow the established patterns.
- [x] No abstraction justified by "for testability" or "in case we need it later" — Vite plugin extraction has a concrete coverage rationale; schema split has a concrete browser-bundle rationale.
- [x] "What we are NOT building" section present.
- [x] Cross-cutting reminders consolidated (TDD, DCO, qa, subagent reviews, README).
- [x] Dependency graph + rollback rules carried from spec §7.4.
- [x] Each Task ends with a subagent-review step + an open-PR step.
- [x] Frequent commits inside each Task (one per logical green state, not one per Task).

---

## Execution handoff

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh `general-purpose` subagent per Task with the full Task spec embedded in the prompt; review between Tasks; fast iteration; protects this session's context window from accumulating implementation details.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`; batch execution with checkpoints between Tasks for review.

Subagent-Driven is the right call for an 8-Task plan: each Task is large enough that loading its files into a fresh agent is cheaper than streaming all of them through this session's context.

Pick one to proceed.
