# S1 — Design-system component CSS pass

- **Status:** Draft
- **Date:** 2026-05-17
- **Author:** @mathvbarone (brainstorm) + post-S0 agent
- **Parent / source:** [`docs/superpowers/specs/2026-05-17-visual-fidelity-audit-and-decomposition.md`](2026-05-17-visual-fidelity-audit-and-decomposition.md) slice **S1**
- **Depends on:** S0 (PR #121, merge `fa10214`) — tokens + base reset now reach both apps' DOM, verified post-merge.
- **Related ADRs:** [ADR-0005](../../adr/0005-css-theme-no-js.md) (CSS-only theming via `prefers-color-scheme` — upheld), [ADR-0006](../../adr/0006-public-app-no-css-framework.md) (hand-built design system, no framework — upheld), [ADR-0004](../../adr/0004-public-app-form-controls-native.md) (native form controls — upheld).
- **Reference target:** `docs/reference/01–06.png` (full-screen mockups; the visual language, not a per-component spec sheet).

---

## 0. Executive summary

S0 made design tokens reach the DOM but **no component is styled** — both apps render as token-coloured but otherwise unstyled HTML. S1 writes co-located, token-driven CSS for the **23 structural-only** design-system components so both apps render in the references' visual language.

Fidelity bar: **token-faithful, not pixel-exact** — components clearly match the references' color/space/radius/type language; exact shadow/transition/pixel values are reasonable token-derived interpretations, not measured from the mockups.

The components were built CSS-ready: variants are exposed as `data-variant`, state as ARIA attributes, slots as `data-region`, with `sta-*` BEM class hooks. S1 CSS is therefore mechanical and uniform across components — attribute-selector + `var(--token)`, light/dark inherited automatically from the S0 `:root` cascade with **zero per-component theme code**.

S1 ships as **one spec → ~5 stacked PRs**: a dev-only component **gallery** (the verification surface S0 proved necessary) followed by four component-family PRs.

**What ships:** 23 `Component.css` files + their `import` lines, a dev-only gallery route in `apps/admin`, per-component text-presence tests, and per-family Playwright light/dark cascade smokes.

**What does NOT ship:** screen-level layout (S2+), any new design token, app feature/behaviour changes, a manual theme toggle, restyling the already-styled `Table`/`Toast`/`Drawer`, any change to component `.tsx` markup beyond adding the `import './<Component>.css'` line.

---

## 1. Locked decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Decompose by component family** — 4 family PRs, single shared spec. | User decision. Families are homogeneous (same conventions, different components); one spec + stacked PRs mirrors the analyst-notes 1-spec/N-PR precedent and minimises near-duplicate spec churn. |
| 2 | **Fidelity = token-faithful, not pixel-exact.** | User decision. Mockups are screens, not a component sheet; states (hover/focus/disabled) aren't all shown and need token-driven interpretation anyway. |
| 3 | **CSS mechanism = co-located `<Component>.css` + `import './<Component>.css'` at the top of `<Component>.tsx`**, selectors keyed off the existing `.sta-*` hooks + `[data-variant]` / `[data-region]` / `aria-*` / `:focus-visible` / `:hover` / `:disabled`. Values are `var(--token-*)` only. | Mirrors the shipped `Table.css` / `Toast.css` / `Drawer.css` / `base.css` precedent. ADR-0006 (hand-built). The components already emit these hooks — no `.tsx` markup change needed beyond the import line. |
| 4 | **No per-component theme code; no `prefers-color-scheme` / `[data-theme]` in any `Component.css`.** | ADR-0005: theme flips entirely via the S0 `:root` token cascade. Components consume `var(--color-*)` unconditionally. |
| 5 | **Verification via a dev-only component gallery** route in `apps/admin`, gated out of production navigation. | S0 proved static gates pass while real rendering is unverified. A gallery makes every S1 PR independently, visually verifiable (incl. components unreachable on real screens without interaction/state). |
| 6 | **Dark verification uses `prefers-color-scheme` emulation, not an in-app toggle.** | Post-S0 `tokens.css` has only `:root` + `@media (prefers-color-scheme: dark)`; the `[data-theme]` block was removed. A manual toggle would re-introduce removed surface and contradict ADR-0005. Playwright emulates `colorScheme`; humans toggle the OS. |
| 7 | **PR stack:** S1.0 gallery scaffold → S1a form controls → S1b surfaces → S1c feedback/status → S1d overlays. Stacked. | Gallery must exist before family PRs can be verified in it. Families ordered most-foundational-first. |

---

## 2. Scope — the 23 components

Already styled (OUT of scope): `Table`, `Toast`, `Drawer`.

| Family (PR) | Components |
|---|---|
| **S1a — form controls** | Button, IconButton, Input, Select, Textarea, ToggleButtonGroup |
| **S1b — surfaces** | Card, Shell, Sidebar, HeaderBar, EmptyStateLayout |
| **S1c — feedback/status** | Pill, Chip, StatusPill, SourceBadge, Skeleton, FieldValueRenderer, ExternalLink |
| **S1d — overlays/primitives** | Modal, Popover, Tabs, Tooltip, DropdownMenu |

(23 total. Final per-family membership may shift slightly at writing-plans time if a family overflows the size budget — see §5.)

---

## 3. CSS architecture & conventions

Every `<Component>.css`:

- Lives at `packages/design-system/src/<components|primitives>/<Component>.css`; imported as the first statement of `<Component>.tsx` via `import './<Component>.css'` (side-effect, Table/Toast/Drawer precedent).
- Base selector `.sta-<component>`; sub-elements `.sta-<component>__<element>`.
- Variants/state via the attributes the component **already emits** — never add new markup hooks in S1 beyond the import line:
  - `[data-variant="…"]` (Button, Pill, Card, StatusPill, …)
  - `[data-region="…"]` (Card slots)
  - `[aria-pressed="true"]` (Chip, toggle Buttons), `[aria-current="page"]` (Sidebar), `[aria-selected="true"]` (Tabs), `[aria-disabled="true"]`, `:disabled`
  - `:hover`, `:focus-visible` (focus ring already token-defined globally by S0 `base.css`; components only override when the reference demands it)
- All values are `var(--token-*)`. If a needed value has no token, **do not invent a token in S1** — use the nearest existing token and flag it in the PR for a future token-system slice.
- No `@media (prefers-color-scheme: …)` and no `[data-theme]` selectors anywhere in component CSS.
- Native form controls (Input/Select/Textarea) are *styled*, not re-implemented (ADR-0004).

## 4. Component gallery (verification surface)

- **PR S1.0** adds a dev-only route to `apps/admin` (e.g. `?route=gallery`), absent from production navigation (rendered only when the route is explicitly requested; not linked from the nav).
- S1.0 ships the gallery scaffold rendering the **already-styled** `Table`/`Toast`/`Drawer` as the pattern exemplar; each family PR appends its components with every variant/state/slot exercised.
- The gallery is dev/review infrastructure: it does not change production bundles' behaviour (route is reachable but unlinked; acceptable for an internal admin tool). No new dependency.

## 5. PR stack & sizing

| PR | Concern | Approx files |
|---|---|---|
| **S1.0** | Gallery route + scaffold + Playwright light/dark harness + exemplar (Table/Toast/Drawer) entries | route/view + harness + test (~4–6) |
| **S1a** | 6 form-control `.css` + imports + gallery entries + tests | ~13 |
| **S1b** | 5 surface `.css` + imports + gallery entries + tests | ~11 |
| **S1c** | 7 feedback/status `.css` + imports + gallery entries + tests | ~15 |
| **S1d** | 5 overlay `.css` + imports + gallery entries + tests | ~11 |

Each family PR **exceeds** the ≤8-files / ≤300-LOC atomic ceiling. This is a documented inseparable-concern exception (precedent: analyst-notes N.b3b / N.c2): a family is one coherent CSS concern; splitting a component's CSS from its import + gallery entry + test would orphan test pre-conditions. Each PR body states this justification explicitly. **writing-plans may split a family** into two PRs if it genuinely overflows even with the documented exception (e.g. S1c at 7 components).

## 6. Testing & verification (TDD-ordered — tests precede CSS)

Per the project's plan/spec test-ordering discipline, each PR's task list orders tests before implementation:

1. **Per-`Component.css` text-presence test** (mirrors `base.css.test.ts` / `Table.css.test.ts`): asserts the base `.sta-*` selector, the variant/state attribute selectors that component requires, and that values are `var(--…)` token references. Written red-first (file absent → ENOENT), then the CSS.
2. **Per-family gallery Playwright smoke**: load the gallery, assert each component's resolved `getComputedStyle` reflects token values (not browser defaults) in **light** and **emulated `prefers-color-scheme: dark`**. This is the concrete cascade check S0 lacked pre-merge.
   - **Worktree limitation (from S0):** a git worktree's app dev server resolves the workspace `design-system` package via the main checkout's symlink. The gallery smoke is therefore run **from the main checkout against the branch** during review, and/or **post-merge**, exactly as documented for S0 PR #121. Each PR records the smoke result explicitly; it is not faked or silently skipped.
3. `npm run qa` green (100%×4) every PR; per-PR Codex review + local acceptance per standing discipline.

## 7. Scope boundaries

**In:** the 23 components' co-located CSS + their import lines, the dev-only gallery, text-presence tests, gallery Playwright smokes.

**Out:** screen-level layout/composition (S2+); any new design token; `apps/*` feature/behaviour changes; component `.tsx` changes beyond the single `import './<Component>.css'` line; a manual/in-app theme toggle; restyling `Table`/`Toast`/`Drawer`; the public lodging view (S7) and admin attributes panel (S6).

## 8. ADR alignment

- **ADR-0005** upheld — zero theme code in components; light/dark inherited from S0 `:root` cascade.
- **ADR-0006** upheld — hand-written CSS on tokens, no framework.
- **ADR-0004** upheld — native form controls styled, not re-implemented.
- No ADR created or amended.

## 9. What this spec is not

Not an implementation plan. The plan (writing-plans, next step) expands §3–§6 into a TDD-ordered task list per PR, fixes final per-family membership against the size budget, and pins the gallery route mechanism. No code until the plan is approved.
