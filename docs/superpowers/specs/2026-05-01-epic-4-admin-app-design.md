# Epic 4 — Admin App (`apps/admin`) Design

**Spec date:** 2026-05-01.
**Parent product spec:** [`docs/superpowers/specs/2026-04-22-product-pivot-design.md`](2026-04-22-product-pivot-design.md) §3 (admin app product surface), §4 (data model — already in `packages/schema`), §5 (`ResortView` projection — already shipped), §8 (`/api/*` contract).
**Predecessor:** [`docs/superpowers/specs/2026-04-28-epic-3-public-app-design.md`](2026-04-28-epic-3-public-app-design.md) (Epic 3 — public app, shipped).
**ADRs in flight:** [ADR-0011](../../adr/0011-defer-test-sync-ux-to-epic-5.md) (Test / Sync deferral), [ADR-0012](../../adr/0012-defer-analyst-notes-to-post-epic-4-followup.md) (Analyst notes deferral).
**Authoritative agent rules:** `AGENTS.md` (or `CLAUDE.md` until the agent-discipline migration stack lands).

## 0. Executive Summary

Epic 4 ships `apps/admin`, a loopback-only Vite SPA + in-process API middleware that lets a single analyst edit `Resort` and `ResortLiveSignal` documents and trigger an all-or-nothing publish through the same `publishDataset()` pipeline `apps/public` already consumes. The admin app is **never** built into a production container image; the network boundary (`127.0.0.1:5174` `strictPort: true`) is the access control in Phase 1. Editing is read-only below the `md` breakpoint — controls are removed from the tab order, not merely disabled.

**What ships in Epic 4** (10 PRs across foundation, navigation, editor, publish, polish):

- **Foundation** (PRs 4.1a/b/c) — `packages/schema/api/` Zod surface for 6 in-scope endpoints + `WorkspaceFile` schema + contract-snapshot test; the `vite-plugin-admin-api.ts` middleware skeleton + `apps/admin` Shell composition; design-system additions (Sidebar, StatusPill, Tabs, Popover, DropdownMenu).
- **Navigation** (PRs 4.2 / 4.3) — Dashboard health cards + Resorts table.
- **Editor** (PRs 4.4a/4.4b) — Resort editor split on the read-vs-write axis: 4.4a ships GET + workspace read + render-only durable + live panels with StatusPill wiring; 4.4b ships ModeToggle + MANUAL edit form + PUT + workspace atomic-write + integration round-trip.
- **Publish** (PR 4.5) — POST publish + publish history + Toast wired to publish success/failure.
- **Polish** (PRs 4.6a/4.6b) — keyboard shortcuts + responsive read-only-below-md affordance; integration tests + Dockerfile prod-build guard.

**What does NOT ship in Epic 4** (out of scope; documented per ADR / parent spec):

- Test / Sync adapter actions + endpoints 4-5 — deferred to Epic 5 alongside the first real (non-stub) adapter ([ADR-0011](../../adr/0011-defer-test-sync-ux-to-epic-5.md)).
- Per-resort, per-field analyst notes + endpoints 9-10 + Markdown sanitizer + per-field UI — deferred to a small post-Epic-4 follow-up PR ([ADR-0012](../../adr/0012-defer-analyst-notes-to-post-epic-4-followup.md)).
- Auth (Phase 2 only — loopback IS the boundary in Phase 1), audit-log read surface (Phase 2), preview tokens (Phase 2 — loopback admin has no sharing), per-resort publish (Phase 2; trigger condition is resort count ≥ 25).

The admin's `/api/*` wire contract is the **stable portability line** across Phase 1 → Phase 2 (parent §8.4). Phase 2 swaps the Vite middleware for a Hono service over Postgres without changing the SPA's fetch boundary.

---

## 1. Locked Decisions Summary

| # | Decision | Rationale |
|---|---|---|
| 1 | **Loopback-only binding** (`127.0.0.1:5174`, `strictPort: true`). | Per parent §3.1. Network boundary is the Phase 1 control; no auth needed. `strictPort` makes accidental port drift fatal (catches misconfig early). |
| 2 | **In-process API** via `apps/admin/vite-plugin-admin-api.ts` middleware. | Per parent §3.11. Single Node process; no IPC; rate-limit bucket in-memory. Phase 2 swaps to Hono with the same wire contract. |
| 3 | **Wire contract is the portability line.** All `/api/*` requests/responses go through Zod schemas in `packages/schema/api/*.ts`. | Per parent §8.4 invariants. SPA never knows whether the server is Vite middleware or a real Hono service. |
| 4 | **Read-only below the `md` breakpoint.** Edit controls are **removed from the tab order**, not merely `disabled`. | Per parent §3.2. Keyboard-only users on small screens can't tab onto inert controls. |
| 5 | **All-or-nothing publish in Phase 1.** Calls `publishDataset()` from `@snowboard-trip-advisor/schema/node` directly — same pipeline `apps/public` consumes via the published file. | Per parent §3.7. Per-resort publish is a Phase 2 concern (trigger ≥ 25 resorts). The "same pipeline as `research/cli.ts publish`" wording in §3.7 is the LOGICAL pipeline (parse → Zod validate → atomic write → archive), not a literal subprocess; admin's Vite middleware imports `publishDataset()` directly per §3.11. No `research/cli.ts` build needed for Epic 4. |
| 6 | **Workspace file format is forward-compatible.** `data/admin-workspace/<slug>.json` ships Resort-only initial schema with Zod `.passthrough()` (or `Partial<{ notes }>`) so the post-Epic-4 analyst-notes follow-up can add a `notes` field without a `schema_version` bump. | Per [ADR-0012](../../adr/0012-defer-analyst-notes-to-post-epic-4-followup.md) §Decision step 2. Workspace files are admin-internal — they live outside the `published.schema_version` versioning scheme. |
| 7 | **Test / Sync deferred to Epic 5** | Per [ADR-0011](../../adr/0011-defer-test-sync-ux-to-epic-5.md). Real adapters land in Epic 5; designing Test/Sync UX against stubs produces shallow UX. |
| 8 | **Analyst notes deferred to a post-Epic-4 follow-up PR.** | Per [ADR-0012](../../adr/0012-defer-analyst-notes-to-post-epic-4-followup.md). Markdown sanitizer + per-field UI ship in their own PR; workspace file format is forward-compat to permit additive landing. |
| 9 | **Vite middleware process model: NO separate ADR.** Captured here in §10.1 instead. | Parent §3.11 + §8.4 already adjudicate the decision (one process, no separate binary, Phase 2 swap path) with explicit reasoning. ADR-0004 precedent shows ADRs document NEW reasoning; Vite-middleware-as-API has its reasoning inline already. |

### 1.1 Parent-spec divergences

| Parent reference | Divergence | Reason |
|---|---|---|
| §3.6 (Resort editor) | No `Test` / `Sync` actions in Epic 4. | [ADR-0011](../../adr/0011-defer-test-sync-ux-to-epic-5.md). Real adapters land in Epic 5. |
| §3.6 (Resort editor) | `AUTO` mode in Epic 4 displays the most recent value with `SourceBadge` (read-only); no refresh-from-adapter button. `MANUAL` mode is the only edit path. | [ADR-0011](../../adr/0011-defer-test-sync-ux-to-epic-5.md). The ModeToggle wire shape is locked in Epic 4; Epic 5 widens `AUTO`'s behaviour. |
| §3.7 (Publish workflow) | "Same pipeline as `research/cli.ts publish`" — but the CLI does not exist on `main` and is **not** in Epic 4 scope. The admin handler imports `publishDataset()` from `@snowboard-trip-advisor/schema/node` directly. | The parent wording describes the LOGICAL pipeline. In-process import is consistent with §3.11's single-process topology. A future `research/cli.ts` is a separate concern (likely Epic 5 or 6). |
| §3.9 (Analyst notes) | No analyst-notes UI / endpoints / Markdown sanitizer in Epic 4. | [ADR-0012](../../adr/0012-defer-analyst-notes-to-post-epic-4-followup.md). Workspace file is forward-compat for the follow-up PR. |
| §8.4.1 (`/api/*` contract inventory) | Endpoints 4 (`POST /api/resorts/:slug/test-adapter/:sourceKey`) and 5 (`POST /api/resorts/:slug/sync/:sourceKey`) are NOT schema'd in `packages/schema/api/` and NOT registered in `apps/admin/server/` in Epic 4. | [ADR-0011](../../adr/0011-defer-test-sync-ux-to-epic-5.md). Land with the first real adapter. |
| §8.4.1 (`/api/*` contract inventory) | Endpoints 9 (`GET /api/analyst-notes/:slug`) and 10 (`PUT /api/analyst-notes/:slug`) are NOT schema'd / registered in Epic 4. | [ADR-0012](../../adr/0012-defer-analyst-notes-to-post-epic-4-followup.md). Land with the analyst-notes follow-up PR. |

