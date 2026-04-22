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
- Two documents in the seed dataset: `three-valleys` and `st-anton`.
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
- Every PR passes integration + visual-regression + a11y (axe-core-per-route) + size-limit.

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
&country=FR[,AT,CH,IT,ES,SE]*     ISO 3166-1 alpha-2
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
- Enforced by `size-limit` in CI (Epic 1 PR 6).

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

### 3.8 PublishState enum (reserved in Phase 1, activated in Phase 2)

```ts
type PublishState =
  | 'draft'
  | 'in_review'
  | 'approved'
  | 'scheduled'
  | 'published'
  | 'archived';
// 'rejected' is a transition, not a state
```

Phase 1 persists only `draft` → `published` transitions; the other states are reserved in the schema so Phase 2 activation is additive.

### 3.9 Analyst notes

Per-resort, per-field Markdown-formatted notes stored alongside the workspace. Rendered safely (no `dangerouslySetInnerHTML`; Markdown-to-AST parser + sanitizer). Not published; internal-only.

### 3.10 Keyboard shortcuts

`/` focuses search. `g r` → Resorts. `g i` → Integrations. `mod+enter` → Save (in editor). `esc` closes modals.

### 3.11 Admin process topology (Phase 1)

`apps/admin` is a Vite SPA served by a Vite dev server that **also hosts an in-process request handler** via a Vite middleware plugin (`apps/admin/vite-plugin-admin-api.ts`). The middleware implements the `/api/*` surface (Fastify-style handlers) in the same Node process as the dev server. The SPA calls `fetch('/api/...')` exactly as it will in Phase 2; the server implementation differs but the wire contract does not.

- **One process.** No separate admin-api binary in Phase 1. The rate-limit bucket (§7.4) lives in-memory in this process; there is no cross-process contention because the CLI does not fetch adapters.
- **Wire contract identical to Phase 2.** Every request/response goes through Zod parse on both sides. Admin's browser code never imports filesystem APIs, Node-only modules, or the adapter registry directly. It only uses `fetch`.
- **Middleware plugin scope:** registered only on `apps/admin`'s Vite dev server. `apps/public`'s Vite server has no such middleware; the public app is read-only and consumes only `data/published/current.v1.json`.
- **Production admin:** the middleware plugin is **not bundled** into any container image (`apps/admin` is never built for production in Phase 1). Phase 2 replaces the middleware with a real Hono service (see §8).

The handler modules live at `apps/admin/server/*.ts` and are imported by the middleware plugin. Every handler uses the Zod request/response schemas from `packages/schema/api/*.ts` (Section 8.5.1).

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
  publish_state: PublishState,     // Phase 1: only 'draft' | 'published'
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
const ColorToken = z.string().brand<'ColorToken'>();
const ISOCountryCode = z.string().length(2).brand<'ISOCountryCode'>();
const ISODateTimeString = z.string().datetime({ offset: true }).brand<'ISODateTimeString'>();

export type ResortSlug = z.infer<typeof ResortSlug>;
export type UpstreamHash = z.infer<typeof UpstreamHash>;
// etc.
```

**Constructor contract:** callers obtain a branded value only via `Schema.parse(raw)` or `Schema.safeParse(raw)`. `urlState.ts` parses URL params through these schemas; no ad-hoc `as ResortSlug` casts anywhere. ESLint rule `eslint-plugin-sta-design/no-brand-cast` bans `as ResortSlug` / `as UpstreamHash` patterns outside `packages/schema/` test files.

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
};
```

### 4.4 `METRIC_FIELDS` const — typed dot-paths

Enumerated at compile time as a `satisfies` list of valid dot-paths into `Resort | ResortLiveSignal`:

```ts
type DotPaths<T> = /* recursive type-generator producing all valid dot-paths */;
type MetricPath = DotPaths<Resort> | DotPaths<ResortLiveSignal>;

export const METRIC_FIELDS = [
  'altitude_m.min', 'altitude_m.max', 'slopes_km', 'lift_count',
  'skiable_terrain_ha', 'season.start_month', 'season.end_month',
  'snow_depth_cm', 'lifts_open.count', 'lifts_open.total',
  'lift_pass_day', 'lodging_sample.median_eur'
] as const satisfies readonly MetricPath[];
```

Typos fail the type-check, not runtime. `validatePublishedDataset` asserts coverage: every record's `field_sources` keys are a superset of every `METRIC_FIELDS` entry that has a non-null value.

### 4.5 Publish-time invariants

- Every URL field matches `^https:`.
- Every `ResortSlug` matches `/^[a-z0-9-]{1,64}$/`.
- Every `Money.currency === 'EUR'` in Phase 1.
- Every `ResortLiveSignal.observed_at` is within the last 14 days for `status=ok`, within 30 days for `status=stale`, else `status=failed` (driven by per-field TTLs in `config/freshness.ts`).
- `schema_version === 1` on every record.
- **Phase 1 publish_state guard:** `validatePublishedDataset` asserts `publish_state ∈ {'draft', 'published'}`. Any other state (`in_review`, `approved`, `scheduled`, `archived`) is a Phase-2-reserved value and must never appear in a Phase 1 published dataset. A runtime test covers this; a Phase 2 feature flag widens the allowed set.

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

Readers join `resorts[i]` with `live_signals[j]` by `slug === resort_slug`. Zod validates the whole envelope; join logic lives in `packages/selectors/loadResortDataset.ts`.

### 4.6 Validation ordering

All ingest paths (adapter response, admin POST, migration import) follow: **parse → Zod validate → archive raw → persist workspace**. Raw bytes are archived **before** parsing for debugging; persistence happens **after** validation passes. Validation failure logs `upstream_hash` + `zod_issues` and does not write to the workspace.

---

## 5. Selectors (`packages/selectors`)

### 5.1 `ResortView`

The projection layer between raw records and the UI. Selectors return discriminated-union field states:

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

`packages/selectors` exposes `toFieldValue<T>(state: FieldStateFor<T>): FieldValue<T>` with the mapping:

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
packages/schema         (leaf — zero workspace deps)
   ↑
packages/selectors      (depends only on schema)
   ↑
packages/design-system  (depends only on schema — NEVER selectors)
   ↑
packages/integrations   (depends only on schema)
   ↑
