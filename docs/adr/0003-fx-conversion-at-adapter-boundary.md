# ADR-0003: FX conversion happens at the adapter boundary; FX provenance is a first-class FieldSource sub-object

- **Status:** Accepted
- **Date:** 2026-04-27
- **Deciders:** @mathvbarone
- **Related spec:** [`docs/superpowers/specs/2026-04-22-product-pivot-design.md`](../superpowers/specs/2026-04-22-product-pivot-design.md) §0 line 34, §4.3, §4.3.1, §4.5, §7.1
- **Related ADRs:** [ADR-0001](./0001-pivot-to-data-transparency.md), [ADR-0002](./0002-durable-vs-live-split.md)

## Context

The Phase 1 spec hard-encodes `Money.currency: 'EUR'` as a TypeScript literal in four places (spec §0 line 33, §4.3 line 306, §4.5 line 346, §7.1) and the schema enforces it at parse time (`packages/schema/src/primitives.ts:7` — `currency: z.literal('EUR')`). That worked when the seed list was `three-valleys` (FR) + `st-anton` (AT) — both Eurozone resorts whose upstream feeds price natively in EUR.

Epic 2 changes the seed list (decided 2026-04-27 with the user) to two **non-Eurozone EU** resorts: `kotelnica-bialczanska` (Poland, PLN) and `spindleruv-mlyn` (Czech Republic, CZK). Both upstream feeds price natively in their domestic currencies; neither will ever yield a Money-typed value already in EUR. The product still wants to surface EUR consistently (spec §0 line 33 — "EUR-only pricing" is one of the data-transparency promises to the trip organizer).

This forces a decision about where currency conversion lives. The product also has a stronger constraint than "convert somewhere": the data-transparency thesis (ADR-0001) makes provenance non-optional. A converted EUR value with no record of the rate, the rate's date, or the upstream's native amount is opaque exactly where the user needs to inspect it. Whatever conversion pattern we adopt has to keep the FX rate as part of the value's provenance — visible to the user, not hidden behind an adapter call.

## Decision

**Convert at the adapter boundary; record FX provenance as a first-class sub-object on `FieldSource`.**

Concretely:

1. **Schema unchanged at the value level.** `Money.currency: 'EUR'` remains a TypeScript literal in `packages/schema/src/primitives.ts`. Every published `Money` value is in EUR; the union does not widen.
2. **`FieldSource` gains an optional `fx?: FxProvenance` sub-object.** When the upstream price is EUR-native, `fx` is absent. When the upstream price is in PLN/CZK/CHF/GBP/NOK/SEK/DKK/HUF/RON/BGN, the adapter populates `fx` with `{ source: 'ecb-reference-rate', observed_at, rate, native_amount, native_currency }` (full type in spec §4.3.1).
3. **Adapters do the conversion.** A non-Eurozone adapter fetches its native-currency price, multiplies by the day's ECB reference rate (cached, see Phase 1 implementation note below), produces the EUR `Money` value, and emits both the value and the `fx` sub-object.
4. **The validator enforces presence conditionally (from Epic 5).** `validatePublishedDataset` will carry a `KNOWN_NON_EUR_SOURCES` table (`packages/schema/src/fx.ts`, introduced in Epic 5 PR 5.x alongside the first non-EUR adapter). For any `FieldSource` whose `source` is in that table AND whose `source !== 'manual'`, `fx` is required. Manually authored values (`source: 'manual'`) MAY include `fx` for transparency; absence is allowed. **Phase 1 (Epic 2) has zero non-EUR adapter sources to enforce against**, so the table + the matching `fx_provenance_required` validator branch are deferred per the ai-clean-code-adherence audit; PR 2.2's validator only carries the FX-math-sanity check on already-present `fx` provenance.
5. **The FX rate source is fixed for Phase 1.** Only the ECB daily reference rate is acceptable as the FX source in Phase 1. Adding alternative sources (commercial FX feeds, retail rates) is a `schema_version` bump and a separate ADR.

### Phase 1 implementation note

