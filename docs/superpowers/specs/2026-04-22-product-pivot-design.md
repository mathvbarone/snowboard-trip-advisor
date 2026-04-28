# Product Pivot: Data-Transparency Comparison Tool

**Spec date:** 2026-04-22
**Status:** Resolved — user sign-off on all seven open decisions captured in §12; ready for implementation planning
**Supersedes:** `docs/superpowers/specs/ARCHIVED-2026-04-03-snowboard-trip-advisor-design.md` (scoring-based ranker)
**Decision record:** ADR-0001 (`docs/adr/0001-pivot-to-data-transparency.md`)

---

## Resolved Decisions Summary

All seven open decisions from the drafting pass have been resolved with the user. Full reasoning in §12.

| # | Decision | Resolution |
|---|---|---|
| 1 | Phase 2 stack | Hono + Drizzle + Postgres; Redis / BullMQ / S3 deferred until pressure requires them |
| 2 | Phase 1 admin auth | Loopback-only, no auth |
| 3 | Per-resort publish threshold | All-or-nothing in Phase 1; revisit when resort count crosses 25 |
| 4 | `exactOptionalPropertyTypes` | Enabled on Day 1 (Epic 1 PR 1.1) |
| 5 | Phase 2 auth library | Better Auth (Lucia deprecated upstream in 2025) |
| 6 | Phase 1 rate-limit bucket | In-memory, per-process; admin-only fetches in Phase 1 (CLI does not fetch adapters) |
| 7 | License + contribution model | Apache-2.0 (code) + CC BY 4.0 (data) + DCO (no CLA) |

---

## 0. Executive Summary

Snowboard Trip Advisor pivots from a scoring-based ranker to a **data-transparency comparison tool** for European ski resorts. The product no longer computes or displays a ranking. Instead, it surfaces durable resort facts and live market signals **side-by-side with visible source provenance**, and the organizer makes the ranking call themselves.

**Scope of Phase 1:**

- European resorts only (Alps + Pyrenees + Nordic Europe; no North America, no Japan).
- EUR-only pricing, metric-only units.
- Two documents in the seed dataset: `kotelnica-bialczanska` (Kotelnica Białczańska, PL — Tatra Mountains) and `spindleruv-mlyn` (Špindlerův Mlýn, CZ — Krkonoše/Giant Mountains). Both resorts price natively in non-EUR currencies (PLN and CZK respectively) and are deliberately chosen to exercise the FX-conversion pattern from ADR-0003 in the seed fixture.
- Two Vite apps (`apps/public`, `apps/admin`); admin is loopback-only.
- No backend; no auth; no database. Filesystem-only persistence.

**Scope of Phase 2 (target state, not implemented in this spec):**

- Multi-operator deployments. Minimal initial target: Hono admin API + Drizzle + Postgres + Better Auth, single process.
- Redis (rate limiting, presence), BullMQ (background jobs), and S3 (audit archive) are **deferred until observable pressure justifies them**.
- Stable `/api/*` contract preserved from Phase 1, so the admin UI survives the migration.

**Quality posture:**

- `npm run qa` remains the hard gate (lint → typecheck → coverage).
- 100% line/branch/function/statement coverage.
- TDD required; `--no-verify` forbidden.
- Every PR passes integration + a11y (axe-core-per-route). Visual regression, Storybook, size-limit, and Lighthouse CI land with Epic 6 after the UI surface has stabilized.

**Licensing posture:**

- Apache-2.0 for code, CC BY 4.0 for data snapshots.
- DCO (no CLA).
- Zero first-party tracking.
- Default-off affiliate IDs, operator disclosure required.

---

## 1. Goals, Non-Goals, Product Principles

### 1.1 Goals

- Help the snowboard trip organizer **compare** European resorts using **inspectable** durable + live data.
- Preserve the distinction between **durable resort intelligence** (terrain, size, structural facts) and **live market signals** (snow depth, lifts open, lift-pass price, observed_at timestamps).
- Surface source + `observed_at` + `fetched_at` on every displayed value.
- Route booking decisions to external providers (OpenSnow, Booking.com, Airbnb, Snow-Forecast) via disclosed deep links.
- Support per-operator deployments with runtime-configurable affiliate IDs (default OFF).
- Maintain a semi-opinionated structure: sorts, filters, shortlist UX — but the **ranking is always the user's**.

### 1.2 Non-Goals (Phase 1)

- Scoring, ranking, or "overall score" fields.
- Booking, checkout, or affiliate transactions.
- User accounts, sessions, personalization.
- Live per-request scraping; all data is published snapshots.
- Non-European resorts; non-EUR pricing; imperial units.
- Mobile-native apps.

### 1.3 Product Principles

1. **Data transparency over recommendation.** Every value has a source; sources are visible; the user judges.
2. **Durable vs live is architecturally separate.** Freshness, validation, and publishing are distinct for each; the spec enforces the split with two document types.
3. **Published data over live fetches.** The public UI reads only from validated published snapshots.
4. **Provenance by default.** Every metric field has a `FieldSource` record.
5. **Privacy by default.** Zero tracking, no third-party fonts, no analytics.
6. **Honest deep links.** External outbound links are disclosed with micro-copy; never silently interpolated affiliate strings.
7. **Operator obligations are named.** A self-deploy operator sees an explicit obligations doc.

---

## 2. Product Surface — Public App (`apps/public`)

### 2.1 Routes & URL state

All routing is **URL-param-driven**; no router library. URL keys (parsed by a Zod schema in `apps/public/src/lib/urlState.ts`):

```
?shortlist=<slug>[,<slug>]*       ordered, capped at 6
&view=cards|matrix|detail         default: cards
&sort=price_asc|price_desc|name   missing values sink; name A→Z is default tiebreaker
&country=FR[,AT,CH,IT,ES,SE,PL,CZ]*     ISO 3166-1 alpha-2 (PL + CZ added in Epic 2 alongside the seed-list change)
&highlight=<field_key>            highlights a field across the matrix
&resort=<slug>                    detail view target (only when view=detail)
```

**Not carried in URL (privacy):** `trip` dates, party size, traveller names. `localStorage` key `sta-v1` carries those locally.

**Share URL derivation:** Clipboard API writes the current URL minus `trip`; fallback modal for unsupported browsers.

**Merge/replace on collision:** opening a share link while a local shortlist exists prompts "Merge / Replace / Keep mine" (modal, not silent).

**Merge rule (defined):** `merged = URL ∪ local` where URL entries come first (preserving URL order), local-only entries append (preserving their prior order). If the result exceeds the cap (6), the tail is truncated. The modal previews the exact resulting shortlist before confirm so the user sees which local entries will be dropped. Both the merge and the cap-truncation are deterministic and covered by unit tests.

**URL-wins-on-mount per-key:** each URL key independently overrides localStorage on mount; non-URL keys persist from storage.

### 2.2 Views

**Card view** (default, `view=cards`): grid of resort cards. Each card shows name, country flag, 2 durable highlights (piste_km, lift_count), 2 live highlights (snow_depth_cm, lifts_open), a shortlist-toggle star, and "View detail". Sort dropdown (price_asc | price_desc | name). Country multi-select filter chips.

**Matrix view** (`view=matrix`): table of shortlisted resorts × fields. Highlightable field (`highlight=`). Each cell shows the value + a small `SourceBadge` (source icon) + `observed_at` tooltip. Missing values explicitly marked **"—"** with a "no data yet" tooltip. Hidden below the `md` breakpoint (<900px); a message redirects mobile users to card view.

**Shortlist drawer ↔ matrix interaction:** the drawer renders on every breakpoint and always shows the current shortlist with per-resort detail-view CTAs. The "Open matrix" affordance inside the drawer is:
- ≥`md`: visible and active.
- <`md`: hidden (not merely disabled — removed from the tab order).

Resize across the `md` boundary while the drawer is open keeps focus on the drawer's close affordance (never on the now-removed matrix toggle). Covered by an integration test.

**`highlight=` when `view=cards`:** the `highlight` URL key has no effect outside matrix view; it is preserved in URL state and activates automatically when the user switches to matrix.

**Detail view** (`view=detail&resort=<slug>`): full-page layout. Hero (name, country, altitude_m, slopes_km). Durable facts table (source: `resort-feed`). Live signals table (source: `opensnow`, `snowforecast`, `booking`, `airbnb`). Deep-link section with honesty micro-copy: "Opens Booking.com in a new tab. We may receive a commission if you book; this does not affect the data shown." External links carry `rel="noopener noreferrer"` + `referrerpolicy="no-referrer"`. Per-resort `booking_ss` and `airbnb_ss` override strings allow operators to use their own curated search strings.

### 2.3 Responsive breakpoints

