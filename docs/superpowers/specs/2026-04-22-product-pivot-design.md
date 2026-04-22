# Product Pivot: Data-Transparency Comparison Tool

**Spec date:** 2026-04-22
**Status:** Draft — awaiting user input on 7 open decisions (see §12) before implementation plan can be written
**Supersedes:** `docs/superpowers/specs/2026-04-03-snowboard-trip-advisor-design.md` (scoring-based ranker)
**Decision record:** ADR-0001 (`docs/adr/0001-pivot-to-data-transparency.md`)

---

## ⚠ Missing Decisions — READ BEFORE IMPLEMENTING

This spec was drafted under a "follow my own recommendations" directive. Every architectural decision currently has a defensible choice written in, but **seven of those choices were made by the drafting agent, not by the user**. They are listed in full detail in [§12 Open Major Decisions](#12-open-major-decisions-for-user-review). Summary:

| # | Decision | Current choice | Reversibility cost if user overrides |
|---|---|---|---|
| 1 | Phase 2 stack | Fastify + Lucia + Postgres + Redis + BullMQ + S3 | HIGH — rewrites most of §8; `/api/*` contract (§8.5.1) survives |
| 2 | Phase 1 admin auth | Loopback-only, no auth | MEDIUM — adds ~1 epic if second user needed before Phase 2 |
| 3 | Per-resort publish threshold | Deferred until >25 resorts | LOW — ~2 PRs in Epic 2 or 5 |
| 4 | `exactOptionalPropertyTypes` | Deferred to Epic 7 | LOW–MEDIUM — ~1 day schema cleanup if flipped Day-1 (TS reviewer dissents) |
| 5 | Phase 2 auth library | Lucia (not Auth.js v5) | MEDIUM — rewrites §8.3 |
| 6 | Phase 1 rate-limit bucket | Filesystem + flock (shared CLI + admin) | LOW — in-memory variant is simpler if CLI drops fetches |
| 7 | License + CLA | Apache-2.0 + CC BY 4.0 + DCO (no CLA) | HIGH at a later date if dual-license needed |

**Handoff contract for the next agent picking this up:**

1. Do **not** start `writing-plans` until the user has signalled which of the seven items they accept, override, or defer.
2. For items the user accepts as-written, capture the implicit approval in-session and proceed.
3. For items the user overrides, edit §12 **and** propagate the change into the affected spec sections (e.g., overriding #1 rewrites most of §8; overriding #5 rewrites §8.3; overriding #7 touches §11.1.1 and every license header).
4. If the user signals a new missing decision this agent did not anticipate, add it to §12 **and** this summary table.
5. Once §12 is empty of user-blocking items, re-run the all-specialist final review (§13 reviewer lineage) on the revised file before invoking `writing-plans`.

Do **not** treat this checklist as closed. Items #1 and #7 in particular are high-cost to reverse later; a user "sure, whatever" answer is not a real accept unless the user has seen the rewrite cost.

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

- Multi-operator deployments via Fastify + Lucia + Postgres + Redis + BullMQ + S3.
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

- **One process.** No separate admin-api binary in Phase 1. The `flock()` rate-limit bucket (Section 7.4) is forward-compat for Phase 2 and for CLI/admin concurrency during development.
- **Wire contract identical to Phase 2.** Every request/response goes through Zod parse on both sides. Admin's browser code never imports filesystem APIs, Node-only modules, or the adapter registry directly. It only uses `fetch`.
- **Middleware plugin scope:** registered only on `apps/admin`'s Vite dev server. `apps/public`'s Vite server has no such middleware; the public app is read-only and consumes only `data/published/current.v1.json`.
- **Production admin:** the middleware plugin is **not bundled** into any container image (`apps/admin` is never built for production in Phase 1). Phase 2 replaces the middleware with a real Fastify service.

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

Filesystem-backed bucket at `data/integrations/rate-limits/<source>.json`. `flock()` on the file; atomic increment + timestamp; shared across the CLI process and the admin-api process (Phase 1 needs this because both can fetch). Phase 2 upgrades to Redis `CL.THROTTLE`.

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

`research/cli.ts`:
- `refresh:snow` — fetch snow data for all resorts (opensnow + snowforecast).
- `refresh:lifts` — fetch lifts_open for all resorts (resort-feed).
- `refresh:all` — full refresh (all adapters for all resorts).
- `test:adapter <source> --resort <slug> [--record]` — probes one adapter; `--record` writes a fixture (requires `RECORD_ALLOWED=true`).
- `migrate:v0-to-v1` — one-shot migration (see Section 10).
- `publish` — full publish pipeline.

---

## 8. Phase 2 Target State

Phase 2 is a target, not part of this spec's implementation scope. Recorded here so Phase 1 choices don't paint us into a corner.

### 8.1 Services

- `services/admin-api/` — Fastify + Lucia (NOT Auth.js). Lucia chosen because: Fastify-native, explicit session model, Postgres-owned session state, no Next.js coupling.
- `services/admin-workers/` — BullMQ workers for adapter fetches, publish jobs, notification sends.
- **`WORKER_MODE=inline|external`** — for small deployments, workers run in the admin-api process; for large deployments, they run separately. Same code, different boot path.

### 8.2 Data stores

- **Postgres** — primary persistence. Append-only versioning (not shadow tables). `publish_archives` table separate from `publish_events`. `pg_partman` daily partitions on the `audit_log` table. App role only has `INSERT` on the current-day partition via a `SECURITY DEFINER` function.
- **Audit log read path:** a separate `audit_reader` Postgres role has `SELECT` on **all** `audit_log` partitions (current + historical). The `/api/audit` endpoints (8.5.1 #8–#9) execute under this role via connection-pool role switching; the write-only app role never reads audit records. This prevents a compromised app role from exfiltrating the full audit history, while keeping the read surface available to authorized reviewers.
- **Redis** — session rotation, presence pub/sub (advisory short TTL, not locking), `CL.THROTTLE` rate limiting, BullMQ queues.
- **S3** — raw upstream audit archives (migrated from filesystem). S3 Block Public Access + SSE-KMS CMK + lifecycle expiration 30-90d + deny `aws:SecureTransport=false`.

### 8.3 Auth & RBAC

- **Sessions in Postgres** (Lucia). Cookie flags: `HttpOnly; Secure; SameSite=Lax; __Host-` prefix.
- **CSRF:** double-submit token.
- **Refresh token rotation** on every use, with **grace window and family reuse detection:**
  - Each refresh token carries a `family_id` (uuid shared across the rotation chain) and a `generation` counter.
  - On successful rotation, the previous token stays valid for a **30-second grace window** to absorb race conditions (concurrent tabs, retried requests).
  - If a token is presented **after** its grace window expired AND a newer generation in the same `family_id` has already been issued, the server treats it as reuse: the entire family is revoked, all sessions under that `user_id` are terminated, and a `security.refresh_reuse` audit event is emitted.
  - This is the textbook OAuth 2.1 refresh token rotation model; documented here so Phase 2 implementation cannot accidentally omit reuse detection.
- **RBAC** via `routeGuard({ role })` Fastify plugin wrapper. ESLint rule requires `preHandler: requireRole(...)` with explicit `'public'` sentinel on unauthenticated routes. Meta-test asserts `fastify.printRoutes()` enumerates only wrapped routes. Roles: `public`, `editor`, `publisher`, `audit_reader`, `admin`. Every `/api/*` endpoint in 8.5.1 names its role explicitly.

### 8.4 Preview tokens

Ed25519 signed (not HMAC). Default TTL 1h, max 24h. `jti` (claim) + `token_version` in DB allow instant revocation on role change.

### 8.5 API contract stability

The Phase 1 `/api/*` surface consumed by `apps/admin` is the stable contract. Phase 2 Fastify re-implements it **verbatim**. The admin UI code does not change at the Phase 1 → Phase 2 boundary; only its backing store does. This mirrors the Sanity Studio / Sanity API separation.

#### 8.5.1 `/api/*` contract inventory

The following endpoints are the Phase 1 → Phase 2 stable surface. Every entry specifies: method, path, request schema (Zod), response schema (Zod), role requirement (Phase 2), rate-limit class (Phase 2). Schemas live in `packages/schema/api/*.ts`.

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
| 11 | `POST /api/preview-tokens` | `PreviewTokenBody` (slug, TTL ≤24h) | `PreviewTokenResponse` (Ed25519-signed token) | `editor` | write |
| 12 | `GET /api/analyst-notes/:slug` | `ResortSlugParam` | `AnalystNoteResponse` (Markdown body, sanitized HTML preview) | `editor` | read |
| 13 | `PUT /api/analyst-notes/:slug` | `AnalystNoteBody` | `AnalystNoteResponse` | `editor` | write |
| 14 | `POST /api/auth/login` (P2) | `LoginBody` | `LoginResponse` (sets session cookie) | `public` | auth |
| 15 | `POST /api/auth/logout` (P2) | — | `204 No Content` | any | auth |
| 16 | `POST /api/auth/refresh` (P2) | — (refresh cookie) | `204` (new session + refresh cookie) | any | auth |

**Contract invariants enforced by CI:**
1. Every endpoint has a Zod schema pair in `packages/schema/api/*.ts`.
2. `apps/admin` fetches go through a single typed client generated from those schemas (no ad-hoc `fetch` calls outside the client).
3. A contract snapshot test serializes the schema set to JSON and diffs against `packages/schema/api/__snapshots__/contract.snap`. Changes require maintainer review.
4. Phase 2 Fastify registers each route with the same Zod schemas via `fastify.withTypeProvider<ZodTypeProvider>()` — route registration fails to compile if the admin UI's expected shape diverges.
5. `GET`/`HEAD` are idempotent and safe; `POST`/`PUT` carry `Idempotency-Key` headers on destructive operations (publish, sync) in Phase 2.

**Phase 1 specifics:**
- All endpoints served by `apps/admin/server/*.ts` via the Vite middleware plugin (Section 3.11).
- Role checks are no-ops in Phase 1 (loopback-only, no auth); the role column is populated so Phase 2 can flip them on without schema churn.
- Rate-limit class is advisory in Phase 1 (flock-based bucket from Section 7.4); Phase 2 enforces via `CL.THROTTLE`.

### 8.6 Field-level review

- Field-level comments thread (`(resort_id, field_path) → comments[]`).
- Unresolved threads block `approved → published` transition.

### 8.7 Per-resort publish

Activated when the resort count crosses 25. Per-resort publish regenerates `current.json` atomically by composing all `published`-state rows for the operator's dataset.

### 8.8 Secrets

Via KMS / Vault / SOPS, loaded at boot, Zod-validated at boot. Fail-closed if any required secret is missing.

**Rotation semantics (explicit):**
- Secrets are read **only at process boot** — no hot-reload, no filesystem watchers. This keeps the threat model simple (no TOCTOU on secret file reads) and makes rotation deterministic.
- **Rotation procedure:** operator rolls the secret in the backing store (KMS/Vault/SOPS) → triggers a rolling restart of `services/admin-api` + `services/admin-workers` → new processes boot with the rotated secret → old connections drain.
- **BullMQ job idempotency:** every enqueued job carries a `jobKey` (resort_slug + adapter_key + target_observed_at bucket). Workers use BullMQ's built-in `jobId`-based deduplication so that a job retried after a mid-rotation 401 is not executed twice against the upstream.
- **401 handling:** workers that get a 401 from any upstream auth surface exit with code `EX_CONFIG` (78) instead of retrying; the supervisor's backoff-and-restart cycle picks up the rotated secret on boot. CLI surfaces this with a clear "secrets changed; restart the worker" hint.
- **Secret `version` field:** every secret record includes a `version` integer. Boot logs record the loaded version; an audit event (`secret.loaded`) includes the version but never the value.

### 8.9 Observability

- `pino` structured logs with `requestId` + `traceparent` propagation.
- OpenTelemetry traces through adapter fetches.
- Error boundary instrumentation in `apps/public` + `apps/admin`.

---

## 9. Phase 1 Epic Breakdown

Seven epics, ~36 PRs. Each epic completes independently; the quality gate stays green throughout.

### Epic 1 — Workspace + schema + adapter contract + design-system scaffold + CSP + harness + ESLint + size-limit

**PR 1.1** — npm workspaces layout; root `tsconfig.base.json` + `tsconfig.references.json` + per-package `tsconfig.json`; `vitest.workspace.ts`. Strict flags: `strict: true`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`. `exactOptionalPropertyTypes` **deferred to Epic 7**.

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
**PR 6.2** — Filesystem-backed rate-limit bucket (flock + JSON counter).
**PR 6.3** — Audit archive writer (validate-before-persist; 30d / 100-per-resort-per-source retention).
**PR 6.4** — OpenSnow adapter + fixture + redaction rules.
**PR 6.5** — Resort-feed adapter (durable facts) + fixture + redaction.
**PR 6.6** — Snow-Forecast adapter + fixture + redaction.
**PR 6.7** — Booking.com + Airbnb adapters (deep-link generators + fixture).
**PR 6.8** — CLI `refresh:snow` / `refresh:lifts` / `refresh:all` / `test:adapter`.

### Epic 7 — Stabilization & observability

**PR 7.1** — `exactOptionalPropertyTypes` flip + fixes.
**PR 7.2** — `pino` structured logging + error boundary instrumentation in both apps.
**PR 7.3** — Performance/a11y audit rollup (Lighthouse CI + size-limit baseline tuning).
**PR 7.4** — ADR backfill (0001–0007) + `docs/release-policy.md` + DX polish (commit hooks, codemod utilities).

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
9. The research CLI (`refresh:snow`, `refresh:lifts`, `refresh:all`, `test:adapter`, `migrate:v0-to-v1`, `publish`).
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

**ADR cadence note:** 0001-0007 are the Day-1 backfill at Epic 7 PR 7.4. Additional ADRs are expected to land during Epic 6 (real-adapter integration raises new decisions — upstream TOS negotiation, rate-limit tuning, redaction corpus maintenance). The ADR process (0007) describes how to propose new ones mid-stream; any architectural decision reached during Epic 6 that a reviewer flagged as "needs a writeup" becomes an ADR PR before the epic closes.

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

## 12. Open Major Decisions (for user review)

All reviewer feedback folded; no remaining blocking disagreements among specialists. The items below are decisions made under the "follow my own recommendations" directive — each is something the user may wish to revisit. Items closed by other sections have been removed from this list.

1. **Phase 2 tech stack is Fastify + Lucia + Postgres + Redis + BullMQ + S3, not Next + Auth.js + Supabase.** Reasoning: Fastify-native session primitives; explicit session model; Phase 2 presence + BullMQ + S3 are stable infrastructure choices; admin UI stays a Vite SPA across the migration because the `/api/*` contract is stable (now fully specified in 8.5.1). If the user wants a different stack (e.g., a single Next.js app replacing both UIs), the `/api/*` contract inventory still holds as the portability line but most of Section 8 is re-decided.

2. **Admin is loopback-only in Phase 1 with no auth.** If the user plans to share the admin with a second person before Phase 2 ships, Phase 1 needs a minimum viable auth (Basic or HMAC-over-a-shared-token). Current spec does not include this.

3. **Per-resort publish deferred until resort count crosses 25.** If the user plans to add more than 5 resorts before Phase 2 and wants independent publish cadences per resort, per-resort publish moves into Phase 1 (+~2 PRs in Epic 2 or 5).

4. **`exactOptionalPropertyTypes` is deferred to Epic 7.** TypeScript reviewer argued for a Day-1 flip (concentrates cleanup cost where new code is being written; avoids a large end-of-project diff). Current spec keeps the deferral because Zod's `.optional()` output interacts awkwardly during the v0→v1 schema migration and the fixture re-recording campaign lands in Epic 2. Reviewer dissent is recorded so the user can override: flipping in PR 1.1 adds ~1 day of schema-migration work up front in exchange for strictly cleaner new code throughout Epics 2–6.

5. **Fastify + Lucia vs Auth.js v5 (Auth.js now supports non-Next hosts).** Auth.js v5 beta runs outside Next. Current spec chooses Lucia for explicit session persistence; if the user wants provider-ergonomics (OAuth, passkeys via Auth.js adapters), the spec switches to Auth.js v5 at the cost of session-storage control.

6. **Rate-limit bucket in Phase 1 is filesystem-backed (flock).** Alternative was in-memory, per-process. Current choice shares quota across CLI + admin-api processes. If the user is willing to restrict to admin-only fetches (no CLI) in Phase 1, the filesystem complexity goes away.

7. **Apache-2.0 + CC BY 4.0 + DCO (no CLA).** Alternative was MIT-code + CC0-data + CLA. Current choice is Apache-2.0 because of the patent-grant clause and NOTICE support for third-party trademarks; DCO over CLA for contributor friction. If the user plans to dual-license a proprietary edition later, a CLA becomes necessary.

*(Previously-listed items #4 "matrix below md," #8 "services/ placeholders," and #9 "filesystem Phase 1" were closed by Sections 2.2/2.3, 10.3, and Section 1 respectively and have been removed from this list.)*

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

## 14. Next Steps (post-approval) — handoff for the continuation agent

Per the brainstorming-skill contract, this spec is the handoff to the `writing-plans` skill. The expected next artifact is a detailed implementation plan at `docs/superpowers/plans/2026-04-22-product-pivot.md` that enumerates Epic 1 PR 1.1 down to step-by-step tasks with acceptance criteria.

### 14.1 Where this spec stopped

The drafting agent completed:
1. Full spec (§§0–13) across all reviewer domains.
2. Four rounds of all-specialist final review with all CRITICAL/IMPORTANT findings folded in.
3. Seven open decisions explicitly flagged at the top of the file (⚠ Missing Decisions callout above) and detailed in §12.
4. Spec committed to `pivot/data-transparency` branch (see PR linked in commit log).

The drafting agent did **not** complete:
1. User sign-off on the seven open decisions in §12 — the user must respond before implementation planning starts.
2. Final all-specialist review on the committed file (this runs again after §12 decisions are resolved — overrides change spec content).
3. Invocation of `writing-plans`.

### 14.2 What the continuation agent must do

**Step 1 — block on user decisions.** The continuation agent must **not** dispatch `writing-plans` until §12 is resolved. Present the seven items from the Missing Decisions callout to the user as a structured question set (one question at a time per the brainstorming skill; accept/override/defer). For items the user overrides, propagate changes into all affected sections — do not leave §12 and §§2–11 out of sync.

**Step 2 — re-run final review.** After §12 edits, dispatch the all-specialist review one more time on the revised file. If any reviewer raises a new CRITICAL finding that trace-links to a user override, fold it in before proceeding.

**Step 3 — commit the resolved spec.** Amend or follow-up commit with DCO sign-off on the same `pivot/data-transparency` branch. Do not open a second PR; amend the existing one.

**Step 4 — dispatch `writing-plans`.** Only after §12 is clean and the final review passes. The plan targets the 7-epic, ~36-PR decomposition in §9.

### 14.3 Non-obvious context the continuation agent may not have

- The user's autonomous-execution directive (from the drafting session): "1. Proceed section by section until the full spec is finished. 2. Run relevant specialist reviews at each section and incorporate feedback. 4. Iterate until reviewers are satisfied. 5. Save the final version. 6. Run a full final review with all specialists used so far. 7. Continue iterating until all specialists are satisfied." — The drafting agent is at step 7 complete. The continuation agent resumes at user-facing decision resolution.
- The user's preference (recorded as a feedback memory): follow own recommendations on decisions; only surface decisions that are truly blocking or high-cost-to-reverse. The seven items in §12 meet that bar.
- The `pivot/data-transparency` branch protection is described in §10.4: force-push OFF, up-to-date-with-base OFF, required checks ON. Do not rebase; `git merge main` weekly.
- This repo runs under strict `npm run qa` (lint → typecheck → coverage); this spec is prose only and does not trip the gate, but any follow-up commits that touch code must.