Phase 1 has no real adapters yet (Epic 5 lands them); the seed fixture (PR 2.1) is hand-authored with `source: 'manual'` and pre-computed EUR amounts plus illustrative `fx` blocks. The `fx` provenance pattern is exercised in the fixture so Epic 5 can implement it mechanically when real adapters land. Per the ai-clean-code-adherence audit, the `KNOWN_NON_EUR_SOURCES` table itself is **deferred to Epic 5 PR 5.x** — shipping it empty in Epic 2 PR 2.2 would have zero current consumers; Epic 5 introduces both the table and the first entry alongside the first non-EUR adapter.

## Consequences

### Positive

- **Provenance is honest.** The user can see the native currency, the rate, and the date of the rate alongside the converted EUR value. The conversion is not opaque.
- **Schema literal is preserved.** Every consumer of `Money` (the public app cards, the matrix view, the admin editor) keeps a tight `currency: 'EUR'` contract. No `if (currency === 'EUR') ... else ...` branching anywhere.
- **The adapter contract gains exactly one obligation.** Non-Eurozone adapters convert + emit `fx`. The contract is mechanical, testable, and validator-enforced.
- **Phase 2 portability.** The `/api/*` contract is unchanged: clients consume `Money` + `FieldSource.fx` as part of `ResortDetailResponse`. A Phase 2 multi-operator world where the FX rate source becomes operator-configurable is a single field on `FxProvenance.source` (the discriminator literal widens additively).
- **Validator coverage is mechanical.** The non-EUR-source list lives in code; adding a new non-EUR upstream is one PR (Epic 5) that adds an entry plus an adapter integration test asserting `fx` is present.

### Negative / costs

- **Schema layer carries an optional field that is conditionally required.** Zod's type system can't express "required if `source` is in this table"; the validator (`validatePublishedDataset`) carries the conditional logic. Tests must cover both the present-and-required and the absent-and-allowed branches per non-EUR source.
- **Adapter authors must remember to populate `fx`.** Epic 5 PR 5.x ships a shared `assertFxProvenance(fieldSourceMap, knownNonEurSources)` helper used by adapter integration tests, mitigating the foot-gun. CI also runs the full validator on the published fixture, so a missing `fx` on a non-EUR-source `FieldSource` fails CI from the moment Epic 5 lands the enforcement branch.
- **The ECB rate is end-of-day TARGET.** Adapters fetching mid-day prices use the previous business day's rate; weekend prices use Friday's rate. This is documented in adapter `attribution_block` text per the spec's "honesty micro-copy" pattern.
- **Two non-Eurozone resorts in the seed dataset means the seed fixture is more complex than `three-valleys` + `st-anton` would have been.** The complexity is intentional — the fixture's job is to demonstrate the FX-provenance pattern Epic 5 has to follow.

### Neutral / follow-on

- **`KNOWN_NON_EUR_SOURCES` does NOT exist in Epic 2.** Per the ai-clean-code-adherence audit, the table is deferred to Epic 5 PR 5.x where the first non-EUR adapter consumes it. Shipping it empty in Epic 2 would satisfy zero current consumers.
- **`schema_version` does not bump.** Adding an optional sub-object to `FieldSource` is a backward-compatible schema change in Zod's structural-typing model — pre-existing fixture data parses cleanly because `fx` is optional. The integer `schema_version: 1` literal is unchanged.
- **README and CLAUDE.md updates for the FX rule live in PR 2.0a (spec amendment) and Epic 5 (adapter rules).** This ADR doesn't introduce a new CLAUDE.md rule directly; it justifies the spec amendment.

## Alternatives considered

### A. Schema relaxation — widen `Money.currency` to a union `'EUR' | 'PLN' | 'CZK' | ...`

Let `Money` carry the native currency, and convert in the projection layer (`loadResortDataset` or `ResortView`).

Rejected because:

- It pushes the conversion logic to read time, where every consumer (public app, admin matrix, contract responses) has to either know the user's preferred currency or pick one. The data-transparency promise becomes "we surface the native currency and you do the math" — which is exactly the kind of work-user-not-product friction the pivot is meant to eliminate.
- The `currency` discriminator widens the public-app rendering surface: `formatMoney(m: Money)` now has to know how to render PLN, CZK, CHF, etc. That's eight more locale files for a Phase 1 audience that has not asked for native-currency display.
- Phase 2 would have to re-narrow the union if the operator audience is, in practice, EUR-only. A widened union is a one-way door at the schema-version level.

### B. FX provenance as additional sibling fields on `FieldSource`

Add `fx_rate?: number`, `fx_date?: ISODateTimeString`, `fx_source?: string`, `fx_native_amount?: number`, `fx_native_currency?: string` as five separate optional fields on `FieldSource`.

Rejected because:

- The five fields are co-required: either all are present or all are absent. Modeling them as siblings means the validator has to express that co-requirement field-by-field; a sub-object models it structurally and Zod validates it at parse time.
- A future addition (e.g. `fx_observed_window_minutes` for intra-day rates) means a sixth sibling field on a record that's already 6 fields wide — `FieldSource` becomes a flat 11-field bag, which is exactly the shape the spec's "discriminated union" framing pushes against.
- The TypeScript type `FieldSource['fx_rate']` is `number | undefined` — every consumer has to non-null-assert or branch. With a sub-object, `FieldSource['fx']` is `FxProvenance | undefined` and one branch covers all five inner fields.

### C. Swap the seed list to two Eurozone resorts and defer FX entirely to Epic 5

Pick `chamonix` (FR) + `zermatt` (CH — though Switzerland is not Eurozone; pick `lech` (AT) instead) and ship the FX decision when a non-Eurozone resort is actually added.

Rejected because:

- The user explicitly asked for Eastern European resorts as the seed pair. The product's audience includes operators planning trips into Poland and Czechia; "we'll figure out FX later" is not a credible posture if the seed dataset doesn't cover those countries.
- Deferring FX to Epic 5 means the adapter contract is half-baked when real adapters land — the contract has to be amended mid-epic, which is exactly the spec-drift pattern CLAUDE.md "Documentation Discipline" exists to prevent.
- The seed fixture's job (per spec §10.5 invariant 3) includes demonstrating the provenance pattern. A fixture without FX provenance would not exercise the pattern Epic 5 has to inherit.

### D. Encode FX provenance as free-form Markdown in `attribution_block`

`attribution_block: { en: 'Source: Špindlerův Mlýn feed; converted from CZK 1500 at ECB rate 0.04 EUR/CZK on 2026-04-26' }`

Rejected because:

- The validator has no way to mechanically check that an `attribution_block` mentions the rate, the date, and the native amount. CI cannot fail a missing-FX-block PR; missing provenance has to be caught in code review, which is exactly the drift-prevention CLAUDE.md tries to mechanize.
- Free-form text is unparseable by the public app — there's no way to render "FX: 0.04 EUR/CZK on 2026-04-26" as a structured tooltip or inspector pane without re-parsing the block.
- The shape is what the field is, not what its description is. Making it free-form text confuses provenance-as-data with provenance-as-prose.

## Notes

- This ADR lands in the same epic (Epic 2) as the spec amendment (PR 2.0a) and the validator implementation (PR 2.2). The intent is that the codebase never carries a state where the spec describes the new pattern but the validator doesn't enforce it.
- Spec §11.3 originally scheduled ADRs 0003–0007 as Epic 6 PR 6.4 backfill. This ADR is promoted from "backfill" to "land in Epic 2" because it is load-bearing for the seed fixture and the validator. The remaining 0004–0007 are unchanged in their Epic 6 cadence; the ADR-process-itself ADR (currently scheduled as 0007) may want to renumber post-hoc, but renumbering existing ADRs is itself a documentation drift hazard, so the current preference is to leave the gap (this ADR is 0003; the next backfill ADR continues from 0004). If future planning prefers a continuous sequence, that's an Epic 6 housekeeping decision.
- ADR-0001 establishes the data-transparency thesis. ADR-0002 establishes the durable-vs-live split. This ADR slots between them as a third architectural invariant: **converted Money values carry their conversion provenance.**