`xs=360 / sm=600 / md=900 / lg=1280`. Matrix is hidden below `md`. Card view adapts down to 360. Detail view adapts to 360 with stacked sections.

**Card layout at xs (360):** single-column vertical stack within each card: country flag row + title, altitude range, slopes_km, lift_count, snow_depth_cm, lifts_open, star/shortlist toggle, "View detail" CTA. No 2-column grids at xs. Card grid is single column at xs; two columns at sm; three at md; four at lg.

### 2.4 Accessibility

- Axe-core gate in integration tests: every route + every interactive state (hover, focus, expanded, open) fails PR on any `serious`/`critical` violation.
- `ToggleButtonGroup` uses `aria-pressed` (NOT `role="tab"`) — stateful toggle, not a tab.
- Drawer and modal overlays use `inert` on background content (NOT `aria-hidden`).
- `prefers-reduced-motion` honored via CSS token override.
- Focus traps implemented by Radix UI primitives (Dialog, Popover, DropdownMenu, Tooltip).
- Contrast ratios verified at token level (AA minimum; AAA for body text).

### 2.5 Performance budget

- `apps/public` JS: 180 KB gzip initial + 45 KB gzip per route chunk.
- LCP: ≤2.0s on fast-4G emulation.
- CLS: <0.05.
- Informal budget during Epic 1-5; enforced by `size-limit` in CI from Epic 6.

### 2.6 CSP posture

Single source of truth: `config/csp.ts`. Dev Vite plugin injects via middleware; prod nginx serves `Content-Security-Policy` header baked at build time.

Policy (summary): `default-src 'self'`; `img-src 'self' data: https:`; `font-src 'self'`; `connect-src 'self'`; `script-src 'self'` (no nonces/hashes in prod; Vite dev uses nonce); `style-src 'self' 'unsafe-inline'` (inline styles used via token objects — see design system rules); `frame-ancestors 'none'`; `base-uri 'self'`; `form-action 'self'`; `upgrade-insecure-requests`.

### 2.7 Typography & fonts

- **Display:** DM Serif Display (headlines only).
- **Body/UI:** DM Sans.
- **Numeric/data:** JetBrains Mono (values in matrix + detail).

All self-hosted via `@fontsource/*`. WOFF2 only; preload primary weights.

---

## 3. Admin App (`apps/admin`) — Phase 1 loopback-only

### 3.1 Binding & build

- Vite dev server binds `127.0.0.1:5174` only. `server.host = '127.0.0.1'`, `server.strictPort = true`.
- `apps/admin` is **never** built into the production container image. Dockerfile multi-stage builds `apps/public` only.
- Started via `npm run dev:admin`. No auth in Phase 1 (the network boundary is the control).

### 3.2 Responsive policy

