# S0 — Design-system foundation (token loading + ADR-0005 compliance + base reset)

- **Status:** Draft
- **Date:** 2026-05-17
- **Author:** @mathvbarone (brainstorm) + post-analyst-notes agent
- **Parent / source:** [`docs/superpowers/specs/2026-05-17-visual-fidelity-audit-and-decomposition.md`](2026-05-17-visual-fidelity-audit-and-decomposition.md) slice **S0**
- **Related ADRs:** [ADR-0005](../../adr/0005-css-theme-no-js.md) (CSS-only theming via `prefers-color-scheme`) — **upheld, not amended**; [ADR-0006](../../adr/0006-public-app-no-css-framework.md) (hand-built design system, no CSS framework); [ADR-0004](../../adr/0004-public-app-form-controls-native.md) (native form controls).
- **Related specs:** Epic 3 spec §5 (component inventory), §6.2 (theme); Epic 4 spec (admin app).

---

## 0. Executive summary

The design tokens shipped (`packages/design-system/tokens.css`) but never reach
either app: nothing imports the file, so every `var(--color-*)` / `var(--space-*)`
resolves to nothing and both apps render as unstyled browser-default HTML. S0 is
the **blocking foundation** for all visual-fidelity work (audit §2): it makes the
tokens reach the DOM, brings the token generator into compliance with ADR-0005
(emit `@media (prefers-color-scheme: dark)`), and adds the smallest hand-written
reset/base so existing `sta-*` class-hooks render coherently.

S0 deliberately styles **no component and no screen** — that is S1+. No app source
is edited; propagation is via the design-system barrel side-effect import (the
same mechanism that already loads `utilities.css`).

---

## 1. Locked decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Theme policy: honor OS `prefers-color-scheme`; keep ADR-0005 unchanged.** Both apps ship full light + dark token sets; the OS picks. | User decision. The references (public dark `01–03`, admin light `04–06`) are the dark / light *renderings*, not fixed per-app identities. ADR-0005 already specifies this; the generator simply diverged and is corrected here. |
| 2 | **Generator emits `:root` (light) + `@media (prefers-color-scheme: dark) { :root { …dark… } }`.** The current `[data-theme="dark"]` block is **removed**. | ADR-0005 §Decision-1/2 mandates the media-query form; §Decision-3 frames a manual toggle as a *future, purely additive* `[data-theme=…]` layer. The present `[data-theme="dark"]` block is dead (never applied at runtime) — YAGNI: re-add additively when a toggle UI actually ships. |
| 3 | **Foundational CSS loads via the design-system barrel** (`src/index.ts` imports `./tokens.css` then `./base.css`, before the existing `./utilities.css`). | Single source of truth; matches the existing `utilities.css` precedent; impossible to forget in a new app/test harness. No app source edited. |
| 4 | **New `base.css` is hand-written, minimal, token-driven** (box-sizing reset, body reset, body font/color/bg from tokens, `:focus-visible` baseline). No dependency, no normalize library. | ADR-0006 (hand-built, no framework). Component- and element-specific resets are owned by later fidelity slices, not S0 (YAGNI). |
| 5 | **No ADR is created or amended.** ADR-0005 is upheld; the generator change is a *compliance fix*, documented as a compliance note here. | The decision record already exists and is correct; only the implementation diverged. |

---

## 2. Generator change

**File:** `scripts/generate-tokens.ts` (`renderTokensCss`), driven by
`scripts/generate-tokens.cli.ts` (unchanged).

Current emission (audit-verified): `:root { …light… }` then
`[data-theme="dark"] { …dark… }` (no media query).

Target emission:

```css
:root {
  /* space, breakpoint, radius, z, duration, font-*, color.light */
}
@media (prefers-color-scheme: dark) {
  :root {
    /* color.dark overrides only */
  }
}
```

- The structural tokens (space/breakpoint/radius/z/duration/font) stay in `:root`
  only — they are theme-invariant.
- Only the color group has a dark override set; it is emitted inside the
  media-query-wrapped `:root`.
- The `[data-theme="dark"]` selector emission is deleted.

**`tokens.css` is a generated artifact.** The `npm run qa` step `tokens:check`
runs `tokens:generate && git diff --exit-code packages/design-system/tokens.css`,
so the regenerated file MUST be committed in the same PR or the gate fails. The
generated file header (`/* GENERATED — do not edit … */`) is preserved.

---

## 3. `base.css`

**File:** `packages/design-system/src/base.css` (NEW). Hand-written, token-driven,
≈35 lines. Indicative content (final wording owned by the plan/TDD):

```css
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; }
html, body { min-height: 100%; }
body {
  font-family: var(--font-family-body);
  color: var(--color-foreground);
  background: var(--color-background);
  font-size: var(--font-size-md);
  line-height: 1.5;
}
:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
```

