# S1 — Design-system Component CSS Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add co-located, token-driven CSS to the 23 structural-only design-system components so both apps render in the reference mockups' visual language, verified in a new dev-only component gallery.

**Architecture:** Each component gets a co-located `<Component>.css` imported as the first statement of its `.tsx` (Table/Toast/Drawer precedent). CSS keys off the hooks the component **already emits** (`sta-*` BEM, `[data-variant]`, `[data-region]`, `aria-*`); values are `var(--token-*)` only; light/dark inherited from the S0 `:root` cascade with zero per-component theme code. A dev-only unlinked `?route=gallery` page in `apps/admin` renders every component × variant × state for visual + Playwright cascade verification.

**Tech Stack:** TypeScript/React 19, hand-written CSS (no framework — ADR-0006), Vitest (jsdom design-system project + root scripts project), Playwright MCP, `npm run qa` gate.

**Spec:** [`docs/superpowers/specs/2026-05-17-s1-design-system-component-css-design.md`](../specs/2026-05-17-s1-design-system-component-css-design.md) (`c751bd8`+`ad77032`). Base: merged S0 `fa10214`. Branch `claude/s1-ds-component-css`, worktree `/Users/matheusbarone/Projects/snowboard-trip-advisor/.claude/worktrees/s1-ds-component-css`.

---

## Critical execution constraints (read before any task)