---

## 2. Architecture & Package Layout

### 2.1 Workspace dependencies

```
packages/
  schema/                  (leaf — Resort, ResortLiveSignal, validatePublishedDataset, publishDataset, ResortView, FieldStateFor<T>)
    api/                   (NEW in Epic 4 — Zod request/response surface for the admin /api/*)
  design-system/           (← schema; extends in PR 4.1c with Sidebar, StatusPill, Tabs, Popover, DropdownMenu; Toast lands in 4.5)
  integrations/            (← schema; stub adapters only — Test/Sync not consumed in Epic 4 per ADR-0011)

apps/
  public/                  (← schema, design-system, integrations — Epic 3, shipped)
  admin/                   (← schema, schema/api, design-system, integrations)
    server/                (NEW — handler modules per endpoint)
    src/                   (SPA — Shell, views, state, lib)
    vite-plugin-admin-api.ts (NEW — middleware that wires server/* into the dev server)
    vite.config.ts         (extends to register the admin-api plugin)
```

Cross-layer imports remain blocked by `eslint.config.js` `no-restricted-imports`. Adding `packages/schema/api/**` to the admin's allowed-import surface; the public app does NOT import `schema/api/*` (it consumes only the published file via `loadResortDatasetFromObject`).

### 2.2 Schema package additions (PR 4.1a)

**`packages/schema/api/` (NEW directory):**

- `index.ts` — barrel re-export of every schema pair below.
- `listResorts.ts` — `ListResortsQuery` + `ListResortsResponse` (endpoint 1).
- `resortDetail.ts` — `ResortSlugParam` + `ResortDetailResponse` (endpoint 2; full durable + latest live + per-field state via `FieldStateFor<T>`).
- `resortUpsert.ts` — `ResortUpsertBody` + reuses `ResortDetailResponse` (endpoint 3).
- `publish.ts` — `PublishBody` + `PublishResponse` (endpoint 6; version id, archive path).
- `listPublishes.ts` — `ListPublishesQuery` + `ListPublishesResponse` (endpoint 7; version history).
- `health.ts` — `HealthQuery` (none) + `HealthResponse` (endpoint 8; adapter freshness, archive size).
- `__snapshots__/contract.snap` — JSON serialization of every Zod schema in the directory; updated via `npm run test:contract-snap` (added in 4.1a). Diffs require maintainer review per parent §8.4.1 invariant 3.

Endpoints 4 + 5 (Test/Sync) and 9 + 10 (analyst notes) are **NOT** added in Epic 4 — they land in Epic 5 and the post-Epic-4 follow-up respectively.

**`packages/schema/src/` additions:**

- `workspaceFile.ts` — `WorkspaceFile` Zod schema for `data/admin-workspace/<slug>.json`. Top-level shape: `{ schema_version: 1, slug: ResortSlug, resort: Resort, live_signal: ResortLiveSignal | null, modified_at: ISODateTimeString }`. Uses Zod `.passthrough()` so the post-Epic-4 follow-up can add a `notes` field additively without a `schema_version` bump.
- `index.ts` / `node.ts` — barrel updates as needed.

### 2.3 `apps/admin/src/` layout

```
apps/admin/
├── index.html             # exists — minor edits in 4.1b for shell mount + meta tags
├── package.json           # exists
├── tsconfig.json          # exists
├── vite.config.ts         # extends in 4.1b to register vite-plugin-admin-api + bind 127.0.0.1:5174 strictPort
├── vite-plugin-admin-api.ts   # NEW — dispatches /api/* requests to apps/admin/server/* handlers
├── public/                # admin-only static assets if any
├── server/                # NEW — handler modules per endpoint (Node-only)
│   ├── listResorts.ts
│   ├── resortDetail.ts
│   ├── resortUpsert.ts
│   ├── publish.ts
│   ├── listPublishes.ts
│   ├── health.ts
│   ├── workspace.ts       # shared: read/write workspace files
│   └── __tests__/         # handler unit tests (no Vite — direct invocation with fixtures)
└── src/
    ├── main.tsx           # exists — minor edits in 4.1b for Shell mount
    ├── App.tsx            # exists — full composition lands in 4.1b
    ├── App.test.tsx       # exists — render contract test
    ├── test-setup.ts      # exists — extend with admin-specific MSW handlers
    ├── lib/
    │   ├── apiClient.ts   # generated from packages/schema/api/* — typed client; SPA never calls fetch directly
    │   ├── apiClient.test.ts
    │   ├── errors.ts      # admin-specific error-envelope decoder
    │   ├── format.ts      # field-value formatters (numbers, dates, currency display)
    │   └── __tests__/
    ├── state/
    │   ├── useResortList.ts
    │   ├── useResortDetail.ts
    │   ├── useWorkspaceState.ts
    │   ├── useModeToggle.ts
    │   ├── usePublish.ts
    │   ├── usePublishes.ts
    │   ├── useHealth.ts
    │   └── *.test.ts
    ├── views/
    │   ├── Shell.tsx          # admin-specific Shell variant (left rail + Sidebar + HeaderBar)
    │   ├── Dashboard.tsx
    │   ├── ResortsTable.tsx
    │   ├── ResortEditor.tsx
    │   │   ├── DurablePanel.tsx
    │   │   ├── LivePanel.tsx
    │   │   ├── FieldRow.tsx       # value + StatusPill + ModeToggle + edit affordance
    │   │   └── ModeToggle.tsx
    │   ├── PublishDialog.tsx
    │   ├── PublishHistory.tsx
    │   └── states/                # DatasetUnavailable, NoResorts (admin variants if needed)
    └── mocks/
        └── server.ts              # MSW handlers for admin /api/* endpoints
```

### 2.4 Vite plugins

`vite-plugin-admin-api.ts` (NEW in 4.1b):

- A `Plugin` that registers a `configureServer` hook.
- The hook installs a Connect-style middleware on `/api/`. The middleware reads the request body (JSON), parses through the matching Zod schema from `packages/schema/api/*`, dispatches to the matching `server/*` handler, parses the handler's return value through the response Zod schema, and writes the response.
- Errors are caught and shaped into a standard `{ error: { code, message, details? } }` envelope (see §4.8 below).
- Phase-1 specifics inline (rate-limit class is advisory; role checks are no-ops).

Plugin scope: only on `apps/admin/`'s Vite dev server. `apps/public/`'s Vite server has no admin-api middleware — the public app reads the published file via `fetch('/data/current.v1.json')` per Epic 3 spec §10.2.

The plugin is **not** built into a production container image. The Dockerfile guard test (PR 4.6b) verifies the prod build does not include `apps/admin/`.

CSP: admin is dev-only in Phase 1; no production CSP is generated. The admin's `index.html` does NOT carry a `<meta http-equiv="Content-Security-Policy">` — the dev server doesn't emit a nonce header, and the prod-image guard prevents the file from ever shipping. Phase 2's Hono service ships its own CSP per the admin product surface there.

### 2.5 Process binding

