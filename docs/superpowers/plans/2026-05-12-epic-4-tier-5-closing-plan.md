# Epic 4 Tier 5 — Admin Closing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan PR-by-PR. Steps use checkbox (`- [ ]`) syntax for tracking. Each PR is its own atomic concern; do **not** bundle. Read the **Reviewer-fold log** at the bottom before starting Task 1 of any PR. Per memory `feedback_atomic_prs.md`: ≤8 files per PR; one concern per PR.

**Goal:** Close Epic 4 by shipping (a) PR 4.6a polish (keyboard shortcuts + responsive read-only-below-md tab-order discipline) **and a load-bearing spec amendment to §7.16**, (b) PR 4.6b integration backfill (dashboard + resorts-table + full-flow tests), (c) PR 4.6c follow-up fix for the `useWorkspaceState` in-flight-clear race + `flushNow` export + `mod+enter` save wiring.

**Architecture:** PR 4.6a introduces two pure hooks (`useShortcuts`, `useResponsiveTabOrder`) consumed by Shell + FieldRow. **Tab-order discipline below md uses native `disabled` per design-system [Button.tsx:35-40](../../../packages/design-system/src/components/Button.tsx) convention** — overriding the original spec §7.16 wording (`tabIndex={-1}` + `aria-disabled`) per section reviewer P0 finding (WAI-ARIA 1.2: `aria-disabled` without native `disabled` is still mouse-clickable AND visible to AT roving cursors). PR 4.6b adds 3 integration tests against the bridge MSW tier. PR 4.6c adopts the AbortController race-resolution per Decision K1 (renamed from J1 to avoid collision with PR 4.5a's existing `Idempotency-Key` Decision J1 at [apiClient.ts:32](../../../apps/admin/src/lib/apiClient.ts)) + adds `flushNow(slug)` export + wires Shell's `mod+enter` callback to it.

**Tech Stack:** React 19, TypeScript strict (`exactOptionalPropertyTypes: true`), Vitest + `@testing-library/react` + `@testing-library/user-event`, MSW tiered (canned + bridge), `jest-axe`, Radix primitives via `@snowboard-trip-advisor/design-system`. `tokens.breakpoint.md === 900` (verified via [`packages/design-system/src/tokens.ts:21`](../../../packages/design-system/src/tokens.ts) — NOT 768).

---

## Tier 5 → Epic 4 done gate

Per [spec §7.4](../specs/2026-05-01-epic-4-admin-app-design.md#74-tiers-gates-and-parallelism), after PRs 4.6a + 4.6b + 4.6c merge to `main`:

1. **Keyboard shortcuts work in browser smoke** for the subset shipped in 4.6a (`g r` → resorts; `g i` → integrations Toast; `Escape` callback wired; `mod+enter` callback wired) AND `mod+enter` save wired to `flushNow` in 4.6c. The `/` shortcut is **deferred to Phase 2** when search functionality lands (Decision B1; spec §7.16 amended in PR 4.6a).
2. **Responsive read-only enforced via DOM `disabled` attribute** (NOT just CSS visibility, NOT via `tabindex="-1"+aria-disabled`) on Shell header action buttons + edit input absent from DOM in `FieldRow` below `md`.
3. **Bridge integration test (`full-flow.test.tsx`) green** — composite open admin → Resorts → row click → MANUAL edit → save → publish → see in PublishHistory.
4. **`useWorkspaceState` in-flight-clear race fix** verified — clearing a field mid-PUT does NOT leave the workspace file with a stale value while the editor's `<Input>` displays blank.
5. **`npm run qa` green** on `main` after each PR merges. Coverage 100% × 4.

---

## Decisions log

| ID | Decision | Why |
|---|---|---|
| **A1** | Tier 5 ships as **3 PRs** (4.6a + 4.6b + 4.6c). Spec §7.4 originally listed 2 (4.6a + 4.6b parallel). The carryforward `useWorkspaceState` in-flight-clear race fix splits to 4.6c per `feedback_atomic_prs.md` ≤8-file ceiling: PR 4.6a's final shape is **6 new files (`shortcuts.ts/test.ts`, `useResponsiveTabOrder.ts/test.ts`, `Shell.responsive.css.ts`, `Shell.test.tsx`) + 2 MODIFY (`Shell.tsx`, `FieldRow.tsx`) + 1 spec MODIFY = 9 files** (one over the ≤8 ceiling, justified per AGENTS.md §95 — see file-structure table below); pushing the carryforward into 4.6a would (a) exceed the ceiling further AND (b) mix two concerns (polish + race-fix) in one PR. | File budget + atomic-PR discipline. |
| **A2** | PR 4.6a + 4.6b are parallel-capable (no shared files). PR 4.6c depends on PR 4.6a merge (touches `useWorkspaceState.ts` + `Shell.tsx` — `Shell.tsx` is in 4.6a's scope). | Per spec §7.4 parallelism analysis. |
| **B1** | **`/` keyboard shortcut deferred to Phase 2** (when search functionality ships). Spec §7.16 amended in PR 4.6a (file 8) to remove `/` from PR 4.6a's deliverables. **Rationale (section reviewer P0 / BLOCK):** a focus-only target (placeholder `<input type="search">`) is a WCAG 3.3.2 + 4.1.2 violation — input claims search role, does nothing; assistive-tech users typing get silence, no autocomplete, no submit feedback. Maintainer-confirmed Phase 1 deferral 2026-05-12. **Consequence:** Shell.tsx does NOT add a search input in PR 4.6a; `useShortcuts` does NOT emit an `onSlash` callback. | Section reviewer P0 finding (BLOCK). User decision 2026-05-12. |
| **C1** | **`g i` → `Toast.info("Integrations management isn't available yet.")`** No urlState extension (would break the 8-file budget by adding `urlState.ts` + `urlState.test.ts`). Maintainer-confirmed cleaner-copy variant 2026-05-12 (replaces draft "Integrations is coming in Phase 2." which leaked internal jargon per section reviewer P1). | Section reviewer P1 finding + user copy preference. |
| **D1** | **Shell header action buttons below `md` use native `disabled={readOnly}`** — NOT `tabIndex={-1}` + `aria-disabled="true"`. Per design-system [`Button.tsx:35-40`](../../../packages/design-system/src/components/Button.tsx) explicit comment ("we deliberately do NOT add a parallel `aria-disabled` prop — the native `disabled` attribute already conveys the disabled state to assistive tech") AND WAI-ARIA 1.2 normative behavior ("aria-disabled does not change operability — element still perceivable and operable to AT and to mouse"). Native `disabled` removes from tab order, prevents mouse activation, AND triggers `:disabled` CSS for visual state. **Targets:** the Publish `<Button>` and the Account `<DropdownMenu trigger={<Button>...}>`'s inner button. The `disabled` prop on the `<Button>` inside `DropdownMenu`'s trigger is preserved through `cloneElement` ([DropdownMenu.tsx:141](../../../packages/design-system/src/components/DropdownMenu.tsx)). | Section reviewer P0 finding (BLOCK). |
| **D2** | **Spec §7.16 amendment authored as part of PR 4.6a** (file 8). Triggers Subagent Review Discipline per AGENTS.md §60 (`docs/superpowers/specs/**` is a CODEOWNERS-protected path). The amendment co-ships with the code change it documents; this is the AGENTS.md "Documentation Discipline" pattern ("treat doc drift as a documentation bug, not optional cleanup"; checked-in docs are authoritative). | AGENTS.md authority model. |
| **E1** | **`useResponsiveTabOrder()` returns `{ readOnly: boolean }`** keyed off `(min-width: ${tokens.breakpoint.md}px)` — i.e. `readOnly = !aboveMd`. Internally uses `useSyncExternalStore` over `window.matchMedia`. **jsdom-friendly fallback** to `readOnly: false` when `window.matchMedia` is unavailable (matches existing FieldRow pattern at lines 67-87 from PR 4.4d Decision D11). Test stubs `window.matchMedia` per existing `FieldRow.test.tsx` precedent (line 122-127). | Token-driven breakpoint per Codex round-7 P2-9 fold on PR 4.4d. Fallback prevents test-suite jsdom crashes. |
| **E2** | **No new shared `useMediaQuery` hook.** apps/public's `useMediaQuery` ([apps/public/src/state/useMediaQuery.ts](../../../apps/public/src/state/useMediaQuery.ts)) stays where it is. matchMedia subscription is **inlined** in `useResponsiveTabOrder.ts` per locality-of-behavior (`ai-clean-code-adherence` rubric — no abstraction-for-testability). | File budget + locality. Future Epic 5/6 may consolidate when a third consumer exists. |
| **F1** | **`useShortcuts(handlers)` hook** called once in Shell. Single document-level `keydown` listener via `useEffect`; cleanup on unmount. The 4 callbacks (`onGoResorts`, `onGoIntegrations`, `onModEnter`, `onEscape`) are all optional. | Locality + flat architecture (`ai-clean-code-adherence` §2). |
| **F2** | **Sequence window 1000 ms** for `g _` chord. Stored as a closure-scoped variable inside the `useEffect` callback; cleared by `setTimeout`. After 1 s the `g`-pending state expires; the next `g` restarts the window. | Standard chord-debounce pattern; matches GitHub/Linear behavior. |
| **F3** | **Editable-target bypass**: `g _` skips when `document.activeElement` is `INPUT`, `TEXTAREA`, `SELECT`, OR has `[contenteditable]`. `mod+enter` and `Escape` fire regardless (they are intentional cross-context shortcuts; spec §3.10 expects `mod+enter` from inside the editor's input). | Mirrors GitHub/Linear behavior. |
| **F4** | **Shortcut handlers contract** (per Decision B1 — only 4 of the spec §3.10 5 ship in 4.6a; `mod+enter` wires to flush in 4.6c): `interface ShortcutHandlers { onGoResorts?, onGoIntegrations?, onModEnter?, onEscape? }`. All optional. | YAGNI: don't ship handlers for shortcuts not yet wireable. |
| **F5** | **`useShortcuts` uses a `useRef`-pinned handlers pattern** so the document-level `keydown` listener is attached ONCE per consumer-mount (empty `useEffect` dep array). Without this, every Shell render — which produces fresh inline handler closures — would tear down + re-attach the listener, causing keystrokes mid-render to be silently dropped. Test asserts handler-swap-mid-render is picked up by next keystroke without re-subscribing. | Plan-reviewer P0 fold #6 (2026-05-12). Pre-empts a Codex round on `[handlers]`-deps re-subscribe. |
| **G1** | **`Escape` Phase-1 wiring**: Shell wires `onEscape: () => {}` (no-op). Radix Dialog (used by DS Modal) handles modal Escape **internally**. `shortcuts.test.ts` asserts the callback fires on Escape press; integration-level "Escape closes Modal" coverage already lives in [packages/design-system/src/primitives/Modal](../../../packages/design-system/src/primitives/Modal.tsx) tests + the `publish-flow.test.tsx` Radix-backed dialog flow. | DRY — don't duplicate Radix's behavior. Callback exists for forward-compat (Phase 2 non-Radix overlays). |
| **G2** | **`mod+enter` Phase-1 wiring**: Shell wires `onModEnter: () => {}` (no-op). True flush wiring deferred to PR 4.6c (requires `flushNow(slug)` export from `useWorkspaceState`; useWorkspaceState changes belong to 4.6c per Decision A1). `shortcuts.test.ts` asserts the callback fires on **both** `Meta+Enter` (macOS) and `Control+Enter` (Linux/Windows) — cross-platform. | Phase-1 limitation: autosave still persists changes on the existing 500 ms debounce, so the UX gap is minimal. The shortcut "exists" structurally; PR 4.6c connects the wire. |
| **G3** | **`g i` Phase-1 wiring**: Shell wires `onGoIntegrations: () => toast.show({ variant: 'info', message: "Integrations management isn't available yet." })`. No URL change. The Toast is hover/focus-pausable per the existing PR 4.5b Toast contract; auto-dismiss at the `info` variant default (5000 ms). | Section reviewer C1 fold; user copy preference. |
| **H1** | **`Shell.responsive.css.ts`**: a TypeScript module exporting a CSS string (`export const RESPONSIVE_CSS: string`). Shell.tsx renders `<style>{RESPONSIVE_CSS}</style>` at the top of its tree. **Scope:** a single `@media (max-width: ${tokens.breakpoint.md - 1}px)` block that hides the `.app-shell__brand` text and tightens `.app-shell__header` padding/gap so the remaining controls (Publish + Account dropdown) fit a narrow viewport without overflow. **Documented Phase-1 limitation:** the admin app has no global base styles for `.app-shell` / `.app-shell__header` / `.app-shell__brand` (apps/admin currently ships zero CSS files; Shell.responsive.css.ts is the first), so visually the rule has no observable effect today. The rule is in place for when base styles ship; mechanical test asserts the `RESPONSIVE_CSS` export contains the expected media-query selector + property names. | YAGNI on header collapse / panel-stacking — current admin uses a Tabs-based editor (one panel at a time per PR 4.4b spec deviation; no side-by-side panels to stack). The CSS file is a polish placeholder; spec §7.16 line 676 anticipated this. |
| **I1** | **PR 4.6a tab-order test in Shell.test.tsx (NEW)**: assert `screen.getByRole('button', { name: 'Publish' })` carries the `disabled` attribute when matchMedia is stubbed to return below-md. Same for the Account DropdownMenu trigger button (queried by accessible name). Stub matchMedia per the existing `FieldRow.test.tsx` precedent. **Verified before code (Decision-time check 2026-05-12):** DS DropdownMenu's trigger is `cloneElement`-merged ([DropdownMenu.tsx:141](../../../packages/design-system/src/components/DropdownMenu.tsx)), preserving the inner `<Button>`'s `disabled` prop; clicks on a `disabled` button don't fire native `click` events, so DropdownMenu's wrapped `onClick` won't open the menu. | Tests assert the rendered DOM (per spec §7.16 line 678's "test must assert the rendered DOM ... not just CSS visibility" — amended to assert `disabled` attribute via Decision D2). |
| **I2** | **Shell.test.tsx is NEW** in PR 4.6a (not previously existed; current Shell coverage rides on Dashboard / ResortsTable / PublishDialog tests). **Counts as a 9th file.** Resolution: bundle Shell tests **inside** the new `Shell.responsive.css.ts.test.ts` file (extend its scope to include Shell tab-order assertions) — keeps file count at 8. **Alternative if pre-existing Shell test coverage proves insufficient:** push Shell.test.tsx as a 9th file with explicit "test coverage gap" justification in PR body. | File budget. Decision deferred to execution time — verify via a `find apps/admin/src/views -name "Shell.test*"` first. |
| **K1 (PR 4.6c) — RESOLVED 2026-05-12** | **In-flight-clear race fix: chose (a) AbortController.** Decision renamed from `J1` → `K1` to avoid collision with PR 4.5a's existing `Idempotency-Key` Decision J1 at [`apiClient.ts:32-37`](../../../apps/admin/src/lib/apiClient.ts) (two unrelated decisions sharing one ID would confuse future readers of the comment trail). Approach: extend `apiClient.request()` with an optional `{ signal }` forwarded to `fetch`; `useWorkspaceState`'s `SlugStore` gains `abortController` + `inFlightDraft` fields; `flush()` passes `controller.signal` into `apiClient.upsertResort`; `clearFieldValue` aborts the controller ONLY when the cleared path was present in `inFlightDraft` (path-gated, not always — clearing an unrelated path mid-flight does NOT abort). `flush()`'s catch detects `err instanceof DOMException && err.name === 'AbortError'` and routes to a distinct "revert statuses for in-flight-draft paths from `saving` → `dirty`, do NOT prepopulate, do NOT update lastSentDraft" branch (NOT the generic `save-failed`). `__resetForTests()` aborts every store's controller + the AbortError catch no-ops when `storesBySlug.get(slug) !== store` so reset-mid-flight doesn't push state through stale subscribers. **Rejected (b) PUT-API widening with `null`-as-clear:** would touch `packages/schema/**` (Subagent Review trigger per AGENTS.md §60), invert the schema's required-field contract, and lock in null-as-clear wire semantics that Phase 2's Hono swap will likely re-evaluate. **Honest residual limitation (documented inline in `useWorkspaceState.ts` + spec §7.13):** when the server has atomic-written before abort propagates (likely on localhost with sub-ms latency), the workspace file on disk persists the typed value; the SPA's editor input + canonical correctly show the cleared state in-session; reload would re-surface the disk-side value. Recovery: re-edit or toggle AUTO. | Section reviewer + plan reviewer approved AbortController approach with 3 blockers + 6 P1s folded pre-code. |

---

## What we are NOT building (anti-patterns avoided per `ai-clean-code-adherence`)

- **No new shared `useMediaQuery` hook.** matchMedia inlined per locality-of-behavior. apps/public's hook stays put. (§2 — flat architecture; §1 — locality.)
- **No `/` keyboard shortcut in Phase 1.** Defer to Phase 2 search ship. The `useShortcuts` interface omits `onSlash`. (Decision B1.)
- **No `?route=integrations` URL extension.** `g i` surfaces a Toast; no URL change. urlState.ts untouched. (Decision C1.)
- **No placeholder search `<input>` in Shell header.** No focus target = no `/` shortcut = no need for an input. (Decision B1.)
- **No `aria-disabled` JSX prop on action buttons.** Native `disabled` is sufficient per design-system Button.tsx convention. (Decision D1.)
- **No `tabIndex={-1}` JSX prop on action buttons.** Native `disabled` removes from tab order. (Decision D1.)
- **No header collapse / panel-stacking grid CSS.** Editor uses Tabs (one panel at a time post PR 4.4b deviation); current Shell header fits action buttons on a single row. The CSS file ships a minimal media-query overlay (Decision H1). (§3 — restrained DRY; YAGNI.)
- **No fold of Sidebar pathname-vs-query mismatch carryforward.** Defer to a separate Sidebar cleanup PR (post-Tier-5).
- **No fold of Dashboard health-card staleness carryforward.** Defer to a separate `useHealth` subscription PR (post-Tier-5).
- **No PR 4.6a touch on `useWorkspaceState`.** Carryforward fix is PR 4.6c scope only. (Decision A1.)
- **No factored-out `useShortcutSequence` helper.** The `g _` chord logic lives inline in `useShortcuts`'s `useEffect` body. (§3 — restrained DRY.)
- **No shortcut "registry" or plugin system.** Hardcoded handlers; one consumer (Shell). (§2 — flat architecture.)
- **No change to FieldRow's render-only `<span role="switch" aria-disabled="true">` below md.** Decision D1's native-`disabled` rule applies to **header action buttons only** (Publish + Account dropdown trigger). The FieldRow span has no native `disabled` analog (it's a `<span>`, not a `<button>` / `<input>`); the existing PR 4.4d D11 form (`<span role="switch" aria-disabled="true" aria-checked={isManual}>`) remains unchanged. (Plan-reviewer P2 fold #9 — clarifies D1 scope.)

---

## File structure

### PR 4.6a — Polish + spec amendment (9 files; +1 over the ≤8 ceiling, justified)

**File-budget justification (plan-reviewer P1 fold #5 — 2026-05-12):** the ≤8-file target is exceeded by ONE file (final count: 9) because the spec amendment (file 9) is documentation-discipline per AGENTS.md §95 ("treat README/spec drift as a documentation bug, not optional cleanup"). Deferring the spec amendment to a follow-up docs PR would (a) leave spec §7.16 contradicting the shipped code for the duration of the gap, and (b) split the single concern (polish + spec wording that documents the polish) across two PRs in violation of the AGENTS.md "every commit demonstrably depends on the previous one" carve-out. The 9-file count is **flagged in the PR body** with this rationale. Per Decision I2 (revised at plan-review fold time), CSS-export tests are bundled into `Shell.test.tsx` (the Shell suite IS the consumer of `RESPONSIVE_CSS` — its rendered `<style>` tag + the export-shape tests are the same concern surface). No standalone CSS test file.

| # | Path | Action | LOC est | Imports | Public surface | Module state |
|---|---|---|---|---|---|---|
| 1 | `apps/admin/src/lib/shortcuts.test.ts` | CREATE | ~160 | `vitest`, `@testing-library/react`, `@testing-library/user-event`, `react`, `./shortcuts` | tests | none |
| 2 | `apps/admin/src/lib/shortcuts.ts` | CREATE | ~85 | `react` (`useEffect`, `useRef`) | `interface ShortcutHandlers`, `function useShortcuts(handlers: ShortcutHandlers): void` | none (handlers pinned to `useRef` per Decision F5; sequence-window state closure-scoped inside `useEffect`) |
| 3 | `apps/admin/src/lib/useResponsiveTabOrder.test.ts` | CREATE | ~90 | `vitest`, `@testing-library/react`, `react`, `./useResponsiveTabOrder` | tests | none |
| 4 | `apps/admin/src/lib/useResponsiveTabOrder.ts` | CREATE | ~50 | `react` (`useCallback`, `useSyncExternalStore`), `@snowboard-trip-advisor/design-system` (`tokens`) | `function useResponsiveTabOrder(): { readonly readOnly: boolean }` | none |
| 5 | `apps/admin/src/views/Shell.responsive.css.ts` | CREATE | ~25 | `@snowboard-trip-advisor/design-system` (`tokens`) | `const RESPONSIVE_CSS: string` | none (frozen module-level string) |
| 6 | `apps/admin/src/views/Shell.test.tsx` | CREATE | ~150 | `vitest`, `@testing-library/react`, `react`, `@snowboard-trip-advisor/design-system` (`tokens`), `./Shell`, `./Shell.responsive.css` (`RESPONSIVE_CSS`) | tests (Shell tab-order + keyboard mount + style-tag presence + RESPONSIVE_CSS export shape) | none |
| 7 | `apps/admin/src/views/Shell.tsx` | MODIFY | net **+40** (import `useShortcuts`, `useResponsiveTabOrder`, `setRoute` from `useURLState`, `useToast` from DS, `RESPONSIVE_CSS`; split into `<Shell>` outer (mounts ToastProvider) + `<ShellInterior>` inner (uses `useToast` + `useShortcuts`); render `<style>{RESPONSIVE_CSS}</style>` at top; wire `disabled={readOnly}` on Publish + on the inner `<Button>` of DropdownMenu's trigger) | as before, plus `../lib/shortcuts`, `../lib/useResponsiveTabOrder`, `../state/useURLState` (`setRoute`), `./Shell.responsive.css` (`RESPONSIVE_CSS`); DS `useToast` already exported (verified in PR 4.5b) | (unchanged `ShellProps`) | none |
| 8 | `apps/admin/src/views/ResortEditor/FieldRow.tsx` | MODIFY | net **−25** (drop the `MD_QUERY` constant at line 55, the `hasMatchMedia` helper at lines 67-69, the `useIsAboveMd` hook at lines 71-87; **drop the now-unused `tokens` import (line 5) and `useSyncExternalStore` import (line 14)**; import `useResponsiveTabOrder`; replace `const isAboveMd = useIsAboveMd()` (line 235) with `const { readOnly } = useResponsiveTabOrder(); const isAboveMd = !readOnly`) | as before, plus `../../lib/useResponsiveTabOrder`; **remove** `tokens` from DS import + `useSyncExternalStore` from react import | (unchanged) | (drop the inlined matchMedia subscription) |
| 9 | `docs/superpowers/specs/2026-05-01-epic-4-admin-app-design.md` | MODIFY | net **+45 −10** (rewrite §7.16 — pin amendment to TEXT-anchors, NOT line numbers, since spec lines may shift across PRs) | n/a | §7.16 wording amendment | n/a |

### PR 4.6b — Integration backfill (parallel-capable; sibling session)

Per [spec §7.17](../specs/2026-05-01-epic-4-admin-app-design.md#717-pr-46b--integration-backfill-closing-pr) unchanged.

| # | Path | Action |
|---|---|---|
| 1 | `tests/integration/apps/admin/dashboard.test.tsx` | CREATE |
| 2 | `tests/integration/apps/admin/resorts-table.test.tsx` | CREATE |
| 3 | `tests/integration/apps/admin/full-flow.test.tsx` | CREATE (bridge tier) |

(3 files; well under budget.) **Sibling session may execute in parallel from a separate worktree starting from `origin/main`.** No shared files with PR 4.6a.

### PR 4.6c — `useWorkspaceState` race fix + `flushNow` + `mod+enter` wiring (after PR 4.6a merges)

**File-budget justification (9 files; +1 over the ≤8 ceiling, same shape as PR 4.6a):** plan reviewer round 1 surfaced 3 blockers + 6 P1s. Blocker #2 mandates a spec amendment (§7.4 Tier 5 done-gate criterion 4 acknowledges PR 4.6c; §7.13 status updates the carried-forward limitation to "addressed in PR 4.6c") — this is AGENTS.md §95 documentation discipline and **flips the Subagent Review trigger to YES** (`docs/superpowers/specs/**` is CODEOWNERS-protected per AGENTS.md §60). Blocker #3 mandates `Shell.test.tsx` coverage of the new route-aware `onModEnter` branches (off-route no-op vs on-route flush, same-mount setRoute regression). The handoff §52 amendment is intentionally skipped (handoffs are historical Tier-N snapshots; corrections live in the canonical spec).

| # | Path | Action |
|---|---|---|
| 1 | `apps/admin/src/state/useWorkspaceState.test.ts` | MODIFY (race repro + flushNow tests + path-gated abort positive + path-gated abort negative + no-in-flight clearFieldValue branch + flushNow during in-flight + flushNow empty draft + `__resetForTests` aborts) |
| 2 | `apps/admin/src/state/useWorkspaceState.ts` | MODIFY (AbortController + inFlightDraft fields + flush() AbortError branch with `storesBySlug.get(slug) !== store` guard + clearFieldValue path-gated abort + `flushNow(slug)` export + `__resetForTests` aborts) |
| 3 | `apps/admin/src/lib/apiClient.ts` | MODIFY (`request()` accepts `RequestOptions \| undefined`; `upsertResort(slug, body, options?)` forwards `options.signal` into `fetch`) |
| 4 | `apps/admin/src/lib/apiClient.test.ts` | MODIFY (one focused signal-forwarding test: `fetch` is called with `init.signal === providedSignal` via spy) |
| 5 | `apps/admin/src/views/Shell.tsx` | MODIFY (read `useURLState()`; wire `onModEnter` to `() => { if (route.route === 'editor') { flushNow(route.slug) } }`; off-route stays no-op) |
| 6 | `apps/admin/src/views/Shell.test.tsx` | MODIFY (route-aware mod+enter test: render at `?route=dashboard`, fire mod+enter, assert `flushNow` NOT called; `setRoute({ route: 'editor', slug })`, fire mod+enter, assert `flushNow(slug)` called — same Shell mount, catches stale-closure regression) |
| 7 | `tests/integration/apps/admin/resort-editor-write.test.tsx` | MODIFY (bridge test in `describe('useWorkspaceState — in-flight-clear race (PR 4.6c)')` — type → debounce starts PUT → clear → assert canonical NOT prepopulated with typed value AND editor input renders blank) |
| 8 | `docs/superpowers/plans/2026-05-12-epic-4-tier-5-closing-plan.md` | MODIFY (Decision K1-resolved row + file structure correction — this section) |
| 9 | `docs/superpowers/specs/2026-05-01-epic-4-admin-app-design.md` | MODIFY (§7.4 Tier 5 done-gate criterion 4 acknowledges PR 4.6c; §7.13 status: "Phase-1 limitation carried forward (PR 4.6a polish)" → "addressed in PR 4.6c — Decision K1 AbortController race fix; residual disk-divergence documented") |

**Subagent Review trigger: YES** (spec touched per AGENTS.md §60).

---

## PR 4.6a tasks

**Branch:** `epic-4/pr-4.6a-polish`. **Depends on:** `main` (post-Tier-4 close, [PR #102](https://github.com/mathvbarone/snowboard-trip-advisor/pull/102) merge commit `481f434`). **README:** evaluation only (admin app already user-facing per PR 4.5b; no new product surface).

**Subagent Review trigger:** **YES** — `docs/superpowers/specs/**` is touched (Decision D2, file 8). Brief the reviewer to verify: (a) the §7.16 amendment cites both Button.tsx:35-40 AND WAI-ARIA 1.2 normative text; (b) the test wording is amended to `disabled` attribute, not `tabindex="-1"`; (c) the `/` deferral is documented with the WCAG 3.3.2 / 4.1.2 rationale; (d) the amendment does NOT modify any §7.4 done-gate criteria beyond replacing `tabindex="-1"` with `disabled`.

**File budget:** 9 files (one over the ≤8 ceiling per AGENTS.md §95 documentation discipline). Spec amendment justified because checked-in docs that would conflict with shipping code MUST be amended in the same branch — deferring to a follow-up docs PR would leave §7.16 contradicting the shipped code for the duration of the gap and split a single concern (polish + spec wording that documents the polish) across two PRs. Flag this in the PR body.

### Task 4.6a-0: Verify worktree clean + branch ready

- [ ] **Step 1: Confirm worktree state.**
  Run: `git status --short && git log --oneline -3 && git branch --show-current`
  Expected: clean tree; top commit `481f434` (PR #102 merge); branch `epic-4/pr-4.6a-polish` (already renamed at session start).

- [ ] **Step 2: Confirm baseline qa green.**
  Run: `npm run qa` (already verified at session start; re-run only if any commits land before 4.6a-1).
  Expected: exit 0; coverage 100% × 4.

- [ ] **Step 3: Verify DS DropdownMenu trigger preserves `disabled` prop through cloneElement.**
  Run: `grep -n "cloneElement" packages/design-system/src/components/DropdownMenu.tsx`
  Expected: `cloneElement(trigger, { ... })` at line ~141. Confirm by reading the merged-props pattern; `cloneElement` preserves all original props of the trigger (including `disabled`) and merges in the additional ones.

- [ ] **Step 4: Verify `Shell.test.tsx` non-existence (per Decision I2 — revised).**
  Run: `find apps/admin/src/views -name "Shell.test*"`
  Expected: no output. **Plan: create Shell.test.tsx as the 6th NEW file**, bundling CSS-export tests inside it (the Shell suite IS the consumer of `RESPONSIVE_CSS`). Final file count: 9 (within 9-file justified ceiling per file-budget rationale above).

- [ ] **Step 5: Pin `setRoute` signature (per plan-reviewer P0 fold #2).**
  Run: `grep -n "export function setRoute\|setRoute(state:" apps/admin/src/state/useURLState.ts`
  Expected: line `export function setRoute(state: RouteState): void` at line 63. The `RouteState` union includes `{ route: 'resorts'; country?: ISOCountryCode; hasFailures?: boolean }` (verified at `apps/admin/src/lib/urlState.ts:49`). Therefore `setRoute({ route: 'resorts' })` (with no filter args) is type-valid. PIN this call shape verbatim in Task 4.6a-8 Shell.tsx impl; no other call shapes are needed.

### Task 4.6a-1: Spec §7.16 amendment

**Files:** Modify `docs/superpowers/specs/2026-05-01-epic-4-admin-app-design.md`.

- [ ] **Step 1: Rewrite §7.16.** Locate the section by **text-anchor** (NOT line numbers — spec lines may shift across PRs per plan-reviewer P2 fold #8): the heading is `### 7.16 PR 4.6a — Polish (keyboard shortcuts + responsive read-only-below-md)`. The amendment changes:
  - **Goal paragraph:** add explicit "the `/` shortcut is **deferred to Phase 2** when search functionality lands per [Tier 5 plan Decision B1](../plans/2026-05-12-epic-4-tier-5-closing-plan.md). PR 4.6a ships 4 of the 5 spec §3.10 shortcuts; `/` deferred to Phase 2."
  - **Files (tests first) list:** drop the "asserts `/` focuses search" wording from item 1. Drop any reference to a search `<input>` in the Shell.tsx MODIFY description (item 7). Replace item 7's wording: "apply `tabIndex={-1}` and `aria-disabled` JSX props" → "apply native `disabled={readOnly}` JSX prop, per [`packages/design-system/src/components/Button.tsx:35-40`](../../../packages/design-system/src/components/Button.tsx) ('we deliberately do NOT add a parallel `aria-disabled` prop — the native `disabled` attribute already conveys the disabled state to assistive tech') and WAI-ARIA 1.2 ('aria-disabled does not change operability — element still perceivable and operable to AT and to mouse'). The native `disabled` removes from tab order, prevents mouse activation, AND triggers `:disabled` CSS for visual state."
  - **Acceptance gate:** "responsive test asserts the rendered DOM at simulated `md`-1 viewport contains read-only `<span>` (not edit input) for `<FieldRow>` and `tabindex='-1'` JSX attributes (not CSS-only) on any header/sidebar action that still renders" → "...AND **`disabled` attribute** (NOT `tabindex='-1'+aria-disabled`) on any header/sidebar action button that still renders, per [Tier 5 plan Decision D1](../plans/2026-05-12-epic-4-tier-5-closing-plan.md)."
  - Add a new line after the Files block: "**Plan:** [Tier 5 closing plan](../plans/2026-05-12-epic-4-tier-5-closing-plan.md)."

- [ ] **Step 2: Run drift check.**
  Run: `npm run check:agent-discipline-sync`
  Expected: exit 0 (the spec is checked-in docs; the drift checker only verifies AGENTS.md/CLAUDE.md authority symmetry + bot/ADR pairing, NOT spec content).

- [ ] **Step 3: Commit.**
  Run:
  ```bash
  git add docs/superpowers/specs/2026-05-01-epic-4-admin-app-design.md docs/superpowers/plans/2026-05-12-epic-4-tier-5-closing-plan.md
  git commit -m "$(cat <<'EOF'
  Epic 4 Tier 5 plan + spec §7.16 amendment

  Drops `/` shortcut from PR 4.6a deliverables (defer to Phase 2 search ship per
  section reviewer P0 — placeholder search input violates WCAG 3.3.2/4.1.2).

  Replaces tabIndex={-1}+aria-disabled with native disabled={readOnly} per
  Button.tsx:35-40 design-system convention + WAI-ARIA 1.2 normative behavior.

  Adds Tier 5 plan covering PRs 4.6a (polish + this spec amendment) +
  4.6b (integration backfill, parallel-capable) + 4.6c (useWorkspaceState
  in-flight-clear race fix follow-up).
  EOF
  )"
  ```
  Expected: pre-commit hook runs (docs-only carve-out fires per AGENTS.md — only `check:agent-discipline-sync` runs); commit succeeds with auto-DCO trailer.

### Task 4.6a-2: `useResponsiveTabOrder.test.ts` (failing tests)

**Files:** Create `apps/admin/src/lib/useResponsiveTabOrder.test.ts`.

- [ ] **Step 1: Write the failing tests.**

```ts
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useResponsiveTabOrder } from './useResponsiveTabOrder'

// Mirrors the FieldRow.test.tsx matchMedia stub pattern (lines 122-127). jsdom
// does not implement window.matchMedia; tests that mount the hook directly stub
// it explicitly.
function stubMatchMedia(matches: boolean): { fire: (next: boolean) => void } {
  const listeners = new Set<(e: MediaQueryListEvent) => void>()
  const mql: MediaQueryList = {
    matches,
    media: '(min-width: 900px)',
    onchange: null,
    addListener: (): void => undefined,
    removeListener: (): void => undefined,
    addEventListener: (_event: string, cb: EventListenerOrEventListenerObject): void => {
      if (typeof cb === 'function') { listeners.add(cb as (e: MediaQueryListEvent) => void) }
    },
    removeEventListener: (_event: string, cb: EventListenerOrEventListenerObject): void => {
      if (typeof cb === 'function') { listeners.delete(cb as (e: MediaQueryListEvent) => void) }
    },
    dispatchEvent: (): boolean => false,
  }
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql))
  return {
    fire: (next: boolean): void => {
      Object.defineProperty(mql, 'matches', { value: next, configurable: true })
      const event = { matches: next, media: mql.media } as MediaQueryListEvent
      for (const cb of listeners) { cb(event) }
    },
  }
}

describe('useResponsiveTabOrder', (): void => {
  afterEach((): void => {
    vi.unstubAllGlobals()
  })

  it('returns { readOnly: false } when matchMedia matches (above md)', (): void => {
    stubMatchMedia(true)
    const { result } = renderHook(() => useResponsiveTabOrder())
    expect(result.current).toEqual({ readOnly: false })
  })

  it('returns { readOnly: true } when matchMedia does NOT match (below md)', (): void => {
    stubMatchMedia(false)
    const { result } = renderHook(() => useResponsiveTabOrder())
    expect(result.current).toEqual({ readOnly: true })
  })

  it('flips when the matchMedia change event fires', (): void => {
    const { fire } = stubMatchMedia(true)
    const { result, rerender } = renderHook(() => useResponsiveTabOrder())
    expect(result.current.readOnly).toBe(false)
    fire(false)
    rerender()
    expect(result.current.readOnly).toBe(true)
  })

  it('returns { readOnly: false } when window.matchMedia is unavailable (jsdom fallback)', (): void => {
    // Per Decision E1: matches the FieldRow useIsAboveMd fallback pattern. Tests
    // that mount components without explicit matchMedia stubs (e.g.,
    // ResortEditor.test.tsx) should not crash; hook returns the desktop-default
    // readOnly: false (= aboveMd: true).
    vi.stubGlobal('matchMedia', undefined)
    const { result } = renderHook(() => useResponsiveTabOrder())
    expect(result.current).toEqual({ readOnly: false })
  })

  it('removes the matchMedia change listener on unmount', (): void => {
    const removeSpy = vi.fn()
    const mql = {
      matches: true,
      media: '(min-width: 900px)',
      onchange: null,
      addListener: (): void => undefined,
      removeListener: (): void => undefined,
      addEventListener: (): void => undefined,
      removeEventListener: removeSpy,
      dispatchEvent: (): boolean => false,
    } as unknown as MediaQueryList
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql))
    const { unmount } = renderHook(() => useResponsiveTabOrder())
    unmount()
    expect(removeSpy).toHaveBeenCalledWith('change', expect.any(Function))
  })
})
```

- [ ] **Step 2: Run the tests — expect FAIL.**
  Run: `npx vitest run apps/admin/src/lib/useResponsiveTabOrder.test.ts`
  Expected: failures pointing at the missing `useResponsiveTabOrder` module.

- [ ] **Step 3: Don't commit yet — Task 4.6a-3 immediately follows to green these tests.**

### Task 4.6a-3: `useResponsiveTabOrder.ts` (impl)

**Files:** Create `apps/admin/src/lib/useResponsiveTabOrder.ts`.

- [ ] **Step 1: Implement.**

```ts
import { tokens } from '@snowboard-trip-advisor/design-system'
import { useCallback, useSyncExternalStore } from 'react'

// Returns { readOnly: true } when the viewport is below the design-system `md`
// breakpoint (= 900px per packages/design-system/src/tokens.ts:21). Below md,
// the admin editor is read-only per AGENTS.md "Admin App Rules" + spec §3.2 —
// edit controls are removed from the tab order, action buttons are
// `disabled={readOnly}` per Tier 5 plan Decision D1.
//
// Internals: matchMedia subscription via useSyncExternalStore. jsdom-friendly
// fallback to readOnly: false (= aboveMd: true) when window.matchMedia is
// unavailable, matching the FieldRow useIsAboveMd pattern (PR 4.4d D11). This
// lets test files that mount components indirectly skip the matchMedia stub.

const ABOVE_MD_QUERY = `(min-width: ${tokens.breakpoint.md.toString()}px)`

function hasMatchMedia(): boolean {
  return typeof window.matchMedia === 'function'
}

function getAboveMdSnapshot(): boolean {
  if (!hasMatchMedia()) { return true }
  return window.matchMedia(ABOVE_MD_QUERY).matches
}

export function useResponsiveTabOrder(): { readonly readOnly: boolean } {
  const subscribe = useCallback((cb: () => void): (() => void) => {
    if (!hasMatchMedia()) { return (): void => {} }
    const mql = window.matchMedia(ABOVE_MD_QUERY)
    mql.addEventListener('change', cb)
    return (): void => { mql.removeEventListener('change', cb) }
  }, [])
  const aboveMd = useSyncExternalStore(subscribe, getAboveMdSnapshot)
  return { readOnly: !aboveMd }
}
```

- [ ] **Step 2: Run the tests — expect PASS.**
  Run: `npx vitest run apps/admin/src/lib/useResponsiveTabOrder.test.ts`
  Expected: 5 passed.

- [ ] **Step 3: Verify file coverage 100% × 4.**
  Run: `npx vitest run apps/admin/src/lib/useResponsiveTabOrder.test.ts --coverage`
  Expected: 100% statements / branches / functions / lines for the new file.

- [ ] **Step 4: Commit.**
  Run:
  ```bash
  git add apps/admin/src/lib/useResponsiveTabOrder.ts apps/admin/src/lib/useResponsiveTabOrder.test.ts
  git commit -m "Add useResponsiveTabOrder hook for admin tab-order discipline"
  ```
  Expected: pre-commit qa runs full chain; passes; auto-DCO trailer.

### Task 4.6a-4: `shortcuts.test.ts` (failing tests)

**Files:** Create `apps/admin/src/lib/shortcuts.test.ts`.

- [ ] **Step 1: Write the failing tests.**

```ts
import { renderHook } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useShortcuts } from './shortcuts'

describe('useShortcuts', (): void => {
  let user: ReturnType<typeof userEvent.setup>

  beforeEach((): void => {
    user = userEvent.setup()
    document.body.focus()
  })

  afterEach((): void => {
    document.body.replaceChildren()
  })

  describe('g r → onGoResorts', (): void => {
    it('fires onGoResorts when g then r is pressed within 1 second', async (): Promise<void> => {
      const onGoResorts = vi.fn()
      renderHook(() => useShortcuts({ onGoResorts }))
      await user.keyboard('g')
      await user.keyboard('r')
      expect(onGoResorts).toHaveBeenCalledOnce()
    })

    // Per plan-reviewer P0 fold #1 (2026-05-12): vi.useFakeTimers + userEvent
    // deadlock is a known userEvent v14 trap. For this timeout-expiry-only case
    // we bypass userEvent entirely and dispatch raw KeyboardEvents — the only
    // thing under test is the sequence-window setTimeout-clear behavior, not
    // userEvent's keystroke modeling. The other tests above use real userEvent.
    it('does NOT fire if the sequence window expires (1.5 s gap)', (): void => {
      vi.useFakeTimers()
      try {
        const onGoResorts = vi.fn()
        renderHook(() => useShortcuts({ onGoResorts }))
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'g' }))
        vi.advanceTimersByTime(1500)
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }))
        expect(onGoResorts).not.toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    })

    it('does NOT fire when the active element is an INPUT (editable bypass)', async (): Promise<void> => {
      const onGoResorts = vi.fn()
      const input = document.createElement('input')
      document.body.appendChild(input)
      input.focus()
      renderHook(() => useShortcuts({ onGoResorts }))
      await user.keyboard('g')
      await user.keyboard('r')
      expect(onGoResorts).not.toHaveBeenCalled()
    })
  })

  describe('g i → onGoIntegrations', (): void => {
    it('fires onGoIntegrations on g then i within 1 second', async (): Promise<void> => {
      const onGoIntegrations = vi.fn()
      renderHook(() => useShortcuts({ onGoIntegrations }))
      await user.keyboard('g')
      await user.keyboard('i')
      expect(onGoIntegrations).toHaveBeenCalledOnce()
    })

    it('does NOT fire when active element is contenteditable', async (): Promise<void> => {
      const onGoIntegrations = vi.fn()
      const ce = document.createElement('div')
      ce.setAttribute('contenteditable', 'true')
      ce.tabIndex = 0
      document.body.appendChild(ce)
      ce.focus()
      renderHook(() => useShortcuts({ onGoIntegrations }))
      await user.keyboard('g')
      await user.keyboard('i')
      expect(onGoIntegrations).not.toHaveBeenCalled()
    })
  })

  describe('g <unknown> resets sequence without firing', (): void => {
    it('does NOT fire any callback for `g x`', async (): Promise<void> => {
      const onGoResorts = vi.fn()
      const onGoIntegrations = vi.fn()
      renderHook(() => useShortcuts({ onGoResorts, onGoIntegrations }))
      await user.keyboard('g')
      await user.keyboard('x')
      expect(onGoResorts).not.toHaveBeenCalled()
      expect(onGoIntegrations).not.toHaveBeenCalled()
    })
  })

  describe('mod+enter → onModEnter (cross-platform)', (): void => {
    it('fires onModEnter on Meta+Enter (macOS)', async (): Promise<void> => {
      const onModEnter = vi.fn()
      renderHook(() => useShortcuts({ onModEnter }))
      await user.keyboard('{Meta>}{Enter}{/Meta}')
      expect(onModEnter).toHaveBeenCalledOnce()
    })

    it('fires onModEnter on Control+Enter (Linux/Windows)', async (): Promise<void> => {
      const onModEnter = vi.fn()
      renderHook(() => useShortcuts({ onModEnter }))
      await user.keyboard('{Control>}{Enter}{/Control}')
      expect(onModEnter).toHaveBeenCalledOnce()
    })

    it('fires onModEnter even when active element is an INPUT (no editable bypass)', async (): Promise<void> => {
      const onModEnter = vi.fn()
      const input = document.createElement('input')
      document.body.appendChild(input)
      input.focus()
      renderHook(() => useShortcuts({ onModEnter }))
      await user.keyboard('{Meta>}{Enter}{/Meta}')
      expect(onModEnter).toHaveBeenCalledOnce()
    })

    it('does NOT fire on plain Enter (modifier required)', async (): Promise<void> => {
      const onModEnter = vi.fn()
      renderHook(() => useShortcuts({ onModEnter }))
      await user.keyboard('{Enter}')
      expect(onModEnter).not.toHaveBeenCalled()
    })
  })

  describe('Escape → onEscape', (): void => {
    it('fires onEscape on Escape press', async (): Promise<void> => {
      const onEscape = vi.fn()
      renderHook(() => useShortcuts({ onEscape }))
      await user.keyboard('{Escape}')
      expect(onEscape).toHaveBeenCalledOnce()
    })

    it('fires onEscape even when active element is an INPUT', async (): Promise<void> => {
      const onEscape = vi.fn()
      const input = document.createElement('input')
      document.body.appendChild(input)
      input.focus()
      renderHook(() => useShortcuts({ onEscape }))
      await user.keyboard('{Escape}')
      expect(onEscape).toHaveBeenCalledOnce()
    })
  })

  describe('cleanup', (): void => {
    it('removes the keydown listener on unmount', async (): Promise<void> => {
      const onGoResorts = vi.fn()
      const { unmount } = renderHook(() => useShortcuts({ onGoResorts }))
      unmount()
      await user.keyboard('g')
      await user.keyboard('r')
      expect(onGoResorts).not.toHaveBeenCalled()
    })
  })

  describe('handlers-ref pattern (Decision F5)', (): void => {
    // Per plan-reviewer P0 fold #6 (2026-05-12): without a useRef pin on
    // handlers, the useEffect dep `[handlers]` would tear down + re-attach
    // the document keydown listener every Shell render (Shell passes fresh
    // closure handlers each render since they aren't memoized). The hook
    // pins handlers to a ref AND keeps useEffect deps empty so the listener
    // mounts ONCE per consumer-mount; ref reads see the latest handlers.
    it('picks up swapped handlers without re-subscribing', async (): Promise<void> => {
      const first = vi.fn()
      const second = vi.fn()
      const { rerender } = renderHook(
        (props: { onGoResorts: () => void }) => useShortcuts(props),
        { initialProps: { onGoResorts: first } },
      )
      await user.keyboard('g')
      await user.keyboard('r')
      expect(first).toHaveBeenCalledOnce()
      expect(second).not.toHaveBeenCalled()
      rerender({ onGoResorts: second })
      await user.keyboard('g')
      await user.keyboard('r')
      expect(first).toHaveBeenCalledOnce()  // unchanged from before
      expect(second).toHaveBeenCalledOnce()
    })
  })
})
```

- [ ] **Step 2: Run the tests — expect FAIL.**
  Run: `npx vitest run apps/admin/src/lib/shortcuts.test.ts`
  Expected: failures pointing at the missing `shortcuts` module.

- [ ] **Step 3: Don't commit yet — Task 4.6a-5 immediately follows.**

### Task 4.6a-5: `shortcuts.ts` (impl)

**Files:** Create `apps/admin/src/lib/shortcuts.ts`.

- [ ] **Step 1: Implement.**

```ts
import { useEffect, useRef } from 'react'

// Tier 5 PR 4.6a — global keyboard shortcuts hook (parent spec §3.10).
//
// Phase 1 ships 4 of the 5 spec §3.10 shortcuts; the `/` shortcut is deferred
// to Phase 2 when search functionality lands per Tier 5 plan Decision B1
// (a focus-only target violates WCAG 3.3.2 / 4.1.2 — input claims search role,
// does nothing).
//
// Conventions:
//   - Single document-level `keydown` listener per consumer-mount (Decision F5).
//   - Handlers are pinned via useRef so re-renders with fresh handler closures
//     don't tear down + re-attach the listener (would silently drop keystrokes
//     mid-render). useEffect dep array is empty; ref reads see latest handlers.
//   - `g _` chord uses a 1000 ms sequence window; the next `g` after expiry
//     restarts the window (Decision F2).
//   - Editable-target bypass: `g _` skip when document.activeElement is INPUT,
//     TEXTAREA, SELECT, or contenteditable. `mod+enter` and `Escape` fire
//     regardless (intentional cross-context shortcuts per spec §3.10) — Decision F3.
//   - Cross-platform `mod+enter`: matches both Meta+Enter (macOS) and
//     Control+Enter (Linux/Windows).

const SEQUENCE_WINDOW_MS = 1000

export interface ShortcutHandlers {
  readonly onGoResorts?: () => void
  readonly onGoIntegrations?: () => void
  readonly onModEnter?: () => void
  readonly onEscape?: () => void
}

function isEditableTarget(): boolean {
  const el = document.activeElement
  if (el === null) { return false }
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') { return true }
  return el instanceof HTMLElement && el.isContentEditable
}

export function useShortcuts(handlers: ShortcutHandlers): void {
  // Decision F5 + plan-reviewer P0 fold #6: pin handlers via ref so the
  // useEffect body runs ONCE per consumer-mount and ref reads see the latest
  // handler closures. Without the ref, the [handlers] dep would re-trigger the
  // effect on every Shell render (handlers are inline closures, not memoized).
  const handlersRef = useRef<ShortcutHandlers>(handlers)
  handlersRef.current = handlers

  useEffect((): (() => void) => {
    let pendingG: ReturnType<typeof setTimeout> | null = null
    let awaitingChord = false

    const clearPending = (): void => {
      if (pendingG !== null) {
        clearTimeout(pendingG)
        pendingG = null
      }
      awaitingChord = false
    }

    const onKeydown = (event: KeyboardEvent): void => {
      const h = handlersRef.current

      // Escape: fire regardless of focus target. Radix Dialog handles modal
      // Escape internally — Shell's wired callback is a no-op in Phase 1
      // (Tier 5 plan Decision G1).
      if (event.key === 'Escape') {
        h.onEscape?.()
        return
      }

      // mod+enter (Meta+Enter on macOS, Ctrl+Enter on Linux/Windows): fire
      // regardless of focus target (spec §3.10 expects this from inside
      // editor inputs).
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        h.onModEnter?.()
        return
      }

      // g _ chord: bypass when an editable element has focus.
      if (isEditableTarget()) { return }

      if (awaitingChord) {
        const second = event.key
        clearPending()
        if (second === 'r') { h.onGoResorts?.(); return }
        if (second === 'i') { h.onGoIntegrations?.(); return }
        // Unknown second key: silently drop the chord; do NOT re-arm on this
        // keystroke (would surprise the user typing an unrelated key).
        return
      }

      if (event.key === 'g') {
        awaitingChord = true
        pendingG = setTimeout(clearPending, SEQUENCE_WINDOW_MS)
      }
    }

    document.addEventListener('keydown', onKeydown)
    return (): void => {
      clearPending()
      document.removeEventListener('keydown', onKeydown)
    }
  }, [])
}
```

- [ ] **Step 2: Run the tests — expect PASS.**
  Run: `npx vitest run apps/admin/src/lib/shortcuts.test.ts`
  Expected: 12 passed.

- [ ] **Step 3: Verify file coverage 100% × 4.**
  Run: `npx vitest run apps/admin/src/lib/shortcuts.test.ts --coverage`
  Expected: 100% statements / branches / functions / lines for the new file.

- [ ] **Step 4: Commit.**
  Run:
  ```bash
  git add apps/admin/src/lib/shortcuts.ts apps/admin/src/lib/shortcuts.test.ts
  git commit -m "Add useShortcuts hook for admin keyboard shortcuts (PR 4.6a)"
  ```

### Task 4.6a-6: `Shell.responsive.css.ts` (CSS string only — tests bundled into Shell.test.tsx in Task 4.6a-8)

**Files:** Create `apps/admin/src/views/Shell.responsive.css.ts`. **No standalone test file** — the CSS-export tests are bundled into `Shell.test.tsx` (Task 4.6a-8) per Decision I2 (revised at plan-review fold time).

- [ ] **Step 1: Implement Shell.responsive.css.ts.**

```ts
// apps/admin/src/views/Shell.responsive.css.ts
import { tokens } from '@snowboard-trip-advisor/design-system'

// Tier 5 PR 4.6a — admin Shell responsive overlay (parent spec §3.2 +
// Tier 5 plan Decision H1).
//
// **Phase-1 limitation:** the admin app currently ships zero CSS files; the
// classNames `.app-shell`, `.app-shell__header`, `.app-shell__brand` are
// defined as hooks in Shell.tsx but have no base styles. This file is the
// FIRST admin CSS surface and ships an overlay rule that becomes visible only
// when base styles ship. Tab-order discipline lives in TSX render gates per
// spec §7.16 — CSS cannot apply `disabled` / `tabindex`.

const MAX_BELOW_MD = `${(tokens.breakpoint.md - 1).toString()}px`

export const RESPONSIVE_CSS = `@media (max-width: ${MAX_BELOW_MD}) {
  .app-shell__header { padding: 0.5rem; gap: 0.5rem; }
  .app-shell__brand { display: none; }
}`
```

- [ ] **Step 2: Verify the file compiles + lints.**
  Run: `npx tsc --noEmit --project apps/admin/tsconfig.json` (or workspace tsc-noEmit)
  AND: `npx eslint apps/admin/src/views/Shell.responsive.css.ts`
  Expected: clean (export shape verified mechanically; runtime test coverage comes via Shell.test.tsx in Task 4.6a-8).

- [ ] **Step 3: No commit yet — Task 4.6a-8 commits Shell.tsx + Shell.test.tsx (which covers RESPONSIVE_CSS) together with this file.** This keeps the consumer + the CSS string in one commit so a reviewer can see them as one change.

### Task 4.6a-7: `FieldRow.tsx` MODIFY — replace inline `useIsAboveMd` with `useResponsiveTabOrder`

**Files:** Modify `apps/admin/src/views/ResortEditor/FieldRow.tsx`.

- [ ] **Step 1: Delete the responsive-block `MD_QUERY` constant (line 55) + `hasMatchMedia` helper (lines 67-69) + `useIsAboveMd` hook (lines 71-87).** The whole 50-87 region of comments + helpers + hook is removed.

- [ ] **Step 2: Update the import block (drop now-unused imports per plan-reviewer P2 fold #7).**
  - **Remove `tokens` from the DS import** (line 5) — it was only used by the deleted `MD_QUERY`. Confirm via `grep -n "tokens\." apps/admin/src/views/ResortEditor/FieldRow.tsx` — should return no results after the impl deletion.
  - **Remove `useSyncExternalStore` from the react import** (line 14) — it was only used by the deleted `useIsAboveMd`. Keep `useRef`, `useState` (still used by FieldRow's local-string state).
  - **Add** `import { useResponsiveTabOrder } from '../../lib/useResponsiveTabOrder'` to the appropriate import group (lib group). Maintain import-order (`@typescript-eslint/import-order` per AGENTS.md §122).

- [ ] **Step 3: Replace `const isAboveMd = useIsAboveMd()` (line 235) with `const { readOnly } = useResponsiveTabOrder(); const isAboveMd = !readOnly`.** All downstream usages of `isAboveMd` continue to work unchanged.

- [ ] **Step 4: Run FieldRow tests + ResortEditor tests + integration tests.**
  Run: `npx vitest run apps/admin/src/views/ResortEditor apps/admin/src/state/useWorkspaceState.test.ts tests/integration/apps/admin/resort-editor-write.test.tsx`
  Expected: ALL existing tests still pass (the hook contract is preserved end-to-end; only the implementation moved).

- [ ] **Step 5: Verify FieldRow line coverage stays 100% × 4.**
  Run: `npx vitest run apps/admin/src/views/ResortEditor/FieldRow.test.tsx --coverage`
  Expected: 100% × 4 for FieldRow.tsx.

- [ ] **Step 6: Commit.**
  Run:
  ```bash
  git add apps/admin/src/views/ResortEditor/FieldRow.tsx
  git commit -m "FieldRow consumes useResponsiveTabOrder (drop inline useIsAboveMd)"
  ```

### Task 4.6a-8: `Shell.tsx` MODIFY + `Shell.test.tsx` CREATE — wire shortcuts + native disabled below md + responsive CSS injection + bundled CSS-export tests

**Files:** Modify `apps/admin/src/views/Shell.tsx`. Create `apps/admin/src/views/Shell.test.tsx` (NEW; bundles Shell tab-order tests + Shell rendering tests + CSS export shape tests per Decision I2 revised).

- [ ] **Step 1: Write the failing Shell test file.**

```ts
// apps/admin/src/views/Shell.test.tsx — NEW
import '@testing-library/jest-dom/vitest'
import { tokens } from '@snowboard-trip-advisor/design-system'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Shell } from './Shell'
import { RESPONSIVE_CSS } from './Shell.responsive.css'

// Inlined matchMedia stub — keeps the test file self-contained (no cross-file
// shared fixtures per ai-clean-code-adherence §3).
function stubMatchMedia(matches: boolean): void {
  const mql = {
    matches,
    media: '(min-width: 900px)',
    onchange: null,
    addListener: (): void => undefined,
    removeListener: (): void => undefined,
    addEventListener: (): void => undefined,
    removeEventListener: (): void => undefined,
    dispatchEvent: (): boolean => false,
  } as unknown as MediaQueryList
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql))
}

describe('RESPONSIVE_CSS export shape', (): void => {
  it('targets max-width: (md-1)px', (): void => {
    const expectedMax = `${(tokens.breakpoint.md - 1).toString()}px`
    expect(RESPONSIVE_CSS).toContain(`@media (max-width: ${expectedMax})`)
  })

  it('hides .app-shell__brand below md', (): void => {
    expect(RESPONSIVE_CSS).toMatch(/\.app-shell__brand\s*\{[^}]*display:\s*none/)
  })

  it('tightens .app-shell__header padding below md', (): void => {
    expect(RESPONSIVE_CSS).toMatch(/\.app-shell__header\s*\{[^}]*padding/)
  })
})

describe('Shell — responsive tab-order discipline (Decision D1)', (): void => {
  afterEach((): void => {
    vi.unstubAllGlobals()
  })

  it('Publish button is NOT disabled above md', (): void => {
    stubMatchMedia(true)
    render(<Shell><div /></Shell>)
    const publish = screen.getByRole('button', { name: 'Publish' })
    expect(publish).not.toBeDisabled()
  })

  it('Publish button IS disabled below md (native disabled, NOT aria-disabled, NOT tabindex)', (): void => {
    stubMatchMedia(false)
    render(<Shell><div /></Shell>)
    const publish = screen.getByRole('button', { name: 'Publish' })
    expect(publish).toBeDisabled()
    expect(publish).not.toHaveAttribute('aria-disabled')
    expect(publish).not.toHaveAttribute('tabindex', '-1')
  })

  it('Account dropdown trigger IS disabled below md', (): void => {
    stubMatchMedia(false)
    render(<Shell><div /></Shell>)
    const account = screen.getByRole('button', { name: 'Account' })
    expect(account).toBeDisabled()
  })
})

describe('Shell — responsive CSS injection', (): void => {
  afterEach((): void => {
    vi.unstubAllGlobals()
  })

  it('renders the RESPONSIVE_CSS overlay inside a <style> tag', (): void => {
    stubMatchMedia(true)
    const { container } = render(<Shell><div /></Shell>)
    const styleTag = container.querySelector('style')
    expect(styleTag?.textContent).toContain('@media (max-width:')
    expect(styleTag?.textContent).toContain('.app-shell__brand')
  })
})

describe('Shell — keyboard shortcut mount + Toast wiring', (): void => {
  beforeEach((): void => {
    stubMatchMedia(true)
  })

  afterEach((): void => {
    vi.unstubAllGlobals()
  })

  it('renders without crashing (mounts useShortcuts hook + ToastProvider)', (): void => {
    render(<Shell><div /></Shell>)
    // Smoke: full keyboard-shortcut behaviour lives in shortcuts.test.ts; here
    // we only verify the Shell-level wiring composes without throwing.
    expect(screen.getByRole('banner')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL.**
  Run: `npx vitest run apps/admin/src/views/Shell.test.tsx`
  Expected: failures on the Shell tab-order suite — Publish button not disabled, no `<style>` tag rendered, etc.

- [ ] **Step 3: Implement the Shell.tsx modifications.**

```tsx
// apps/admin/src/views/Shell.tsx — modifications:

// 1. Add imports:
import { Button, DropdownMenu, Sidebar, ToastProvider, useToast } from '@snowboard-trip-advisor/design-system'
// ...
import { useShortcuts } from '../lib/shortcuts'
import { useResponsiveTabOrder } from '../lib/useResponsiveTabOrder'
import { setRoute } from '../state/useURLState'

import { PublishDialog } from './PublishDialog'
import { RESPONSIVE_CSS } from './Shell.responsive.css'

// 2. Inside Shell component (above the return):
export function Shell({ children }: ShellProps): JSX.Element {
  const [publishOpen, setPublishOpen] = useState<boolean>(false)
  const { readOnly } = useResponsiveTabOrder()
  return (
    <ToastProvider>
      <ShellInterior
        readOnly={readOnly}
        publishOpen={publishOpen}
        setPublishOpen={setPublishOpen}
      >
        {children}
      </ShellInterior>
    </ToastProvider>
  )
}

// 3. ShellInterior is INSIDE the ToastProvider so useToast() is in-context.
//    (useShortcuts wires Toast for the g i shortcut per Decision G3.)
interface ShellInteriorProps {
  readonly readOnly: boolean
  readonly publishOpen: boolean
  readonly setPublishOpen: (open: boolean) => void
  readonly children: ReactNode
}

function ShellInterior({
  readOnly,
  publishOpen,
  setPublishOpen,
  children,
}: ShellInteriorProps): JSX.Element {
  const toast = useToast()
  useShortcuts({
    onGoResorts: (): void => { setRoute({ route: 'resorts' }) },
    onGoIntegrations: (): void => {
      toast.show({
        variant: 'info',
        message: "Integrations management isn't available yet.",
      })
    },
    // Phase 1 no-op per Tier 5 plan Decisions G1, G2 (Radix Dialog handles
    // modal Escape; mod+enter flush wires in PR 4.6c via flushNow).
    onModEnter: (): void => {},
    onEscape: (): void => {},
  })
  return (
    <>
      <style>{RESPONSIVE_CSS}</style>
      <div className="app-shell">
        <header role="banner" className="app-shell__header">
          <span className="app-shell__brand">Admin</span>
          <Button
            disabled={readOnly}
            onClick={(): void => { setPublishOpen(true) }}
          >
            Publish
          </Button>
          <DropdownMenu
            trigger={<Button disabled={readOnly}>Account</Button>}
            label="Account menu"
            items={[
              { label: 'Sources', onSelect: (): void => {} },
              { label: 'Integrations', onSelect: (): void => {} },
              { label: 'History', onSelect: (): void => {} },
            ]}
          />
        </header>
        <Sidebar items={SIDEBAR_ITEMS} />
        <main>{children}</main>
        {publishOpen && (
          <PublishDialog open={publishOpen} onOpenChange={setPublishOpen} />
        )}
      </div>
    </>
  )
}
```

- [ ] **Step 4: Run the Shell tests — expect PASS.**
  Run: `npx vitest run apps/admin/src/views/Shell.test.tsx`
  Expected: all suites pass (CSS export shape + Shell tab-order + CSS overlay injection + keyboard mount).

- [ ] **Step 5: Run the full admin test suite + integration tests for any cross-effects.**
  Run: `npx vitest run apps/admin tests/integration/apps/admin`
  Expected: ALL tests pass. Existing PublishDialog / useHealth / useToast tests should be unaffected (Shell's wrapping order is preserved; only the inner content + onMount behavior changed).

- [ ] **Step 6: Verify Shell.tsx + Shell.responsive.css.ts coverage 100% × 4.**
  Run: `npx vitest run apps/admin/src/views/Shell.test.tsx --coverage`
  Expected: 100% × 4 for Shell.tsx and Shell.responsive.css.ts.

- [ ] **Step 7: Commit Shell.tsx + Shell.responsive.css.ts + Shell.test.tsx together** (one reviewable change).
  Run:
  ```bash
  git add apps/admin/src/views/Shell.tsx apps/admin/src/views/Shell.responsive.css.ts apps/admin/src/views/Shell.test.tsx
  git commit -m "Wire useShortcuts + native disabled below md in Shell + responsive CSS (PR 4.6a)"
  ```

### Task 4.6a-9: Full qa green + push

- [ ] **Step 1: Run the full quality gate.**
  Run: `npm run qa`
  Expected: exit 0; lint clean; drift check clean; typecheck clean; coverage 100% × 4; tokens clean; hook tests 72 pass; integration 56+ pass.

- [ ] **Step 2: Push the branch.**
  Run: `git push -u origin epic-4/pr-4.6a-polish`
  Expected: branch pushes; CI starts.

### Task 4.6a-10: Open PR + Subagent Review (spec MODIFY trigger)

- [ ] **Step 1: Open PR with the standard body shape.** Mirror PR #102's body structure. Body must list: spec sections (§3.10, §3.2, §7.16 amended in this PR), decisions log IDs A1–K1 (the open race-fix decision was tagged J1 when PR 4.6a's body was authored; renamed K1 in PR 4.6c to avoid the apiClient.ts:32 collision — PR 4.6a's shipped body text on GitHub is unaffected), file budget **(9/8 — one over the ≤8 ceiling, justified per AGENTS.md §95 documentation discipline; spec amendment co-ships with the code change it documents)**, verification commands. Title: `Epic 4 PR 4.6a — Polish (keyboard shortcuts + responsive read-only) + spec §7.16 amendment`.

- [ ] **Step 2: Dispatch Subagent Review per AGENTS.md §60** (mechanical trigger fired by `docs/superpowers/specs/**` MODIFY). Brief the reviewer to verify: (a) the §7.16 amendment cites both [Button.tsx:35-40](../../../packages/design-system/src/components/Button.tsx) AND WAI-ARIA 1.2 normative text; (b) the `/` deferral is documented with the WCAG 3.3.2 / 4.1.2 rationale; (c) the amendment does NOT modify any §7.4 done-gate criteria beyond replacing `tabindex="-1"` with `disabled`; (d) Tier 5 plan and spec wording agree on the 4-of-5 shortcut subset shipped in PR 4.6a.

- [ ] **Step 3: Post `@codex review` as a PR comment.**

- [ ] **Step 4: Wait 2-5 min; cross-check via REST on every round.**
  Run: `gh api '/repos/mathvbarone/snowboard-trip-advisor/pulls/<PR>/comments?sort=created&direction=desc&per_page=10'` AND `gh api '/repos/mathvbarone/snowboard-trip-advisor/issues/<PR>/comments?sort=created&direction=desc&per_page=10'`
  Expected: top-level "Codex Review: Didn't find any major issues. Breezy!" issue comment OR inline review comments to fold.

- [ ] **Step 5: Fold + reply + resolve + re-request — repeat until 👍.**

### Task 4.6a-11: Local-test plan (execute, don't just describe)

| # | Step | Command | Expected |
|---|------|---------|----------|
| 1 | Full quality gate | `npm run qa` | PASS (exit 0). |
| 2 | Build smoke | `npm run build` | Admin + public Vite builds clean. |
| 3 | Focused new-file coverage | `npx vitest run apps/admin/src/lib/shortcuts.test.ts apps/admin/src/lib/useResponsiveTabOrder.test.ts apps/admin/src/views/Shell.test.tsx` | All new files 100% × 4 (Shell.test.tsx covers Shell.tsx + Shell.responsive.css.ts per Decision I2 revised). |
| 4 | Admin dev server | `npm run dev:admin` (background) | `Local: http://127.0.0.1:5174/` ready in <500ms. |
| 5 | Playwright MCP keyboard smoke | navigate `http://127.0.0.1:5174/?route=editor&slug=kotelnica-bialczanska` → press `g` then `r` → assert URL changes to `/?route=resorts` → press `g` then `i` → assert Toast surfaces with "Integrations management isn't available yet." → press `Meta+Enter` → no error → press `Escape` → modal closes if open | Each shortcut behaves per Tier 5 plan Decisions F1–G3. |
| 6 | Playwright MCP responsive smoke | `mcp__playwright__browser_resize` to viewport width 800 (sub-md); navigate to editor → assert FieldRow input is NOT in DOM (replaced by read-only span via FieldRow's existing render gate); navigate to Shell — assert Publish button has `disabled` attribute (NOT `aria-disabled` / `tabindex="-1"`) | Tab-order discipline enforced via DOM, not just CSS, per Decision D1. |
| 7 | Axe scan | `mcp__playwright__browser_evaluate` with `axe.run({ include: [['main']] })` at both desktop (1280) and sub-md (800) viewport | Zero violations. |

- [ ] Execute each step; capture findings in a PR comment (replay block) for the maintainer.

### Task 4.6a-12: Final report + maintainer merge handoff

- [ ] Compose the final summary: PR # + commit SHA, qa results, codex round count + final verdict, local-test plan outcomes, any deferred issues, and "ready for maintainer merge."

---

## PR 4.6b tasks (sibling session — included for plan completeness)

A sibling session in a separate worktree starting from `origin/main` executes 4.6b in parallel with 4.6a. The plan structure mirrors 4.6a:

- **Task 4.6b-1**: Write failing tests for `tests/integration/apps/admin/dashboard.test.tsx` (canned tier per spec §6.3): health cards render + click-through-to-filtered-resorts; cold-start empty state per §10.9.
- **Task 4.6b-2**: Write failing tests for `tests/integration/apps/admin/resorts-table.test.tsx` (canned tier): table renders + sort + filter + click row updates URL state; cold-start empty-state row.
- **Task 4.6b-3**: Write failing test for `tests/integration/apps/admin/full-flow.test.tsx` (bridge tier per spec §6.3 / P0-3 fold): per-test workspace + history tmpdir; composite open admin → Resorts → row click → MANUAL edit → save → publish → see in PublishHistory; assert SPA state AND filesystem state.
- **Task 4.6b-4**: qa green + push + Codex review loop + local-test plan + final report.

**Branch:** `epic-4/pr-4.6b-integration-backfill`. **Depends on:** `main`. **Subagent Review trigger:** NO. **Parallel-capable with:** PR 4.6a. **README:** consider mentioning `npm run dev:admin` entrypoint.

---

## PR 4.6c tasks (after PR 4.6a merges)

**Branch:** `epic-4/pr-4.6c-workspace-race-fix`. **Depends on:** PR 4.6b merged. **Subagent Review trigger: YES** (spec touched per Decision K1 + Documentation Discipline).

- **Task 4.6c-0**: Brainstorm with `superpowers:brainstorming` — pick race-fix architectural approach K1 (formerly J1; renamed to avoid apiClient.ts:32 collision). Dispatch section-review subagent (architectural) + post-fold plan-review subagent. Append the Decision K1-resolved row to this plan.
- **Task 4.6c-1**: Write failing race-repro test in `useWorkspaceState.test.ts`: type valid value → debounce starts PUT → user clears input mid-PUT → assert canonical NOT prepopulated with typed value AND status reverts to `dirty` (not `save-failed`, not `saved`).
- **Task 4.6c-2**: Write failing `flushNow(slug)` tests: edit → `flushNow(slug)` → PUT fires immediately (no 500ms wait); flushNow with empty draft is a no-op (existing empty-diff short-circuit); flushNow during in-flight queues per existing inFlightToken behavior (documented).
- **Task 4.6c-3**: Write failing path-gated abort tests: cleared path WAS in inFlightDraft → abort fires; cleared path was NOT in inFlightDraft → abort does NOT fire (in-flight PUT completes normally); clearFieldValue when `inFlightDraft === null` → existing clear path runs (no abort attempt).
- **Task 4.6c-4**: Write failing `__resetForTests` aborts-every-controller test (microtask drain confirms no leaked rejections).
- **Task 4.6c-5**: Implement K1 in `useWorkspaceState.ts`: `SlugStore` gains `abortController` + `inFlightDraft` fields; `flush()` creates fresh controller, stores both, passes signal, catches AbortError separately from generic catch; AbortError branch reverts statuses for in-flight-draft paths to `dirty`, skips prepopulate, skips lastSentDraft update; finally clears both fields. `clearFieldValue` reads `store.inFlightDraft` and aborts only when the cleared path is in-flight (via `valueAtPathDiffersFromSent`-style walk); for nested clears, abort when the parent is in-flight. AbortError handler no-ops when `storesBySlug.get(slug) !== store`. `__resetForTests` aborts every controller before clearing.
- **Task 4.6c-6**: Implement `apiClient.request()` `RequestOptions | undefined` signature + `upsertResort(slug, body, options?)` signal forwarding. One focused unit test in `apiClient.test.ts`.
- **Task 4.6c-7**: Implement `flushNow(slug)` export in `useWorkspaceState.ts`.
- **Task 4.6c-8**: Modify Shell.tsx — read `useURLState()`; replace the Phase-1 no-op `onModEnter` with `() => { if (route.route === 'editor') { flushNow(route.slug) } }`. Off-route stays no-op. Modify Shell.test.tsx — same-mount setRoute test catches stale-closure regression.
- **Task 4.6c-9**: Bridge integration test in `resort-editor-write.test.tsx` `describe('useWorkspaceState — in-flight-clear race (PR 4.6c)')` block: type → debounce starts PUT → clear → canonical NOT prepopulated with typed value AND editor input renders blank.
- **Task 4.6c-10**: Modify spec §7.4 done-gate + §7.13 status (per blocker #2 / AGENTS.md §95 documentation discipline).
- **Task 4.6c-11**: qa green + push + Subagent Review (spec MODIFY trigger per K1) + Codex review loop + local-test plan + final report.

---

## Reviewer-fold log

(Populated as Codex / subagent rounds happen on each PR.)

### PR 4.6a

- **2026-05-12, Section reviewer (a11y/UX-copy) — pre-plan**: 3 BLOCK / REVISE findings folded into Decisions B1 (drop `/` shortcut + search input until Phase 2; WCAG 3.3.2/4.1.2), C1 (Toast copy "Integrations management isn't available yet."; drop "Phase 2" jargon), D1+D2 (native `disabled={readOnly}` over `tabIndex={-1}+aria-disabled`; spec §7.16 amended in same PR per AGENTS.md §95). User-confirmed all three folds before plan write.
- **2026-05-12, Plan reviewer — round 1**: 10 findings folded inline (P0 #1 fake-timers + userEvent deadlock → raw dispatchEvent; P0 #2 setRoute signature pinned in Task 4.6a-0 Step 5; P0 #6 handlers-ref pattern in shortcuts.ts + Decision F5 + bundled test; P1 #5 file budget 8 → 9 with AGENTS.md §95 justification; P1 #4 useResponsiveTabOrder fallback verified post-review — no change needed; P2 #3 Account button smoke-test ordering verified correct — no change; P2 #7 FieldRow imports drop made explicit in Task 4.6a-7; P2 #8 spec amendment text-anchor pinning; P2 #9 D1 scope clarified in "What we are NOT building"; P2 #10 pre-empted by P0 #6).
- **2026-05-12, Plan reviewer — round 2 (verification)**: 3 cascade gaps from the round-1 file-count change folded inline (P0 cascade-#1: file-budget claim updated to "9/8 justified" in Decision A1, in PR 4.6a tasks intro, AND in Task 4.6a-10 Step 1; P0 cascade-#2: Task 4.6a-11 Step 3 path corrected from `Shell.responsive.css.ts.test.ts` → `Shell.test.tsx`; P2 cascade-#3 absorbed into the Decision A1 update). Round-1 folds independently re-verified ✅.

### PR 4.6b

- _(none yet)_

### PR 4.6c

- _(none yet)_
