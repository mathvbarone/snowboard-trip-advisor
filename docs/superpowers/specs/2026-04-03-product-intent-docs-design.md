# Product Intent Docs Design

## Summary

This change updates repository documentation so the project's product intention is explicit and durable. The README should become the strategic product document that explains where Snowboard Trip Advisor is headed, while `CLAUDE.md` should become the implementation guardrail that tells agents how to preserve that direction in future work.

The documentation should make clear that Snowboard Trip Advisor is not just a dataset demo or a generic resort directory. It is intended to become a decision-support marketplace for a snowboard trip organizer who is choosing the best resort for a group. The product should guide ranking and shortlisting decisions using transparent criteria rather than a black-box recommendation.

## Goals

- Reframe `README.md` around the long-term product vision rather than the current implementation only.
- Define the primary user as a trip organizer planning a snowboard trip for a group.
- Define the product's main job as ranking and shortlisting resorts.
- Make the main decision criteria explicit:
  - riding quality as the primary headline signal
  - resort size
  - current snow conditions
  - lodging cost in the resort region
- Explain the architectural split between durable resort intelligence and live market signals.
- State that the first phase is discovery-only with external booking paths.
- State that the product should later evolve toward live deal visibility without claiming direct booking is part of the near-term scope.
- Add agent instructions in `CLAUDE.md` requiring `README.md` updates in PRs that introduce meaningful product-facing features or change project direction.

## Non-Goals

- Redesign the product scope beyond the agreed marketplace direction.
- Introduce a detailed roadmap with fixed milestone dates.
- Commit the project to full in-app booking.
- Rewrite implementation documentation that remains technically correct unless it conflicts with the product framing.

## Product Intention

Snowboard Trip Advisor should be described as a resort marketplace and decision-support app for snowboard trip organizers. The primary user is one person evaluating options on behalf of a group, not a group collaboration tool.

The organizer should be able to compare resorts and create a shortlist by balancing:

- riding quality first
- resort scale such as slopes, lifts, and practical mountain size
- current snow conditions
- accommodation cost in the resort region

The system should be semi-opinionated. It should rank and compare options, but the reasoning must remain visible so the organizer can override the default ordering when tradeoffs matter.

## Data Model Direction

The docs should define two categories of product data:

### Durable Resort Intelligence

These are fields that can be researched, normalized, versioned, and reused over longer intervals:

- resort identity
- resort size and lift network
- riding-quality signals
- broad trip-quality signals
- stable access characteristics

### Live Market Signals

These are fields that should eventually be refreshed close to real time:

- current snow conditions
- lodging price signals in the resort region
- later marketplace-style deal visibility

The README and `CLAUDE.md` should both emphasize that the architecture should preserve this distinction. Future work should not flatten both categories into one undifferentiated dataset model because freshness, provenance, validation, and update cadence differ materially between them.

## README Structure

`README.md` should be reorganized into a vision-led document with these sections:

1. Product thesis
2. Primary user and decision workflow
3. Core comparison criteria
4. Product operating model: durable resort intelligence plus live market signals
5. Current state of the implementation
6. System overview and project structure
7. Development and run instructions

The README should prominently communicate the long-term direction first, then include a clear correction layer describing what is implemented today so the document remains truthful.

### README Content Requirements

- Explain that the project is intended to help a snowboard trip organizer choose the best resort for a group.
- Explain that the experience should feel like a curated resort marketplace for discovery and comparison.
- Say that phase 1 is discovery-only and sends users to external providers for booking or accommodation decisions.
- Say that future phases should add live snow and lodging price awareness.
- Keep the current-state section explicit that the present codebase is local-first and reads published JSON snapshots instead of live APIs.
- Preserve enough implementation detail that another agent can infer what foundation already exists and what epics still need to be created.

## `CLAUDE.md` Structure

`CLAUDE.md` should keep its existing quality-gate and TDD rules, but add a project-intent section near the top so implementation work is constrained by the product vision.

### `CLAUDE.md` Content Requirements

- Define the primary user and primary workflow.
- State that ranking and shortlisting resorts is the main product goal.
- State that riding quality is the primary headline criterion.
- State that resort size, snow conditions, and lodging cost are key supporting signals.
- State that phase 1 is discovery-only with external booking paths.
- State that future work may expand toward live deal visibility.
- State that durable resort intelligence and live market signals must remain distinct in architecture and documentation.

### Documentation Discipline Rule

`CLAUDE.md` should explicitly require README maintenance as part of feature delivery:

- Any PR that introduces meaningful product-facing functionality must evaluate whether `README.md` needs an update.
- Any PR that changes product scope, user workflow, system boundaries, or roadmap direction must update `README.md` in the same branch.
- Agents should treat README drift as a documentation bug, not an optional cleanup task.

This rule is intended to keep the repo usable by future agents that need to infer next epics from the documentation rather than reverse-engineering product direction from code alone.

## Recommended Editing Approach

### Option 1: Minimal insertion

Add a short vision section to the top of the existing README and append a short project-intent section to `CLAUDE.md`.

Tradeoffs:

- fastest
- lowest editing risk
- does not fully solve the current README weakness because architecture still dominates the document

### Option 2: Vision-led restructure

Rewrite the README opening and major section order so product vision leads, then preserve the useful implementation detail lower in the document. Add a concise project-intent and documentation-discipline section to `CLAUDE.md`.

Tradeoffs:

- best fit for the agreed goal
- keeps the existing technical detail while giving future agents a clearer strategic anchor
- slightly larger doc edit

### Option 3: README plus separate roadmap document

Keep the README shorter and add a dedicated strategy document for product direction.

Tradeoffs:

- can work well for larger teams
- creates another place for drift
- unnecessary overhead for the current repository size

## Recommendation

Use option 2.

The README needs a true vision-led restructure so another agent can infer future epics from it. A small prepend would leave the document too architecture-heavy. `CLAUDE.md` should then encode the discipline that product-facing changes must keep the README current.

## Risks And Mitigations

- Risk: the README overstates implemented capabilities.
  - Mitigation: include a dedicated current-state section that clearly separates vision from shipped behavior.
- Risk: `CLAUDE.md` becomes repetitive with the README.
  - Mitigation: keep README focused on product and system direction, and keep `CLAUDE.md` focused on agent constraints and maintenance rules.
- Risk: future agents ignore documentation updates.
  - Mitigation: make README maintenance an explicit project rule in `CLAUDE.md`.

## Validation

Success looks like:

- a new reader can explain who the product is for and what decision it supports after reading the README
- a future agent can infer the next likely epics from the README without guessing the product thesis
- an implementation agent reading `CLAUDE.md` understands that keeping `README.md` current is part of completing product-facing work