```ts
// apps/admin/vite.config.ts (sketch)
export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
  },
  plugins: [react(), adminApiPlugin()],
})
```

`strictPort: true` makes startup fail if 5174 is taken — catches accidental port drift early. Admin and public app cannot collide because `apps/public` binds `127.0.0.1:5173` (Vite default).

### 2.6 Engines pin

Inherits the root `engines.node ≥ 20.11` pin. No new engine constraints.

---

## 3. Process Topology

### 3.1 Loopback binding

`apps/admin` is a Vite SPA bound to `127.0.0.1:5174` `strictPort: true`. Started via `npm run dev:admin` (already wired in root `package.json` from Epic 1). No auth in Phase 1 — the network boundary IS the access control. Per parent §3.11, this "admin process" is also the API server.

Admin must NEVER be exposed beyond loopback in Phase 1. The `127.0.0.1` binding (not `0.0.0.0`) is the mechanical control. A future `npm run dev:admin --host` flag would defeat this — the Epic 4 spec explicitly disallows it; an ADR would be required to relax.

### 3.2 In-process API surface

The Vite dev server hosts the `/api/*` middleware in the same Node process. The SPA calls `fetch('/api/...')` — the request never leaves the process; the middleware handles it inline. Per parent §3.11.

```
Browser                Vite dev server (Node process)
─────                  ──────────────────────────────
fetch('/api/resorts')  →  Vite Connect middleware
                       →  vite-plugin-admin-api.ts dispatch
                       →  apps/admin/server/listResorts.ts handler
                       →  reads data/admin-workspace/*.json
                       →  reads data/published/current.v1.json (via packages/schema)
                       ←  returns ListResortsResponse (Zod-validated)
                       ←  middleware writes response
fetch resolves         ←
```

The handler modules under `apps/admin/server/` are **Node-only** — they import `node:fs/promises`, `@snowboard-trip-advisor/schema/node`, etc. They are never bundled into the SPA. The SPA only imports the typed `apiClient` from `apps/admin/src/lib/apiClient.ts`, which generates `fetch` calls from the `packages/schema/api/*` schemas.

