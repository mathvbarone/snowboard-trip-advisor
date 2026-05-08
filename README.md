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

The default route of the public app (`/`) is the **cards landing**: a hero header, a filter bar (country chips, sort, bucketed price, cards/matrix view toggle), and one card per resort. Each card surfaces four metric fields side-by-side — durable (altitude range, slopes_km) and live (snow_depth_cm, lift_pass_day) — with the source glyph + observed_at tooltip from `field_sources`. A star toggles the resort into a URL-shared shortlist; "Browse lodging near …" routes outbound with `rel="noopener noreferrer"` + `referrerpolicy="no-referrer"`. Sort and country filter are URL-shared (`?sort=`, `?country=`) so links round-trip; the price bucket is a private filter and is not serialized. The matrix view and detail drawer compose against the same dataset projection.

## Shortlist & sharing

The shortlist is the trip organizer's working set — up to six resorts they want to compare side-by-side. Tapping the star on any card adds the resort to `?shortlist=…` in the URL; tapping again removes it. A right-edge drawer lists the shortlisted resorts with a per-row remove button and an "Open Matrix" CTA (visible at the `md` breakpoint and up; the matrix view itself redirects below `md`). Sharing is one click: the share-URL dialog copies the current `window.location.href` via the Clipboard API, with a readonly text-input fallback when the API is unavailable (legacy browsers, non-https). When a recipient opens a share-link in a session that already has a different shortlist saved, a merge/replace dialog asks whether to keep the link's set, keep the saved one, or merge them — set-equal-but-reordered links adopt URL order silently and never trigger the prompt.

## Matrix view (`?view=matrix`)

The matrix view is the side-by-side comparison surface for the URL-shared shortlist: each shortlisted resort becomes a column, each `METRIC_FIELDS` entry (altitude, slopes, snow depth, lift pass, lodging median, etc.) becomes a row. Empty shortlist renders an "Add resorts to compare" hint pointing back to cards view. The cards/matrix toggle lives at App level (above the view dispatch), so it stays reachable on both routes; clicking it pushes `?view=` to history (browser back returns to the previous view). `?highlight=<field_key>` flags a single metric row for emphasis — a sharable link that prefocuses the snow-depth row, for instance. Below the `md` breakpoint the matrix is replaced by a redirect message (matrix at narrow widths is unreadable); at the `md`–`lg` band with the detail drawer open, a CSS rule downgrades the matrix to a single-column flow under the drawer.

## Detail drawer (`?detail=<slug>`)

The detail drawer is a non-modal right-edge panel that opens over the cards or matrix view when a resort slug is set in `?detail=…` (typically by activating the star affordance on a card, which carries `data-detail-trigger="<slug>"`). The drawer surfaces the full picture for one resort: a "Snow conditions" section with live signals (snow depth, lifts open, lift-pass day price, lodging-sample median) and a "Terrain stats" section with durable facts (altitude range, slopes_km, lift_count, skiable_terrain_ha, season window) — every field rendered with its source glyph and `observed_at` provenance. A trip-note section is reserved for analyst commentary (Phase 1 placeholder; CMS lands in Phase 2). The "Browse lodging near …" CTA routes to a Booking deep link with `rel="noopener noreferrer"` + `referrerpolicy="no-referrer"` and `encodeURIComponent`-encoded interpolation; below the CTA, the verbatim honesty micro-copy reads: *"Opens Booking.com in a new tab. We may receive a commission if you book; this does not affect the data shown."* The drawer is non-modal so the cards or matrix behind stay clickable; Escape and outside-click dismiss; closing clears `?detail=` from the URL (browser back returns to the previous view) and focus returns to the triggering element. The drawer module is code-split into its own lazy chunk so the cards landing's initial bundle stays small.

## Current state today

The pivot is **mostly executed** on `main`. Epics 1–3 and Epic 4 Tiers 1–2 have shipped; Epic 4 Tiers 3–5 (admin editor write path, publish UI, polish) and Epics 5–6 (real upstream adapters, ops) remain. There is no long-lived `pivot/data-transparency` integration branch — feature branches ship directly to `main`. (See [AGENTS.md §"Migration / Hotfix Branch Rules"](AGENTS.md) for the rationale.)

What exists on `main` today:

- **`packages/schema`** — the v1 Zod schema with the durable-vs-live split, `loadResortDataset` / `loadResortDatasetFromObject` projection, `validatePublishedDataset` (provenance enforcement at publish time), `WorkspaceFile` admin schema with the `editor_modes` cross-key invariant, and the typed `packages/schema/api/` wire contract for the 6 admin endpoints (snapshot-pinned).
- **`packages/design-system`** — hand-built design system: `Card`, `Button`, `IconButton`, `Input`, `Select`, `Chip`, `Pill`, `SourceBadge`, `FieldValueRenderer`, `Modal`, `Drawer`, `Tooltip`, `Table`, `ToggleButtonGroup`, `Shell`, `HeaderBar`, `Sidebar`, `StatusPill`, `Tabs`, `Popover`, `DropdownMenu`, `EmptyStateLayout`, `Skeleton`, glyph icons, generated `tokens.css`.
- **`apps/public`** — full Phase 1 cards landing + matrix view + detail drawer + URL-shared shortlist + share-URL dialog (`ShortlistDrawer`, `ShareUrlDialog`, `MergeReplaceDialog` are app-local views composed on top of the DS `Drawer` / `Modal` primitives) + view toggle + `?highlight=` row affordance + bundle-budget tooling (`npm run analyze`).
- **`apps/admin`** — loopback-only editor (`127.0.0.1:5174`, `strictPort:true`). Real handlers for `GET /api/health` (full aggregates including `resorts_with_corrupt_workspace`) and `GET /api/resorts` (filterable + sortable); the other 4 endpoints (`resortDetail`, `resortUpsert`, `publish`, `listPublishes`) are 501-stubs that ship in Tier 3 / Tier 4. Dashboard view + ResortsTable view + Dashboard "Failed fields" card-click navigation. Editor view + write path land in Tier 3; publish handler lands in Tier 4 PR 4.5a.
- **Publish pipeline (library only, today)** — `@snowboard-trip-advisor/schema/node` exports `publishDataset()` + `validatePublishedDataset()` (parse → Zod validate → provenance check → atomic write → archive). The admin's `POST /api/resorts/:slug/publish` endpoint that calls into this library is **not yet wired** — it lands in Tier 4 PR 4.5a; today the route returns a 501 stub. The pre-pivot `research/` directory and its scoring code were deleted in Epic 2; a `research/cli.ts` wrapping the same library is planned for Epic 5 alongside the first real upstream adapters.
- **Two seed resorts** in `data/published/current.v1.json`: Kotelnica Białczańska (Poland) and Špindlerův Mlýn (Czech Republic), each with the full FX-aware `field_sources` provenance.

## Getting started

```bash
npm install
npm run setup      # installs the pre-commit hook + regenerates tokens.css
npm run dev        # Vite dev server for the public app
npm run dev:admin  # loopback admin app (127.0.0.1:5174)
npm run qa         # lint → drift → typecheck → coverage → tokens → hooks → integration (hard gate)
```

`npm run research test:adapter -- --record` (fixture recording for real upstream adapters) becomes available when Epic 5 lands.

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

```
apps/public/             Public discovery app (cards landing, matrix view, detail drawer, shortlist)
apps/admin/              Admin loopback editor (Dashboard, ResortsTable; editor lands in Epic 4 Tier 3)
packages/schema/         Zod schema + projections + validators + publishDataset + the typed admin /api/* wire contract
packages/design-system/  Hand-built design system + generated tokens.css
packages/integrations/   Adapter contract (Epic 5 onwards lands real upstream adapters here)
config/                  Build-time configuration (CSP, fonts, etc.)
data/published/          Published v1 JSON snapshots
data/admin-workspace/    Per-resort workspace files the admin editor writes (Phase 1 filesystem-only)
docs/superpowers/specs/  Design specs (parent + per-epic)
docs/superpowers/handoffs/  Tracked post-milestone handoffs
docs/adr/                Architecture decision records
scripts/                 Repo automation (hooks, build-budget, drift checks, hooks-test harness)
tests/integration/       Cross-workspace integration tests
```

## Licensing & contributing

- Code: **Apache-2.0**.
- Data snapshots: **CC BY 4.0**.
- Contributions: **DCO sign-off** (`git commit -s`). No CLA.

The full license boundary (which file types fall under which license) is specified in spec §11.1.1. `LICENSE`, `NOTICE`, and `CONTRIBUTING.md` shipped with Epic 1.

## Status & roadmap

- **Phase 1** — in progress on `main`. Epics 1–3 (workspace scaffolding + schema migration + public app) shipped; Epic 4 (admin app) is mid-flight: Tiers 1–2 (foundation, navigation) are on `main`, Tiers 3–5 (editor, publish, polish) are pending. Epics 5–6 (real adapters, ops) follow.
- **Phase 2** — target; detailed in spec §8. Multi-operator deployments, Postgres-backed admin API, authenticated admin users. Starts after Phase 1 ships and a dedicated Phase 2 spec is written.
- **Phase 3+** — out of scope. Any proposal requires a GitHub Discussion and an ADR before PRs.

## Links

- Current spec: [`docs/superpowers/specs/2026-04-22-product-pivot-design.md`](docs/superpowers/specs/2026-04-22-product-pivot-design.md)
- Pivot rationale: [`docs/adr/0001-pivot-to-data-transparency.md`](docs/adr/0001-pivot-to-data-transparency.md)
- Superseded (historical): [`docs/superpowers/specs/ARCHIVED-2026-04-03-snowboard-trip-advisor-design.md`](docs/superpowers/specs/ARCHIVED-2026-04-03-snowboard-trip-advisor-design.md)
- Agent instructions: [`CLAUDE.md`](CLAUDE.md)
