# Visual Fidelity — Audit & Decomposition

- **Status:** Draft (audit only — NOT a design or implementation mandate)
- **Date:** 2026-05-17
- **Author:** @mathvbarone (request) + post-analyst-notes agent
- **Purpose:** Inventory the gap between the running apps and the visual references
  in `docs/reference/01–06.png`, then decompose remediation into independently
  brainstorm-able slices with a recommended order. This document exists so the
  maintainer can **prioritize**; it does not authorize implementation. Each slice
  below still needs its own brainstorm → spec/ADR → plan before code.
- **Related:** ADR-0004 (native form controls), ADR-0005 (CSS-only theming via
  `prefers-color-scheme`), ADR-0006 (hand-built design system, no CSS framework),
  Epic 3 spec §5 (component inventory) + §6.2 (theme), Epic 4 spec (admin app).

---

## 0. Executive summary

The visual design is **fully specified** (Epic 3 §5/§6.2, ADRs 0004/0005/0006,
six reference mockups) but the **implementation has a blocking foundation defect
plus large per-screen gaps**. The apps render as unstyled browser-default HTML
today because the design tokens never reach the DOM.

The single highest-leverage finding: **`packages/design-system/tokens.css` is
never imported** — not by either app, not by the design-system barrel
(`src/index.ts` imports only `utilities.css`). Every component references
`var(--color-*)` / `var(--space-*)` that resolve to nothing. No screen can match
its reference until this is fixed; it blocks everything else.

Secondary structural findings:

- The token generator (`scripts/generate-tokens.ts`) emits `:root` +
  `[data-theme="dark"]`, **not** the `@media (prefers-color-scheme: dark)` block
  that ADR-0005 mandates. `data-theme` is never set at runtime, so the public
  app's dark reference look (`01/02/03`) cannot activate even once tokens load.
- There is **no global CSS reset / base style** anywhere.
- Of ~28 design-system components, only **3** carry real CSS
  (`Table.css`, `Toast.css`, `Drawer.css` — the last is behavioral, not visual).
  The other ~25 (Button, Card, Pill, Chip, Input, Select, Textarea, HeaderBar,
  Sidebar, StatusPill, SourceBadge, Skeleton, ToggleButtonGroup, etc.) are
  class-hook-only with zero styling.
- Two reference screens correspond to **UI that does not exist at all**:
  `03.png` (public lodging-results view) and `06.png` (admin resort-attributes
  panel for non-metric fields). These are net-new **product features**, not
  visual-fidelity passes, and need product brainstorms beyond styling.

---

## 1. Reference → screen map