Server / SPA boundary discipline: the `eslint.config.js` `no-restricted-imports` rule extends in 4.1a to ban `apps/admin/src/**` from importing `apps/admin/server/**` and `node:*` (mirrors Epic 3's `apps/public/**` ban on `loadResortDataset` from `@snowboard-trip-advisor/schema/node`).

### 3.3 No production build

`apps/admin` is **never** built into the production container image. Per parent §3.1.

The Dockerfile guard (PR 4.6b) is a CI smoke test: build the prod image (or simulate the multi-stage build steps); assert the resulting image does NOT contain any `apps/admin/dist/*` files. Implementation detail in §10.7.

The admin's `npm run build --workspace=@snowboard-trip-advisor/admin-app` exists for development verification (does the SPA tree-shake, does the typed `apiClient` compile against the schemas) but its `dist/` is never copied into the prod image.

---

## 4. `/api/*` Contract (Epic 4 in-scope subset)

Six endpoints in Epic 4 (rows 1, 2, 3, 6, 7, 8 of parent §8.4.1). Endpoints 4-5 deferred to Epic 5 ([ADR-0011](../../adr/0011-defer-test-sync-ux-to-epic-5.md)); endpoints 9-10 deferred to the analyst-notes follow-up ([ADR-0012](../../adr/0012-defer-analyst-notes-to-post-epic-4-followup.md)).

### 4.1 Endpoint 1 — `GET /api/resorts`

**Request:** `ListResortsQuery` — `{ filter?: { country?: ISOCountryCode, hasFailures?: boolean }, page?: { offset: number, limit: number } }`. All fields optional; default page is `{ offset: 0, limit: 50 }`.

**Response:** `ListResortsResponse` — `{ items: ResortSummary[], page: { offset, limit, total } }`. `ResortSummary` includes `slug`, `name`, `country`, `last_updated`, `stale_field_count`, `failed_field_count`, `publish_state`.

**Handler logic** (`apps/admin/server/listResorts.ts`):
- Read all workspace files (`data/admin-workspace/*.json`); fall back to published `current.v1.json` for resorts without workspace files (i.e., never edited).
- Compute `stale_field_count` / `failed_field_count` per resort using `ResortView` projection's `FieldStateFor<T>` (already in `packages/schema/src/`).
- Apply filter + page.
- Respond.

### 4.2 Endpoint 2 — `GET /api/resorts/:slug`

**Request:** `ResortSlugParam` — `{ slug: ResortSlug }` (URL param parsed via Zod).

**Response:** `ResortDetailResponse` — `{ resort: Resort, live_signal: ResortLiveSignal | null, field_states: Record<MetricPath, FieldStateFor<unknown>> }`.

**Handler logic** (`apps/admin/server/resortDetail.ts`):
- Read `data/admin-workspace/<slug>.json` if exists.
- Else read `data/published/current.v1.json` and project the requested resort.
- Build `field_states` via the `ResortView` projection helpers.
- Respond.

### 4.3 Endpoint 3 — `PUT /api/resorts/:slug`

**Request:** `ResortUpsertBody` — `{ resort: Partial<Resort>, live_signal?: Partial<ResortLiveSignal> | null }`. Partial allows field-level edits without resending the whole document.

**Response:** `ResortDetailResponse` — same shape as endpoint 2 (returns the post-write state).

**Handler logic** (`apps/admin/server/resortUpsert.ts`):
- Read existing workspace file (or fall back to published doc + workspace creation).
- Merge incoming partial onto existing state (deep merge for `field_sources`, shallow merge for top-level `Resort` fields).
- Run **client-side-equivalent validation**: parse the merged `Resort` (and `ResortLiveSignal` if present) through the schema. Reject on parse failure with `400 invalid-resort` envelope (see §4.8).
- **Atomic-write** the workspace file (temp file + rename, see §10.3).
- Respond with the post-write `ResortDetailResponse`.

**Note: full `validatePublishedDataset` is NOT run on PUT** — that runs only on publish (endpoint 6). Per-field PUT is permitted to pass through partial / staging states (e.g., a field marked `failed` but not yet replaced with a manual value); the publish gate enforces the full invariants.

### 4.4 Endpoint 6 — `POST /api/resorts/:slug/publish`

**Request:** `PublishBody` — `{ confirm: true }`. The boolean is a guard against accidental publish; the SPA's confirm dialog sets it.

**Note:** despite the path including `:slug`, Phase 1 publish is **all-or-nothing** — the slug parameter is a path artefact for future Phase 2 per-resort publish. The handler reads ALL workspace files and rebuilds the published JSON.

**Response:** `PublishResponse` — `{ version_id: string, archive_path: string, published_at: ISODateTimeString, resort_count: number }`.

**Handler logic** (`apps/admin/server/publish.ts`):
- Read all workspace files.
- Compose the `PublishedDataset` envelope shape (per `packages/schema/src/published.ts`).
- Call `publishDataset(...)` from `@snowboard-trip-advisor/schema/node` — which runs `parse → validatePublishedDataset → atomic write → archive`.
- On success: respond with the version metadata.
- On `validatePublishedDataset` failure: respond `400 publish-validation-failed` with the issue list in `details`.

### 4.5 Endpoint 7 — `GET /api/publishes`

**Request:** `ListPublishesQuery` — `{ page?: { offset, limit } }`. Default `{ offset: 0, limit: 20 }`.

**Response:** `ListPublishesResponse` — `{ items: PublishMetadata[], page: { ... } }`. `PublishMetadata` includes `version_id`, `published_at`, `archive_path`, `resort_count`, `published_by` (Phase 1: hostname fingerprint per spec §4.5.1's `manifest.generated_by`).

**Handler logic:** read the archive directory under `data/published/archive/` (the directory `publishDataset` writes archives into); list versions newest-first; respond.

### 4.6 Endpoint 8 — `GET /api/health`

**Request:** `HealthQuery` — `{}`.

**Response:** `HealthResponse` — `{ resorts_total, resorts_with_stale_fields, resorts_with_failed_fields, pending_integration_errors, last_published_at, archive_size_bytes }`.

**Handler logic:** read all workspace files (or fall back to published doc); aggregate per-field statuses; respond.

### 4.7 Contract invariants (parent §8.4.1, enforced in Epic 4)

1. **Every Phase 1 endpoint has a Zod schema pair** in `packages/schema/api/*.ts`. The contract-snapshot test (4.1a) enforces this mechanically — `__snapshots__/contract.snap` lists every export from `packages/schema/api/index.ts`; diffs require maintainer review.
2. **`apps/admin` fetches go through the typed `apiClient`** generated from those schemas. ESLint rule (4.1a) bans `fetch(` and `XMLHttpRequest` references outside `apiClient.ts`.
3. **The contract-snapshot test** lives at `packages/schema/api/contract.test.ts`; it serializes every schema to JSON and asserts byte-equality with `__snapshots__/contract.snap`.
4. **Phase 2 route registration uses the same schemas** — when Phase 2 lands, route registration imports from `packages/schema/api/*` so a schema change is a Phase 2 compile error.
5. **`GET`/`HEAD` are idempotent and safe.** `PUT`/`POST` carry an `Idempotency-Key` header on destructive operations (publish, sync — sync is Epic 5). Phase 1's in-process middleware honors but does not enforce idempotency keys; Phase 2 enforces.

### 4.8 Error envelope

All error responses share a single shape:

```ts
{
  error: {
    code: string,           // 'invalid-request' | 'invalid-resort' | 'not-found' | 'publish-validation-failed' | 'internal'
    message: string,        // human-readable summary
    details?: unknown,      // Zod issue list, validator issues, etc.
  }
}
```

Schema lives at `packages/schema/api/errorEnvelope.ts`. Every handler wraps its body in a try/catch that produces this envelope on any thrown error. The middleware status codes: `400` for input/validation failures, `404` for not-found, `500` for unhandled errors.

---

## 5. Component Inventory

### 5.1 Design-system additions (PR 4.1c, with Toast moved to PR 4.5)

Per Epic 3 spec §5.1 "Out of Epic 3" — these components are admin-only in Phase 1 (the public app does not consume them). All ship with the same TDD + axe + variant-matrix discipline as Epic 3's components.

- **`Sidebar`** — left-rail navigation. Renders an `aria-label` group of `<NavLink>`-style anchors. Supports an active-route highlight prop.
- **`StatusPill`** — small visual badge with 4 named variants: `Live` | `Stale` | `Failed` | `Manual`. Drives the editor's per-field status indicator. Must axe-clean in all 4 states; uses semantic color tokens from `packages/design-system/src/tokens.ts`.
- **`Tabs`** — top-of-panel tab affordance. Used in PR 4.4a's editor (Durable / Live tabs). Keyboard-navigable per ARIA pattern (Left/Right arrows, Home/End).
- **`Popover`** — anchored floating panel. Used in 4.4b's `FieldRow` for the per-field actions dropdown (Phase 1 has only the ModeToggle; Epic 5's Test/Sync extends it).
- **`DropdownMenu`** — keyboard-navigable menu for the HeaderBar's user identity placeholder + Sources / Integrations / History links. Distinct from `Popover` (menu items vs. arbitrary content).

**Deferred to PR 4.5:** `Toast` — first real consumer is publish success/failure UI; component fan-out tightens by deferring until consumer exists.

**Deferred to analyst-notes follow-up:** `TextArea` — only the analyst-notes UI consumes it ([ADR-0012](../../adr/0012-defer-analyst-notes-to-post-epic-4-followup.md)).

### 5.2 App-level composites in `apps/admin/src/views/`

- **`Shell`** — admin-specific wrapper. Composes `<Sidebar>` (left rail) + `<HeaderBar>` (top, with Publish button + user identity placeholder) + `<main>` content area. Distinct from `apps/public`'s `Shell` — different chrome.
- **`Dashboard`** — health cards grid. Each card surfaces one metric from `GET /api/health`; clicking a card navigates to a filtered Resorts view.
- **`ResortsTable`** — table of resorts from `GET /api/resorts`. Columns: name, country, last updated, stale-field count, failed-field count, publish state. Click row → `ResortEditor` route.
- **`ResortEditor`** — the core. Composes `<DurablePanel>` and `<LivePanel>` inside a `<Tabs>` switch (or stacked, depending on viewport).
  - **`DurablePanel`** — renders the Resort doc's durable fields via `<FieldRow>` per field.
  - **`LivePanel`** — renders the latest `ResortLiveSignal` per field via `<FieldRow>`.
  - **`FieldRow`** — `<StatusPill>` + value display (or edit input in MANUAL mode) + `<ModeToggle>` + `<SourceBadge>` (the Epic-3 design-system component).
  - **`ModeToggle`** — `AUTO` ↔ `MANUAL` toggle. Disabled when no adapter is registered for the field (i.e., always disabled in Epic 4 since real adapters are Epic 5; but the visual disabled state ships now per the parent §3.6 contract).
- **`PublishDialog`** — modal confirm dialog before `POST /api/publish`. Lists workspace state (number of changed resorts; number of resorts with `Failed` fields blocking publish per parent §3.7).
- **`PublishHistory`** — list of past publishes from `GET /api/publishes`. Phase 1 read-only — no rollback action.

---

## 6. State, Theme, Testing

### 6.1 State surface (hooks)

Mirrors Epic 3's pattern (one hook per concern; `__resetForTests` exports for isolation). 7 hooks:

- `useResortList()` — wraps `apiClient.listResorts(query)`. Query state via URL params (admin's URL-state lib lives in `apps/admin/src/lib/urlState.ts`, parallel to Epic 3's `apps/public/src/lib/urlState.ts`).
- `useResortDetail(slug)` — wraps `apiClient.getResort(slug)`. Suspense-friendly via React 19 `use()` (same pattern as Epic 3's `useDataset`; same rejected-promise pinning per [ADR-0010](../../adr/0010-usedataset-rejected-promise-pinning.md)).
- `useWorkspaceState()` — local UI state for the editor's draft changes BEFORE PUT (debounced auto-save fires PUT through `apiClient`). Backed by `useState` + `useEffect`; not Suspense-driven.
- `useModeToggle(slug, fieldPath)` — per-field AUTO/MANUAL state. Local UI state; the mode is part of the workspace file's per-field state (`field_sources[fieldPath].mode = 'manual' | 'auto'`).
- `usePublish()` — wraps `apiClient.publish()`. Returns `{ status: 'idle' | 'publishing' | 'success' | 'error', result?, error? }`.
- `usePublishes()` — wraps `apiClient.listPublishes()`.
- `useHealth()` — wraps `apiClient.getHealth()`.

### 6.2 Theme

Inherits semantic tokens from `packages/design-system/tokens.css`. No theme-toggle UI in Phase 1 (parent §6.5 of pivot spec — Phase 2 concern). Admin uses dark-by-default OR follows `prefers-color-scheme` — same posture as the public app per Epic 3 [ADR-0005](../../adr/0005-css-theme-no-js.md).

### 6.3 Testing strategy

Same Epic 3 patterns:

- **Unit tests** (`vitest` + jest-axe) for every component, hook, lib helper, and server handler. 100% line / branch / function / statement coverage gate; no `/* istanbul ignore */`.
- **Integration tests** under `tests/integration/apps/admin/*.test.tsx`. MSW intercepts `apiClient` fetches at the network layer. Each test exercises a route composition:
  - `dashboard.test.tsx` — health cards render + click-through-to-filtered-resorts (PR 4.6b).
  - `resorts-table.test.tsx` — table renders + sort + filter + click row (PR 4.6b).
  - `resort-editor-read.test.tsx` — editor opens, durable + live render, MANUAL toggle visible (PR 4.4a).
  - `resort-editor-write.test.tsx` — MANUAL edit + PUT round-trip + workspace file written (PR 4.4b — this test is part of 4.4b's acceptance gate).
  - `publish-flow.test.tsx` — PublishDialog opens + confirm + Toast on success/failure (PR 4.5).
- **End-to-end Playwright tests** are deferred to Epic 6 (visual regression layer — same posture as Epic 3 per parent §6.5).
- **Server handler tests** live under `apps/admin/server/__tests__/`. Each handler is invocable directly with fixture inputs (no Vite required). The Vite middleware itself is a thin lifecycle adapter and is coverage-excluded with rationale (see §10.1).

---

## 7. PR Breakdown

### 7.1 TDD discipline

Tests-first ordering enforced by deliverable lists in §7.5–§7.14. Each PR's "Tests added" subsection lists test files BEFORE implementation files. Per AGENTS.md / CLAUDE.md TDD Workflow.

### 7.2 Subagent-review trigger matrix

PRs touching these paths require an independent subagent review per AGENTS.md:

| PR | Triggered paths |
|---|---|
| 4.1a | `packages/schema/**` (Zod surface), `eslint.config.js` (extending no-restricted-imports), `package.json` (new test script) |
| 4.1b | `apps/admin/vite.config.ts` (binding), `apps/admin/vite-plugin-admin-api.ts` |
| 4.1c | `packages/design-system/**` (component additions) |
| 4.4a, 4.4b | `packages/schema/**` (workspace file format), `apps/admin/server/**` (handler additions, Phase 2 portability surface) |
| 4.5 | `apps/admin/server/publish.ts` (publish pipeline gate), `packages/schema/**` (touches `publishDataset` consumer) |
| 4.6b | `Dockerfile`, `.github/workflows/quality-gate.yml` (adding the prod-build guard CI step) |

### 7.3 Cross-cutting assignments (every PR)

- **TDD** per the deliverable ordering.
- **README evaluation** — admin app is internal-only and not user-facing, so README updates are minimal. PRs 4.5 (publish) and 4.6b (integration tests + Dockerfile guard) MAY warrant a README mention of the admin app's existence + how to start it; lower-numbered PRs may skip with a one-line note in the PR description.
- **DCO sign-off** on every commit (`git commit -s`, or auto-added by `prepare-commit-msg` once stack-2 of the agent-discipline migration lands).
- **Subagent Review Discipline** — per the §7.2 matrix.
- **Pre-commit `npm run qa`** — runs before each commit.

### 7.4 Dependency graph + rollback

```
4.1a (Foundation) ─┐
4.1b (Vite middleware) ─┼─→ 4.2 (Dashboard)
4.1c (DS additions) ─┘   │
                          ├─→ 4.3 (Resorts table) ─→ 4.4a (Editor read)
                          │                              │
                          │                              ↓
                          │                          4.4b (Editor write) ─→ 4.5 (Publish) ─→ 4.6a (Polish) ─→ 4.6b (Integration + Dockerfile)
                          ↓
                       (4.4a depends on 4.1a's apiClient + 4.1c's Tabs/StatusPill;
                        4.4b depends on 4.4a's editor shell)
```

Rollback policy mirrors Epic 3 spec §10.1: `git revert` on the integration branch, no force-push, downstream worktrees rebase.

### 7.5 PR 4.1a — Foundation: schema surface + apiClient + contract snapshot

**Goal.** No app code yet. Ship the typed wire contract (Zod schemas), the `apiClient` generator, and the contract-snapshot test that pins the surface.

**Branch:** `epic-4/pr-4.1a-foundation`. **README:** skip (no user-visible surface).

**Files:**

- Create `packages/schema/api/index.ts` + 6 schema files (listResorts, resortDetail, resortUpsert, publish, listPublishes, health) + `errorEnvelope.ts`.
- Create `packages/schema/api/contract.test.ts` (snapshot test; updates `__snapshots__/contract.snap`).
- Create `packages/schema/src/workspaceFile.ts` (`WorkspaceFile` Zod schema with `.passthrough()`).
- Create `packages/schema/src/workspaceFile.test.ts`.
- Modify `packages/schema/src/index.ts` to barrel-export `WorkspaceFile` and `WorkspaceFileSchema`.
- Modify `eslint.config.js` to:
  - Allow `apps/admin/src/**` to import `@snowboard-trip-advisor/schema/api`.
  - Ban `apps/admin/src/**` from importing `@snowboard-trip-advisor/schema/node` (Node-only; mirrors public app's restriction).
  - Ban `apps/admin/src/**` from raw `fetch(` references (must use `apiClient`).
- Create `apps/admin/src/lib/apiClient.ts` — typed client. Each endpoint is one async function: `listResorts(q): Promise<ListResortsResponse>`, etc. Generated from the schemas: each function calls `fetch('/api/...')`, parses response through the response schema, and returns the typed result.
- Create `apps/admin/src/lib/apiClient.test.ts` — unit tests with MSW for each endpoint's happy + error paths.
- Modify root `package.json`:
  - Add `test:contract-snap` npm script that runs only the contract snapshot test.
  - Wire `test:contract-snap` into `npm run qa`.

**Subagent review trigger:** YES — `packages/schema/**`, `eslint.config.js`, `package.json` (qa wiring).

**Acceptance gate:** `npm run qa` green; contract snapshot present; apiClient unit tests pass; ESLint rules block illegal imports.

### 7.6 PR 4.1b — Vite middleware skeleton + admin Shell composition

**Goal.** `apps/admin` boots at `127.0.0.1:5174 strictPort:true`, the middleware dispatches `/api/*` to handler stubs (which return 501 Not Implemented), and the Shell renders the empty admin chrome.

**Branch:** `epic-4/pr-4.1b-middleware`. **Depends on:** 4.1a merged. **README:** skip.

**Files:**

- Create `apps/admin/vite-plugin-admin-api.ts` — Vite plugin that registers a Connect middleware on `/api/*`, parses request body through Zod schemas, dispatches to `server/*` handlers (stub implementations returning 501 in this PR), wraps response in error envelope. Lifecycle adapter is coverage-excluded; the dispatch helper is unit-tested.
- Create `apps/admin/server/{listResorts,resortDetail,resortUpsert,publish,listPublishes,health,workspace}.ts` — STUB handlers returning `{ error: { code: 'not-implemented', message: '...' } }` with status 501. Real implementations land in subsequent PRs.
- Create `apps/admin/server/__tests__/dispatch.test.ts` — unit-tests the middleware's request → handler dispatch logic (path matching, schema parsing, error envelope).
- Modify `apps/admin/vite.config.ts` — register `adminApiPlugin()`; bind `127.0.0.1:5174 strictPort:true`.
- Modify `apps/admin/index.html` — `<html lang="en">`, `<meta name="description">`, basic shell mount point. NO CSP nonce (admin is dev-only).
- Modify `apps/admin/src/App.tsx` — replace stub `<main className="app-shell" />` with `<Shell><Outlet /></Shell>` composition (or the equivalent without a router until 4.2/4.3 — the App could initially render `<Shell><Dashboard />` placeholder).
- Create `apps/admin/src/views/Shell.tsx` — composes `<Sidebar>` (placeholder until 4.1c) + `<HeaderBar>` (placeholder) + `<main>{children}</main>`. The component is a placeholder shell until 4.1c lands the design-system pieces.
- Modify `apps/admin/src/main.tsx` — mount with `<StrictMode>` (already existed); no extra setup.
- Create `apps/admin/src/test-setup.ts` extension — admin-specific MSW server setup (similar to public app's pattern).
- Create `apps/admin/src/mocks/server.ts` — MSW handlers stubs for all 6 endpoints (return canned data; tests override per-suite).

**Subagent review trigger:** YES — `apps/admin/vite.config.ts` (binding decision), `apps/admin/vite-plugin-admin-api.ts` (new middleware surface).

**Acceptance gate:** `npm run dev:admin` boots on 127.0.0.1:5174; `fetch('/api/resorts')` returns 501 with the error envelope; `App.test.tsx` passes; integration test `tests/integration/apps/admin/shell.test.tsx` (NEW) verifies Shell renders without errors.

### 7.7 PR 4.1c — Design-system additions: Sidebar, StatusPill, Tabs, Popover, DropdownMenu

**Goal.** Five new design-system components ship with full TDD + axe + variant-matrix coverage. Toast is **deferred** to PR 4.5 (first real consumer is publish success/failure).

**Branch:** `epic-4/pr-4.1c-design-system`. **Depends on:** 4.1b merged. **README:** evaluation only.

**Files:**

- Create `packages/design-system/src/components/Sidebar.tsx` + `.test.tsx`.
- Create `packages/design-system/src/components/StatusPill.tsx` + `.test.tsx` (4 variants: `Live`, `Stale`, `Failed`, `Manual`; each axe-clean).
- Create `packages/design-system/src/primitives/Tabs.tsx` + `.test.tsx` (keyboard-navigable per ARIA: Left/Right, Home/End).
- Create `packages/design-system/src/primitives/Popover.tsx` + `.test.tsx`.
- Create `packages/design-system/src/components/DropdownMenu.tsx` + `.test.tsx`.
- Modify `packages/design-system/src/index.ts` — re-export the 5 new entries.
- Modify `apps/admin/src/views/Shell.tsx` — replace placeholders with the new Sidebar + DropdownMenu (HeaderBar's user identity placeholder).

**Subagent review trigger:** YES — `packages/design-system/**`.

**Acceptance gate:** `npm run qa` green; each new component renders + axe-clean per variant; Shell shows the actual chrome (not placeholders).

### 7.8 PR 4.2 — Dashboard view + GET /api/health endpoint

**Goal.** Dashboard renders health cards from `GET /api/health`; click-through to filtered Resorts.

**Branch:** `epic-4/pr-4.2-dashboard`. **Depends on:** 4.1a/b/c merged. **README:** skip (admin internal).

**Files:**

- Implement `apps/admin/server/health.ts` — replace 4.1b's 501 stub with the real implementation: read all workspace files (or fall back to published doc), aggregate per-field statuses, compose `HealthResponse`.
- Create `apps/admin/server/__tests__/health.test.ts`.
- Create `apps/admin/src/state/useHealth.ts` + `.test.ts`.
- Create `apps/admin/src/views/Dashboard.tsx` + `.test.tsx`. Card click navigates via URL state (e.g., `?route=resorts&filter=stale`). Routing is URL-driven with `useURLState`-style hooks (port from Epic 3's pattern).
- Create `apps/admin/src/lib/urlState.ts` + `.test.ts` (admin variant of Epic 3's URL-state lib; admin route schema is different but the abstraction is the same).
- Modify `apps/admin/src/App.tsx` — route by URL state to render Dashboard or future Resorts view.

**Subagent review trigger:** NO (no CODEOWNERS-protected paths beyond design-system, which 4.1c already touched).

**Acceptance gate:** `npm run qa` green; `npm run dev:admin` boots and Dashboard renders the 5 health metrics.

### 7.9 PR 4.3 — Resorts table + GET /api/resorts endpoint

**Goal.** Resorts table renders the resort list with filterable columns; click row navigates to editor.

**Branch:** `epic-4/pr-4.3-resorts-table`. **Depends on:** 4.2 merged. **README:** skip.

**Files:**

- Implement `apps/admin/server/listResorts.ts` — replace 501 stub. Read workspace files; fall back to published doc; compute summaries; apply filter + page.
- Create `apps/admin/server/__tests__/listResorts.test.ts`.
- Create `apps/admin/src/state/useResortList.ts` + `.test.ts`.
- Create `apps/admin/src/views/ResortsTable.tsx` + `.test.tsx` — uses Epic-3's `Table` design-system primitive (already shipped).
- Modify `apps/admin/src/App.tsx` — wire the Resorts route.
- Modify `apps/admin/src/lib/urlState.ts` — extend route schema with `resorts` route + filter params.

**Subagent review trigger:** NO.

**Acceptance gate:** Resorts table renders; sort + filter work; clicking a row updates URL state (transition to editor route lands in 4.4a).

### 7.10 PR 4.4a — Resort editor read path

**Goal.** Editor route renders durable + live panels read-only; ModeToggle visible (disabled — adapter actions are Epic 5); StatusPill per field.

**Branch:** `epic-4/pr-4.4a-editor-read`. **Depends on:** 4.3 merged. **README:** skip.

**Files:**

- Implement `apps/admin/server/resortDetail.ts` — replace 501 stub. Read workspace file or fall back to published; build `field_states` via `ResortView` projection; respond.
- Create `apps/admin/server/__tests__/resortDetail.test.ts`.
- Implement `apps/admin/server/workspace.ts` — read helpers for `data/admin-workspace/<slug>.json`. Atomic-write helper deferred to 4.4b.
- Create `apps/admin/server/__tests__/workspace.test.ts` (read paths only).
- Create `apps/admin/src/state/useResortDetail.ts` + `.test.ts`.
- Create `apps/admin/src/views/ResortEditor.tsx` (composition shell) + `.test.tsx`.
- Create `apps/admin/src/views/ResortEditor/DurablePanel.tsx` + `.test.tsx`.
- Create `apps/admin/src/views/ResortEditor/LivePanel.tsx` + `.test.tsx`.
- Create `apps/admin/src/views/ResortEditor/FieldRow.tsx` + `.test.tsx` — render-only mode (StatusPill + value display + SourceBadge); no edit affordance yet.
- Create `apps/admin/src/views/ResortEditor/ModeToggle.tsx` + `.test.tsx` — render-only AUTO/MANUAL toggle visible but disabled (no PUT yet, so toggling has no effect; lands in 4.4b).
- Modify `apps/admin/src/lib/urlState.ts` — extend with `resort/:slug` route.
- Create `tests/integration/apps/admin/resort-editor-read.test.tsx` — verifies editor opens, both panels render with sample data, StatusPill states correct.

**Subagent review trigger:** YES — `packages/schema/**` is touched indirectly (workspace.ts reads workspace files via the schema; the schema itself was added in 4.1a but the read path is exercised here).

**Acceptance gate:** Editor renders for both seed-dataset slugs; durable + live panels show all fields with correct StatusPill states; integration test passes.

### 7.11 PR 4.4b — Resort editor write path

**Goal.** ModeToggle becomes interactive; MANUAL mode exposes edit input; PUT writes to workspace; integration test round-trips.

**Branch:** `epic-4/pr-4.4b-editor-write`. **Depends on:** 4.4a merged. **README:** skip.

**Files:**

- Implement `apps/admin/server/resortUpsert.ts` — replace 501 stub. Read existing workspace; merge incoming partial; per-resort schema validation; atomic-write workspace file.
- Create `apps/admin/server/__tests__/resortUpsert.test.ts` (validation failures + happy path + idempotency).
- Modify `apps/admin/server/workspace.ts` — add atomic-write helper (temp file + rename per §10.3); add atomic-write tests in `__tests__/workspace.test.ts`.
- Create `apps/admin/src/state/useWorkspaceState.ts` + `.test.ts` — local UI state for in-flight edits with debounced PUT (default debounce: 500ms).
- Create `apps/admin/src/state/useModeToggle.ts` + `.test.ts` — per-field AUTO/MANUAL state.
- Modify `apps/admin/src/views/ResortEditor/FieldRow.tsx` — add edit input affordance in MANUAL mode; debounced auto-save via `useWorkspaceState`.
- Modify `apps/admin/src/views/ResortEditor/ModeToggle.tsx` — interactive (AUTO ↔ MANUAL).
- Create `tests/integration/apps/admin/resort-editor-write.test.tsx` — verifies ModeToggle flips, MANUAL edit triggers PUT (asserted via MSW request log), workspace state mirrors response, page reload preserves the workspace state.
- Modify `apps/admin/src/test-setup.ts` if needed for the workspace-file test fixture loading.

**Subagent review trigger:** YES — `packages/schema/**` (workspace file write semantics), `apps/admin/server/**` (publish pipeline portability surface — validation must agree with publish's full validation).

**Acceptance gate:** End-to-end MANUAL edit → PUT → workspace file written. Integration test passes; per-field round-trip verified.

### 7.12 PR 4.5 — Publish workflow + Toast

**Goal.** Publish dialog confirms; POST runs `publishDataset()`; success / failure surfaces via Toast; PublishHistory list shows past versions.

**Branch:** `epic-4/pr-4.5-publish`. **Depends on:** 4.4b merged. **README:** evaluation — admin app is now functional end-to-end; consider mentioning in README.

**Files:**

- Implement `apps/admin/server/publish.ts` — replace 501 stub. Read all workspace files; compose `PublishedDataset`; call `publishDataset()`; respond.
- Create `apps/admin/server/__tests__/publish.test.ts` — happy path + `validatePublishedDataset` failure (assert error envelope + status 400).
- Implement `apps/admin/server/listPublishes.ts` — replace 501 stub.
- Create `apps/admin/server/__tests__/listPublishes.test.ts`.
- Create `apps/admin/src/state/usePublish.ts` + `.test.ts`.
- Create `apps/admin/src/state/usePublishes.ts` + `.test.ts`.
- Create `apps/admin/src/views/PublishDialog.tsx` + `.test.tsx`.
- Create `apps/admin/src/views/PublishHistory.tsx` + `.test.tsx`.
- Create `packages/design-system/src/components/Toast.tsx` + `.test.tsx` — first real consumer is here. Variant matrix: `info`, `success`, `error`. Auto-dismiss timing prop.
- Modify `packages/design-system/src/index.ts` — re-export Toast.
- Wire Toast into `apps/admin/src/views/Shell.tsx` (top-level `<ToastProvider>`).
- Modify HeaderBar to surface a "Publish" button that opens PublishDialog.
- Create `tests/integration/apps/admin/publish-flow.test.tsx`.

**Subagent review trigger:** YES — `apps/admin/server/publish.ts` is the publish gate; review verifies it does NOT bypass `validatePublishedDataset` and DOES correctly compose the `PublishedDataset` envelope.

**Acceptance gate:** End-to-end publish flow works — open dialog, confirm, see Toast, archive directory grows, PublishHistory updates.

### 7.13 PR 4.6a — Keyboard shortcuts + responsive read-only-below-md

**Goal.** Per parent §3.10 (keyboard shortcuts) and §3.2 (responsive policy).

**Branch:** `epic-4/pr-4.6a-polish`. **Depends on:** 4.5 merged. **README:** skip.

**Files:**

- Create `apps/admin/src/lib/shortcuts.ts` + `.test.ts` — global keyboard shortcut handler (`/` focuses search, `g r` → resorts, `g i` → integrations placeholder, `mod+enter` saves in editor, `esc` closes modals).
- Create `apps/admin/src/views/Shell.responsive.css.ts` (or modify existing CSS) — at viewport `< md` (900px), edit controls receive `tabindex={-1}` and inputs/selects have `disabled aria-readonly`. Implementation per parent §3.2: edit controls must be **removed from tab order**, not merely visually hidden.
- Modify `apps/admin/src/views/ResortEditor/FieldRow.tsx` — gate the edit input rendering on viewport via `useMediaQuery`; below md, render a read-only span instead.
- Tests: assert keyboard shortcuts via `vitest` userEvent; assert tabindex via DOM assertions.

**Subagent review trigger:** NO.

**Acceptance gate:** Keyboard shortcuts test green; responsive test asserts tab-order at simulated `md`-1 viewport.

### 7.14 PR 4.6b — Integration tests + Dockerfile prod-build guard

**Goal.** Final integration suite; Dockerfile guard CI step.

**Branch:** `epic-4/pr-4.6b-integration`. **Depends on:** 4.6a merged. **README:** consider mentioning admin app's `npm run dev:admin` entrypoint.

**Files:**

- Create / extend `tests/integration/apps/admin/dashboard.test.tsx`, `resorts-table.test.tsx` (these may have landed in earlier PRs; this PR completes coverage).
- Create `tests/integration/apps/admin/full-flow.test.tsx` — composite: open admin → navigate to Resorts → click row → MANUAL edit → save → publish → see in history.
- Create `scripts/check-admin-not-in-prod.ts` (+ `.cli.ts` + `.test.ts`) — CI helper that scans the prod-image build output for any `apps/admin/` artifact. Fails the workflow if found.
- Modify `.github/workflows/quality-gate.yml` — add a `dockerfile-guard` job that builds the prod image stages and runs `check-admin-not-in-prod.ts`.
- Modify `Dockerfile` if needed — verify the multi-stage build's COPY paths exclude `apps/admin/dist/`.

**Subagent review trigger:** YES — `Dockerfile` and `.github/workflows/quality-gate.yml`.

**Acceptance gate:** All integration tests green; the new `dockerfile-guard` CI job passes; `npm run qa` green.

### 7.15 Cross-cutting (every PR)

- TDD enforced via deliverable ordering — tests first, implementation after.
- README evaluation — admin app is internal; PRs 4.5 + 4.6b MAY warrant a README mention; lower-numbered PRs skip with a one-line PR-description note.
- Subagent Review Discipline — per the §7.2 trigger matrix.
- DCO sign-off on every commit (auto via `prepare-commit-msg` once stack-2 of agent-discipline migration lands).
- Pre-commit `npm run qa` runs before each commit.

---

## 8. ADRs

In flight at spec time:

- [ADR-0011](../../adr/0011-defer-test-sync-ux-to-epic-5.md) — Test/Sync deferred to Epic 5.
- [ADR-0012](../../adr/0012-defer-analyst-notes-to-post-epic-4-followup.md) — Analyst notes deferred to a post-Epic-4 follow-up.

No additional ADRs anticipated for Epic 4. The Vite-middleware process model decision is captured in §10.1 of this spec (per the brainstorm reviewer's recommendation; ADR-0004 precedent showed ADRs document NEW reasoning, and parent §3.11 + §8.4 already adjudicate this with full rationale).

If new architectural decisions emerge during implementation (e.g., a sanitizer-equivalent question for some unforeseen rendering surface), they get an ADR at that time.

---

## 9. Out of Scope (Phase 2 / Epic 5+)

- **Test / Sync adapter actions + endpoints 4-5** — [ADR-0011](../../adr/0011-defer-test-sync-ux-to-epic-5.md). Lands in Epic 5 alongside the first real (non-stub) adapter. The ModeToggle's wire shape is locked in Epic 4; Epic 5 widens its `AUTO` half by adding the adapter-action buttons.
- **Analyst notes + endpoints 9-10 + Markdown sanitizer + per-field UI + ADR-0013** — [ADR-0012](../../adr/0012-defer-analyst-notes-to-post-epic-4-followup.md). Lands in a small post-Epic-4 follow-up PR before Epic 5 begins.
- **Auth** — Phase 2 only. Loopback IS the boundary in Phase 1.
- **Audit log read surface** (`GET /api/audit`, `GET /api/audit/:id`) — Phase 2 only (parent §8.4.1's Phase 2 additions list).
- **Preview tokens** (`POST /api/preview-tokens`) — Phase 2 only. Loopback admin has no sharing.
- **Per-resort publish** — Phase 2; trigger condition is resort count ≥ 25 per parent §12 decision 3.
- **`research/cli.ts` publish** — out of Epic 4. The admin's publish handler imports `publishDataset()` directly. A future CLI wrapping the same library is a separate concern (likely Epic 5 or 6).
- **Phase 2 Hono service** — entire admin Phase 2 swap. Same wire contract, different backing store (Postgres + Drizzle); §8.2 of parent spec.
- **Bulk-refresh CLI** — parent §7.9 / §8.2. Phase 2.
- **i18n translation framework** — Phase 2; Phase 1 admin is `en` only.
- **`prefers-reduced-motion`** beyond what design-system primitives already enforce — Epic 6 polish.
- **Visual regression testing** for admin (Playwright + Storybook) — Epic 6 (parallels Epic 3's deferral per parent §6.5).

---

## 10. Operational concerns

### 10.1 Vite middleware process model (the ADR-0014 that wasn't)

Parent §3.11 + §8.4 lock this decision: **one Node process** serves the SPA AND the `/api/*` surface. The middleware plugin (`apps/admin/vite-plugin-admin-api.ts`) registers a Connect handler that dispatches requests to `apps/admin/server/*.ts` modules.

**Phase 1 specifics:**

- The rate-limit bucket (parent §7.4) lives in-memory in the Vite dev-server process; there is no cross-process contention because the Phase 1 CLI does NOT fetch adapters (parent §7.9).
- Role checks (parent §8.4.1's "Role (P2)" column) are no-ops in Phase 1; the role column is populated in Zod schemas so Phase 2 can flip them on without schema churn.
- The middleware is **only** registered on `apps/admin`'s Vite dev server. `apps/public`'s dev server has no admin-api middleware.
- The middleware is **not bundled** into any container image; the Dockerfile guard (§10.7 + PR 4.6b) verifies this.

**Phase 2 lift path:**

The `/api/*` wire contract is the stability line. Phase 2 replaces the Vite middleware with a Hono service over Postgres/Drizzle (parent §8.2). The SPA's `apiClient.ts` does NOT change — it imports the same Zod schemas from `packages/schema/api/*` and still calls `fetch('/api/...')`. Only the server implementation differs.

### 10.2 Workspace file format and forward-compat

The `WorkspaceFile` Zod schema (`packages/schema/src/workspaceFile.ts`) ships in PR 4.1a:

```ts
const WorkspaceFile = z.object({
  schema_version: z.literal(1),
  slug: ResortSlug,
  resort: Resort,
  live_signal: ResortLiveSignal.nullable(),
  modified_at: ISODateTimeString,
}).passthrough()  // forward-compat for the analyst-notes follow-up PR
```

The `.passthrough()` permits unknown top-level fields. The post-Epic-4 analyst-notes follow-up adds a `notes` field (a `Record<string, AnalystNote>` keyed by metric path); existing workspace files written without `notes` continue to parse.

**Why this is admin-internal and NOT under `published.schema_version`:** workspace files are never shipped to `apps/public`. They live under `data/admin-workspace/`, never enter `data/published/`, and the publish pipeline reads them, validates against the published-doc schema, and writes a fresh `current.v1.json`. The workspace `schema_version` is a separate evolution track from the published one. A workspace `schema_version` bump would be needed if the workspace SHAPE changes incompatibly (e.g., merging `resort` and `live_signal` into a single `RecordEntry`); additive fields like `notes` are backwards-compatible by design.

### 10.3 Atomic-write semantics

Workspace files (`data/admin-workspace/<slug>.json`) and the published file (`data/published/current.v1.json`) both use the **temp file + rename** pattern:

```
1. Write to <target>.<random-suffix>.tmp
2. fsync the temp file
3. rename(<target>.<random-suffix>.tmp, <target>)  // POSIX-atomic
```

`publishDataset()` from `@snowboard-trip-advisor/schema/node` already implements this for the published file (Epic 2). The admin workspace write helper (`apps/admin/server/workspace.ts`, PR 4.4b) implements the same pattern.

**Lock semantics:** Phase 1 is single-process (one Vite dev server, one analyst). No cross-process locks needed. If a future Phase 1 use case introduces concurrent writes (multiple admin instances on the same workspace dir — unlikely given loopback), the existing `publishDataset` lock-timeout approach (`packages/schema/src/publishDataset.lockTimeout.test.ts`) is the reference. Phase 2 ships proper distributed locking when admin moves to a real service.

### 10.4 Publish pipeline reuse

The admin's `POST /api/resorts/:slug/publish` handler (`apps/admin/server/publish.ts`) imports `publishDataset` from `@snowboard-trip-advisor/schema/node`. Same function the Epic 2 CLI / `publishDataset.test.ts` exercises. Same atomic-write + archive semantics. Same `validatePublishedDataset` gate.

**Why no `research/cli.ts`:** parent §3.7's "same pipeline as `research/cli.ts publish`" wording describes the LOGICAL pipeline (parse → validate → atomic write → archive), not a literal subprocess invocation. The admin runs the library function directly in-process; a CLI wrapping the same library is a separate concern out of Epic 4 scope.

### 10.5 In-memory rate-limit (advisory in Phase 1)

Per parent §7.4 + §8.4.1's "RL class (P2)" column: rate-limit class is recorded for Phase 2; Phase 1's rate limiter is in-memory and advisory.

The middleware does NOT enforce rate limits in Epic 4 — it would create no-op friction since:
- Loopback admin with one analyst means rate limiting protects nothing.
- Real adapter calls (the actual rate-limit consumers) are deferred to Epic 5 per [ADR-0011](../../adr/0011-defer-test-sync-ux-to-epic-5.md).

The rate-limit class is recorded in the Zod schemas as metadata (custom `.describe()` annotations or a separate constant table) so Phase 2 can wire enforcement without re-shaping the schemas.

### 10.6 No CSP nonce (admin is dev-only)

Admin is never built into a production container image. The Vite dev server is the only deployment surface in Phase 1. Vite's default dev-server CSP posture (none) is acceptable — the loopback boundary protects against any cross-origin concern.

When Phase 2 ships the Hono service, the admin's `index.html` will be served by Hono with a Phase-2-appropriate CSP. Until then, no CSP bookkeeping in Epic 4. This is a **deliberate divergence** from Epic 3's CSP discipline (Epic 3's public app ships dev + prod CSP per spec §6.4) — admin's loopback-only Phase 1 posture justifies the divergence.

### 10.7 Dockerfile prod-build guard

Per parent §3.1: "`apps/admin` is **never** built into the production container image." The Dockerfile guard (PR 4.6b) verifies this mechanically:

- A new CI workflow step (`dockerfile-guard`) runs as part of `quality-gate.yml`. The job builds the prod image (or its multi-stage equivalent locally with `docker buildx build --target <prod-stage>`) and asserts the resulting image / staged filesystem does NOT contain any `apps/admin/dist/*` files.
- The check is implemented as `scripts/check-admin-not-in-prod.{ts,cli.ts,test.ts}` mirroring the Epic 3 `check-*` pattern.
- If the check fails, the PR is blocked. Required-status adoption is deferred to Epic 6's branch-protection rebuild (same cadence as Epic 3's `analyze` check).

### 10.8 Test fixtures for workspace files

Hand-authored fixtures under `tests/fixtures/admin-workspace/<slug>.json` for both seed-dataset slugs. Loaded by `apps/admin/server/__tests__/workspace.test.ts` and the integration tests under `tests/integration/apps/admin/`. The fixtures must match `WorkspaceFile` Zod parse — they're the canonical examples.

When the analyst-notes follow-up PR adds the `notes` field, it adds NEW fixtures with `notes` populated; the Epic 4 fixtures (without `notes`) MUST continue to parse — that's the forward-compat invariant test.

---

## 11. Verification & next steps

1. This spec is committed to `docs/superpowers/specs/2026-05-01-epic-4-admin-app-design.md` on branch `docs/epic-4-admin-app-spec`.
2. A spec-document-reviewer subagent runs against this doc; findings folded into the same branch before maintainer review.
3. Maintainer reviews the committed spec.
4. `superpowers:writing-plans` produces the implementation plan against this spec.
5. `superpowers:using-git-worktrees` + `superpowers:subagent-driven-development` execute the plan PR by PR, in the dependency-graph order from §7.4.