- **Pre-commit runs full `npm run qa`** on non-docs commits (lint → check:agent-discipline-sync → typecheck → coverage 100%×4 → tokens:check → test:hooks → test:integration). A commit with a failing test is **rejected**. Per task: write test → run RED (do **not** commit) → implement → run GREEN → `npm run qa` → **then** commit. Never commit at red.
- **`--no-verify` and force-push are hook-blocked.** Never use them. If qa fails, fix the root cause.
- **Worktree path discipline:** all paths are relative to the S1 worktree above. Verify edits with `git status` in that worktree; do not `cd` to the main checkout (coverage/dev run from main checkout uses pre-S1 code).
- **Gallery Playwright smoke runs from the MAIN checkout against this branch (or post-merge)** — same workspace-symlink limitation S0 hit (PR #121). The worktree's app dev server resolves `@snowboard-trip-advisor/design-system` via the main checkout symlink. Record the smoke result explicitly per PR; never fake or silently skip it.
- **No new design tokens.** If a needed value has no token, use the nearest existing token and note it in the PR body for a future token slice. Do not edit `tokens.ts`.
- **No `.tsx` markup change beyond adding `import './<Component>.css'`** as the first import. The inventory confirms all 23 already emit the needed hooks.
- **Stacked PRs:** S1.0 → S1a → S1b → S1c-1 → S1c-2 → S1d. Each branches off the previous (or is rebased on it). One spec, ~6 PRs.

---

## Per-component CSS recipe (applies to every component task)

Every `<Component>.css` MUST:
1. Open with a short header comment: what it styles + "token-driven, light/dark via S0 `:root` cascade (ADR-0005); no theme code here."
2. Define the base selector (the component's root `sta-*` class, or the exact root class from the contract table — note Textarea/Skeleton/Shell exceptions).
3. Style every variant/state the component emits via attribute selectors: `.sta-x[data-variant="…"]` for each value in the contract table; `[aria-pressed="true"]`, `[aria-current="page"]`, `[aria-selected="true"]`, `[aria-invalid="true"]`, `[data-region="…"]`, `[data-source="…"]`, `[data-state="…"]` as listed; `:hover`, `:focus-visible`, `:disabled` where the control is interactive.
4. Use `var(--token-*, <fallback>)` with a sane fallback (Toast.css/Drawer.css precedent), tokens only — no raw hex, no raw px except `0`/`1px` hairlines and `100%`.
5. Contain **no** `@media (prefers-color-scheme)` and **no** `[data-theme]` selector.
6. Not redefine `sta-visually-hidden` (owned by S0 `utilities.css`).

Every `<Component>.css.test.ts` MUST follow this exact skeleton (Table.css.test.ts/base.css.test.ts precedent), with `(): void` on every callback and a rationale comment that jsdom can't compute styles:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// <Component> visual CSS. jsdom can't resolve the cascade/tokens, so the
// testable surface is CSS source text; real cascade is the gallery
// Playwright smoke (plan §Gallery smoke).
describe('<Component>.css', (): void => {
  const path = resolve(import.meta.dirname, '<Component>.css')
  const source = readFileSync(path, 'utf8')

  it('declares the base selector', (): void => {
    expect(source).toContain('.sta-<component>')
  })
  it('drives values from design tokens', (): void => {
    expect(source).toMatch(/var\(--(color|space|radius|font|duration|z)-/)
  })
  // + one it() per required variant/state selector from the contract table
})
```

The per-component task loop (identical for all 23 — do not re-narrate, follow it):
1. Write `<Component>.css.test.ts` from the skeleton + that component's contract-table assertions. Run it → **RED** (`ENOENT`, file absent). Do not commit.
2. Add `import './<Component>.css'` as the first import line of `<Component>.tsx` (above other imports, blank line before non-side-effect imports — match the file's existing import grouping; Table.tsx precedent).
3. Create `<Component>.css` per the recipe, deriving spacing/color/radius/type from tokens to match the reference language (token-faithful, NOT pixel-measured — spec §0; use Table.css/Toast.css/Drawer.css as the house style).
4. Add the component (all variants/states) to the gallery (see S1.0).
5. Run the component's test → **GREEN**. Run `npm run qa` → green. Commit (grouped per PR — see each PR's commit step; one commit per component is fine, ≤ family size).

---

## PR S1.0 — Component gallery scaffold

**Files:**
- Modify: `apps/admin/src/lib/urlState.ts` (ROUTE_VALUES line 30, Route union ~47–53, parseURL ~55–101, serializeURL)
- Modify: `apps/admin/src/App.tsx` (render chain ~17–24)
- Create: `apps/admin/src/views/Gallery.tsx`
- Create: `apps/admin/src/views/Gallery.test.tsx`
- Modify: `apps/admin/src/App.test.tsx` (add gallery route test)
- Create: `apps/admin/src/views/gallery-smoke.md` (the documented manual/MCP Playwright procedure — see §Gallery smoke)

- [ ] **Step 1: Failing routing test.** In `apps/admin/src/App.test.tsx` add (mirror the existing `?route=resorts` test at ~44–54):

```ts
it('renders the Gallery when URL has ?route=gallery', (): void => {
  window.history.replaceState({}, '', '/?route=gallery')
  render(<App />)
  expect(screen.getByRole('heading', { name: /component gallery/i })).toBeInTheDocument()
  window.history.replaceState({}, '', '/') // reset URL — match the file's other route tests so the route doesn't leak into later tests
})
```
Also add to `urlState.test.ts` (mirror its dashboard/editor cases) an assertion that `parseURL('?route=gallery')` returns `{ route: 'gallery' }` and that `gallery` is NOT in any nav-items list (unlinked).

- [ ] **Step 2: Run RED.** `npx vitest run apps/admin/src/App.test.tsx apps/admin/src/lib/urlState.test.ts` — expect FAIL (`gallery` unknown route → falls back to dashboard; Gallery undefined).

- [ ] **Step 3: Wire the route.** In `apps/admin/src/lib/urlState.ts`: add `'gallery'` to `ROUTE_VALUES`; add `| { route: 'gallery' }` to the `Route` union; in `parseURL` add an early branch mirroring dashboard: `if (route === 'gallery') { return { route: 'gallery' } }`; in `serializeURL` add `if (state.route === 'gallery') { const p = new URLSearchParams(); p.set('route','gallery'); return \`?\${p.toString()}\` }`. Do NOT add `gallery` to `SIDEBAR_ITEMS` in `views/Shell.tsx` (stays unlinked — spec §7).

- [ ] **Step 4: Gallery view.** Create `apps/admin/src/views/Gallery.tsx`: a dev-only page with an `<h1>Component gallery</h1>`, a short note that theme follows OS `prefers-color-scheme` (no toggle — ADR-0005), and a `<section>` per component family. S1.0 ships ONLY the already-styled exemplars — render `Table`, `Toast` (via its provider/trigger), and `Drawer` (open state) so the gallery's pattern is established. Each component rendered inside a labelled `<section data-gallery-component="<Name>">` wrapper so the Playwright smoke can target it. Family sections for S1a–S1d exist as empty `<section data-gallery-family="…">` placeholders with a TODO comment; later PRs fill them.

- [ ] **Step 5: Gallery render test.** `apps/admin/src/views/Gallery.test.tsx`: assert the heading renders and the exemplar wrappers (`[data-gallery-component="Table"]` etc.) are present (jsdom render via @testing-library, mirror existing view tests).

- [ ] **Step 6: App render branch.** In `apps/admin/src/App.tsx` add `{route.route === 'gallery' ? <Gallery /> : null}` after the publishes line; add the import.

- [ ] **Step 7: Smoke procedure doc.** Create `apps/admin/src/views/gallery-smoke.md` documenting the exact MAIN-checkout procedure (see §Gallery smoke below) so every later PR follows the identical steps.

- [ ] **Step 8: GREEN + gate.** `npx vitest run apps/admin/` green; `npm run qa` green (100%×4).

- [ ] **Step 9: Gallery smoke (S1.0).** Follow §Gallery smoke from the main checkout against this branch: load `?route=gallery`, assert the exemplar components resolve token styles light + emulated dark. Record the result in the PR body.

- [ ] **Step 10: Commit + PR.**
```bash
git add apps/admin/src/lib/urlState.ts apps/admin/src/App.tsx apps/admin/src/views/Gallery.tsx apps/admin/src/views/Gallery.test.tsx apps/admin/src/App.test.tsx apps/admin/src/lib/urlState.test.ts apps/admin/src/views/gallery-smoke.md
git commit -m "feat(admin): dev-only component gallery route (S1.0)"
git push origin claude/s1-ds-component-css
```
Open PR; body: states this is S1.0 (gallery infra, the §4/§7 named `apps/*` exception — unlinked dev-only route), the gallery-smoke result, links spec `c751bd8`. Then per-PR `@codex review` + local acceptance per standing discipline.

---

## §Gallery smoke (the per-PR cascade verification — identical every PR)

From the **main checkout** `/Users/matheusbarone/Projects/snowboard-trip-advisor` with this branch checked out there (or post-merge on `main`):
1. `npm run dev:admin` (admin dev server, `127.0.0.1:5174`).
2. Playwright MCP: `browser_navigate` → `http://127.0.0.1:5174/?route=gallery`.
3. For each component this PR styled, `browser_evaluate` `getComputedStyle` on its `[data-gallery-component="<Name>"]` root: assert it resolves token-derived values (e.g. non-default `background-color`/`border`/`color`/`font-family`, not the jsdom/browser defaults `rgba(0,0,0,0)` / `Times`).
4. Repeat under emulated dark: Playwright `browser_resize`-style is N/A; use the MCP color-scheme emulation if available, else document that dark is verified by the S0 `@media` cascade + a second OS-level check. Record both results in the PR body. A default/unstyled computed value = the CSS import didn't take — STOP and investigate before claiming success.

---

## PR S1a — Form controls (6 components)

Per-component contract table (follow the §recipe + §task loop for each; commit per component, one PR):

| Component | Root selector | Required selectors to assert (test `it`s) | Notes |
|---|---|---|---|
| Button | `.sta-button` | `[data-variant="primary"]`, `[data-variant="secondary"]`, `[data-variant="ghost"]`, `:focus-visible`, `:disabled`, `[aria-pressed="true"]` | native `<button>`; **worked exemplar below** |
| IconButton | `.sta-icon-button` | `[data-hit-area="square"]`, `:focus-visible`, `:disabled`, `[aria-pressed="true"]` | native `<button>`, square hit area |
| Input | `.sta-input` | `.sta-input__label`, `.sta-input__control`, `[aria-invalid="true"]`, `:disabled` | native `<input>` in `<label>` |
| Select | `.sta-select` | `.sta-select__label`, `.sta-select__control`, `:disabled` | native `<select>`; style native control (ADR-0004), not a custom dropdown |
| Textarea | `.sta-textarea__control` | base `.sta-textarea__control`, `:focus-visible`, `:disabled` | **root IS `__control`**, no block/label class |
| ToggleButtonGroup | `.sta-toggle-button-group` | `.sta-toggle-button`, `.sta-toggle-button[aria-pressed="true"]`, `:focus-visible`, `:disabled` | `role="group"` container + native buttons |

**Worked exemplar — Button** (the model every other component mirrors; shows the fidelity level — token-faithful, minimal, not pixel-measured):

`Button.css.test.ts` (full, from skeleton):
```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// Button visual CSS. jsdom can't resolve the cascade/tokens, so the
// testable surface is CSS source text; real cascade is the gallery
// Playwright smoke (plan §Gallery smoke).
describe('Button.css', (): void => {
  const path = resolve(import.meta.dirname, 'Button.css')
  const source = readFileSync(path, 'utf8')

  it('declares the base selector', (): void => {
    expect(source).toContain('.sta-button')
  })
  it('styles all three variants via data-variant', (): void => {
    expect(source).toContain('.sta-button[data-variant="primary"]')
    expect(source).toContain('.sta-button[data-variant="secondary"]')
    expect(source).toContain('.sta-button[data-variant="ghost"]')
  })
  it('styles focus-visible, disabled, and pressed state', (): void => {
    expect(source).toContain(':focus-visible')
    expect(source).toContain(':disabled')
    expect(source).toContain('[aria-pressed="true"]')
  })
  it('drives values from design tokens only', (): void => {
    expect(source).toMatch(/var\(--(color|space|radius|font|duration)-/)
    // no raw hex colors
    expect(source).not.toMatch(/:\s*#[0-9a-fA-F]{3,6}\b/)
  })
})
```

`Button.css` (exemplar — token-faithful, the house style; later components mirror this density, deriving their own token mapping from the references):
```css
/* Button visual CSS. Token-driven; light/dark via the S0 :root cascade
 * (ADR-0005) — no theme code here. Variants keyed off the data-variant
 * the component already emits (no className branching). */
.sta-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm, 8px);
  padding: var(--space-sm, 8px) var(--space-lg, 16px);
  font-family: var(--font-family-body, sans-serif);
  font-size: var(--font-size-md, 16px);
  font-weight: var(--font-weight-medium, 500);
  border-radius: var(--radius-md, 8px);
  border: 1px solid transparent;
  cursor: pointer;
  transition: background-color var(--duration-fast, 120ms),
    border-color var(--duration-fast, 120ms);
}
.sta-button[data-variant="primary"] {
  background: var(--color-accent, #0066cc);
  color: var(--color-background, #fff);
}
.sta-button[data-variant="secondary"] {
  background: var(--color-surface, #f4f5f7);
  color: var(--color-foreground, #0b0d10);
  border-color: var(--color-border, #d6d9dd);
}
.sta-button[data-variant="ghost"] {
  background: transparent;
  color: var(--color-accent, #0066cc);
}
.sta-button:hover:not(:disabled) { filter: brightness(0.96); }
.sta-button:focus-visible {
  outline: 2px solid var(--color-accent, #0066cc);
  outline-offset: 2px;
}
.sta-button[aria-pressed="true"] { filter: brightness(0.9); }
.sta-button:disabled { opacity: 0.5; cursor: not-allowed; }
```

- [ ] For each of the 6: run §task loop. Add each to the Gallery `S1a form controls` section (all variants + a disabled + a pressed example; Input/Textarea with `aria-invalid` example).
- [ ] After all 6 green: `npm run qa`; §Gallery smoke for the 6; commit per component; push; open PR. **Size-exception note in PR body:** "Family PR > ≤8 files / ≤300 LOC — documented inseparable-concern exception per spec §5 (analyst-notes N.b3b/N.c2 precedent): one coherent CSS family; splitting a component's CSS from its import+gallery+test orphans test pre-conditions." `@codex review` + local acceptance.

---

## PR S1b — Surfaces (5 components)

Follow §recipe + §task loop. Contract table:

| Component | Root selector | Required selectors to assert | Notes |
|---|---|---|---|
| Card | `.sta-card` | `[data-variant="elevated"]`, `[data-variant="flat"]`, `[data-region="header"]`, `[data-region="body"]`, `[data-region="footer"]` | regions are `data-region` divs, not BEM |
| Shell | `.sta-skip-link` | `.sta-skip-link`, `.sta-skip-link:focus` | **minimal**: only skip-link (visually-hidden until `:focus`); `<main>` has no class — do not invent one |
| Sidebar | `.sta-sidebar` | `.sta-sidebar__list`, `.sta-sidebar__item`, `.sta-sidebar__link`, `.sta-sidebar__link[aria-current="page"]`, `:focus-visible` | active state via `aria-current` |
| HeaderBar | `.sta-header-bar` | `.sta-header-bar__brand`, `[data-region="view-toggle"]`, `[data-region="shortlist"]` | implicit banner |
| EmptyStateLayout | `.sta-empty-state` | `.sta-empty-state__heading`, `.sta-empty-state__body`, `[data-region="icon"]`, `[data-region="cta"]`, `[data-region="details"]` | icon region `aria-hidden` |

- [ ] §task loop ×5; gallery `S1b surfaces` section (Card both variants + all regions; Sidebar with an active item; EmptyStateLayout with icon+cta+details). qa; §Gallery smoke; commit per component; PR with the same size-exception note; `@codex review` + acceptance.

---

## PR S1c-1 — Feedback/status A (4 components)

> Spec §5 explicitly authorises splitting S1c (7) — split into S1c-1 (4) + S1c-2 (3) to respect the size budget.

| Component | Root selector | Required selectors | Notes |
|---|---|---|---|
| Pill | `.sta-pill` | `[data-variant="default"]`, `[data-variant="stale"]` | do not restyle `sta-visually-hidden` |
| StatusPill | `.sta-status-pill` | `[data-variant="live"]`, `[data-variant="stale"]`, `[data-variant="failed"]`, `[data-variant="manual"]` | variant required (4 values), no default |
| SourceBadge | `.sta-source-badge` | `.sta-source-badge__name`, `[data-source="opensnow"]`, `[data-source="manual"]` (+ assert at least the 6-source set is addressable) | renders a glyph SVG; style wrapper+name |
| Skeleton | `.sta-skeleton` | `.sta-skeleton[data-variant="line"]`, `[data-variant="block"]`, `[data-variant="card"]`, `[role="status"]` | also has `sta-skeleton--<variant>` modifier — assert the `[data-variant]` form for consistency; add a subtle reduced-motion-safe shimmer (no animation if `prefers-reduced-motion`) |

- [ ] §task loop ×4; gallery `S1c feedback/status` section (each variant; Skeleton all 3; SourceBadge a couple sources). qa; §Gallery smoke; commit per component; PR (size-exception note); `@codex` + acceptance.

---

## PR S1c-2 — Feedback/status B (3 components)

| Component | Root selector | Required selectors | Notes |
|---|---|---|---|
| Chip | `.sta-chip` | `:focus-visible`, `:disabled`, `[aria-pressed="true"]` | native `<button>` toggle |
| FieldValueRenderer | `.sta-field-value` | `.sta-field-value__text`, `.sta-field-value__info`, `.sta-field-value__missing`, `[data-state="fresh"]`, `[data-state="stale"]`, `[data-state="never_fetched"]` | composes Pill/SourceBadge/Tooltip — style only its own `sta-field-value*` parts |
| ExternalLink | `.sta-external-link` | `[data-variant="inline"]`, `[data-variant="button"]`, `:focus-visible` | `button` variant should visually echo `.sta-button` tokens (do not duplicate — reference same tokens) |

- [ ] §task loop ×3; gallery entries; qa; §Gallery smoke; commit per component; PR (size-exception note); `@codex` + acceptance.

---

## PR S1d — Overlays/primitives (5 components)

| Component | Root selector | Required selectors | Notes |
|---|---|---|---|
| Modal | `.sta-modal` | `.sta-modal__overlay`, `.sta-modal__title`, `[data-modal="true"]` | Radix Dialog; only authored classes are text-testable (Radix runtime attrs are not) |
| Popover | `.sta-popover` | base `.sta-popover` + token usage | Radix DismissableLayer; `role="dialog"` |
| Tabs | `.sta-tabs` | `.sta-tabs__list`, `.sta-tabs__tab`, `.sta-tabs__tab[aria-selected="true"]`, `.sta-tabs__panel`, `:focus-visible` | selected state via `aria-selected` |
| Tooltip | `.sta-tooltip` | `.sta-tooltip`, `.sta-tooltip__arrow` + token usage | Radix injects `data-state`/`data-side` at runtime — NOT in source, so do NOT assert them in the text test (note in test comment) |
| DropdownMenu | `.sta-dropdown-menu` | `.sta-dropdown-menu`, `.sta-dropdown-menu__menu`, `.sta-dropdown-menu__item`, item `:focus-visible`, item `:hover` | Radix DismissableLayer+FocusScope; menu `role="menu"`, items `role="menuitem"` with roving tabindex. Only authored `sta-dropdown-menu*` classes are text-testable — Radix runtime attrs (trigger `aria-expanded`, `data-*`) are NOT in source, do NOT assert them |

- [ ] §task loop ×5. Gallery entries: Modal (open), Popover (open), Tabs (with a selected tab), Tooltip (forced-open if the gallery can; else document it's verified via interaction in the smoke), DropdownMenu (open, with ≥2 items so item `:hover`/`:focus-visible` are verifiable). qa; §Gallery smoke (Modal/Popover/Tooltip/DropdownMenu need an open-state trigger in the gallery — wire a permanently-open instance for verification). Commit per component; PR (size-exception note); `@codex` + acceptance.

---

## Out of scope (all PRs)

Screen-level layout (S2+); new tokens / `tokens.ts`; `apps/*` behaviour beyond the unlinked gallery route; `.tsx` changes beyond the `import './<Component>.css'` line; manual theme toggle / any `[data-theme]` or `prefers-color-scheme` in component CSS; restyling Table/Toast/Drawer; redefining `sta-visually-hidden`.

## Done criteria (whole S1)

- 23 `<Component>.css` + tests; each imported by its `.tsx`; `npm run qa` green every PR (100%×4).
- Gallery renders all 23 across variants/states; §Gallery smoke recorded green (light + dark) per PR from the main checkout/post-merge.
- No new tokens; no theme code in any component CSS; no Table/Toast/Drawer change; gallery route unlinked (absent from `SIDEBAR_ITEMS`).
- Each family PR carries the documented size-exception justification; S1c shipped as S1c-1 + S1c-2.