Out of scope for `base.css`: heading scale, form-control normalization, table
resets, link styling, list resets — each is owned by the slice that first styles
that surface (S1+). S0 adds only what makes the *existing* unstyled class-hooks
legible (correct font, fg/bg, predictable box model, visible focus).

---

## 4. Barrel wiring

**File:** `packages/design-system/src/index.ts`.

Current line 1: `import './utilities.css'`.

Target (order matters — tokens define the custom properties `base.css`
consumes; both precede `utilities.css` for cascade predictability):

```ts
import './tokens.css'
import './base.css'
import './utilities.css'
```

No `apps/*` source changes. Both apps already import runtime components from the
barrel (`@snowboard-trip-advisor/design-system`), so the CSS side-effect imports
propagate exactly as `utilities.css` does today. **Verification obligation
(carried into the plan):** confirm neither app relies on a deep import path that
would bypass the barrel; add a dev-server smoke step asserting `document.body`
resolves a token-driven background/font.

---

## 5. Testing (TDD-ordered — tests precede implementation)

Per AGENTS.md TDD Workflow and the project's plan/spec test-ordering discipline,
the implementation plan's task list MUST order each test before its
implementation. Deliverable order:

1. **Generator unit test (red first):** `renderTokensCss(tokens)` output
   *contains* `@media (prefers-color-scheme: dark)` wrapping a `:root` whose body
   includes the dark color custom properties, and *does not contain*
   `[data-theme`. Then implement the generator change to green.
2. **`tokens.css` drift:** regenerate via `npm run tokens:generate`, commit the
   artifact; the existing `tokens:check` qa gate enforces committed == generated.
   (No new test — the gate is the assertion.)
3. **Barrel import test (red first):** assert `src/index.ts` imports `./tokens.css`
   and `./base.css`, both before `./utilities.css`. Then add the imports.
4. **`base.css` content test (red first):** CSS-text assertion that the file
   declares the `box-sizing: border-box` universal reset and the body
   `var(--color-foreground)` / `var(--color-background)` / `var(--font-family-body)`
   references. jsdom does not resolve `@media` or computed custom properties
   reliably, so the assertion is on stylesheet text, not computed style. Then add
   `base.css`.
- **Gate:** `npm run qa` green (lint → check:agent-discipline-sync → typecheck →
  coverage → tokens:check → test:hooks → test:integration). Coverage 100%×4 on the
  TS generator change. The `PostToolUse:Edit|Write` lint hook surfaces violations
  in-loop for self-correction.

---

## 6. Scope boundaries

**In scope:** generator media-query compliance, `tokens.css` regeneration,
`base.css`, barrel wiring, the four tests above.

**Explicitly out of scope (later slices / not now):**
- Styling any design-system component or any screen (S1+).
- Per-app or fixed-identity theming; any `[data-theme]` manual-toggle layer.
- Any `apps/*` source edit.
- Element/form/table/heading resets beyond the minimal body baseline.
- New dependencies.

---

## 7. PR sizing & review disposition

- **One atomic PR.** Est. ≈110 LOC across 5 files
  (`generate-tokens.ts`, `tokens.css` [generated], `base.css`, `index.ts`,
  test file[s]) — within the ≤300 LOC / ≤8 files ceiling.
- **Risk:** low; mechanical infra. Paths touched: `packages/design-system/**`,
  `scripts/**`. No `packages/schema/**`, `docs/adr/**` change → no mechanical
  Subagent Review path trigger. Per the project's review-proportionality
  practice: one lightweight subagent review + the standard per-PR Codex review;
  no heavyweight multi-agent adjudication.
- The S0 **spec doc** (this file, under `docs/superpowers/specs/**`) is committed
  in the brainstorming phase and does mechanically trigger Subagent Review for
  its own docs-only commit per AGENTS.md §60; the *implementation* PR does not.

---

## 8. Verification steps

1. `npm run qa` green on the implementation branch.
2. `git diff --exit-code packages/design-system/tokens.css` clean after
   `npm run tokens:generate` (tokens:check).
3. Dev-server smoke (both apps): `document.body` computed `background-color` and
   `font-family` resolve to the light token values; toggling the OS/browser
   `prefers-color-scheme: dark` flips background/foreground with no JS and no
   first-paint flash (ADR-0005 §Consequences).
4. No `apps/*` source file modified (`git diff --stat` excludes `apps/`).
5. Confirm no deep design-system import in either app bypasses the barrel
   side-effect (grep import specifiers).

---

## 9. What this spec is not

Not an implementation plan. The plan (next step, via the writing-plans skill)
expands §5 into a TDD-ordered task list. No code until the plan is approved.
