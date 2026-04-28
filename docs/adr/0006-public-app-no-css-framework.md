# ADR-0006: `apps/public` ships a hand-built design system; no CSS framework

- **Status:** Accepted
- **Date:** 2026-04-28
- **Deciders:** @mathvbarone
- **Related spec:** [`docs/superpowers/specs/2026-04-22-product-pivot-design.md`](../superpowers/specs/2026-04-22-product-pivot-design.md) §6.4 + Epic 3 spec §4
- **Related ADRs:** [ADR-0005](./0005-css-theme-no-js.md)

## Context

Before starting Epic 3, Section 4 of the Epic 3 spec ran a user-reviewed brainstorm against three CSS-framework options, against the alternative of continuing on the hand-built design system already in `packages/design-system/` (Epic 1 PR 1.4):

- **Pico CSS** — class-light, semantic-first.
- **Tailwind CSS** — utility-first, build-time tree-shaken.
- **Radix Themes** — token-driven component library on top of Radix Primitives.

The brainstorm produced a clear answer: stay on the hand-built design system. This ADR records the decision so the next agent who proposes "we should just use Tailwind" can find the prior reasoning instead of re-litigating it.

The relevant existing state:

- `packages/design-system/tokens.ts` and the generator that emits `tokens.css` already shipped in Epic 1 PR 1.4. The token surface (color, space, radius, type, shadow) is tested and stable.
- The visual references for `apps/public` are deliberately custom — they are not styled in any framework's idiomatic visual language. Matching them in any framework would mean fighting the framework's defaults from line one.
- Code in this repository is largely agent-generated. Frameworks that rely on cascade-priority tricks, utility-class-name matching, or implicit theme contexts make agent-driven edits harder to reason about than explicit hand-written components do.

## Decision

**`apps/public` (and `apps/admin`) consume `packages/design-system` only. No CSS framework is added in Phase 1.** The design system is hand-built on top of `tokens.ts`, with components written as plain React + scoped CSS Modules (or equivalent) referencing `var(--token-name)`.

The component inventory (spec §6.4) is small — under a dozen components for Phase 1 — and grows linearly with new product surfaces, not as a function of styling permutations.

## Consequences

### Positive

- **Tokens stay the source of truth.** A framework would either replace `tokens.ts` (throwing away Epic 1 PR 1.4) or duplicate it (drift risk). Neither is acceptable.
- **Visual references match cleanly.** The references are custom; the implementation is custom. There is no framework-default override layer to fight.
- **Agent-collaboration friendly.** A hand-written `<Button>` component with explicit token references is trivial to read, edit, and review. A utility-class-name-soup version (`className="px-4 py-2 rounded bg-primary text-primary-foreground hover:bg-primary/90"`) is harder to diff, harder to reason about cascade-wise, and harder for an agent to refactor without regression.
- **Bundle size is bounded by what we use.** No framework runtime or unused-utility tree to ship.
- **Theme handling stays in CSS** (per ADR-0005). Frameworks that ship JS-driven theme contexts would conflict with the no-JS-theme decision.

### Negative / costs

- **More upfront component-implementation work.** Every primitive (button, input, card, badge, list, dialog) is written by hand. The Epic 3 spec has budgeted this; it is not unbudgeted scope.
- **No "free" preset visual style.** Designers cannot reference framework-stock components as a starting point.
- **Visual consistency is enforced by token discipline + review,** not by a framework's built-in cohesion.

### Neutral / follow-on

- The decision is *reversible*. Adopting a framework later is a `tokens.ts` → framework-token-mapping migration plus a per-component port. The earliest reasonable trigger is the cost-of-pivot below.

## Alternatives considered

### A. Pico CSS

Rejected. Pico's value is "make plain HTML look good without classes" — but the visual reference is not the Pico aesthetic, and overriding Pico's defaults to match the reference would mean writing the same hand-tokened CSS we already write, plus carrying Pico's defaults. The savings are negative.

### B. Tailwind CSS

Rejected. Tailwind would force a token system parallel to (or replacing) `tokens.ts`. The utility-class-name patterns also work against agent-driven editing — diffs are noisier, intent is encoded in long class strings rather than named components, and theme inversion (ADR-0005) becomes a `dark:` prefix on every token reference. The framework's strengths (rapid prototyping, large team coordination) do not match this project's needs (agent-driven edits, small surface, custom visual reference).

### C. Radix Themes

Rejected. Radix Themes is a high-quality token-driven component library. It would deliver excellent a11y defaults — but it bundles its own token surface that conflicts with `tokens.ts`, ships a JS-driven `<Theme>` provider for theme switching (conflicts with ADR-0005's CSS-only stance), and the Phase 1 component count is small enough that the per-component savings do not justify the override cost. Radix *Primitives* may still be reached for in Phase 2 for individual headless components (dialog, popover) without buying the whole Themes layer, and that decision is left open.

### D. Defer the choice

Rejected. The Epic 3 spec needs a default styling stack to write component code against; deferring would block the entire epic. The cost of locking in "hand-built on `tokens.ts`" is low because `tokens.ts` already ships and the component count is small.

## Cost-of-pivot trigger

Reopen this decision when **either** of:

- The design system reaches **N ≥ 30 components** and the per-component implementation cost has become a Phase-2-velocity bottleneck.
- `tokens.ts` maintenance becomes a bottleneck — i.e., the generator + per-token discipline costs more agent time than a framework's tokenization would.

Until either trigger fires, do not propose a framework adoption. If a future agent does, link this ADR.

## Notes

- The brainstorm itself is preserved in the Epic 3 spec §4 for traceability; this ADR is the canonical decision record, not the brainstorm.
- Reaching for individual headless libraries (Radix Primitives' `Dialog`, `Popover`, `Tooltip`) for *specific* a11y-load-bearing patterns is a separate decision and is not blocked by this ADR. ADR-0004 already settled that native form controls are preferred where possible; the headless-primitive question is an Epic-by-Epic call.
