# ADR-0007: A11y test library is `jest-axe`, consumed via Vitest's `expect.extend`

- **Status:** Accepted
- **Date:** 2026-04-28
- **Deciders:** @mathvbarone
- **Related spec:** [`docs/superpowers/specs/2026-04-22-product-pivot-design.md`](../superpowers/specs/2026-04-22-product-pivot-design.md) §6.5
- **Related ADRs:** [ADR-0004](./0004-public-app-form-controls-native.md)

## Context

The project's accessibility discipline (spec §6.5) requires `axe-core` checks against rendered components. The choice is which packaging of `axe-core` to integrate, and how it composes with Vitest (the project's test runner).

Four options on the table:

- **`jest-axe`** — the established `axe-core` matcher, exposes `toHaveNoViolations`. Originally written for Jest; works under Vitest unchanged via `expect.extend({ toHaveNoViolations })`.
- **`vitest-axe`** — a Vitest-native port. Lightly maintained (sparse releases, small contributor base); not a clear win given `jest-axe` already works under Vitest.
- **`@axe-core/react`** — wraps the React DevTools integration; component-focused, but its primary surface is dev-time logging in the browser, not test-runner assertions. Doesn't compose cleanly with Vitest's matcher pattern.
- **`@axe-core/playwright`** — full E2E checks against a live browser. Higher-fidelity (real layout, real CSS) but expensive (browser per test, slower) and out of scope for unit/component tests. Will be picked up in Epic 6 for the visual-regression / E2E layer; not the answer for component-level coverage.

`jest-axe` is the most established and most-used of the four; it works under Vitest with a one-line `expect.extend` setup; and its API (`results = await axe(container); expect(results).toHaveNoViolations()`) is the pattern most agents and contributors will recognize.

## Decision

**The a11y test library is `jest-axe`, consumed via Vitest's `expect.extend({ toHaveNoViolations })` pattern.**

Concretely:

1. **Per-app/per-package test setup** registers the matcher. `apps/public/src/test-setup.ts` and (when added) `packages/design-system/src/test-setup.ts` call `expect.extend({ toHaveNoViolations })` at module scope. Vitest's `setupFiles` config wires the setup file into every test run.
2. **The standard component a11y assertion** is: render the component, query `axe(container)`, assert `expect(results).toHaveNoViolations()`. Wrap in `it('has no a11y violations: <state>', …)` — one test per per-component state.
3. **Per-state coverage is the discipline.** For each interactive component, assert against the state set: `default | hover | focus | open/expanded | disabled`. Components that lack one of these states (e.g., a static `<Card>` has no hover/focus state worth checking separately) record the omission inline; components with additional states (e.g., `<Select>`'s `open` vs `closed`) assert against each.
4. **`@axe-core/playwright` is the Epic 6 follow-up,** not a Phase 1 dependency. Component tests stay in Vitest + jsdom + `jest-axe`; full-page E2E a11y lands when Epic 6 wires up Playwright.

## Consequences

### Positive

- **One library, one mental model.** Agents and contributors recognize `expect(results).toHaveNoViolations()`; no library-specific incantations.
- **Vitest compatibility is mechanical.** `expect.extend` is a documented Vitest API. There is no patching, no monkey-shim, no wrapper layer.
- **Per-state assertions catch real bugs.** Most a11y regressions show up only in the open/expanded or focus state — running axe in default-state-only would miss them. Forcing per-state coverage catches focus-trap leaks, `aria-expanded` mismatches, and disabled-control focus-order bugs.
- **Bundle stays small.** `jest-axe` carries `axe-core` plus a small matcher; no Jest runtime, no React DevTools wrapper.

### Negative / costs

- **Naming dissonance.** "Jest-axe under Vitest" reads weird in PR descriptions. Acceptable; the runtime alignment is what matters.
- **Manual per-state coverage.** No automated way to enumerate component states; each component test file lists them explicitly. This is a discipline cost, not a tooling gap — and the explicitness is a feature, not a bug, for a project where components are agent-generated.

### Neutral / follow-on

- Migrating to `vitest-axe` later (if it becomes well-maintained) is a one-PR swap of import + matcher registration; the test bodies don't change because the API is the same.
- `@axe-core/playwright` lands in Epic 6 alongside the visual-regression workflow; it complements rather than replaces this ADR.

## Alternatives considered

### A. `vitest-axe`

Rejected. It is lightly maintained — sparse releases, small contributor base — and offers no functional advantage over `jest-axe` running under Vitest. Adopting an under-maintained library to avoid a naming awkwardness is a poor trade.

### B. `@axe-core/react`

Rejected. Its primary surface is dev-time browser logging (DevTools panel), not test-runner assertions. Composing it into Vitest would require building the matcher layer ourselves — exactly what `jest-axe` already provides.

### C. `@axe-core/playwright` for component tests

Rejected as the *primary* a11y test library. Spinning up a real browser per component test is too slow and too high-fidelity for unit-level checks. Reserved for Epic 6 E2E.

### D. Skip a11y testing in Phase 1

Rejected. The product makes load-bearing accessibility claims (ADR-0004 — native form controls because a11y > pixel-match); shipping without machine-checked enforcement would let those claims drift. Manual review alone is insufficient at agent-generated-code velocity.

## Notes

- The `expect.extend({ toHaveNoViolations })` registration happens once per test setup file; it does not need to run inside individual test files.
- The per-state assertion pattern is documented in the spec §6.5; this ADR records the *library choice* rather than the per-component test catalog.
