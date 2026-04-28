# Snowboard Trip Advisor

A **data-transparency comparison tool** for European ski resorts, built for a snowboard trip organizer choosing resorts for a group. The product surfaces durable resort facts and live market signals **side-by-side with visible source provenance** (source, `observed_at`, `fetched_at`) and lets the organizer rank the shortlist themselves. It does not compute an overall score.

Phase 1 is a local, filesystem-only build with two seed resorts. Phase 2 extends it toward multi-operator deployments. Booking stays external.

## What this is NOT

- Not a ranker. There is no overall score, no weighted recommendation, no "best resort" output.
- Not a booking engine. Outbound links go to external providers (OpenSnow, Booking.com, Airbnb, Snow-Forecast) with disclosed deep links.
- Not a review aggregator. The product shows measured facts, not user opinions.

## Who it's for

The single trip organizer planning a group snowboard trip who wants to:

- compare resorts on measurable facts rather than marketing copy;
- see where each value came from and how fresh it is;
- shortlist resorts and make the ranking call themselves;
- keep booking outside the product.

## Product direction

### Phase 1 (current)

- European resorts only (Alps + Pyrenees + Nordic Europe).
- EUR-only pricing, metric-only units.
- Two Vite apps: `apps/public` (discovery + comparison) and `apps/admin` (loopback-only editor).
- Filesystem-only persistence; no backend, no auth, no database.
- All data is published snapshots — no live per-request fetches from upstream.

### Phase 2 (target)

- Multi-operator deployments with authenticated admin users.
- Postgres-backed persistence via a Hono admin API. Better Auth is the current candidate for sessions, with Auth.js v5 and hosted options (Clerk, WorkOS) as fallbacks if Better Auth doesn't fit when Phase 2 starts.
- Redis / BullMQ / S3 are **deferred until observable pressure justifies them**.
- The `/api/*` contract is the stable portability line — Phase 2 re-implements it verbatim on Postgres, and the admin UI does not change at the boundary.

Detailed design is in [`docs/superpowers/specs/2026-04-22-product-pivot-design.md`](docs/superpowers/specs/2026-04-22-product-pivot-design.md). The rationale for the data-transparency direction is in [ADR-0001](docs/adr/0001-pivot-to-data-transparency.md).

## Data model at a glance

Two document types, separated because their freshness and validation rules differ:

- **`Resort`** (durable): identity, country, altitude range, slopes_km, lift_count, skiable terrain, season window. Changes on season-level timescales.
- **`ResortLiveSignal`** (volatile): snow_depth_cm, lifts_open, lift_pass_day (EUR), forecast, lodging sample. Each value carries `observed_at` and `fetched_at`; stale values render as "—" with a tooltip.

Every metric field has a matching `field_sources` entry carrying `source`, `source_url`, `observed_at`, `fetched_at`, `upstream_hash`, and an attribution block. `validatePublishedDataset` enforces that coverage at publish time.

The Phase 1 seed dataset ships two resorts: **Kotelnica Białczańska** (`kotelnica-bialczanska`, Poland, prices natively in PLN) and **Špindlerův Mlýn** (`spindleruv-mlyn`, Czech Republic, prices natively in CZK). Because both resorts are EU but neither uses the euro, every Money-typed field carries an additional `fx` sub-object on its `FieldSource` recording the ECB reference rate used to convert into EUR — see [ADR-0003](docs/adr/0003-fx-conversion-at-adapter-boundary.md) for rationale and the validator-enforced shape.

## Cards landing (`/`)

The default route of the public app (`/`) is the **cards landing**: a hero header, a filter bar (country chips, sort, bucketed price), and one card per resort. Each card surfaces four metric fields side-by-side — durable (altitude range, slopes_km) and live (snow_depth_cm, lift_pass_day) — with the source glyph + observed_at tooltip from `field_sources`. A star toggles the resort into a URL-shared shortlist; "Browse lodging near …" routes outbound with `rel="noopener noreferrer"` + `referrerpolicy="no-referrer"`. Sort and country filter are URL-shared (`?sort=`, `?country=`) so links round-trip; the price bucket is a private filter and is not serialized. The matrix view (PR 3.4) and detail drawer (PR 3.5) compose against the same dataset projection.

## Current state today