- **Full editing available at the `md` breakpoint (≥900px) and above.**
- **Read-only below the `md` breakpoint.** Mobile + small-tablet users can audit live data and inspect field states but cannot edit. Publish/approve/sync/test actions are **hidden** (not merely disabled — they are removed from the tab order entirely so keyboard-only users don't tab onto inert controls). Editable controls (inputs, selects, toggles) render with `disabled` + `aria-readonly`. Below `md` the left/right panels stack into a single column for legibility.

### 3.3 Shell

Sidebar (logo, nav: Dashboard, Resorts, Sources, Integrations, History), header (breadcrumb, Publish button, user identity placeholder), main content area. Implemented with design-system `Shell`, `Sidebar`, `HeaderBar` components.

### 3.4 Dashboard

Health cards: total resorts, resorts with stale fields, resorts with failed fields, pending integration errors, last successful publish timestamp. Card click navigates to a filtered Resorts list.

### 3.5 Resorts

Table of resorts. Columns: name, country, last updated, stale fields count, failed fields count, publish state. Click row → resort editor.

### 3.6 Resort editor (the core)

Left panel: durable fields (from `Resort` document). Right panel: live signals (from `ResortLiveSignal` document). Each field row:

- **Label + StatusPill** (`Live` | `Stale` | `Failed` | `Manual`).
- **Value** display/edit (Auto mode: read-only formatted value + `SourceBadge`; Manual mode: input or select).
- **ModeToggle** (`AUTO` / `MANUAL`). Auto disabled when no adapter exists for the field.
- **Actions** (Auto mode only): `Test` (probes the adapter with the fixture), `Sync` (triggers a real adapter fetch).

Field-level `FieldStateFor<T>` shape drives the UI; the mapped type keeps the editor type-safe per field.

### 3.7 Publish workflow (Phase 1)

- **All-or-nothing publish.** Clicking "Publish" runs the same pipeline as `research/cli.ts publish`: parse → Zod validate → `validatePublishedDataset` → atomic write → archive.
- Per-resort publish is deferred to Phase 2 (triggered when resort count crosses 25).
- Publish requires all Auto-mode fields with `status=failed` to either be fixed or switched to Manual.

### 3.8 PublishState enum

```ts
type PublishState = 'draft' | 'published';
```

Phase 1 ships only the two states the admin UI and publish pipeline actually use. A richer editorial workflow (`in_review`, `approved`, `scheduled`, `archived`, `rejected`) is a Phase 2 concern and will widen the union additively when the workflow is designed — not preemptively now. Widening is a schema-version decision (`schema_version` bumps when the enum changes; migration CLI handles the transition).

### 3.9 Analyst notes

Per-resort, per-field Markdown-formatted notes stored alongside the workspace. Rendered safely (no `dangerouslySetInnerHTML`; Markdown-to-AST parser + sanitizer). Not published; internal-only.

### 3.10 Keyboard shortcuts

`/` focuses search. `g r` → Resorts. `g i` → Integrations. `mod+enter` → Save (in editor). `esc` closes modals.

### 3.11 Admin process topology (Phase 1)

`apps/admin` is a Vite SPA served by a Vite dev server that **also hosts an in-process request handler** via a Vite middleware plugin (`apps/admin/vite-plugin-admin-api.ts`). The middleware implements the `/api/*` surface in the same Node process as the dev server. The SPA calls `fetch('/api/...')` exactly as it will in Phase 2; the server implementation differs but the wire contract does not.

- **One process.** No separate admin-api binary in Phase 1. The rate-limit bucket (§7.4) lives in-memory in this process; there is no cross-process contention because the CLI does not fetch adapters.
- **Wire contract identical to Phase 2.** Every request/response goes through Zod parse on both sides. Admin's browser code never imports filesystem APIs, Node-only modules, or the adapter registry directly. It only uses `fetch`.
- **Middleware plugin scope:** registered only on `apps/admin`'s Vite dev server. `apps/public`'s Vite server has no such middleware; the public app is read-only and consumes only `data/published/current.v1.json`.
- **Production admin:** the middleware plugin is **not bundled** into any container image (`apps/admin` is never built for production in Phase 1). Phase 2 replaces the middleware with a real Hono service (see §8).

The handler modules live at `apps/admin/server/*.ts` and are imported by the middleware plugin. Every handler uses the Zod request/response schemas from `packages/schema/api/*.ts` (Section 8.4.1).

---

## 4. Data Model & Schema (`packages/schema`)

### 4.1 Split documents

Two document types (per CMS reviewer decision D1):

**`Resort`** (durable; published):
```ts
{
  schema_version: 1,
  slug: ResortSlug,                // /^[a-z0-9-]{1,64}$/
  name: LocalizedString,           // { en: string }
  country: ISOCountryCode,         // EU only
  region: LocalizedString,
  altitude_m: { min: number, max: number },
  slopes_km: number,
  lift_count: number,
  skiable_terrain_ha: number,
  season: { start_month: number, end_month: number },
  publish_state: PublishState,     // 'draft' | 'published' in Phase 1
  field_sources: Record<string, FieldSource>
}
```

**Note on analyst notes.** `analyst_note` does NOT live on the published `Resort`. It is admin-internal and persisted in a separate workspace file `data/admin-workspace/<slug>.json`, never touched by the publish pipeline, never shipped in `current.v1.json`. Treating it as admin-only in both schema and storage avoids accidental publication of internal commentary.

**`ResortLiveSignal`** (volatile):
```ts
{
  schema_version: 1,
  resort_slug: ResortSlug,
  observed_at: ISODateTimeString,
  fetched_at: ISODateTimeString,
  snow_depth_cm?: number,
  lifts_open?: { count: number, total: number },
  lift_pass_day?: Money,           // { amount, currency: 'EUR' }
  forecast_next_7d?: Array<{ date: string, snow_cm: number }>,
  lodging_sample?: { median_eur: Money, sample_size: number },
  field_sources: Record<string, FieldSource>
}
```

### 4.2 Branded types (via Zod `.brand()`)

All branded types are derived from Zod schemas using `.brand<'Name'>()`. No hand-rolled nominal brands coexist with Zod brands.

```ts
const ResortSlug = z.string().regex(/^[a-z0-9-]{1,64}$/).brand<'ResortSlug'>();
const UpstreamHash = z.string().regex(/^[a-f0-9]{64}$/).brand<'UpstreamHash'>();
const ISOCountryCode = z.string().length(2).brand<'ISOCountryCode'>();
const ISODateTimeString = z.string().datetime({ offset: true }).brand<'ISODateTimeString'>();

export type ResortSlug = z.infer<typeof ResortSlug>;
export type UpstreamHash = z.infer<typeof UpstreamHash>;
// etc.
```

**Constructor contract:** callers obtain a branded value only via `Schema.parse(raw)` or `Schema.safeParse(raw)`. `urlState.ts` parses URL params through these schemas; no ad-hoc `as ResortSlug` casts anywhere. This is enforced via code review; if `as BrandedType` patterns appear, add a `no-restricted-syntax` entry in `eslint.config.js` (standard ESLint, no custom plugin needed).

Round-trip through `JSON.stringify` + `Schema.parse` is safe: the underlying runtime value is a plain string; `parse` re-brands.

### 4.3 Shared primitives

```ts
type Money           = { amount: number; currency: 'EUR' };   // Phase 1 literal
type LocalizedString = { en: string };                         // Phase 2 widens additively
type MarkdownString  = string & { readonly __brand: 'MarkdownString' };
type FieldSource     = {
  source: SourceKey;                                          // discriminated union literal
  source_url: string;                                         // https: only
  observed_at: ISODateTimeString;                             // per-value
  fetched_at: ISODateTimeString;                              // per-response
  upstream_hash: UpstreamHash;                                // sha256(raw bytes pre-parse)
  attribution_block: LocalizedString;                         // Markdown, rendered verbatim
  fx?: FxProvenance;                                          // present iff upstream priced in non-EUR; see §4.3.1 + ADR-0003
};

// §4.3.1 — FX provenance for non-Eurozone Money fields
type FxProvenance = {
  source: 'ecb-reference-rate';                               // Phase 1: ECB daily reference rate is the only acceptable source
  observed_at: ISODateTimeString;                             // the date the rate was published (ECB rates are end-of-day TARGET)
  rate: number;                                               // EUR per native unit, e.g. 0.231 for PLN→EUR on a given day
  native_amount: number;                                      // amount in the upstream's native currency
  native_currency: 'PLN' | 'CZK' | 'CHF' | 'GBP' | 'NOK' | 'SEK' | 'DKK' | 'HUF' | 'RON' | 'BGN'; // EU + Switzerland + UK; widen via schema_version bump
};
```

Worked example — a Špindlerův Mlýn `lift_pass_day` priced in CZK, converted to EUR via ECB reference rate:

```ts
// Example FieldSource for a Špindlerův Mlýn lift_pass_day priced 1500 CZK on 2026-04-26.
// ECB reference rate for that day was ~0.04 EUR/CZK, yielding a published Money.amount of 60 EUR.
const example: FieldSource = {
  source: 'resort-feed',
  source_url: 'https://www.skiareal.cz/en/lift-passes',
  observed_at: '2026-04-26T08:00:00Z',
  fetched_at: '2026-04-26T08:00:01Z',
  upstream_hash: '...',
  attribution_block: { en: 'Source: Špindlerův Mlýn official feed (CZK; converted to EUR via ECB reference rate)' },
  fx: {
    source: 'ecb-reference-rate',
    observed_at: '2026-04-26T16:00:00Z',                      // ECB publishes ~16:00 CET
    rate: 0.04,
    native_amount: 1500,
    native_currency: 'CZK',
  },
};
```

The validator (§4.5 + Epic 5 PR 5.x) enforces: any `Money` field whose `FieldSource.source !== 'manual'` AND whose source is known to price natively in non-EUR currency MUST carry `fx`. For `source: 'manual'` the `fx` block is OPTIONAL but recommended; the seed fixture in PR 2.1 demonstrates it on the two non-Eurozone resorts. (Per the ai-clean-code-adherence audit, the table + enforcement branch are deferred from Epic 2 PR 2.2 to Epic 5 PR 5.x — Phase 1 has zero non-EUR adapter sources to enforce against; PR 2.2 ships only FX-math sanity on already-present `fx`.)

### 4.4 `METRIC_FIELDS` const

A hand-maintained flat union of dot-path string literals covering every metric field across both document types:

```ts
export type MetricPath =
  | 'altitude_m.min' | 'altitude_m.max' | 'slopes_km' | 'lift_count'
  | 'skiable_terrain_ha' | 'season.start_month' | 'season.end_month'
  | 'snow_depth_cm' | 'lifts_open.count' | 'lifts_open.total'
  | 'lift_pass_day' | 'lodging_sample.median_eur';

export const METRIC_FIELDS: readonly MetricPath[] = [
  'altitude_m.min', 'altitude_m.max', 'slopes_km', 'lift_count',
  'skiable_terrain_ha', 'season.start_month', 'season.end_month',
  'snow_depth_cm', 'lifts_open.count', 'lifts_open.total',
  'lift_pass_day', 'lodging_sample.median_eur'
] as const;
```

At ~12 fields this is maintainable by hand; a typo in the array that's not in the union fails type-check. A recursive `DotPaths<T>` type-generator was considered but rejected: it's a significant `tsc` compile-time cost for a property — "don't add a metric field without listing it here" — that's cheaper to enforce with code review at current scale. If `METRIC_FIELDS` grows past ~30 entries or the two schemas gain deep nesting, revisit.

`validatePublishedDataset` asserts coverage: every record's `field_sources` keys are a superset of every `METRIC_FIELDS` entry that has a non-null value.

### 4.5 Publish-time invariants

- Every URL field matches `^https:`.
- Every `ResortSlug` matches `/^[a-z0-9-]{1,64}$/`.
- Every `Money.currency === 'EUR'` in Phase 1. Adapters for non-Eurozone EU resorts MUST convert native currency → EUR using a daily ECB reference rate **before** producing `Money` values, and MUST attach the FX provenance to the corresponding `FieldSource.fx` sub-object (§4.3.1). From Epic 5 onward the validator enforces presence of `fx` on any non-`'manual'` `FieldSource` whose adapter is registered in `packages/schema/src/fx.ts` as non-EUR-native (the table + enforcement branch land in Epic 5 PR 5.x with the first real non-EUR adapter; per ADR-0003).
- Every `ResortLiveSignal.observed_at` is within the last 14 days for `status=ok`, within 30 days for `status=stale`, else `status=failed` (driven by per-field TTLs in `config/freshness.ts`).
- `schema_version === 1` on every record.
- **publish_state guard:** `validatePublishedDataset` asserts `publish_state ∈ {'draft', 'published'}`. The enum has exactly those two values in Phase 1, so this is belt-and-braces — but it catches accidental widening by a future PR before the workflow is designed.

### 4.5.1 Published JSON layout

`data/published/current.v1.json` has this top-level shape:

```ts
{
  schema_version: 1,
  published_at: ISODateTimeString,
  resorts: Resort[],               // durable documents
  live_signals: ResortLiveSignal[], // volatile documents
  manifest: {
    resort_count: number,
    generated_by: string,           // CLI version + host fingerprint (host fingerprint = sha256 of hostname, not PII)
    validator_version: string       // schema_version + validator hash
  }
}
```

Readers join `resorts[i]` with `live_signals[j]` by `slug === resort_slug`. Zod validates the whole envelope; join logic lives in `packages/schema/loadResortDataset.ts` (see §5).

### 4.6 Validation ordering

All ingest paths (adapter response, admin POST, migration import) follow: **parse → Zod validate → archive raw → persist workspace**. Raw bytes are archived **before** parsing for debugging; persistence happens **after** validation passes. Validation failure logs `upstream_hash` + `zod_issues` and does not write to the workspace.

---

## 5. Data projection (lives in `packages/schema`)

Originally planned as a separate `packages/selectors` package. Collapsed into `packages/schema` for MVP scale: the two files (`loadResortDataset.ts`, `ResortView` projection) are small enough that a separate package adds ceremony without a corresponding benefit. If the projection grows past ~300 lines or acquires app-specific variants, split it back out.

### 5.1 `ResortView`

The projection layer between raw records and the UI. Projectors return discriminated-union field states:

```ts
type FieldValue<T> =
  | { state: 'never_fetched' }
  | { state: 'fresh', value: T, source: SourceKey, observed_at: ISODateTimeString }
  | { state: 'stale', value: T, source: SourceKey, observed_at: ISODateTimeString, age_days: number };

type ResortView = {
  slug: ResortSlug;
  name: LocalizedString;
  country: ISOCountryCode;
  // durable
  altitude_m: FieldValue<{ min: number, max: number }>;
  slopes_km: FieldValue<number>;
  lift_count: FieldValue<number>;
  // live
  snow_depth_cm: FieldValue<number>;
  lifts_open: FieldValue<{ count: number, total: number }>;
  lift_pass_day: FieldValue<Money>;
  // ...
};
```

### 5.1.1 Relationship to admin-side `FieldStateFor<T>`

The admin editor uses a superset projection, `FieldStateFor<T>`, because it carries edit-mode state the public app never sees:

```ts
type FieldProvenance = {               // shared base
  source: SourceKey;
  observed_at: ISODateTimeString;
  fetched_at: ISODateTimeString;
  upstream_hash: UpstreamHash;
  attribution_block: LocalizedString;
};

type FieldStateFor<T> = {
  mode: 'auto' | 'manual';
  value: T;
  manual_value?: T;
  status: 'ok' | 'stale' | 'failed' | 'manual';
  provenance?: FieldProvenance;        // absent when mode='manual' or status='never'
};
```

`packages/schema` exposes `toFieldValue<T>(state: FieldStateFor<T>): FieldValue<T>` with the mapping:

| admin `status` | public `state` |
|---|---|
| `ok` | `fresh` |
| `stale` | `stale` |
| `failed` | `never_fetched` (public app doesn't show failed states; they become "missing") |
| `manual` | `fresh` (manually set values are treated as fresh; source is `manual`) |

The admin → public conversion runs at publish time; the public app never sees `FieldStateFor<T>`.

### 5.2 `loadResortDataset`

Reads `data/published/current.v1.json`, Zod-parses, joins durable + live by slug, computes `FieldValue` states from TTLs. Returns `ResortView[]`.

### 5.3 Package DAG (enforced by ESLint)

```
packages/schema         (leaf — zero workspace deps; includes loadResortDataset + ResortView)
   ↑
packages/design-system  (depends only on schema)
   ↑
packages/integrations   (depends only on schema)
   ↑
apps/public             (depends on schema, design-system)
apps/admin              (depends on schema, design-system, integrations)
```

`format.ts` in `packages/design-system` accepts only primitive types from `schema` (`Money`, `LocalizedString`, `ISODateTimeString`). `FieldValueRenderer<T>` accepts `FieldValue<T>` from schema. Standard ESLint `no-restricted-imports` (configured in `eslint.config.js`) blocks cross-layer violations in CI.

---

## 6. Design System (`packages/design-system`)

### 6.1 Tokens

**Source of truth:** `packages/design-system/tokens.ts` (TypeScript const objects). Three branded types where type-level discipline earns its keep: `ColorToken`, `SpaceToken`, `BreakpointToken`. Other token scales (`zIndex`, `radius`, `shadow`, `duration`, `fontWeight`, `fontSize`) are plain strings/numbers until there's an actual bug pattern the extra brand would catch.

**Generated artifact:** `packages/design-system/tokens.css` (CSS custom properties, `:root` + dark scope). Header comment on generated file: `/* GENERATED — do not edit; edit tokens.ts and run npm run tokens:generate */`.

**Enforcement:** pre-commit hook calls `npm run tokens:generate`. CI runs `npm run tokens:generate && git diff --exit-code packages/design-system/tokens.css`. Drift fails the PR.

### 6.2 Spacing scale

4pt base: `xs=4, sm=8, md=12, lg=16, xl=24, 2xl=32, 3xl=48, 4xl=64`.

### 6.3 ESLint configuration

**Strict from Day 1.** All rules ship at `severity: 'error'` in the first PR that introduces them (Epic 1 PR 1.6). No staged rollout, no rules at `warn`, no "add when a violation appears" policy. The reasoning is agentic-development discipline: code is frequently generated by agents, and strict lint is the only reliable mechanism to prevent drift from project conventions. A rule that's not enforced is a rule that will decay the moment attention moves elsewhere.

Enforcement is configured in `eslint.config.js` using standard ESLint rules where they cleanly express the constraint; a minimal custom plugin is added only if a rule genuinely needs semantic logic that `no-restricted-syntax` can't express. The rule catalog below is the Day-1 set:

**Package dependency discipline:**
- `no-restricted-imports` with per-package `patterns` — enforces the package DAG (§5.3). `packages/integrations` importing from `packages/design-system` fails CI.
- `no-restricted-imports` with deep-import patterns — `packages/design-system/internals/*`, `packages/schema/*/internal/*` etc. are banned from consumers; only package-root imports (plus explicitly public sub-paths like `packages/design-system/format`) are allowed.

**Branded-type discipline (§4.2):**
- `no-restricted-syntax` with selector `TSAsExpression[typeAnnotation.typeName.name=/^(ResortSlug|UpstreamHash|ISOCountryCode|ISODateTimeString|ColorToken|SpaceToken|BreakpointToken)$/]` — bans `as Brand` casts outside `packages/schema/` test files. Force callers through `Schema.parse` / `Schema.safeParse`.

**Design-system discipline:**
- `no-restricted-syntax` with `Literal[value=/^#[0-9a-fA-F]{3,8}$/]` and `Literal[value=/^(rgb|rgba|hsl|hsla|oklch)\(/]` in `.tsx` / `.ts` files under `apps/` — bans raw CSS color values outside `packages/design-system/tokens.ts`. Colors must be tokens.
- `no-restricted-syntax` targeting JSX opening elements (`JSXOpeningElement[name.name=/^(button|input|a|dialog|select|textarea)$/]`) outside `packages/design-system/**` — raw HTML elements are banned where a design-system wrapper exists.
- `no-restricted-syntax` matching literal `px` values in `style={{ }}` objects and CSS-in-JS template literals — enforces that spacing, breakpoints, and z-index values come from `tokens.ts`, not inline literals.

**TypeScript strictness** (on top of `tsconfig`):
- `@typescript-eslint/no-explicit-any`, `no-non-null-assertion`, `no-floating-promises`, `consistent-type-imports`, `explicit-function-return-type` all at `error`.
- `@typescript-eslint/no-restricted-types` banning legacy `Object`, `Function`, `{}` types.

**Import hygiene:**
- `import/order`, `import/no-cycle`, `import/no-duplicates` at `error`.

**React:**
- `react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps` at `error`.
- `react/jsx-key` at `error`.

**Style / safety:**
- Existing rules from `CLAUDE.md` Code Rules (no nested ternaries, braces on conditionals, `===`, no `var`, object shorthand, no `else` after return).

**Custom-plugin escape hatch.** If a rule genuinely needs AST-cross-referencing (e.g., "this string literal must be a member of `METRIC_FIELDS`"), a minimal workspace plugin is added at that time — one rule per file, unit-tested, reviewed as its own PR. The default position is "standard ESLint first"; the custom plugin exists only when a standard rule can't express the check.

**Regression prevention.** `npm run lint` is part of `npm run qa` (the hard gate). A PR that introduces a lint regression fails CI. The pre-commit hook runs `npm run qa`; `--no-verify` is forbidden (CLAUDE.md DCO section).

### 6.4 Components

Hand-built: `Button`, `IconButton`, `Input`, `TextArea`, `Select`, `ToggleButtonGroup`, `Chip`, `Pill`, `StatusPill`, `SourceBadge`, `Card`, `Table`, `EmptyState`, `LoadingState`, `Shell`, `Sidebar`, `HeaderBar`, `FieldValueRenderer<T>`.

**`FieldValueRenderer<T>`** encapsulates the 3-branch narrowing required by `FieldValue<T>` (from `packages/schema`):
```ts
<FieldValueRenderer
  field={view.slopes_km}
  formatter={formatNumber}
  unit="km"
  missingLabel="—"
  missingTooltip="no data yet"
/>
```
Renders the value with `SourceBadge` + `observed_at` tooltip in `fresh`/`stale` states; renders the missing indicator in `never_fetched` state. Used in both card view and matrix view.

**`SourceBadge` (bundled glyphs only).** The badge renders a bundled per-source glyph from the design system, plus a source name label. It NEVER fetches upstream favicons (would violate CSP `img-src` and zero-tracking, and risks trademark/logo reproduction). New sources must ship a bundled glyph in `packages/design-system/icons/sources/<source>.svg`.

Radix UI primitives (a11y-heavy): `Dialog` (also used by `ShortlistDrawer` with side-sheet styling — a drawer is a drawer-styled Dialog, not a new primitive), `DropdownMenu`, `Popover`, `Tooltip`, `Tabs`, `Toast`. Wrapped at `packages/design-system/primitives/*` so consumers never touch Radix directly.

### 6.5 Storybook + visual regression (deferred to Epic 6)

Storybook, Playwright visual regression, and the `visual:approve` label workflow are **deferred to Epic 6 (stabilization)**. Rationale: visual regression before the UI has a stable baseline produces noise (every intentional UI change fails the visual check), and for a 5-resort MVP the return on that ceremony is low. Integration tests plus axe-core-per-route cover the Phase 1 quality bar.

When Epic 6 activates this:
- `.storybook/` at repo root. `@storybook/test-runner` in CI.
- `@storybook/addon-a11y` on every story.
- Playwright visual regression at 360×780, 900×780, 1280×900.
- `visual:approve` label from a CODEOWNER gates any PR with a non-zero diff.

### 6.6 Integration harness

`tests/integration/harness.ts` — shared Vitest + MSW + Testing Library + `@axe-core/playwright` setup. Default viewport: 360×780 (mobile-first). Per-app route tests in `tests/integration/apps/public/*.test.ts` and `tests/integration/apps/admin/*.test.ts`.

---

## 7. Integration Adapter Architecture (`packages/integrations`)

### 7.1 Adapter contract

```ts
interface Adapter<Source extends SourceKey> {
  readonly source: Source;
  readonly fields: AdapterFieldSet;                              // which field paths this adapter emits
  readonly rateLimit: { tokens_per_window: number; window_ms: number };
  readonly maxResponseBytes: number;
  fetch(ctx: AdapterContext): Promise<AdapterResult>;
}

type AdapterContext = {
  requestId: string;
  traceparent: string;
  dryRun: boolean;                                               // admin "Test" action
  resort_slug: ResortSlug;
};

type AdapterResult =
  | { ok: true;
      values: Partial<ResortFields>;
      sources: Partial<FieldSourceMap>;
      upstream_hash: UpstreamHash }
  | { ok: false; error: AdapterError };

type AdapterError =
  | { code: 'rate_limited';      retry_after_ms: number }
  | { code: 'not_found' }
  | { code: 'upstream_5xx';      status: number }
  | { code: 'upstream_4xx';      status: number; body_sample: string }  // redacted
  | { code: 'schema_mismatch';   zod_issues: ZodIssue[]; upstream_hash: UpstreamHash }
  | { code: 'timeout' }
  | { code: 'ssrf_blocked';      reason: string }
  | { code: 'response_too_large'; bytes: number }
  | { code: 'unknown_error';     cause: unknown; message: string };
```

**Adapters never throw.** `unknown_error` is the catch-all for unexpected runtime failures; it is typed, not string-tagged. All error variants use the `code` discriminator (uniform switch statements, `noFallthroughCasesInSwitch` narrows correctly).

**FX conversion** — adapters that fetch prices in a non-Eurozone currency (PLN, CZK, CHF, GBP, NOK, SEK, DKK, HUF, RON, BGN) MUST convert to EUR before populating `AdapterValueMap` and MUST emit `FieldSourceMap[<path>].fx` for every Money-typed field they produce. The conversion source is fixed to the ECB daily reference rate in Phase 1; alternative sources require a schema_version bump. See ADR-0003 for rationale and the alternatives considered.

### 7.2 Registry (exhaustive typing)

```ts
type SourceKey = 'opensnow' | 'resort-feed' | 'booking' | 'airbnb' | 'snowforecast';

type Registry = { [K in SourceKey]: Adapter<K> };
```

Mapped-type registry makes it a compile-time error to add a `SourceKey` without an adapter.

### 7.3 Constrained HTTP dispatcher

`packages/integrations/http/constrainedDispatcher.ts` wraps `undici`. The dispatcher is delivered in two stages so the hardening cost lands with the code that actually makes HTTP calls:

**Stage 1 — Baseline (Epic 5 PR 5.1, before any real adapter):**
- **SSRF blocklist:** deny RFC1918 (10/8, 172.16/12, 192.168/16), loopback (127/8, ::1), link-local (169.254/16, fe80::/10), CGNAT (100.64/10), ULA (fc00::/7), cloud-metadata IPs (169.254.169.254, metadata.google.internal, AWS IMDS v2 token endpoint), multicast (224/4, ff00::/8), reserved ranges.
- **Size cap:** `maxResponseBytes` enforced via streaming byte counter; truncation yields `response_too_large`.
- **Time cap:** per-adapter timeout (default 10s, max 30s); applies to connect + TLS handshake + full body.
- **Required `User-Agent`:** `SnowboardTripAdvisorBot/<version> (+<contact-url>)` — contact URL is operator-configured.

**Stage 2 — Hardening (Epic 5 PR 5.2, rolled in with the first real HTTP-issuing adapter):**
- **DNS pinning + SNI:** resolve once per request via `dns.lookup` with `all: true`. Each candidate IP is normalized (canonicalization below) and matched against the SSRF blocklist; any blocked candidate fails the request closed (no "try the next one"). The first non-blocked IP is pinned for the connect leg. The TLS `servername` retains the original hostname (SNI preserved).
- **Per-request Agent instance** with `keepAliveTimeout: 1`, `pipelining: 0`, `connections: 1`. No connection pooling across requests. Prevents DNS rebinding via keep-alive.
- **Address canonicalization** (before blocklist check): IPv4-mapped IPv6 `::ffff:v4.v4.v4.v4` → `v4.v4.v4.v4`; IPv6 `::` and `::1` recognized as loopback-equivalent; `0.0.0.0/8` rejected (Linux routes to loopback); `255.255.255.255` and directed broadcasts rejected; `64:ff9b::/96` NAT64 synthesized addresses rejected unless target v4 is public.
- **Redirects:** a 3xx response re-runs DNS resolution + canonicalization + blocklist check on the redirect target (no IP pin reuse). Redirect target that resolves to a blocked IP fails the request closed.

Rationale for the two-stage split: Phase 1 stubs return frozen `as const` values and make no HTTP calls, so the Stage 2 hardening (DNS rebinding prevention, IPv6 address canonicalization, NAT64 edge cases) has no attack surface to protect against until Stage 2 code actually exists. Landing the hardening with the first real HTTP caller keeps the diff reviewable and the tests concretely exercisable.

### 7.4 Rate limiting

**In-memory, per-process, admin-only.** Phase 1 CLI does **not** fetch adapters (see §7.9); all live fetches go through the admin process, so there is only one bucket per source and no shared-state problem to solve.

- Implementation: token-bucket per `SourceKey` in `packages/integrations/rateLimit.ts`. Tokens replenished on a monotonic clock.
- Bucket lives in module-scope state inside the admin-api handler module. A Vite dev-server restart resets it — acceptable in Phase 1.
- The rate-limit interface is the same one Phase 2 will satisfy; the Phase 2 implementation swaps the in-memory bucket for a shared store (Redis `CL.THROTTLE` is the likely choice if multiple admin instances run concurrently). No call-site changes.
- `config/rateLimits.ts` defines per-source `tokens_per_window` and `window_ms`.

### 7.5 Audit archive

Every fetch (response OR error) archived at `data/integrations/audit/<source>/<resort_slug>/<ISO-ms>-<request_id>.json`:
- Request: URL, method, headers (allowlist), body (if POST).
- Response: status, headers (allowlist), raw bytes (pre-parse), `upstream_hash`, `fetched_at`.
- Parse outcome: `ok: true` + parsed shape, or `ok: false` + error + Zod issues if applicable.

**Retention:** configurable via `config/retention.ts` (Zod-validated bounds). Default values: 30 days OR 100 most recent per source per resort, whichever is stricter (i.e. whichever deletes more). Operators with DPO / TOS compliance needs can widen to 6-12 months; operators with tight disk budgets can tighten to 7 days / 25 entries. CI size budget: audit archive <100 MB (configurable in the same file).

**Validate-before-persist ordering:** adapter response is parsed and Zod-validated **before** archiving. If validation fails, the raw bytes + `zod_issues` + `upstream_hash` are still archived (diagnosis path), but the workspace is not updated.

### 7.6 Fixture recording

- `RECORD_ALLOWED=true` environment variable required at process boot AND at adapter level. Missing → `test:adapter --record` fails closed.
- **`RECORD_ALLOWED` scope:** consulted **only** by `research/cli.ts`'s boot path and `packages/integrations/contract.ts`'s adapter gate. Apps and other packages must ignore the variable. The scope is maintained by code review and a clear module boundary; no meta-grep-test is run against it (the rule is simple enough that a test is over-engineered ceremony).
- Mocks in tests unconditionally allowed (no env gate on `*.test.ts`).
- Recorded fixtures at `packages/integrations/adapters/<source>/__fixtures__/<case>.json`.
- **Recording fallback.** If live recording fails (upstream rate-limit, outage, 5xx burst), the adapter's fixture directory may include hand-crafted synthetic fixtures tagged `{"synthetic": true, "notes": "..."}` in the fixture envelope. Synthetic fixtures are valid for CI but tracked in a follow-up issue to replace with real recordings when upstream returns. CI reports synthetic-fixture coverage per adapter; Epic 5 acceptance requires >70% real (non-synthetic) fixtures.
- **PII redaction:** per-adapter `redaction.ts` scrubs headers (email, phone, authorization, cookie, set-cookie, x-api-key patterns) + body (email/phone/token/IPv4/UUIDv4 regex + API-key-echo patterns + nested-JSON fields named `email`, `contact`, `owner`, `reporter`, `user_id`). A shared redaction-corpus test harness at `packages/integrations/audit/redaction.corpus.test.ts` runs synthetic-but-realistic responses per adapter category (JSON-REST, HTML, RSS/XML) through the redactor, asserting no email/phone/UUID/IPv4 survives. Coverage tracks the redaction rule set, not just the scrubber code.
- **Fixture size budget:** <50 KB per fixture; CI fails if exceeded.

### 7.7 `body_sample` redaction

`AdapterError.upstream_4xx.body_sample` is the first 512 bytes of the response body, post-redaction. Each adapter registers its API-key-echo patterns (e.g., `"api_key":"..."`, `Authorization: Bearer ...`) for scrubbing. Unit tests assert redaction on known problematic responses.

### 7.8 Stubs in Phase 1

Initial adapters for `opensnow`, `resort-feed`, `booking`, `airbnb`, `snowforecast` are stubs that return frozen `as const` values + `sources[*].status = 'manual'`. Real implementations land in Epic 5, behind the same contract.

### 7.9 CLI integration

`research/cli.ts` is **not an adapter-fetch surface in Phase 1.** Live fetches happen only inside the admin process (Sync / Test buttons in the resort editor, §3.6). Keeping the CLI fetch-free removes the only reason to share a rate-limit bucket across processes and keeps `RECORD_ALLOWED` scoped narrowly.

CLI commands in Phase 1:
- `test:adapter <source> --resort <slug> [--record]` — probes one adapter in isolation; `--record` writes a fixture (requires `RECORD_ALLOWED=true`). This is a **developer tool**, not a data-refresh path; it writes fixtures, not the workspace.
- `migrate:v0-to-v1` — one-shot migration (see Section 10).
- `publish` — validate and publish the current admin workspace (no network I/O).

Bulk refresh commands (`refresh:snow`, `refresh:lifts`, `refresh:all`) are **deferred to Phase 2**, where they naturally belong to BullMQ-scheduled jobs rather than a CLI invocation.

---

## 8. Phase 2 Target State

**Phase 2 is a target, not part of this spec's implementation scope.** This section records intent and the stable contract that survives the Phase 1 → Phase 2 transition. Concrete architecture decisions (exact libraries, deployment topology, observability stack) are deferred to a dedicated Phase 2 spec written when Phase 2 actually starts.

### 8.1 Intent

Phase 2 extends the Phase 1 single-maintainer filesystem build into a deployable product that supports:
- multi-operator deployments (one codebase, many operators running their own instance);
- authenticated admin users (more than one editor per deployment);
- durable persistence (Postgres-backed, not filesystem-backed);
- automated refresh cadences (scheduled adapter fetches rather than manual Sync clicks).

The durable-vs-live split (§4), the adapter contract (§7), and the `/api/*` contract (§8.4) all carry over unchanged. What changes is the backing store and the deployment shape — not the wire contract the admin UI speaks.

### 8.2 Target stack sketch (subject to revision at Phase 2 kickoff)

The current intent, pending a dedicated Phase 2 spec:

- **Admin API:** **Hono** on Node, single process. Hono was chosen over Fastify because it's lighter, has first-class Zod integration, and keeps the MVP deploy target simple (one process, one container). Fastify remains a reasonable alternative if more built-in plugin ergonomics are needed later.
- **Data store:** **Postgres** via **Drizzle ORM**. Append-only versioning for published datasets; audit-log table; no sharding at MVP scale.
- **Auth:** **Better Auth** (TypeScript-native, actively maintained). Lucia was the earlier working assumption but was deprecated by its author in 2025, so it is not an option. Auth.js v5 and hosted solutions (Clerk, WorkOS) are fallbacks if Better Auth doesn't fit.
- **Sessions:** Postgres-backed, `HttpOnly; Secure; SameSite=Lax; __Host-` cookies. CSRF via double-submit token. Refresh-token rotation with family-reuse detection is required (OAuth 2.1 model) but the implementation detail lives in the Phase 2 spec.
- **Not in the Phase 2 MVP:**
  - **Redis** — only added when >1 admin instance runs concurrently and an in-process rate-limit bucket is no longer sufficient.
  - **BullMQ** — only added when adapter-fetch cadence outgrows inline request handling (long-running jobs, retries across restarts).
  - **S3** — only added when the filesystem audit archive outgrows Postgres's practical size envelope.

These components are deferred on purpose. Adding them before there's observable pressure is a maintenance tax without a corresponding benefit. Each has a natural swap-in point behind an existing interface (rate-limit bucket, job queue, archive writer).

### 8.3 Deferred Phase 2 decisions

Decisions explicitly **not** made in this spec; each belongs to the Phase 2 spec:

- Exact deployment target (self-hosted container, managed Postgres provider, k8s vs single-box).
- Secrets management backend (KMS / Vault / SOPS / env-var).
- Observability stack (`pino` + OpenTelemetry is the current assumption).
- RBAC role set beyond the placeholder columns in the Phase 1 schema.
- Per-resort publish workflow (triggered at the >25-resort threshold per §8.6).
- Field-level review/comments workflow for editorial teams.
- Preview-token format (Ed25519 is the current assumption).

Recording them here so Phase 2 planning has a seed list, not a blank page.

### 8.4 `/api/*` contract stability

The Phase 1 `/api/*` surface consumed by `apps/admin` is the **stable contract** across the Phase 1 → Phase 2 transition. Phase 2 re-implements it verbatim on top of Hono + Drizzle + Postgres. The admin UI code does not change at the boundary; only its backing store does.

#### 8.4.1 `/api/*` contract inventory

The inventory below is the **Phase 1 implementation scope** — endpoints the admin UI actually calls. Phase 2-only endpoints (auth, audit read surface, preview tokens) are listed separately so Phase 2 planning has a seed list, but they are not implemented or schema'd in Phase 1.

Every Phase 1 endpoint has a Zod request/response schema pair in `packages/schema/api/*.ts`. Role and rate-limit class are recorded for Phase 2; in Phase 1 role checks are no-ops and the rate-limit class is advisory.

**Phase 1 implemented surface:**

| # | Method + path | Request schema | Response schema | Role (P2) | RL class (P2) |
|---|---|---|---|---|---|
| 1 | `GET /api/resorts` | `ListResortsQuery` (filters, pagination) | `ListResortsResponse` (resort summaries) | `editor` | read |
| 2 | `GET /api/resorts/:slug` | `ResortSlugParam` | `ResortDetailResponse` (full durable + latest live + per-field state) | `editor` | read |
| 3 | `PUT /api/resorts/:slug` | `ResortUpsertBody` (durable fields) | `ResortDetailResponse` | `editor` | write |
| 4 | `POST /api/resorts/:slug/test-adapter/:sourceKey` | `TestAdapterBody` (no body Phase 1) | `TestAdapterResponse` (`AdapterResult` passthrough) | `editor` | external |
| 5 | `POST /api/resorts/:slug/sync/:sourceKey` | `SyncBody` (field-list scope) | `SyncResponse` (updated fields + new observed_at) | `editor` | external |
| 6 | `POST /api/resorts/:slug/publish` | `PublishBody` (all-or-nothing Phase 1) | `PublishResponse` (version id, archive path) | `publisher` | write |
| 7 | `GET /api/publishes` | `ListPublishesQuery` | `ListPublishesResponse` (version history) | `editor` | read |
| 8 | `GET /api/health` | `HealthQuery` (none) | `HealthResponse` (adapter freshness, archive size) | `editor` | read |
| 9 | `GET /api/analyst-notes/:slug` | `ResortSlugParam` | `AnalystNoteResponse` (Markdown body, sanitized HTML preview) | `editor` | read |
| 10 | `PUT /api/analyst-notes/:slug` | `AnalystNoteBody` | `AnalystNoteResponse` | `editor` | write |

**Phase 2 additions (not schema'd in Phase 1):** `GET /api/audit` + `GET /api/audit/:id` (audit read surface, belongs with RBAC), `POST /api/preview-tokens` (sharing draft resorts — no sharing in loopback), and the auth triplet `POST /api/auth/login` / `logout` / `refresh`.

**Contract invariants enforced by CI:**
1. Every Phase 1 endpoint has a Zod schema pair in `packages/schema/api/*.ts`.
2. `apps/admin` fetches go through a single typed client generated from those schemas (no ad-hoc `fetch` calls outside the client).
3. A contract snapshot test serializes the schema set to JSON and diffs against `packages/schema/api/__snapshots__/contract.snap`. Changes require maintainer review.
4. Phase 2 route registration uses the same Zod schemas — route registration fails to compile if the admin UI's expected shape diverges.
5. `GET`/`HEAD` are idempotent and safe; `POST`/`PUT` carry `Idempotency-Key` headers on destructive operations (publish, sync) in Phase 2.

**Phase 1 specifics:**
- All endpoints served by `apps/admin/server/*.ts` via the Vite middleware plugin (§3.11).
- Role checks are no-ops in Phase 1 (loopback-only, no auth); the role column is populated so Phase 2 can flip them on without schema churn.
- Rate-limit class is advisory in Phase 1 (in-memory bucket per §7.4); Phase 2 enforces via a shared store when multi-instance.

### 8.5 Preview tokens

Signed preview tokens for draft-resort sharing are a Phase 2 concept only — Phase 1 has no sharing surface (loopback admin). The endpoint is not schema'd in Phase 1; it appears in the Phase 2 addition list in §8.4.1. Signing algorithm (Ed25519 is the current assumption) is a Phase 2 decision.

### 8.6 Per-resort publish

Activated when the resort count crosses 25 (§12 decision 3). Per-resort publish regenerates `current.v1.json` atomically by composing all `published`-state rows for the operator's dataset. Until the threshold is crossed, all-or-nothing publish from Phase 1 is retained.

---

## 9. Phase 1 Epic Breakdown

Six epics, ~30 PRs. Each epic completes independently; the quality gate stays green throughout.

### Epic 1 — Workspace + schema + adapter contract + design-system + CSP + harness + ESLint

**Status: DONE — merged in PR #6 (commit `2fbf087`).** Delivered: npm workspaces layout, `tsconfig.base.json` with `exactOptionalPropertyTypes: true`, `vitest.workspace.ts`; `packages/schema/` (Zod schemas, branded types, `METRIC_FIELDS`); `packages/integrations/` (adapter contract + mapped-type registry + 5 stubs); `packages/design-system/tokens.ts` + generated `tokens.css` + drift check; `config/csp.ts`; `tests/integration/harness.ts`; ESLint flat config enforcing the package DAG (§5.3). The canonical reference for what shipped is the merged commit and `packages/*/src/`; agents should not reconstruct the PR-by-PR breakdown from this spec.

### Epic 2 — Data migration

**Status: DONE — merged in PR #9 (commit `1aca19e`).** Delivered: spec amendment (seed list + FX-provenance shape) + ADR-0003 (FX conversion at adapter boundary); `data/published/current.v1.json` for the two seed resorts (`kotelnica-bialczanska`, `spindleruv-mlyn`); `validatePublishedDataset` (FX math sanity + METRIC_FIELDS coverage + envelope-instant ordering); `publishDataset` (atomic writes + monotonic counter under O_EXCL lock wrapping the entire publish lifecycle); `loadResortDataset` + `ResortView` + `FieldValue<T>`; per-app smoke tests in `apps/{public,admin}/src/App.test.tsx`. **Deviation from §9 PR 2.1 (recorded for traceability):** there was no v0 fixture to migrate, so PR 2.1 authored `current.v1.json` from scratch; `research/migrate/v0-to-v1.ts` is deferred until either a recovered v0 dataset surfaces or `research/cli.ts` returns in Epic 5 PR 5.1. **Deferred per ai-clean-code-adherence audit:** `KNOWN_NON_EUR_SOURCES` table + `fx_provenance_required` enforcement (Epic 5 PR 5.x); `FieldStateFor<T>` + `toFieldValue<T>` (Epic 4 PR 4.4).

### Epic 3 — Public app

Formerly split into two epics (cards+detail, then matrix+shortlist); collapsed because they share package, tests, and reviewer scope.

**PR 3.1** — `apps/public` Vite config + entry + CSP dev plugin wiring + Landing route.
**PR 3.2** — CardView (layout, fields, sort UI) + Source badges + observed_at tooltips + missing-value indicators.
**PR 3.3** — Shortlist drawer + URL-param sync + shortlist cap (6) + merge/replace dialog + clipboard-share with fallback.
**PR 3.4** — MatrixView (hidden-below-md message, highlight-field affordance).
**PR 3.5** — Detail route: durable + live panels, deep-link section with honesty micro-copy + `rel="noopener noreferrer"` + `referrerpolicy="no-referrer"` + `encodeURIComponent` on interpolation.
**PR 3.6** — Integration test pass on every route with axe-core. (Visual regression moves to Epic 6 per §6.5.)

### Epic 4 — Admin app (loopback MVP)

**PR 4.1** — `apps/admin` Vite config (loopback bind) + entry + never-built-in-prod Dockerfile guard.
**PR 4.2** — Shell (Sidebar + HeaderBar) + Dashboard health cards.
**PR 4.3** — Resorts list + filters.
**PR 4.4** — Resort editor (durable + live panels, FieldRow, ModeToggle).
**PR 4.5** — Publish flow (all-or-nothing, UI calls same pipeline as CLI).
**PR 4.6** — Read-only-below-md policy + analyst notes (Markdown-sanitized).

### Epic 5 — Real adapters

**PR 5.1** — Adapter infrastructure in one PR: HTTP dispatcher (`undici` + SSRF blocklist + size/time caps + required UA), in-memory rate-limit bucket per §7.4, audit archive writer (validate-before-persist; 30d / 100-per-resort-per-source retention), and the fixture-recording scaffolding + PII redaction corpus. DNS pinning, address canonicalization, and redirect re-checks land with the first HTTP-issuing adapter (PR 5.2), not before.
**PR 5.2** — Snow-data adapters: OpenSnow + Snow-Forecast with fixtures + redaction rules + dispatcher hardening (DNS pin + canonicalization + redirect re-check) rolled in with the first real HTTP calls.
**PR 5.3** — Resort-feed adapter (durable facts) with fixture + redaction.
**PR 5.4** — Deep-link-only adapters: Booking.com + Airbnb deep-link generators + fixture (no HTTP; the adapters produce external URLs, not data).
**PR 5.5** — CLI `test:adapter` developer command (fixture-recording tool; bulk-refresh commands are deferred to Phase 2 per §7.9).

### Epic 6 — Stabilization, observability, visual discipline

**PR 6.1** — `pino` structured logging + error boundary instrumentation in both apps.
**PR 6.2** — `.size-limit.json` + CI `npm run size` step + Lighthouse CI smoke + performance/a11y audit rollup.
**PR 6.3** — Storybook (`.storybook/` + `@storybook/test-runner` + `@storybook/addon-a11y`) + Playwright visual regression at 360/900/1280 + `visual:approve` label workflow (§6.5).
**PR 6.4** — ADR backfill (0004–0007; 0001/0002/0003 already shipped) + DX polish (commit hooks, codemod utilities). `docs/release-policy.md` is deferred to Phase 2 per §11.2.

### CI/CD

Merge gate on every PR: `qa` + `test:integration` + `test:a11y`. Visual-regression + size-limit land in Epic 6. Image workflow (`.github/workflows/image.yml`) triggers on `release: published` tags on `main`; keeps supply chain (cosign + SLSA v1 + SBOM + Trivy + digest-pinned bases).

---

## 10. Code Disposition & Git Workflow

The original (pre-pivot) file-by-file disposition table and the new-directory bootstrap list have been removed — Epic 1 + Epic 2 executed those changes; the repository tree is now the canonical reference. What remains in this section is the **forward-looking** policy: git migration strategy, preserved invariants, and explicitly-removed rules.

### 10.4 Git workflow (current)

The original spec proposed a long-lived `pivot/data-transparency` integration branch. **In practice Epics 1 + 2 shipped feature branch → PR → `main` directly**, and the integration branch was never enacted. The rules below describe the workflow as it actually works today; if a future epic decides to reintroduce a long-lived branch, this section gets rewritten in the same PR that introduces it.

- **Feature branches** cut from `main`; one PR per logical milestone. Squash-merge on merge to `main` (the `(#N)` suffix style is the convention; see existing merge commits).
- **Branch protection on `main`:** force-push OFF, deletion OFF, linear history ON, conversation resolution ON, required status checks (`quality-gate / qa`, `dco`) ON, signed/DCO-trailed commits required, `enforce_admins: true`. Required-CODEOWNER-review is OFF in Phase 1 (single-maintainer).
- **Hotfix policy:** security hotfixes branch from the latest release tag and land on `main` via the same PR flow. Do not open a hotfix PR against `main` without explicit user authorization for the specific incident.
- **Deletion ordering inside each PR:** demolition commits come after the new path is green; avoids mid-PR CI red.
- **Rollback boundary per epic:** the last PR that demolishes legacy paths is the rollback boundary. Reverting a single PR before that point is a one-PR rollback.

### 10.5 Preserved invariants

From current `CLAUDE.md`, unchanged:
1. Schema first (target is `packages/schema/`).
2. Never bypass `validatePublishedDataset` before `publishDataset`.
3. Provenance always (now enforced by `METRIC_FIELDS` coverage).
4. 100% coverage hard gate.
5. No `/* istanbul ignore */`.
6. TDD order.
7. No `any`, no non-null assertions, explicit return types, `import type`, `const` default, `??` over `||`.
8. No `console` outside `research/cli.ts`, `research/migrate/*.ts`, and scripts under `scripts/` (canonical exception list lives in CLAUDE.md → Code Rules → Style; ESLint enforces via `overrides`).
9. Pre-commit hook runs `qa`; `--no-verify` forbidden.

### 10.6 Removed rules

1. **"Config, not code: scoring thresholds belong in `config/scoring.ts`"** — scoring removed.
2. Any implicit reference to single-module `research/schema.ts` — replaced with `packages/schema/`.

---

## 11. Documentation Policy

The README + CLAUDE.md rewrite plans, license boundary table, ADR numbering table, GitHub meta-file inventory, and per-doc update lists were executed across Epic 1 + Epic 2 (PRs #5, #6, #9). The current state of those files in `main` is the canonical reference; agents should not reconstruct the historical edit lists from this spec. What remains in §11 is the **forward-looking** policy: what's deferred until later phases, and the README-drift enforcement rule.

### 11.1 ADR cadence (forward-looking)

ADR-0001, 0002, 0003 have shipped (`docs/adr/`). The remaining backfill set targets Epic 6 PR 6.4: **0004** URL-state-first + merge/replace on collision; **0005** Design-system tokens as TypeScript; **0006** Apache-2.0 + DCO + zero-tracking; **0007** ADR process itself. Additional ADRs are expected mid-stream during Epic 5 (real-adapter integration raises new decisions — upstream TOS, rate-limit tuning, redaction corpus). Any architectural decision flagged by a reviewer as "needs a writeup" becomes an ADR PR before the epic closes.

### 11.2 Deferred docs (write only when needed)

These were intentionally deferred until a real consumer exists. Open one when the listed trigger fires; not before.

| Path | Trigger to write |
|---|---|
| `GOVERNANCE.md` | A second regular contributor joins. |
| `docs/operator-obligations.md` | A multi-operator Phase 2 rollout begins. |
| `docs/trademark-policy.md` | First inbound trademark question lands. |
| `docs/i18n-policy.md` | A second locale is actually added to `LocalizedString`. |
| `docs/release-policy.md` | Phase 2 publishing of `packages/schema` to npm. |
| `docs/data-ethics.md` | The README "Data & trust posture" section grows past ~150 lines. |
| `SUPPORT.md` | Inbound issue/discussion volume needs triage rules. |
| `docs/local-dev.md` | Epic 5 PR 5.1 — loopback admin / font / Playwright / MSW setup. |
| `docs/admin.md` | The README "Using the admin app" section grows past ~150 lines. |

### 11.3 README-drift enforcement

Treat README drift as a documentation bug, not optional cleanup (rule preserved in `CLAUDE.md`). The PR template carries a "README updated if product scope/workflow/boundary changed — link section or attest N/A" checkbox; the CLAUDE.md "Documentation Discipline" rule is the load-bearing version of the same discipline. A future CI job that diffs README section hashes against product-scope path changes is a plausible addition if checkbox-plus-discipline stops working — not needed at current scale.

---

## 12. Resolved Decisions

All seven decisions flagged in the drafting pass have been resolved with the user. The reasoning is recorded here so future readers can reconstruct why each call was made without having to dig through session history.

### 12.1 Phase 2 tech stack — Hono + Drizzle + Postgres; Redis / BullMQ / S3 deferred

**Resolution:** override the drafting agent's Fastify + Lucia + Postgres + Redis + BullMQ + S3 recommendation. Phase 2's minimum viable target is **Hono + Drizzle + Postgres + Better Auth in a single admin-api process**. Redis (rate limiting, presence), BullMQ (background jobs), and S3 (audit archive) are added **only when observable pressure justifies them** — not as day-one infrastructure.

**Reasoning:**
- Six services before the product has users is a maintenance tax without a corresponding benefit. Each deferred component has a natural swap-in behind an existing interface (rate-limit bucket, job queue, archive writer), so deferring them is not a one-way door.
- Hono over Fastify because it's lighter, has first-class Zod integration, and keeps the deploy target simple (one process, one container) at MVP scale.
- The `/api/*` contract inventory (§8.4.1) is the load-bearing portability line; it survives any future library swap. The admin UI does not change at the Phase 1 → Phase 2 boundary regardless of which server implements the contract.
- The frontend remains TypeScript (Vite SPAs unchanged). A Python backend would force the schema to be re-expressed in Pydantic and maintained in two places — not justified at this scale.

### 12.2 Phase 1 admin auth — loopback-only, no auth

**Resolution:** accept as-specced. Single-maintainer Phase 1; network boundary is the control; minimum viable auth is a Phase 2 concern.

### 12.3 Per-resort publish threshold — all-or-nothing in Phase 1

**Resolution:** accept as-specced. Phase 1 starts with ~5 resorts; per-resort publish remains deferred until resort count crosses 25 (target moved into §8.6).

### 12.4 `exactOptionalPropertyTypes` — enabled on Day 1

**Resolution:** override the drafting agent's end-of-project deferral. Flag is enabled in Epic 1 PR 1.1.

**Reasoning:** the TypeScript reviewer's argument wins on the merits — concentrating Zod-`.optional()` cleanup cost alongside the v0→v1 schema migration is cheaper than a large end-of-project diff across six epics of accumulated code. The ~1 day of up-front schema work is absorbed into Epic 1/2 where schema surgery is already the primary activity.

### 12.5 Phase 2 auth library — Better Auth

**Resolution:** override the drafting agent's Lucia choice. Phase 2 MVP uses **Better Auth**.

**Reasoning:** Lucia was deprecated by its author in 2025 and is no longer actively maintained; recommending it was a knowledge-cutoff artifact in the drafting pass. Better Auth is the TypeScript-native successor most of the ecosystem moved to. Auth.js v5 and hosted options (Clerk, WorkOS) remain viable fallbacks if Better Auth doesn't fit Phase 2's concrete requirements when that work starts. Phase 1 has no auth, so nothing in Phase 1 depends on this choice.

### 12.6 Phase 1 rate-limit bucket — in-memory, admin-only fetches

**Resolution:** override the drafting agent's filesystem + `flock()` design. Phase 1 uses **in-memory per-process rate limiting**, and the CLI no longer fetches adapters — all live fetches go through the admin process (§7.4, §7.9).

**Reasoning:** the filesystem bucket existed only to share quota between CLI and admin. Removing CLI fetches removes the only cross-process contention, which removes the reason for the filesystem complexity. Phase 2 will swap to a shared store (Redis `CL.THROTTLE`) when >1 admin instance runs concurrently — that's a library swap behind the same interface, not a re-architecture.

### 12.7 License + contribution model — Apache-2.0 + CC BY 4.0 + DCO

**Resolution:** accept as-specced. No commercial/proprietary-edition plans, so CLA is unnecessary overhead. Apache-2.0's patent grant and NOTICE file remain useful for third-party trademark attribution even for a pure OSS project. DCO sign-off has lower contributor friction than CLA.

---

## 13. Open Implementation Questions (forward-looking)

These are deliberately unresolved — implementation choices that should be made alongside the code that uses them, not prescribed in advance. Plan-writing for Epic 3+ should re-evaluate each.

- **Contract snapshot test mechanism (§8.4.1 invariant 3).** Currently specified as "serialize schema set to JSON and diff against `contract.snap`." Epic 4 (admin app) chooses a specific serializer (JSON.stringify ordering, toJSONSchema, etc.) and whether it's a Vitest `toMatchSnapshot` or a separate CI step.
- **Font self-hosting scope (§2.7).** Three families (DM Serif Display, DM Sans, JetBrains Mono) is more than an MVP needs. Consider starting with one family that covers body + UI + numeric (JetBrains Mono alone, or DM Sans alone) and add the others only if a typography pass actually needs them. Epic 3 PR 3.1 makes the call.