| Ref | App | Theme | Screen | Exists today? |
|-----|-----|-------|--------|---------------|
| `01.png` | public | dark | Listing: hero + resort cards (with photos) | Markup exists, unstyled; **card photos not implemented** |
| `02.png` | public | dark | Resort detail drawer (right slide-over) | Drawer primitive exists (behavioral CSS only); content unstyled |
| `03.png` | public | dark | Lodging-results page near a resort | **Does not exist** — net-new feature |
| `04.png` | admin | light | Ops dashboard: stat cards + integration health | Dashboard exists (Table only); stat-card / health-panel markup absent |
| `05.png` | admin | light | Resort editor: per-field auto/manual + sync | Exists functionally (metric `FieldRow`); unstyled |
| `06.png` | admin | light | Resort "Info" attributes panel (non-metric fields incl. inline Analyst Note + Highlights) | **Does not exist** — net-new feature (this is Phase-2 backlog item #1) |

---

## 2. Foundation gap (blocking — precedes all screen work)

Verified facts (file paths authoritative):

1. **Tokens unloaded.** `packages/design-system/tokens.css` (61 lines: complete
   space/breakpoint/radius/z/duration/font/color tokens) is imported by nothing.
   `packages/design-system/src/index.ts:1` imports only `./utilities.css`
   (21 lines; sole rule `.sta-visually-hidden`). Neither `apps/public/src/main.tsx`
   nor `apps/admin/src/main.tsx` imports any global stylesheet (fonts only).
2. **Theme mechanism diverges from ADR-0005.** `scripts/generate-tokens.ts:15–51`
   emits `:root { … light … }` then (line 45) `[data-theme="dark"] { … dark … }`.
   No `@media (prefers-color-scheme: dark)` branch. Nothing sets `data-theme` on
   `<html>` at runtime (`useMediaQuery` exists but only does breakpoint checks).
   ADR-0005 §Decision requires the media-query branch and forbids JS theme
   branching. The generator and ADR are out of sync.
3. **No reset/base.** No universal selector, no box-sizing reset, no base
   `body`/typography rules in design-system or either app. Browser defaults
   (serif, default margins) are what we see.

Implication: a foundation slice is a hard prerequisite. It is small relative to
the screen work and unblocks all of it.

---

## 3. Per-area implementation state (sizing input)

**Design system (`packages/design-system/src/`):**
- Real CSS: `Table.css` (52 ln, sticky header + row button), `Toast.css`
  (67 ln, token-driven), `primitives/Drawer.css` (36 ln, slide animation,
  hardcoded white bg).
- Class-hook-only (no CSS): Button, IconButton, Card, Chip, Pill, Skeleton,
  SourceBadge, FieldValueRenderer, EmptyStateLayout, ExternalLink, Input,
  Select, Textarea, HeaderBar, Sidebar, StatusPill, ToggleButtonGroup,
  DropdownMenu, Modal, Tooltip, Popover, Tabs.

**apps/public (`apps/public/src/`):**
- `views/Hero.tsx` — class hooks + inline `background-image`; unstyled.
- `views/ResortCard.tsx` — has an `aria-hidden` `sta-resort-card__photo` div but
  **no `<img>`**; reference cards show real photos → net-new markup.
- `matrix.tsx` is the lone partial exception — it imports its own
  `views/matrix.module.css` (`matrix.tsx:15`; ~35 ln, one `@media` downgrade
  rule, token-driven) in addition to `Table.css`.
- `cards.tsx`, `detail.tsx` (Drawer behavioral only), `FilterBar`,
  `ViewToggle`, `ShortlistDrawer`, dialogs, state screens — all
  class-hook-only.
- **No lodging-results view** (`03.png`).

**apps/admin (`apps/admin/src/`):**
- `views/Shell.tsx` + `Shell.responsive.css.ts` — the latter is a `.css.ts`
  emitting an inline `<style>` string with only a sub-900px overlay; its own
  comment (`Shell.responsive.css.ts:6`) confirms "the admin app currently ships
  zero CSS files."
- `Dashboard.tsx` (HeaderBar+Table), `ResortsTable.tsx`, `ResortEditor.tsx` +
  `ResortEditor/*` (metric `FieldRow`, `AnalystNoteSection`, `ModeToggle`),
  `PublishHistory.tsx`, `PublishDialog.tsx` — functional, unstyled.
- **No resort-attributes (Info) panel** for non-metric fields (`06.png`).

---

## 4. Proposed decomposition

Each slice is independently brainstorm-able and gets its own spec/plan. Slices
are typed:

- **[INFRA]** — foundation / no per-screen visual change on its own.
- **[FIDELITY]** — styling an existing functional screen to its reference.
- **[FEATURE]** — net-new product surface; needs a product brainstorm, not just
  CSS. Visual fidelity is a subset of its scope.

| Slice | Type | Scope | Refs | Depends on |
|-------|------|-------|------|------------|
| **S0 — Design-system foundation** | INFRA | Import `tokens.css` app-wide; add global reset/base; reconcile generator with ADR-0005 (emit `@media (prefers-color-scheme: dark)`); decide light-vs-dark per app (refs imply public=dark, admin=light) | — | none |
| **S1 — DS component CSS pass** | FIDELITY | Co-located CSS for the ~25 structural-only primitives/components to token spec (Button, Card, Pill, Chip, Input, Select, Textarea, HeaderBar, Sidebar, StatusPill, SourceBadge, Skeleton, ToggleButtonGroup, Modal, Tabs, Tooltip, Popover, …) | underpins all | S0 |
| **S2 — Public listing fidelity** | FIDELITY | Hero + cards grid + `ResortCard` incl. real photo `<img>` + FilterBar + ViewToggle | `01` | S1 |
| **S3 — Public detail drawer fidelity** | FIDELITY | `detail.tsx` content + Drawer visual styling (token bg, layout, metric grid, trip notes, CTA) | `02` | S1 |
| **S4 — Admin editor fidelity** | FIDELITY | Style existing metric `FieldRow` editor + tabs + per-field auto/manual + sync affordances | `05` | S1 |
| **S5 — Admin dashboard fidelity** | FIDELITY | Stat cards + integration-issues list + data-source health panels (new markup, styled) | `04` | S1 |
| **S6 — Admin resort-attributes panel** | FEATURE | Non-metric field editing (name/slug/location/region/website/timezone/open-season/hero-photo/analyst-note/highlights). Net-new; = Phase-2 backlog #1; subsumes the analyst-note-on-non-metric-fields item | `06` | S1; touches `packages/schema` (mech. subagent review) |
| **S7 — Public lodging results** | FEATURE | Net-new lodging-near-resort view + data source. Largest unknown; needs its own product brainstorm (data provider, schema, routing) before any UI | `03` | S1; product scoping first |

### Dependency graph

```
S0 ──► S1 ──► S2
            ├► S3
            ├► S4
            ├► S5
            ├► S6  (also: schema work + product brainstorm)
            └► S7  (also: product/data brainstorm — largest)
```

---

## 5. Recommended order (rationale)

1. **S0 — foundation.** Mandatory first; tiny relative to payoff; unblocks
   everything; resolves the ADR-0005 divergence before it ossifies. Pure infra,
   low risk, high leverage.
2. **S1 — DS component CSS pass.** The single biggest "the app looks designed
   now" jump. Every screen consumes these primitives, so doing it once here
   avoids per-screen restyle churn. Candidate for sub-splitting (e.g. form
   controls vs. surfaces vs. feedback) if it exceeds PR-sizing ceilings.
3. **S4 (admin editor) or S2 (public listing).** First real screen. S4 is
   lower-risk (functionality already exists and was just verified end-to-end);
   S2 is higher visible payoff but adds net-new card-photo markup.
4. **S3, S5.** Remaining fidelity passes on existing screens.
5. **S6, S7 — defer / separate track.** These are **features**, not fidelity.
   S6 (resort-attributes panel) is the most product-coherent next feature (it is
   Phase-2 #1 and folds in the "analyst notes on non-metric fields" backlog
   item). S7 (lodging) is the largest and least-defined — it needs a data/provider
   product brainstorm before any visual work is meaningful.

**Suggested first brainstorm:** S0. It is self-contained, decision-bearing
(ADR-0005 reconciliation, per-app theme selection, reset strategy), and every
other slice waits on it.

---

## 6. Open questions for prioritization (not answered here)

- Per-app theme: references imply **public = dark, admin = light**. Is that a
  hard product decision, or should both honor `prefers-color-scheme`? (Affects
  S0's ADR-0005 reconciliation — possibly a new ADR.)
- Is S1 one slice or several (PR-sizing: ~25 components likely exceeds the
  ≤300 LOC / ≤8 files ceiling — almost certainly needs splitting)?
- Are `03.png` (lodging) and `06.png` (attributes panel) in scope for the
  current product push at all, or reference-only aspirations? They are features,
  not styling, and each needs its own product brainstorm.
- Reset strategy: minimal box-sizing reset vs. a fuller normalize — owned by S0.

---

## 7. What this document is not

Not a design, not a plan, not an authorization. No slice may proceed to
implementation without its own brainstorm → spec/ADR → plan, per the established
workflow (atomic PRs, TDD-ordered tasks, per-PR Codex review, subagent review
where mechanically triggered). S0 and S6 in particular will likely need ADRs
(theme mechanism; attributes-panel data shape).
