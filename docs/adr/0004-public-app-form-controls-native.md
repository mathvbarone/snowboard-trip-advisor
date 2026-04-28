# ADR-0004: Phase 1 `apps/public` ships native form controls (date, select)

- **Status:** Accepted
- **Date:** 2026-04-28
- **Deciders:** @mathvbarone
- **Related spec:** [`docs/superpowers/specs/2026-04-22-product-pivot-design.md`](../superpowers/specs/2026-04-22-product-pivot-design.md) §6.4
- **Related ADRs:** [ADR-0001](./0001-pivot-to-data-transparency.md)

## Context

The Phase 1 visual reference for `apps/public` includes a custom-styled trip-window date input and a custom-styled sort dropdown. The most direct way to match those mockups pixel-for-pixel is to wrap a headless library (Radix `Select`, `react-day-picker`, or similar) with token-driven styling and bespoke popover behavior.

The competing constraint is accessibility. The product is a single-page comparison surface for a snowboard trip organizer; it has to work on a phone keyboard, with a screen reader, and under coarse-pointer input. Native `<input type="date">` and `<select>` ship that behavior by default — the OS-supplied calendar/picker handles touch targets, keyboard semantics, and SR announcements with no per-platform code from us. Wrapping a headless `Select` introduces real a11y regression risk: mobile virtual-keyboard handling, screen-reader compatibility with `aria-activedescendant`, focus-trap edge cases, and IME quirks. Each of those is a class of bug that does not exist with the native control, and Phase 1 has neither the resort count (N=2) nor the visual-design budget to justify carrying that risk.

The spec §6.4 design-system inventory already settled on `<Input>` / `<Select>` wrappers that consume native semantics and apply tokenized styling. This ADR records *why* — separately from the inventory itself — so the trade-off is preserved when Phase 2 design discussion reopens it.

## Decision

Phase 1 `apps/public` ships **native** `<input type="date">` and **native** `<select>` form controls. The design-system `<Input>` and `<Select>` wrappers exist purely to apply tokenized styling (border, radius, focus-ring, color); they delegate behavior, focus, keyboard handling, and accessibility tree entirely to the underlying native element.

A related decision falls out of the same axis: the price filter is a **bucketed `<Select>`** (`≤€40` / `€40–80` / `€80+`) rather than a slider. A range slider is dramatically harder to keyboard-drive and screen-read accurately than three discrete options, and at N=2 resorts the bucket precision is more than sufficient.

## Consequences

### Positive

- **Accessibility is the default state, not a maintenance burden.** Native form controls are the most accessible thing on earth — every assistive technology already supports them. We do not write per-platform a11y patches; we do not chase mobile keyboard regressions when iOS or Android updates.
- **No headless-library footprint.** No Radix dependency, no `react-day-picker` dependency, no popover-positioning library. The design-system stays small (spec §6.4 inventory), the bundle stays small, and the agent-collaboration surface stays small.
- **Pixel-match is constrained, but the constraint is honest.** Where the OS-supplied date picker chrome diverges from the visual reference, that divergence is documented as accepted (the picker is OS-themed; we style only the input shell). This is preferable to a custom popover that *looks* like the reference but breaks for users on input methods we did not test.
- **Bucketed price filter trivially satisfies WCAG.** `<select><option>≤€40</option>…</select>` is keyboard- and SR-accessible by construction; a slider is not.

### Negative / costs

- **The custom-styled date picker in the visual reference is not delivered in Phase 1.** Where the OS picker is ugly or inconsistent across browsers, that is the visible cost. Documented in the design-system README as an accepted Phase 1 trade-off.
- **The slider affordance for price is also deferred.** Some users prefer a continuous control. At N=2, this is not a usability problem; at N≥10 with high price variance it might be.

### Neutral / follow-on

- The wrappers (`<Input>`, `<Select>`) keep their public API stable across the Phase 2 transition. Swapping the implementation from native-delegate to headless-library-wrapper is a one-component refactor per control, with no consumer-side changes.

## Alternatives considered

### A. Wrap Radix `<Select>` (or equivalent headless library) for full visual control

Rejected for Phase 1. The specific risk surfaces are: (1) mobile virtual-keyboard handling diverges from native `<select>` and triggers known iOS Safari regressions; (2) `aria-activedescendant`-based highlighting is supported unevenly across screen readers (NVDA, VoiceOver, JAWS); (3) focus-trap inside the popover has to be tested per assistive technology. Each of those is a multi-PR debugging cost the project cannot absorb in Phase 1.

Reconsidered if: Phase 2 design refresh demands custom popovers that the native controls cannot deliver, AND a budgeted a11y audit accompanies the change.

### B. Custom calendar component built from primitives

Rejected for the same reasons as Radix wrapper, plus the additional cost of building keyboard navigation, date arithmetic, and locale handling from scratch. The native `<input type="date">` ships all three.

### C. Slider for the price filter

Rejected for Phase 1. A slider is harder to make accessible than a `<select>`, and at N=2 resorts the value variance is too small to benefit from continuous selection. Bucketed `<Select>` ships the same UX outcome (filter price) at lower cost and with no a11y debt.

## Revisit conditions

Reopen this decision when **either** of:

- Phase 2 design refresh demands custom date/select popovers that the native controls cannot deliver (and the design refresh ships an a11y budget for the new components).
- A scheduled a11y audit (manual + axe + screen-reader walkthrough) shows the native-control surface is no longer compliant with the project's target WCAG level.

## Notes

- The spec §6.4 inventory lists `<Input>` / `<Select>` wrappers without explaining why they delegate to native elements rather than wrapping headless libraries; this ADR is that explanation.
- The bucketed-price-filter mini-decision is recorded here rather than in a separate ADR because it falls out of the same "a11y > pixel-match at N=2" trade-off.