apps/public             (depends on schema, selectors, design-system)
apps/admin              (depends on schema, selectors, design-system, integrations)
```

`format.ts` in `packages/design-system` accepts only primitive types from `schema` (`Money`, `LocalizedString`, `ISODateTimeString`); it never sees `ResortView`. ESLint `no-restricted-imports` (via `eslint-plugin-sta-design`) blocks cross-layer violations in CI.

---

## 6. Design System (`packages/design-system`)

### 6.1 Tokens

**Source of truth:** `packages/design-system/tokens.ts` (TypeScript const objects). Branded types for every token (`ColorToken`, `SpaceToken`, `BreakpointToken`, `ZIndexToken`, `RadiusToken`, `ShadowToken`, `DurationToken`, `FontWeightToken`, `FontSizeToken`).

**Generated artifact:** `packages/design-system/tokens.css` (CSS custom properties, `:root` + dark scope). Header comment on generated file: `/* GENERATED — do not edit; edit tokens.ts and run npm run tokens:generate */`.

**Enforcement:** pre-commit hook calls `npm run tokens:generate`. CI runs `npm run tokens:generate && git diff --exit-code packages/design-system/tokens.css`. Drift fails the PR.

### 6.2 Spacing scale

4pt base: `xs=4, sm=8, md=12, lg=16, xl=24, 2xl=32, 3xl=48, 4xl=64`.

### 6.3 ESLint rules (`eslint-plugin-sta-design`)

Local workspace plugin enforces:
- `no-raw-color` — no raw hex/rgb/hsl/oklch in `.tsx`/`.ts`; only tokens.
- `no-inline-style-values` — inline styles allowed but values must come from tokens.
- `no-raw-element` — `<button>`, `<input>`, `<a>`, `<dialog>` etc. must use design-system wrappers where one exists.
- `no-design-system-deep-import` — only `import X from 'packages/design-system'` or `from 'packages/design-system/format'`; no `packages/design-system/internals/*`.
- `no-literal-z-index` — must use `zIndex.*` token.
- `no-literal-breakpoint-px` — must use `breakpoints.*` token.
- `no-restricted-imports` — enforces the package DAG (Section 5.3).

### 6.4 Components

Hand-built: `Button`, `IconButton`, `Input`, `TextArea`, `Select`, `ToggleButtonGroup`, `Chip`, `Pill`, `StatusPill`, `SourceBadge`, `Card`, `Table`, `EmptyState`, `LoadingState`, `Shell`, `Sidebar`, `HeaderBar`, `FieldValueRenderer<T>`.

**`FieldValueRenderer<T>`** encapsulates the 3-branch narrowing required by `FieldValue<T>` (from `packages/selectors`):
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

### 6.5 Storybook + visual regression

- `.storybook/` at repo root. `@storybook/test-runner` runs in CI.
- `@storybook/addon-a11y` on every story.
- Playwright visual regression: stories rendered at **360×780** (default mobile-first), 900×780, 1280×900. Baseline images tracked in git.
- **Baseline governance:** PR with non-zero visual diff requires `visual:approve` label applied by a CODEOWNER. PR bot comments with diff gallery. CI fails without the label.

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

### 7.2 Registry (exhaustive typing)

```ts
type SourceKey = 'opensnow' | 'resort-feed' | 'booking' | 'airbnb' | 'snowforecast';

type Registry = { [K in SourceKey]: Adapter<K> };
```

Mapped-type registry makes it a compile-time error to add a `SourceKey` without an adapter.

### 7.3 Constrained HTTP dispatcher

`packages/integrations/http/constrainedDispatcher.ts` wraps `undici`:

- **DNS pinning + SNI:** resolve once per request via `dns.lookup` with `all: true` (all candidates). Each candidate IP is normalized (see canonicalization below) and matched against the SSRF blocklist; any blocked candidate fails the request closed (no "try the next one"). The first non-blocked IP is pinned for the connect leg. The TLS `servername` retains the original hostname (SNI preserved).
- **Per-request Agent instance** with `keepAliveTimeout: 1`, `pipelining: 0`, `connections: 1`. No connection pooling across requests. Prevents DNS rebinding via keep-alive.
- **Address canonicalization** (before blocklist check):
  - IPv4-mapped IPv6 `::ffff:v4.v4.v4.v4` → `v4.v4.v4.v4`.
  - IPv6 `::` and `::1` recognized as loopback-equivalent.
  - `0.0.0.0/8` rejected (Linux routes to loopback).
  - `255.255.255.255` and directed broadcasts rejected.
  - `64:ff9b::/96` NAT64 synthesized addresses rejected unless target v4 is public.
- **SSRF blocklist (post-canonicalization):** deny RFC1918 (10/8, 172.16/12, 192.168/16), loopback (127/8, ::1), link-local (169.254/16, fe80::/10), CGNAT (100.64/10), ULA (fc00::/7), cloud-metadata IPs (169.254.169.254, metadata.google.internal, AWS IMDS v2 token endpoint), multicast (224/4, ff00::/8), reserved ranges.
- **Size cap:** `maxResponseBytes` enforced via streaming byte counter; truncation yields `response_too_large`.
- **Time cap:** per-adapter timeout (default 10s, max 30s); applies to connect + TLS handshake + full body.
- **Required `User-Agent`:** `SnowboardTripAdvisorBot/<version> (+<contact-url>)` — contact URL is operator-configured.
- **Redirects:** a 3xx response re-runs DNS resolution + canonicalization + blocklist check on the redirect target (no IP pin reuse). Redirect target that resolves to a blocked IP fails the request closed.

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
- **`RECORD_ALLOWED` scope:** consulted **only** by `research/cli.ts`'s boot path and `packages/integrations/contract.ts`'s adapter gate. `apps/admin` (Vite dev server + its middleware plugin), `apps/public`, `packages/schema`, `packages/selectors`, `packages/design-system`, and every other module MUST ignore the variable even if the operator's shell has it set. A repo-wide test grep-asserts that `process.env.RECORD_ALLOWED` appears only in those two source files.
- Mocks in tests unconditionally allowed (no env gate on `*.test.ts`).
- Recorded fixtures at `packages/integrations/adapters/<source>/__fixtures__/<case>.json`.
- **Recording fallback.** If live recording fails (upstream rate-limit, outage, 5xx burst), the adapter's fixture directory may include hand-crafted synthetic fixtures tagged `{"synthetic": true, "notes": "..."}` in the fixture envelope. Synthetic fixtures are valid for CI but tracked in a follow-up issue to replace with real recordings when upstream returns. CI reports synthetic-fixture coverage per adapter; Epic 6 acceptance requires >70% real (non-synthetic) fixtures.
- **PII redaction:** per-adapter `redaction.ts` scrubs headers (email, phone, authorization, cookie, set-cookie, x-api-key patterns) + body (email/phone/token/IPv4/UUIDv4 regex + API-key-echo patterns + nested-JSON fields named `email`, `contact`, `owner`, `reporter`, `user_id`). A shared redaction-corpus test harness at `packages/integrations/audit/redaction.corpus.test.ts` runs synthetic-but-realistic responses per adapter category (JSON-REST, HTML, RSS/XML) through the redactor, asserting no email/phone/UUID/IPv4 survives. Coverage tracks the redaction rule set, not just the scrubber code.
- **Fixture size budget:** <50 KB per fixture; CI fails if exceeded.

### 7.7 `body_sample` redaction

`AdapterError.upstream_4xx.body_sample` is the first 512 bytes of the response body, post-redaction. Each adapter registers its API-key-echo patterns (e.g., `"api_key":"..."`, `Authorization: Bearer ...`) for scrubbing. Unit tests assert redaction on known problematic responses.

### 7.8 Stubs in Phase 1

Initial adapters for `opensnow`, `resort-feed`, `booking`, `airbnb`, `snowforecast` are stubs that return frozen `as const` values + `sources[*].status = 'manual'`. Real implementations land in Epic 6, behind the same contract.

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

Every endpoint has a Zod request/response schema pair in `packages/schema/api/*.ts`. Role and rate-limit class are recorded for Phase 2; in Phase 1 role checks are no-ops and the rate-limit class is advisory.

| # | Method + path | Request schema | Response schema | Role (P2) | RL class (P2) |
|---|---|---|---|---|---|
| 1 | `GET /api/resorts` | `ListResortsQuery` (filters, pagination) | `ListResortsResponse` (resort summaries) | `editor` | read |
| 2 | `GET /api/resorts/:slug` | `ResortSlugParam` | `ResortDetailResponse` (full durable + latest live + per-field state) | `editor` | read |
| 3 | `PUT /api/resorts/:slug` | `ResortUpsertBody` (durable fields) | `ResortDetailResponse` | `editor` | write |
| 4 | `POST /api/resorts/:slug/test-adapter/:sourceKey` | `TestAdapterBody` (no body Phase 1) | `TestAdapterResponse` (`AdapterResult` passthrough) | `editor` | external |
| 5 | `POST /api/resorts/:slug/sync/:sourceKey` | `SyncBody` (field-list scope) | `SyncResponse` (updated fields + new observed_at) | `editor` | external |
| 6 | `POST /api/resorts/:slug/publish` | `PublishBody` (all-or-nothing Phase 1) | `PublishResponse` (version id, archive path) | `publisher` | write |
| 7 | `GET /api/publishes` | `ListPublishesQuery` | `ListPublishesResponse` (version history) | `editor` | read |
| 8 | `GET /api/audit` | `ListAuditQuery` | `ListAuditResponse` (per-adapter audit entries) | `audit_reader` | read |
| 9 | `GET /api/audit/:id` | `AuditIdParam` | `AuditEntryResponse` (full body, redaction-aware) | `audit_reader` | read |
| 10 | `GET /api/health` | `HealthQuery` (none) | `HealthResponse` (adapter freshness, archive size) | `editor` | read |
| 11 | `POST /api/preview-tokens` | `PreviewTokenBody` (slug, TTL ≤24h) | `PreviewTokenResponse` (signed token) | `editor` | write |
| 12 | `GET /api/analyst-notes/:slug` | `ResortSlugParam` | `AnalystNoteResponse` (Markdown body, sanitized HTML preview) | `editor` | read |
| 13 | `PUT /api/analyst-notes/:slug` | `AnalystNoteBody` | `AnalystNoteResponse` | `editor` | write |
| 14 | `POST /api/auth/login` (P2) | `LoginBody` | `LoginResponse` (sets session cookie) | `public` | auth |
| 15 | `POST /api/auth/logout` (P2) | — | `204 No Content` | any | auth |
| 16 | `POST /api/auth/refresh` (P2) | — (refresh cookie) | `204` (new session + refresh cookie) | any | auth |

**Contract invariants enforced by CI:**
1. Every endpoint has a Zod schema pair in `packages/schema/api/*.ts`.
2. `apps/admin` fetches go through a single typed client generated from those schemas (no ad-hoc `fetch` calls outside the client).
3. A contract snapshot test serializes the schema set to JSON and diffs against `packages/schema/api/__snapshots__/contract.snap`. Changes require maintainer review.
4. Phase 2 route registration uses the same Zod schemas — route registration fails to compile if the admin UI's expected shape diverges.
5. `GET`/`HEAD` are idempotent and safe; `POST`/`PUT` carry `Idempotency-Key` headers on destructive operations (publish, sync) in Phase 2.

**Phase 1 specifics:**
- All endpoints served by `apps/admin/server/*.ts` via the Vite middleware plugin (§3.11).
- Role checks are no-ops in Phase 1 (loopback-only, no auth); the role column is populated so Phase 2 can flip them on without schema churn.
- Rate-limit class is advisory in Phase 1 (in-memory bucket per §7.4); Phase 2 enforces via a shared store when multi-instance.

### 8.5 Preview tokens

Signed preview tokens for draft-resort sharing. Phase 1 does not implement them (no sharing in loopback-only mode); the endpoint exists in the contract so Phase 2 activation is additive. Signing algorithm (Ed25519 is the current assumption) is a Phase 2 decision.

### 8.6 Per-resort publish

Activated when the resort count crosses 25 (§12 decision 3). Per-resort publish regenerates `current.v1.json` atomically by composing all `published`-state rows for the operator's dataset. Until the threshold is crossed, all-or-nothing publish from Phase 1 is retained.

---

## 9. Phase 1 Epic Breakdown

Seven epics, ~36 PRs. Each epic completes independently; the quality gate stays green throughout.

### Epic 1 — Workspace + schema + adapter contract + design-system scaffold + CSP + harness + ESLint + size-limit

**PR 1.1** — npm workspaces layout; root `tsconfig.base.json` + `tsconfig.references.json` + per-package `tsconfig.json`; `vitest.workspace.ts`. Strict flags: `strict: true`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, **`exactOptionalPropertyTypes: true`** (flipped on Day 1 per §12 decision 4 — concentrates Zod-`.optional()` cleanup cost alongside the v0→v1 schema migration rather than deferring it to an end-of-project diff).

**PR 1.2** — `packages/schema/` with Zod definitions, branded types, `Money`, `LocalizedString`, `PublishState`, `FieldSource` (including `attribution_block`), `METRIC_FIELDS`, `SourceKey` union. TDD-first; round-trip tests + schema-version-drift guard.

**PR 1.3** — `packages/integrations/contract.ts` (`Adapter<S>`, `AdapterResult`, `AdapterError`, `AdapterContext`, `RECORD_ALLOWED` gate) + `packages/integrations/registry.ts` (mapped-type exhaustiveness) + stubs for all 5 adapters returning `manual`-status frozen values.

**PR 1.4** — `packages/design-system/tokens.ts` (source of truth) + `scripts/generate-tokens.ts` + generated `tokens.css` + header comment + CI drift check + pre-commit integration.

**PR 1.5** — `config/csp.ts` (shared dev + prod CSP source) + `tests/integration/harness.ts` (shared Vitest + MSW + Testing Library + axe-core setup, default viewport 360×780) + `packages/selectors/loadResortDataset.ts` skeleton.

**PR 1.6** — `.size-limit.json` (JS budget) + CI `npm run size` step + Lighthouse CI smoke + axe-core-per-route wiring in the harness.

**PR 1.7** — `eslint-plugin-sta-design/` workspace package rollout, split into three sequenced PRs so the fleet-wide rule set lands in reviewable pieces without ever regressing the main branch:

- **PR 1.7a — plugin scaffold (rules off):** create the `eslint-plugin-sta-design/` workspace package with all rule implementations, unit tests, and documentation. Register all rules in `eslint.config.js` with `severity: 'off'`. Merging this PR adds the plugin to the dependency graph but does not fail any lint run. Size budget: plugin code + tests only.
- **PR 1.7b — autofix sweep:** flip all auto-fixable rules to `severity: 'error'` and commit the mechanical autofix output across the tree in one changeset. Reviewer scope is "confirm the autofix was mechanical"; no hand-edits in this PR.
- **PR 1.7c — manual fixes:** flip the remaining non-auto-fixable rules to `severity: 'error'` and apply hand-written fixes with per-rule commits. Each commit is scoped to a single rule for reviewability. The `qa` gate is green at the end of this PR.

Rationale: a single mega-PR turns the tree red mid-review, and a single trickle turns every intermediate state into a partial enforcement. The three-PR split keeps `main` green between every merge and makes the autofix step reviewer-friendly.

### Epic 2 — Data migration

**PR 2.1** — `research/migrate/v0-to-v1.ts` reading old `current.json`, emitting new `current.v1.json` alongside. CI runs both validators.

**PR 2.2** — `research/validate/validatePublishedDataset.ts` rewritten: imports from `packages/schema`, asserts `METRIC_FIELDS` coverage, https-only, slug regex, `schema_version === 1`, `attribution_block` presence on every source.

**PR 2.3** — `research/publish/publishDataset.ts` REWRITE: atomic rename-based writes (staged tmp → fsync → rename → fsync parent dir). Archive filename `{monotonic-counter}-{iso-ms}.json` with counter at `data/published/.archive-counter` under `flock()`. Unit test for clock regression.

**PR 2.4** — Fixture re-recording campaign (PR 2.5 in original numbering, resequenced for clarity): per-adapter canonical fixtures recorded via `test:adapter --record` with `RECORD_ALLOWED=true`. PII redaction policy + size budget tests. Blocks Epic 6.

**PR 2.5a** — Reader flip prep: `packages/selectors/loadResortDataset.ts` reads `current.v1.json` behind a feature flag; dedicated unit tests cover every branch (fresh/stale/never_fetched, field-level source attribution, schema-version mismatch fallback). Old reader stays.

**PR 2.5b** — Flip consumers: `apps/public` + `apps/admin` read `current.v1.json` exclusively. Legacy reader retained, not wired. The legacy reader path is added to the workspace's `vite.config.ts` `coverage.exclude` list in the same PR with a dated rationale comment (`// retained until PR 2.5c demolition, 2026-0X-XX`). The comment's date is the soak deadline so reviewers have a concrete horizon.

**PR 2.5c** — Demolition (after 1-week soak): delete legacy `current.json`, `research/schema.ts`, `config/scoring.ts`, legacy reader. Coverage-exclusion list in per-workspace `vite.config.ts` updated in the same PR.

### Epic 3 — Public app (cards + detail + URL state)

**PR 3.1** — `apps/public` Vite config + entry + CSP dev plugin wiring.
**PR 3.2** — Landing route (copy reflects data-transparency positioning).
**PR 3.3a** — CardView layout + fields + sort UI.
**PR 3.3b** — Shortlist drawer + matrix toggle + URL-param sync.
**PR 3.4** — Detail route: durable + live panels, deep-link section with honesty micro-copy + `rel="noopener noreferrer"` + `referrerpolicy="no-referrer"` + `encodeURIComponent` on interpolation.
**PR 3.5** — Merge/replace dialog for shortlist collision; clipboard-share with fallback modal.

### Epic 4 — Public app (matrix + shortlist)

**PR 4.1** — MatrixView component (responsive hidden-below-md message).
**PR 4.2** — Shortlist cap (6) + per-resort add/remove affordances.
**PR 4.3** — Highlight-field affordance (URL param + visual emphasis).
**PR 4.4** — Source badges + observed_at tooltips + missing-value indicators.
**PR 4.5** — Integration test pass on every route with axe-core + visual regression at 360/900/1280.

### Epic 5 — Admin app (loopback MVP)

**PR 5.1** — `apps/admin` Vite config (loopback bind) + entry + never-built-in-prod Dockerfile guard.
**PR 5.2** — Shell (Sidebar + HeaderBar) + Dashboard health cards.
**PR 5.3** — Resorts list + filters.
**PR 5.4** — Resort editor (durable + live panels, FieldRow, ModeToggle).
**PR 5.5** — Publish flow (all-or-nothing, UI calls same pipeline as CLI).
**PR 5.6** — Read-only-below-md policy + analyst notes (Markdown-sanitized).

### Epic 6 — Real adapters

**PR 6.1** — Constrained HTTP dispatcher (undici + DNS pin + SSRF blocklist + size/time caps + required UA).
**PR 6.2** — In-memory rate-limit bucket per §7.4 (token bucket per `SourceKey`, admin-process-scoped).
**PR 6.3** — Audit archive writer (validate-before-persist; 30d / 100-per-resort-per-source retention).
**PR 6.4** — OpenSnow adapter + fixture + redaction rules.
**PR 6.5** — Resort-feed adapter (durable facts) + fixture + redaction.
**PR 6.6** — Snow-Forecast adapter + fixture + redaction.
**PR 6.7** — Booking.com + Airbnb adapters (deep-link generators + fixture).
**PR 6.8** — CLI `test:adapter` developer command (fixture-recording tool; bulk-refresh commands are deferred to Phase 2 per §7.9).

### Epic 7 — Stabilization & observability

**PR 7.1** — `pino` structured logging + error boundary instrumentation in both apps.
**PR 7.2** — Performance/a11y audit rollup (Lighthouse CI + size-limit baseline tuning).
**PR 7.3** — ADR backfill (0001–0007) + `docs/release-policy.md` + DX polish (commit hooks, codemod utilities).

### CI/CD

Merge gate on every PR: `qa` + `test:integration` + `test:visual` + `test:a11y` + `size`. Image workflow (`.github/workflows/image.yml`) triggers on `release: published` tags on `main`; keeps supply chain (cosign + SLSA v1 + SBOM + Trivy + digest-pinned bases).

---

## 10. Existing Code Disposition

### 10.1 Disposition legend

- **DELETE** — removed entirely; no trace in target state.
- **REWRITE** — logical function survives; file rewritten at new path with new contract.
- **PRESERVE** — kept in place.
- **MIGRATE** — content transformed (one-shot script); original deleted.
- **AMEND** — kept but modified in place.

### 10.2 File-by-file disposition

| Path | Disposition | Target / notes |
|---|---|---|
| `config/scoring.ts` | **DELETE** | scoring removed |
| `research/schema.ts` | **REWRITE** | → `packages/schema/index.ts` + `packages/schema/api/*.ts` |
| `research/schema.test.ts` | **REWRITE** | → `packages/schema/index.test.ts` |
| `research/scoring/*` | **DELETE** | scoring removed |
| `research/normalize/*` | **REWRITE** | → `packages/integrations/adapters/*/normalize.ts` |
| `research/publish/publishDataset.ts` | **REWRITE** | atomic rename-based writes (staged tmp → fsync → rename → fsync parent); archive filename `{monotonic-counter}-{iso-ms}.json` under `flock()`; current impl is NOT atomic (three separate writeFile calls) — corrected here |
| `research/publish/publishDataset.test.ts` | **REWRITE** | concurrency test (two publishes → two archives, no interleaved current.v1.json); clock regression test |
| `research/validate/validatePublishedDataset.ts` | **REWRITE** | imports from `packages/schema`; `METRIC_FIELDS` coverage; https-only; slug regex; `attribution_block` required |
| `research/validate/validatePublishedDataset.test.ts` | **REWRITE** | new invariants |
| `research/reports/buildChangeReport.*` | **REWRITE** | per-field `{before, after, source_before, source_after}` diff; no score delta |
| `research/sources/fetchText.ts` | **DELETE** | → `packages/integrations/http/constrainedDispatcher.ts` |
| `research/sources/sourceRegistry.ts` | **REWRITE** | → `packages/integrations/registry.ts` with mapped-type exhaustiveness |
| `research/targets.ts` | **REWRITE** | shape flips from "scoring target" to "research target" |
| `research/cli.ts` | **REWRITE** | new subcommands; only approved `console` site |
| `research/cli.test.ts` | **REWRITE** | coverage for new subcommands |
| `research/__fixtures__/*` | **MIGRATE + RE-RECORD** | durable content migrates; scoring fixtures deleted; NEW per-adapter fixtures recorded via `test:adapter --record` (Epic 2 PR 2.4) |
| `data/published/current.json` | **MIGRATE** | one-shot → `current.v1.json`; legacy file deleted after 1-week soak (PR 2.5c) |
| `data/published/history/*` | **PRESERVE** | immutable archive; new archives follow ISO-ms + monotonic-suffix |
| `src/App.tsx` + `src/App.test.tsx` + `src/main.tsx` | **REWRITE** | → `apps/public/src/{App,App.test,main}.tsx` |
| `src/components/Hero.*` | **REWRITE** | → `apps/public/src/routes/Landing.tsx` |
| `src/components/ResortCard.*` | **REWRITE** | → `apps/public/src/features/card-view/ResortCard.tsx` |
| `src/components/ResortGrid.*` | **REWRITE** | → `apps/public/src/features/card-view/CardView.tsx` |
| `src/components/FilterBar.*` | **REWRITE** | → `apps/public/src/features/card-view/FilterBar.tsx` |
| `src/components/ComparePanel.*` | **REWRITE** | → `apps/public/src/features/matrix/MatrixView.tsx` + `ShortlistDrawer.tsx` |
| `src/components/ResortDetailDrawer.*` | **REWRITE** | → `apps/public/src/features/detail/ResortDetail.tsx` |
| `src/data/loadPublishedDataset.*` | **REWRITE** | → `packages/selectors/loadResortDataset.ts` |
| `src/lib/format.*` | **REWRITE** | → `packages/design-system/format.ts` |
| `src/lib/queryState.*` | **REWRITE** | → `apps/public/src/lib/urlState.ts` |
| `src/styles/global.css` | **REWRITE** | → `packages/design-system/global.css` |
| `src/styles/tokens.css` | **DELETE (regenerated)** | → `packages/design-system/tokens.css` (generated) |
| `src/test/*` | **REWRITE** | → `tests/integration/harness.ts` (shared) + per-route tests |
| `index.html` | **REWRITE** | → `apps/public/index.html` + `apps/admin/index.html` |
| `vite.config.ts` | **REWRITE** | → per-app + per-package configs + `vitest.workspace.ts` at root |
| `tsconfig.json` | **REWRITE** | → `tsconfig.base.json` + per-package + `tsconfig.references.json` |
| `package.json` | **AMEND** | workspaces + new scripts |
| `package-lock.json` | **AMEND** | regenerated |
| `eslint.config.js` | **REWRITE** | flat config + `eslint-plugin-sta-design` |
| `Dockerfile` | **AMEND** | multi-stage public-only |
| `nginx.conf` | **AMEND** | add CSP + Referrer-Policy + Permissions-Policy + HSTS + X-Content-Type-Options |
| `Makefile` | **DELETE** | targets migrate to `npm run *` scripts (single source of truth) |
| `.github/workflows/ci.yml` | **AMEND** | add integration + visual + a11y + size steps |
| `.github/workflows/image.yml` | **AMEND** | trigger on `release: published` |
| `.github/workflows/quality-gate.yml` | **AMEND** | absorb into `ci.yml` or keep as alias |
| `scripts/pre-commit` | **AMEND** | runs `qa` + `tokens:generate` + `size` |
| `scripts/bootstrap-host.sh`, `check-prereqs.sh`, `verify-tools.sh` | **PRESERVE** | unchanged |
| `.gitignore` | **AMEND** | add `apps/*/dist/`, `packages/*/dist/`, per-workspace `coverage/` |
| `docs/delivery-model.md`, `deployment-contract.md`, `testing-strategy.md`, `workstation-setup.md` | **AMEND** | see Section 11.4 |
| `CLAUDE.md` | **AMEND** | see Section 11.2 |
| `README.md` | **REWRITE** | see Section 11.1 |

### 10.3 New directories (Epic 1 or 2)

```
apps/public/                    Vite: landing + card view + matrix + detail
apps/admin/                     Vite: loopback-only editor (Phase 1)
packages/schema/                Zod + branded types + API contract
packages/design-system/         Tokens (TS + generated CSS) + components
packages/selectors/             ResortView + URL-state selectors
packages/integrations/          Adapter contract + HTTP + rate limit + audit + registry
tests/integration/              Shared harness + per-app route tests
tests/visual/                   Playwright visual regression (360/900/1280)
tests/a11y/                     axe-core-per-route + Lighthouse smoke
config/freshness.ts             Per-field TTL
config/schedules.ts             Cron schedules (Phase 2)
config/csp.ts                   Shared CSP source
eslint-plugin-sta-design/       Local workspace plugin
scripts/generate-tokens.ts      TS → CSS token generator
```

`services/admin-api/` and `services/admin-workers/` are NOT created in Phase 1 (they would be empty `.gitkeep`s; adds noise). They appear when Phase 2 starts.

### 10.4 Git migration strategy

- **Feature branch:** `pivot/data-transparency` cut from `main`.
- **Branch protection:** force-push **OFF**, up-to-date-with-base **OFF**, required checks **ON**. Avoids 36-PR stale-base rebase loops.
- **PR cadence:** ~36 PRs target `pivot/data-transparency`, not `main`. Main stays deployable.
- **Merge to main:** after Epic 7 completes, `pivot/data-transparency` merges to `main` preserving commit graph (no squash). Individual PRs within the branch can be merge-commit or squash per-PR — maintainer call.
- **Sync cadence:** weekly `git merge main` into `pivot/data-transparency` (never rebase; rebase would force-push the protected branch).
- **Hotfix policy:** security hotfixes branch from latest release tag, land directly on `main`, next weekly merge brings them into the pivot branch.
- **Deletion ordering inside each PR:** demolition commits come after the new path is green; avoids mid-PR CI red.
- **Rollback boundary:** PR 2.5c (legacy demolition) is the last-chance rollback. Before then, flipping the reader switch is a 1-PR revert.

### 10.5 Preserved invariants

From current `CLAUDE.md`, unchanged:
1. Schema first (target is `packages/schema/`).
2. Never bypass `validatePublishedDataset` before `publishDataset`.
3. Provenance always (now enforced by `METRIC_FIELDS` coverage).
4. 100% coverage hard gate.
5. No `/* istanbul ignore */`.
6. TDD order.
7. No `any`, no non-null assertions, explicit return types, `import type`, `const` default, `??` over `||`.
8. No `console` outside `research/cli.ts` (exception list expanded — see Section 11.2).
9. Pre-commit hook runs `qa`; `--no-verify` forbidden.

### 10.6 Removed rules

1. **"Config, not code: scoring thresholds belong in `config/scoring.ts`"** — scoring removed.
2. Any implicit reference to single-module `research/schema.ts` — replaced with `packages/schema/`.

---

## 11. README & Docs Update Plan

### 11.1 README.md full rewrite

Replaces the 294-line scoring-product README. Top-level sections:

1. What this is (3 sentences — data-transparency tool, EU-only Phase 1, no ranking).
2. What this is NOT (not a ranker, not a booking engine, not a review aggregator).
3. Who it's for.
4. Product direction (Phase 1, Phase 2, long-term durable+live separation).
5. How it's built (the inspectability rule; `FieldSource` everywhere; `validatePublishedDataset` gate; scoring removed April 2026).
6. Getting started (`npm install && npm run setup`; `dev`; `dev:admin`; `qa`).
7. Using the public app (URL state shape; shortlist cap 6; matrix hidden below md).
8. Using the admin app (loopback-only; never-in-production; test-before-publish; all-or-nothing Phase 1).
9. The research CLI (`test:adapter`, `migrate:v0-to-v1`, `publish`; bulk refresh is deferred to Phase 2).
10. Data model at a glance (Resort + ResortLiveSignal; METRIC_FIELDS; schema_version 1; Money EUR; LocalizedString en).
11. Project layout (after April 2026 pivot).
12. Quality gate (100% coverage; pre-commit; `--no-verify` forbidden).
13. Data & trust posture ("zero tracking" = no analytics, no third-party beacons, no cross-site identifiers, no server-side fingerprinting; **`localStorage` IS used** for the shortlist-merge fallback and `prefers-color-scheme` override, but it is same-origin, user-controlled, and never transmitted — documented here so "zero tracking" is not confused with "zero storage"; self-hosted fonts; CSP at build time; `rel="noopener noreferrer" referrerpolicy="no-referrer"`; affiliate default-off).
14. Supply chain posture (cosign + SLSA v1 + SBOM + Trivy + digest-pinned bases).
15. Licensing & contributing (see license boundary table 11.1.1 below).
16. Operator obligations (pointer to `docs/operator-obligations.md`).
17. Trademark policy (nominative fair use; pointer to `docs/trademark-policy.md`).
18. Status & roadmap (Phase 1 current, Phase 2 target, Phase 3+ requires Discussion + ADR before PRs).
19. Links (spec, ADRs, schema versioning, release policy).

#### 11.1.1 License boundary table (new; placed in README + NOTICE)

| Category | License | Paths |
|---|---|---|
| Code | Apache-2.0 | all `.ts`, `.tsx`, `.js`, `.css`, `.html`, `nginx.conf`, `Dockerfile`, `scripts/**`, `packages/schema/**`, fixture harness wrappers `__fixtures__/**/*.ts` |
| Config & tooling | Apache-2.0 | all `.yml` / `.yaml` (incl. `.github/workflows/**`, `.github/dependabot.yml`, `.github/labels.yml`, `.github/ISSUE_TEMPLATE/**`), `.github/CODEOWNERS`, `.github/PULL_REQUEST_TEMPLATE*`, `.editorconfig`, `.gitignore`, `.gitattributes`, `.nvmrc`, `.mise.toml`, `package.json`, `package-lock.json`, `tsconfig*.json`, `vite.config.ts`, `vitest.workspace.ts`, `eslint.config.js`, `.prettierrc*` |
| Prose & docs | Apache-2.0 (with explicit "also available under CC BY 4.0 at author's discretion" notice in NOTICE) | `docs/**/*.md`, `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant upstream is CC BY 4.0 — preserved), `SECURITY.md`, `GOVERNANCE.md`, `SUPPORT.md`, `CLAUDE.md`, ADRs under `docs/adr/**` |
| Data snapshots | CC BY 4.0 | `data/published/**/*.json`, captured upstream payloads `__fixtures__/**/*.json`, per-resort snapshots, `docs/**/*.csv` |
| Out of scope | — | upstream third-party marks (NOTICE attributions only); Contributor Covenant itself (CC BY 4.0 upstream); vendored dependencies under `node_modules/` (each package's own license) |

### 11.2 CLAUDE.md amendments (precise edits)

1. **Remove** the rule `Config, not code: scoring thresholds and weights belong in config/scoring.ts`.
2. **Replace** `Schema first: update research/schema.ts before any normalizer, scorer, or publisher` with: `Schema first: update packages/schema/ before any adapter, selector, or publisher. Every metric field must be listed in METRIC_FIELDS.`
3. **Replace** `Provenance always: every published metric field must have a matching field_sources entry` with: `Provenance always: every METRIC_FIELDS entry must have a matching field_sources entry with source + observed_at + fetched_at + upstream_hash + attribution_block. validatePublishedDataset enforces coverage.`
4. **Add** new section **UI Code Rules**:
   - UI code imports styling only from `packages/design-system`.
   - No raw CSS colors in `.tsx` files (enforced by `eslint-plugin-sta-design/no-raw-color`).
   - No inline style values that should be tokens (`no-inline-style-values`).
   - No raw HTML element imports where a design-system component exists (`no-raw-element`).
   - No deep imports into design-system internals (`no-design-system-deep-import`).
   - No literal z-index values (`no-literal-z-index`).
   - No literal breakpoint px values (`no-literal-breakpoint-px`).
5. **Add** new section **Workspace Rules**:
   - Package dependency graph: `schema (leaf) ← selectors ← design-system ← integrations; apps/* consume all packages.`
   - `packages/design-system` never imports from `packages/selectors`.
   - Cross-layer imports blocked by `eslint-plugin-sta-design/no-restricted-imports`.
   - `tokens.css` is generated from `tokens.ts`; hand edits fail the pre-commit hook.
6. **Add** new section **Admin App Rules**:
   - `apps/admin` is loopback-only; binds `127.0.0.1:5174`.
   - Never build `apps/admin` into the production container.
   - Admin is read-only below the `md` breakpoint.
7. **Add** new section **Integration Adapter Rules**:
   - All external HTTP goes through `packages/integrations/http/constrainedDispatcher.ts`.
   - Adapters never throw; they return `AdapterResult`.
   - `upstream_hash` is computed from raw bytes before parse.
   - `RECORD_ALLOWED` gates fixture recording at process boot and adapter level; mocks unconditionally allowed in tests.
   - Fixture PII redaction is a hard test requirement.
8. **Update** **Coverage Rules** section:
   - Per-workspace `vite.config.ts` is the source of truth for coverage exclusions.
   - When deleting a file, remove its entry from the workspace's coverage.exclude list in the same PR.
9. **Update** **Excluded From Coverage** to reference `apps/*/vite.config.ts` + `packages/*/vite.config.ts`.
10. **Add** setup note: `npm run setup` also runs `scripts/generate-tokens.ts` once to materialize `packages/design-system/tokens.css`.
11. **Add** new section **DCO Rule**: all commits signed off (`git commit -s`); agents configure `user.email` before first commit; `--no-verify` forbidden.
12. **Add** new section **Visual-diff Workflow**: changes touching `apps/public/**` or `packages/design-system/tokens.ts` require a `visual:approve` label before merge; agents attach screenshots and request the label; do not self-approve.
13. **Add** new section **Hotfix / Backport Cadence**: security hotfixes branch from latest release tag, land on `main`; weekly `git merge main` into `pivot/data-transparency`; never rebase `main`.
14. **Add** new section **Migration Branch Rule**: schema-version bumps land on `schema/vN-to-vN+1` branch with migration CLI + golden-fixture conversion + maintainer review required.
15. **Update** **no-console exception list** to include `research/cli.ts`, `research/migrate/*.ts`, `scripts/generate-tokens.ts`, `scripts/*.ts` via ESLint `overrides`.
16. **Add** new section **Agent Hotfix Policy** (rule 13):
    - Agents **must not** open a hotfix PR against `main` without explicit user authorization for the specific incident.
    - Hotfixes bypass the `pivot/data-transparency` queue and land directly on the latest release tag → `main`, so the blast radius is larger than a normal PR.
    - When an agent believes a hotfix is warranted, it opens a Discussion (or asks in-session) describing the incident, the proposed patch scope, and the rollback plan. The user confirms before the agent branches from the release tag.
    - This rule is separate from the general "operate more autonomously" preference; hotfixes are the exception because they touch the stable branch.

### 11.3 New documentation files

**ADRs (MADR format — pinned to latest stable (currently MADR 3.0 as of 2026-04), numbered `NNNN-slug.md`, indexed at `docs/adr/README.md`):**

| ADR | Title |
|---|---|
| 0001 | Pivot to data-transparency (scoring removed) |
| 0002 | Split durable resort from live signals |
| 0003 | Phase 2 Fastify + Lucia (not Next + Auth.js) |
| 0004 | URL-state-first + merge/replace on collision |
| 0005 | Design-system tokens as TypeScript (generated CSS) |
| 0006 | Apache-2.0 + DCO + zero-tracking |
| 0007 | ADR process itself |

**ADR cadence note:** ADR-0001 lands with this spec (same PR). ADRs 0002-0007 are backfilled at Epic 7 PR 7.3. Additional ADRs are expected to land during Epic 6 (real-adapter integration raises new decisions — upstream TOS negotiation, rate-limit tuning, redaction corpus maintenance). The ADR process (0007) describes how to propose new ones mid-stream; any architectural decision reached during Epic 6 that a reviewer flagged as "needs a writeup" becomes an ADR PR before the epic closes.

**i18n scope (Phase 1 explicit):** `LocalizedString` stores `{ en: string, [lang: string]: string | undefined }`; Phase 1 ships English-only surface copy. Any non-English content in `LocalizedString` (resort regional names, attribution blocks) is **operator-curated translation** — never machine-translated server-side, and never rendered without a `lang="xx"` attribute on the element. `docs/i18n-policy.md` describes how operators add additional locales by shipping translation bundles; no UI string ever auto-falls-back to `en` silently (missing translations surface a visible indicator).

**Release policy — internal packages:** In Phase 1, all `packages/*` move in lockstep with the repo tag. They are NOT published to npm and are consumed via workspace protocol. Each tag on `main` is the version; `packages/schema/package.json` carries the `schema_version` integer (separate from semver), and a schema-version bump is itself a breaking repo-level change per ADR-0001. Phase 2 may publish `packages/schema` to npm independently (operators embedding the schema in their own services); that decision is deferred to a Phase 2 ADR.

**Other new docs:**

| Path | Purpose |
|---|---|
| `docs/data-schema-versioning.md` | `schema_version` semantics; when to bump; current = 1; migration CLI contract |
| `docs/data-ethics.md` | Attribution policy; upstream TOS posture; affiliate disclosure; takedown process link |
| `docs/local-dev.md` | Loopback admin; font setup; Playwright install; MSW; Storybook |
| `docs/admin/overview.md` | Admin shell; loopback binding; read-only-below-md rule |
| `docs/admin/workflows.md` | `draft → in_review → approved → published` lifecycle (Phase 1: `draft → published` only, rest reserved) |
| `docs/admin/integrations.md` | Per-adapter docs; rate limits; fixture recording; `RECORD_ALLOWED`; `test:adapter` usage; per-upstream attribution requirements |
| `docs/operator-obligations.md` | Self-deploy operator checklist: attribution, affiliate disclosure, GDPR (Phase 2), takedown response SLA |
| `docs/trademark-policy.md` | Nominative fair use; no logo reproduction; name-use-only; takedown carve-out |
| `docs/i18n-policy.md` | `LocalizedString` shape; source-language + en; `lang` attribute + visible indicator; no silent machine translation |
| `docs/release-policy.md` | Semver on `packages/schema`; container tags (SHA + semver); `cosign verify` one-liner; SBOM location; schema-breaking change policy |
| `CONTRIBUTING.md` | 7-step onboarding + DCO sign-off + TDD + PR template pointer |
| `CODE_OF_CONDUCT.md` | Contributor Covenant v2.1 |
| `SECURITY.md` | GitHub Security Advisories primary + email+PGP fallback; tiered scope (see 11.3.1) |
| `GOVERNANCE.md` | BDFL-for-now; co-maintainer promotion criteria; **dead-man clause**: a named standby maintainer (identified in the file) gains unilateral promotion authority for new co-maintainers + signing-key rotation authority after **90 days of BDFL silence** (no commits, no issues, no Discussion replies on the primary maintainer's GitHub account); signing-key custody (ADR-linked); the standby's identity is public (in the file); if the standby is also silent for 90 days, any two active committers with ≥3 merged PRs in the trailing 12 months may jointly invoke a community-promotion vote on GitHub Discussions |
| `SUPPORT.md` | Discussions for questions; Issues for defects; Security Advisories for vulns |
| `LICENSE` | Apache-2.0 |
| `NOTICE` | Project trademarks; CC BY 4.0 notice on data; upstream third-party mark attributions |

#### 11.3.1 SECURITY.md scope (tiered)

**In scope:**
- Vulnerabilities in published artifacts (source, container image at `ghcr.io/...@sha256:...`, CLI, admin binary).
- Default configurations whose misconfiguration is likely (admin-bind defaults, CSP defaults, affiliate-default-off regression).

**Out of scope:**
- Bespoke operator deployments.
- Third-party upstream data sources.
- Trademark disputes (→ takedown process).

**Report via:**
- GitHub Security Advisories (primary, private).
- OR signed email to `security@<domain>` with PGP fingerprint published in this file.

#### 11.3.2 Takedown SLA

- Acknowledgement: **72 hours**.
- Triage decision (accept / reject / counter-notice): **14 calendar days**.
- Accepted takedowns in next published dataset (**≤30 days**) OR hotfix for defamatory/PII/GDPR Art. 17.
- **Public-interest carve-out:** accurate, sourced, non-personal factual claims (piste_km, lift_count, snowfall) are not removable on trademark-holder request alone; route to factual-correction workflow.
- Counter-notice option for contributors whose data is removed.

**Legal framing (read before filing):**
- This project is EU-targeted in Phase 1 but is **not itself a legal service**. The project's SLA, carve-outs, and process live in this document as operator-agnostic defaults.
- **Operator responsibility for jurisdiction-specific legal obligations:** anyone deploying this project (the "operator") is responsible for obtaining jurisdiction-specific legal advice for their deployment — GDPR (EU/UK), DSA / DMA (EU platform obligations at scale thresholds), the German NetzDG, French LCEN notice-and-takedown, the EU Copyright Directive Art. 17, and national trademark / defamation law. The SLA in this section is a **maximum response window for the upstream project**, not a representation that operators may rely on it as their legal compliance baseline.
- **Public-interest factual claims** are presumed retained under the carve-out; operators in jurisdictions with stricter rules (e.g., German persönlichkeitsrecht, Spanish honor laws) may need to remove content that the upstream project retains. Operator-side removal does not bind the upstream project.
- `docs/operator-obligations.md` expands this framing and includes a non-exhaustive checklist; `docs/data-ethics.md` covers attribution and affiliate disclosure. Neither document is legal advice.

### 11.4 Existing docs updates

| Path | Change |
|---|---|
| `docs/delivery-model.md` | Reference 7-epic plan, PR cadence, branch protection rules |
| `docs/deployment-contract.md` | Two-app layout; production builds `apps/public` only; admin is dev-only loopback; CSP baked at build time |
| `docs/testing-strategy.md` | Add visual regression (Playwright 360/900/1280 with `visual:approve` label), axe-core-per-route, size-limit, integration harness, mobile-first default viewport |
| `docs/workstation-setup.md` | Add `npm run storybook`, `npm run dev:admin`, font setup, MSW+Playwright install, mise tool list update |

### 11.5 GitHub meta files

| Path | Content |
|---|---|
| `.github/ISSUE_TEMPLATE/bug.yml` | structured bug report |
| `.github/ISSUE_TEMPLATE/feature.yml` | feature request |
| `.github/ISSUE_TEMPLATE/data-quality.yml` | "a displayed value looks wrong" — resort + field + source + observed vs expected |
| `.github/ISSUE_TEMPLATE/source-integration.yml` | new source proposal: upstream TOS, rate limit, adapter checklist (`upstream_hash`, rate limit, size cap, redaction, fixture), DCO confirmation |
| `.github/ISSUE_TEMPLATE/takedown.yml` | rights holder takedown path; references 11.3.2 SLA |
| `.github/ISSUE_TEMPLATE/scope-question.yml` | "is this in scope?" — points to roadmap + `GOVERNANCE.md` |
| `.github/PULL_REQUEST_TEMPLATE.md` | summary + testing + DCO reminder + screenshots (UI) + README-drift check |
| `.github/PULL_REQUEST_TEMPLATE/source-integration.md` | adapter-specific: upstream TOS confirmed, redaction added + tested, `upstream_hash` pre-parse, rate limit respected, fixture recorded with `RECORD_ALLOWED`, size budget ok |
| `.github/CODEOWNERS` | `/packages/schema/`, `/packages/integrations/`, `/config/csp.ts`, `/nginx.conf`, `/.github/workflows/` require maintainer review; `visual:approve` label required on visual baseline changes |
| `.github/dependabot.yml` | npm weekly (`cooldown: 7d`), github-actions weekly, docker monthly; grouped |
| `.github/labels.yml` | `good-first-issue`, `help-wanted`, `visual:approve`, `schema-change`, `security`, `takedown`, `data-quality`, `not-planned`, `phase-1`, `phase-2` |

### 11.6 README-drift enforcement

1. PR template checkbox: "README.md updated (if this PR changes product scope, workflow, or system boundary) — link the section OR attest not applicable."
2. `CODEOWNERS`: any change to `apps/public/src/features/**`, `packages/schema/**`, or `research/cli.ts` requires a second reviewer to vouch for README alignment.
3. CI job `scripts/check-readme-drift.ts`: diffs section hashes against product-scope path changes; fails the PR if touched paths lack a corresponding README section update.
4. CLAUDE.md rule (preserved): treat README drift as a documentation bug.

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

**Resolution:** override the drafting agent's Epic 7 deferral. Flag is enabled in Epic 1 PR 1.1.

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

## 13. Reviewer Lineage

Specialist reviewers consulted during drafting (each section marked with which reviewers signed off):

| Section | Reviewers |
|---|---|
| 2 — Public app surface | architecture, UX/a11y, security |
| 3 — Admin app (loopback) | frontend (2), security, UI/mobile design system |
| 4 — Schema | CMS reviewer |
| 5 — Selectors | (rolled into Section 4 review) |
| 6 — Design system | UI expert, OSS governance |
| 7 — Integration adapters | backend, security |
| 8 — Phase 2 target state | backend |
| 9 — Phase 1 epics | TypeScript/delivery, frontend delivery |
| 10 — Code disposition | senior staff engineer |
| 11 — Docs & governance | technical writer / OSS governance |

All fold-ins from each review are reflected in the section text above.

---

## 14. Next Steps — ready for implementation planning

All seven open decisions from the drafting pass are resolved (§12). ADR-0001 (the "why" for the pivot) lands in the same PR as this spec. `README.md` and `CLAUDE.md` are updated in the same PR to keep the repo's product framing consistent with the pivot.

The expected next artifact is a detailed implementation plan at `docs/superpowers/plans/2026-04-22-product-pivot.md` enumerating Epic 1 PR 1.1 down to step-by-step tasks with acceptance criteria.

### 14.1 What this PR ships

1. `docs/superpowers/specs/2026-04-22-product-pivot-design.md` — this spec, with all §12 resolutions folded in.
2. `docs/adr/0001-pivot-to-data-transparency.md` — the decision record for the pivot itself.
3. `README.md` — rewritten per §11.1 so the repo's public framing matches the pivot.
4. `CLAUDE.md` — amended per §11.2 so agent instructions reflect the new product direction and code rules.
5. `docs/superpowers/specs/2026-04-03-snowboard-trip-advisor-design.md` — renamed with an `ARCHIVED-` prefix so future readers don't confuse the superseded spec with this one.

### 14.2 What happens next

1. Human review of this PR.
2. Merge to `pivot/data-transparency`; `main` stays on the pre-pivot state until Epic 7 closes and the branch is merged back (per §10.4).
3. Dispatch `writing-plans` against this spec to produce the epic-by-epic implementation plan.
4. Execute Epic 1 PR 1.1 first (npm workspaces layout; `exactOptionalPropertyTypes: true` on Day 1 per §12.4).

### 14.3 Ground rules carried forward

- Branch protection on `pivot/data-transparency`: force-push OFF, up-to-date-with-base OFF, required checks ON. Do not rebase; `git merge main` weekly (§10.4).
- `npm run qa` (lint → typecheck → coverage) is the hard gate on every PR. This spec is prose only and does not trip the gate; any code PR must.
- ADRs 0002–0007 backfill at Epic 7 PR 7.3. Additional ADRs are expected mid-stream during Epic 6 (real-adapter integration surfaces new decisions).
