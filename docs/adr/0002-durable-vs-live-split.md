# ADR-0002: Split durable resort intelligence from live market signals

- **Status:** Accepted
- **Date:** 2026-04-22
- **Deciders:** @mathvbarone
- **Related spec:** [`docs/superpowers/specs/2026-04-22-product-pivot-design.md`](../superpowers/specs/2026-04-22-product-pivot-design.md) §4
- **Related ADR:** [ADR-0001](./0001-pivot-to-data-transparency.md)

## Context

The product surfaces two categories of resort data that have fundamentally different lifecycles:

- **Durable resort intelligence** — facts that change on season-level timescales: resort identity, country, altitude range, slopes_km, lift_count, skiable terrain, season start/end window, broad access characteristics.
- **Live market signals** — values that need freshness to be useful: snow_depth_cm, lifts_open, lift_pass_day (EUR), short-horizon forecasts, lodging price samples. Every value is only meaningful relative to an `observed_at` timestamp.

These two categories differ on every dimension that matters for a data-pipeline design:

| Dimension | Durable | Live |
|---|---|---|
| Update cadence | Seasonal / ad-hoc | Hours to days |
| Validation | Editorial, rare | Per-fetch, automated |
| Staleness tolerance | High | Low (typed TTL per field) |
| Source variety | Few canonical sources | Many, with overlap |
| Publish blast radius | Schema-shaping | Per-resort, per-field |
| Failure mode | Data rot is slow | Data rot is the default state |

The first spec (the superseded scoring-based design) treated all resort data as one undifferentiated record. That worked while the dataset was editorial and static, but any future live-data work would have flattened both categories into the same validation, freshness, and publishing pipeline — which is wrong for both.

## Decision

Split the data model into two document types with separate validation and publishing rules:

- **`Resort`** — durable intelligence, one record per resort.
- **`ResortLiveSignal`** — volatile signals, one record per resort per live-fetch cycle.

Both document types carry their own `field_sources` map and schema version. Published datasets carry both as sibling arrays in `current.v1.json`; readers join by `slug === resort_slug`.

The split is enforced architecturally, not just conventionally:

- Zod schemas for the two types live in separate files under `packages/schema/`.
- `validatePublishedDataset` runs independent invariant checks per type (e.g., `observed_at` freshness TTLs apply only to `ResortLiveSignal`).
- The admin editor UI exposes durable fields (left panel) and live signals (right panel) as distinct surfaces with different affordances (`Test` / `Sync` actions only exist for live-signal fields).
- The `/api/*` contract exposes them under distinct field groups in `ResortDetailResponse`.

## Consequences

### Positive

- **Freshness semantics are legible.** Stale live signals render as "—" with an `observed_at` tooltip; stale durable facts don't exist — they either are current or have not been edited in a long time, which is a different UI state.
- **Provenance is per-value.** Both document types carry `field_sources` entries tied to individual fields, which is what the data-transparency thesis (ADR-0001) actually requires.
- **Ingest pipelines can evolve independently.** Editorial flow for durable facts (admin editor → publish) has nothing in common with adapter-driven live ingestion (fetch → validate → archive → publish). Keeping them separate at the schema level lets them evolve at their own pace.
- **Validation rules match reality.** Durable fields have editorial invariants (slug regex, EUR currency literal, https-only URLs). Live fields have freshness invariants (per-field TTL, `observed_at` within N days). Both sets are checked but they don't have to share a code path.
- **Future per-resort publishing is trivial.** Once resort count crosses 25 (spec §8.6), per-resort publish means regenerating `current.v1.json` by composing the current published `Resort` + latest published `ResortLiveSignal` per slug. Having them as separate documents makes this a join, not a deep-merge.

### Negative / costs

- **Joins at read time.** The public UI and admin editor both need to pair a `Resort` with its latest `ResortLiveSignal`. This is a single line of selector code (`loadResortDataset` composes a `ResortView`), but it is a join that wouldn't exist with a flat record.
- **Schema version coordination.** Both document types carry their own `schema_version`. If a migration bumps one but not the other, the envelope has to handle mixed-version payloads for one migration cycle. The migration CLI (`migrate:v0-to-v1`) has to know about both.
- **Admin editor complexity.** A single resort editor surfaces two documents, two save paths, two status pills, two action sets. Not harder than a flat-record editor with 2× as many fields, but harder than a flat-record editor with 1× as many fields.

### Neutral / follow-on

- The durable-vs-live distinction was already a principle in the pre-pivot `CLAUDE.md` ("Durable resort intelligence and live market signals must remain distinct in both architecture and documentation"). This ADR promotes it from principle to architectural invariant.
- Phase 2's append-only versioning is easier with two document types because each has its own version history. A flat record would need either field-level versioning (complex) or whole-record versioning (coarse).

## Alternatives considered

### A. Flat record with per-field freshness metadata

One `Resort` document with all fields, each carrying its own `observed_at`/`fetched_at`. Rejected because:

- The validation split is still there, just hidden inside a single schema. Freshness rules would have to be applied field-by-field via metadata lookups rather than typed at the document level.
- Per-field versioning would become necessary once any live field is versioned independently of the durable fields, which adds complexity that a document split sidesteps.
- The join-free read model isn't actually a benefit here — the UI needs to render durable and live data differently anyway, so selectors would still split them at the view layer.

### B. Single schema with a `kind` discriminator

One table/document type with `kind: 'durable' | 'live'`. Rejected because:

- It's a flat-record design in a union costume. Validation rules still have to branch on `kind`, which is exactly the "shared code path" the two-document design avoids.
- Publish-time invariants become harder to express because the Zod schema has to accept both shapes everywhere.

### C. Keep them coupled until Phase 2

Ship Phase 1 with a flat record; split when Phase 2 actually needs independent lifecycles. Rejected because:

- The split informs the admin editor UX (two panels, different actions), the publish pipeline (different validation ordering), and the reader selectors. Deferring the split means Phase 1 ships UX that doesn't reflect the real data model, and Phase 2 then has to migrate the UX in addition to the schema.
- The migration cost grows non-linearly with how many code paths have assumed a flat record. Paying the split cost in Phase 1 — when the codebase is small — is strictly cheaper.

## Notes

- The durable-vs-live principle was carried forward unchanged from the pre-pivot `CLAUDE.md`. This ADR is a backfill that promotes the principle to an architectural invariant with named alternatives and consequences.
- The spec documents the two Zod shapes in §4.1. `METRIC_FIELDS` enumerates dot-paths across both document types so coverage tests treat them uniformly at publish time.