**The pivot is documented but not executed.** The codebase on `main` is still the pre-pivot scoring pipeline. Migration happens on the `pivot/data-transparency` branch across six epics (spec §9); `main` stays deployable until Epic 6 closes.

What exists on `main` today:

- a single-app Vite frontend that reads a published JSON snapshot;
- a research pipeline that normalizes resort data, **scores it**, reports changes, and publishes versioned snapshots;
- a shared Zod schema for the current v0 dataset.

What will change during the pivot (see spec §10 for the full file-by-file disposition):

- scoring code and config are deleted (`config/scoring.ts`, `research/scoring/*`);
- schema moves to `packages/schema/` and gains the durable-vs-live split;
- frontend splits into `apps/public` and `apps/admin`;
- published dataset migrates from `current.json` to `current.v1.json` via a one-shot `migrate:v0-to-v1` CLI.

Until the branch merges, the `main` branch still behaves like a scoring-based discovery app.

## Getting started

```bash
npm install
npm run setup      # installs the pre-commit hook
npm run dev        # Vite dev server for the public app
npm run qa         # lint → typecheck → coverage (hard gate)
```

Additional Phase 1 commands — `npm run dev:admin` (loopback admin) and `npm run research test:adapter -- --record` (fixture recording) — become available as their epics land on `pivot/data-transparency` (see spec §9). They are not on `main` yet.

## Quality gate

Every commit goes through:

```bash
npm run qa  # npm run lint → npm run typecheck → npm run coverage
```

- 100% line / branch / function / statement coverage is a hard gate.
- TDD is required: failing test first, then minimal implementation.
- `--no-verify` is forbidden; the pre-commit hook runs `npm run qa` and must pass.

Details and agent rules are in [`CLAUDE.md`](CLAUDE.md).

## Data & trust posture

- Zero first-party tracking: no analytics, no third-party beacons, no cross-site identifiers.
- Primary shortlist state is URL-based. `localStorage` is used only for trip inputs (dates, party size, traveller names), the `prefers-color-scheme` override, and a prior-session shortlist fallback for the merge/replace modal — same-origin, user-controlled, never transmitted.
- Fonts are self-hosted; CSP is baked at build time.
- Outbound links carry `rel="noopener noreferrer"` and `referrerpolicy="no-referrer"`.
- Affiliate IDs are default-off; operators who enable them must disclose.

## Project layout

The layout below reflects `main` today. The target layout after the pivot is documented in spec §10.3.

```
src/                     Vite frontend (pre-pivot; becomes apps/public/)
research/                Research pipeline (schema, normalize, score, validate, publish, CLI)
config/                  Scoring thresholds (deleted in Epic 2)
data/published/          Published JSON snapshots consumed by the frontend
docs/superpowers/specs/  Design specs (current direction: 2026-04-22-product-pivot-design.md)
docs/adr/                Architecture decision records (current: ADR-0001)
```

## Licensing & contributing

- Code: **Apache-2.0**.
- Data snapshots: **CC BY 4.0**.
- Contributions: **DCO sign-off** (`git commit -s`). No CLA.

The full license boundary (which file types fall under which license) is specified in spec §11.1.1. `LICENSE`, `NOTICE`, and `CONTRIBUTING.md` land with Epic 1 PR 1.1 (earliest workspace scaffolding PR) per §11.3.

## Status & roadmap

- **Phase 1** — in progress on `pivot/data-transparency`. Six epics, ~30 PRs; `main` stays deployable until the branch merges back.
- **Phase 2** — target; detailed in spec §8. Starts after Phase 1 ships and a dedicated Phase 2 spec is written.
- **Phase 3+** — out of scope. Any proposal requires a GitHub Discussion and an ADR before PRs.

## Links

- Current spec: [`docs/superpowers/specs/2026-04-22-product-pivot-design.md`](docs/superpowers/specs/2026-04-22-product-pivot-design.md)
- Pivot rationale: [`docs/adr/0001-pivot-to-data-transparency.md`](docs/adr/0001-pivot-to-data-transparency.md)
- Superseded (historical): [`docs/superpowers/specs/ARCHIVED-2026-04-03-snowboard-trip-advisor-design.md`](docs/superpowers/specs/ARCHIVED-2026-04-03-snowboard-trip-advisor-design.md)
- Agent instructions: [`CLAUDE.md`](CLAUDE.md)
