# Epic 4 — Admin App (`apps/admin`) Design

**Spec date:** 2026-05-01.
**Parent product spec:** [`docs/superpowers/specs/2026-04-22-product-pivot-design.md`](2026-04-22-product-pivot-design.md) §3 (admin app product surface), §4 (data model — already in `packages/schema`), §5 (`ResortView` projection — already shipped), §8 (`/api/*` contract).
**Predecessor:** [`docs/superpowers/specs/2026-04-28-epic-3-public-app-design.md`](2026-04-28-epic-3-public-app-design.md) (Epic 3 — public app, shipped).
**Related ADRs (merged):** [ADR-0011](../../adr/0011-defer-test-sync-ux-to-epic-5.md) (Test / Sync deferral), [ADR-0012](../../adr/0012-defer-analyst-notes-to-post-epic-4-followup.md) (Analyst notes deferral).
**Authoritative agent rules:** [`AGENTS.md`](../../../AGENTS.md). `CLAUDE.md` is now a Claude-specific compatibility shim that points at AGENTS.md.

## 0. Executive Summary

Epic 4 ships `apps/admin`, a loopback-only Vite SPA + in-process API middleware that lets a single analyst edit `Resort` and `ResortLiveSignal` documents and trigger an all-or-nothing publish through the same `publishDataset()` pipeline `apps/public` already consumes. The admin app is **never** built into a production container image; the network boundary (`127.0.0.1:5174` `strictPort: true`) is the access control in Phase 1. Editing is read-only below the `md` breakpoint — controls are removed from the tab order, not merely disabled.

**What ships in Epic 4** (13 PRs across foundation, navigation, editor, publish, polish — see §7 for the dependency graph and the tier-and-gate workflow):

- **Foundation** (PRs 4.1a/b/c) — `packages/schema/api/` Zod surface for 6 in-scope endpoints + `WorkspaceFile` schema (with top-level `editor_modes` + cross-key invariant per §10.2) + contract-snapshot test; the `vite-plugin-admin-api.ts` middleware skeleton + `apps/admin` Shell composition + tiered-MSW test harness (canned + bridge); design-system additions (Sidebar, StatusPill, Tabs, Popover, DropdownMenu).
- **Navigation** (PRs 4.2 / 4.3) — Dashboard health cards + Resorts table. Both surface the cold-start empty state per §10.9.
- **Editor** (PRs 4.4a/4.4b/4.4c/4.4d) — quad-split on the server / view / write / interaction axes: 4.4a ships the server read path (`resortDetail` + workspace read helpers); 4.4b ships the read-only editor view (durable + live panels + StatusPill); 4.4c ships the server write path (`resortUpsert` + workspace atomic-write helper) — server-only, with the client-side `useWorkspaceState` hook shipped in 4.4d alongside the interactive ModeToggle; 4.4d makes the editor edit-interactive (ModeToggle flips AUTO↔MANUAL via `editor_modes`, MANUAL exposes edit input, integration write round-trip via `bridgeHandlers(tmpdir)`).
- **Publish** (PRs 4.5a/4.5b) — dual-split on the handler / UI axis: 4.5a ships `publish` + `listPublishes` server handlers; 4.5b ships `<PublishDialog>` + `<PublishHistory>` views + the first real Toast consumer. PublishDialog gates on four blocking conditions including `resorts_with_corrupt_workspace > 0` per §4.3.1.
- **Closing** (PRs 4.6a / 4.6b) — dual-split on the polish / integration-backfill axis: 4.6a ships keyboard shortcuts + responsive read-only-below-md affordance; 4.6b ships the integration backfill (Dashboard, ResortsTable, full-flow). 4.6a and 4.6b are parallel-capable (no shared files). The Dockerfile prod-build guard is **deferred to Epic 6** alongside the Dockerfile rewrite (the existing `Dockerfile` is broken — see §10.7).

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
| §8.4.1 (endpoint 6 path-param schema) | Endpoint 6 (`POST /api/resorts/:slug/publish`) widens its `:slug` path-param schema to `z.union([ResortSlug, z.literal('__all__')])` in Phase 1; endpoints 2 / 3 keep plain `ResortSlug`. | Phase 1 publish is all-or-nothing per §1 row 5; the SPA's no-arg `apiClient.publish()` injects the `'__all__'` sentinel into the URL. `ResortSlug`'s regex `^[a-z0-9-]{1,64}$` rejects underscores, so a plain `ResortSlug` schema would 400 on the sentinel before reaching the handler. Phase 2 collapses the union back to plain `ResortSlug` when per-resort publish lands; the contract-snapshot test (§4.9 invariant 3) catches the change. |

---

## 2. Architecture & Package Layout

### 2.1 Workspace dependencies

```
packages/
  schema/                  (leaf — Resort, ResortLiveSignal, validatePublishedDataset, publishDataset, ResortView; FieldStateFor<T> + toFieldValue<T> are net-new in Epic 4 — land in PR 4.1a)
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
- `resortDetail.ts` — `ResortSlugParam` + `ResortDetailResponse` (endpoint 2; full durable + latest live + per-field state via `FieldStateFor<T>`, which is itself added to `packages/schema/src/resortView.ts` in this same PR — see §7.5).
- `resortUpsert.ts` — `ResortUpsertBody` + reuses `ResortDetailResponse` (endpoint 3).
- `publish.ts` — `PublishBody` + `PublishResponse` (endpoint 6; version id, archive path).
- `listPublishes.ts` — `ListPublishesQuery` + `ListPublishesResponse` (endpoint 7; version history).
- `health.ts` — `HealthQuery` (none) + `HealthResponse` (endpoint 8; adapter freshness, archive size).
- `__snapshots__/contract.snap` — JSON serialization of every Zod schema in the directory; regenerated by `packages/schema/api/contract.test.ts` running under `npm run coverage` (no separate `test:contract-snap` script per F1 P1 fold — the snapshot test is picked up by the standard coverage run). Diffs require maintainer review per parent §8.4.1 invariant 3.

Endpoints 4 + 5 (Test/Sync) and 9 + 10 (analyst notes) are **NOT** added in Epic 4 — they land in Epic 5 and the post-Epic-4 follow-up respectively.

**`packages/schema/src/` additions:**

- `workspaceFile.ts` — `WorkspaceFile` Zod schema for `data/admin-workspace/<slug>.json`. Top-level shape: `{ schema_version: 1, slug: ResortSlug, resort: Resort, live_signal: ResortLiveSignal | null, modified_at: ISODateTimeString, editor_modes: Partial<Record<MetricPath, 'manual' | 'auto'>> }`. Uses Zod `.passthrough()` so the post-Epic-4 follow-up can add a `notes` field additively without a `schema_version` bump. The `editor_modes` field carries the per-field AUTO/MANUAL state for `useModeToggle` (sparse map per §10.2 — only metric paths actively toggled appear; missing keys project as `'auto'`); a `.refine()` enforces the cross-key invariant `Object.keys(editor_modes) ⊆ Object.keys(resort.field_sources)`.
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
- Errors are caught and shaped into a standard `{ error: { code, message, details? } }` envelope (see §4.10 below).
- Phase-1 specifics inline (rate-limit class is advisory; role checks are no-ops).

Plugin scope: only on `apps/admin/`'s Vite dev server. `apps/public/`'s Vite server has no admin-api middleware — the public app reads the published file via `fetch('/data/current.v1.json')` per Epic 3 spec §10.2.

The plugin is **not** built into a production container image. Mechanical Dockerfile-build verification of this is **deferred to Epic 6** (see §10.7 for the deferral rationale and lift conditions); Phase 1 relies on the CODEOWNERS-triggered Subagent Review Discipline on `Dockerfile` to catch any PR that introduces `COPY apps/admin` or equivalent.

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

Inherits the root `package.json` `engines.node` constraint: `^20.19.0 || >=22.12.0`. No new engine constraints. (Spec was previously written as `≥ 20.11`, a stale lower floor that pre-dated the root pin's tightening — fixed per Codex P2 fold on `e1453b2`.)

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

A mechanical Dockerfile guard (CI smoke test asserting the prod image does NOT contain any `apps/admin/dist/*` files) is **deferred to Epic 6** alongside the Dockerfile rewrite — the existing `Dockerfile` is broken (lines 3-13: "DEFERRED — DO NOT BUILD UNTIL EPIC 6"), so a `docker build`-driven guard cannot ship in Epic 4. See §10.7 for deferral rationale + lift conditions.

The admin's `npm run build --workspace=@snowboard-trip-advisor/admin-app` exists for development verification (does the SPA tree-shake, does the typed `apiClient` compile against the schemas) but its `dist/` is never copied into the prod image.

---

## 4. `/api/*` Contract (Epic 4 in-scope subset)

Six endpoints in Epic 4 (rows 1, 2, 3, 6, 7, 8 of parent §8.4.1). Endpoints 4-5 deferred to Epic 5 ([ADR-0011](../../adr/0011-defer-test-sync-ux-to-epic-5.md)); endpoints 9-10 deferred to the analyst-notes follow-up ([ADR-0012](../../adr/0012-defer-analyst-notes-to-post-epic-4-followup.md)).

### 4.1 Endpoint 1 — `GET /api/resorts`

**Request:** `ListResortsQuery` — `{ filter?: { country?: ISOCountryCode, hasFailures?: boolean }, page?: { offset: number, limit: number } }`. All fields optional; default page is `{ offset: 0, limit: 50 }`.

**Response:** `ListResortsResponse` — `{ items: ResortSummary[], page: { offset, limit, total } }`. `ResortSummary` includes `slug`, `name`, `country`, `last_updated`, `stale_field_count`, `failed_field_count`, `publish_state`.

**Handler logic** (`apps/admin/server/listResorts.ts`):
- Read all workspace files (`data/admin-workspace/*.json`); fall back to published `current.v1.json` for resorts without workspace files (i.e., never edited).
- Compute `stale_field_count` / `failed_field_count` per resort using `ResortView` projection's `FieldStateFor<T>` (lands in PR 4.1a — see §2.1 / §7).
- Apply filter + page.
- Respond.

### 4.1.1 Draft resort handling (endpoint 1)

A "draft resort" is a resort with a workspace file (`data/admin-workspace/<slug>.json`) but no entry in published `current.v1.json` — i.e., a new resort being staged for inclusion in the next publish.

`GET /api/resorts` includes draft resorts in the response. Drafts are tagged via `publish_state: 'draft'` in the response (per `Resort.publish_state` enum from parent §3.8). The handler:

1. Read all workspace files; collect `slug + Resort + last_modified` per file.
2. Read published `current.v1.json`; collect any slugs not represented in workspace.
3. Union the two sets. For workspace-only entries, emit `publish_state: 'draft'`. For published-and-workspace entries, the workspace state takes precedence (it's the staged change). For published-only entries, emit `publish_state: 'published'` from the published file.
4. Apply filter + page; respond.

### 4.2 Endpoint 2 — `GET /api/resorts/:slug`

**Request:** `ResortSlugParam` — `{ slug: ResortSlug }` (URL param parsed via Zod).

**Response:** `ResortDetailResponse` — `{ resort: Resort, live_signal: ResortLiveSignal | null, field_states: Record<MetricPath, FieldStateFor<unknown>> }`.

**Handler logic** (`apps/admin/server/resortDetail.ts`):
- Read `data/admin-workspace/<slug>.json` if exists.
- Else read `data/published/current.v1.json` and project the requested resort.
- Build `field_states` via the `ResortView` projection helpers.
- Respond.

### 4.2.1 Draft resort handling (endpoint 2)

`GET /api/resorts/:slug` returns `200` for draft slugs (workspace-only), populating `ResortDetailResponse` from the workspace file alone. `live_signal` is `null` for drafts (no live data until the resort is published and signals start flowing). `404` is returned only when neither the workspace file nor the published doc has the slug.

### 4.3 Endpoint 3 — `PUT /api/resorts/:slug`

**Request:** `ResortUpsertBody` — `{ resort?: Partial<Resort>, live_signal?: Partial<ResortLiveSignal> | null, editor_modes?: Partial<Record<MetricPath, 'manual' | 'auto'>> }`. **All three fields are optional** with partial-overlay semantics; absent fields preserve the workspace's existing state. **At least one of the three MUST be present** — the schema enforces this via `.refine()` so an empty PUT body returns `400 invalid-request` rather than silently mutating only `modified_at`. The `editor_modes` slot lets `useModeToggle` (§6.1) persist mode flips through the same PUT path the field edits use — without it, the SPA cannot write mode changes through the typed `apiClient`. Making `resort` optional is what unlocks the mode-only PUT (a `useModeToggle` flip sends `editor_modes` alone; reconstructing the full `Resort` on every toggle would be wasted bandwidth and a contract mismatch with the partial-overlay model the prose describes).

**Sparse-map shape** (per Codex P1 fold on `89271db`): `MetricPath` is a finite TS union (12 literals in `packages/schema/src/metricFields.ts`); `Record<MetricPath, V>` requires all 12 keys, which contradicts the per-field toggle flow. The TS literal is therefore `Partial<Record<MetricPath, 'manual' | 'auto'>>` (sparse). The Zod schema (PR 4.1a) uses `z.partialRecord(z.enum(METRIC_FIELDS), z.enum(['manual', 'auto']))` — Zod v4's `z.record(z.enum(...), v)` is exhaustive, so `z.partialRecord` is the canonical sparse-record constructor for this case. The sparse shape applies wherever `editor_modes` is referenced (§10.2 storage shape, §6.1 hook, §7.5 schema deliverable).

**Response:** `ResortDetailResponse` — same shape as endpoint 2 (returns the post-write state).

**Handler logic** (`apps/admin/server/resortUpsert.ts`):
- Read existing workspace file (or fall back to published doc + workspace creation).
- Merge incoming partial onto existing state:
  - `resort`: deep merge for `field_sources`, shallow merge for top-level `Resort` fields.
  - `live_signal`: shallow merge if present.
  - `editor_modes`: shallow merge if present (incoming entries override existing per key; missing-from-incoming keys preserved). To "reset" a metric path back to AUTO, the SPA sends `editor_modes: {a: 'auto'}` — semantically equivalent to clearing the entry per §10.2's default-on-missing projection. Cross-key invariant per §10.2 (`Object.keys(editor_modes) ⊆ Object.keys(resort.field_sources)`) is enforced post-merge against the merged `WorkspaceFile`; ghost paths fail the refinement and the handler returns `400 invalid-resort` carrying the message.
- Run **client-side-equivalent validation**: parse the merged `WorkspaceFile` (which includes `Resort`, `ResortLiveSignal`, and `editor_modes`) through the schema. Reject on parse failure (Resort schema OR `editor_modes` refinement) with `400 invalid-resort` envelope (see §4.10).
- **Atomic-write** the workspace file (temp file + rename, see §10.3).
- Respond with the post-write `ResortDetailResponse`.

**Note: full `validatePublishedDataset` is NOT run on PUT** — that runs only on publish (endpoint 6). Per-field PUT is permitted to pass through partial / staging states (e.g., a field marked `failed` but not yet replaced with a manual value); the publish gate enforces the full invariants.

### 4.3.1 Pre-publish blocking-state surface

PUT (endpoint 3) does NOT run full `validatePublishedDataset` — it only validates the resort schema (per-document `Resort` / `ResortLiveSignal` parse). Per-field provenance violations (missing `field_sources` entry, malformed `upstream_hash`) are caught only at publish time.

To surface blocking state to the user **before** they click Publish:

- The `<PublishDialog>` (PR 4.5b deliverables) reads from `GET /api/health` (endpoint 8) to display:
  - Number of workspace files with at least one field in `Failed` state.
  - Number of workspace files missing required `field_sources` entries.
  - Number of workspace files that fail `WorkspaceFile.parse()` (corrupt; see §10.3.1).
  - Total number of would-publish resorts (workspace ∪ published union).
- Client-side re-validation is **explicitly NOT done** — the SPA does not import `validatePublishedDataset`. Server-side health is the single source of truth.
- Publish disabled-state: the dialog's confirm button is `disabled` when ANY of the following:
  - `health.resorts_with_failed_fields > 0` — tooltip: "fix failures or switch fields to MANUAL before publishing."
  - `health.resorts_with_missing_provenance > 0` — tooltip: "every metric field needs a matching `field_sources` entry; check the editor's StatusPill column for missing-provenance markers."
  - `health.resorts_with_corrupt_workspace > 0` — tooltip: "1 workspace file is corrupt. Inspect `data/admin-workspace/` and either repair or `rm` the file before publishing. See server logs for the failing slug + Zod issue list." (The corrupt-workspace count is surfaced in `HealthResponse` per §4.8 so pre-publish gating remains truthful — without this gate, publish would deterministically fail with `500 workspace-corrupt` per §10.3.1 while the dialog rendered "ready to publish.")
  - `health.resorts_total === 0` — tooltip: "no resorts staged for publish. Add resorts in the editor before publishing." (Phase 1 cold-start case per §10.9: `PublishedDataset.resorts` is `z.array(Resort).min(1)` per `packages/schema/src/published.ts:15`'s `EMPTY_DATASET_ZOD_MESSAGE = 'dataset_empty'` invariant — publishing an empty dataset would fail validation server-side; the dialog catches this client-side as a friendlier UX affordance.)

### 4.6 Endpoint 6 — `POST /api/resorts/:slug/publish`

**Path param schema:** Endpoint 6's `:slug` is `z.union([ResortSlug, z.literal('__all__')])` — a Phase 1 widening of the parent §8.4.1 contract per §1.1's divergence row. `ResortSlug` (regex `^[a-z0-9-]{1,64}$`) rejects underscores; the SPA's no-arg `apiClient.publish()` injects the `'__all__'` literal sentinel into the URL, so a plain `ResortSlug` schema would 400 the request before reaching the handler. Phase 2 collapses the union back to plain `ResortSlug` when per-resort publish lands; the contract-snapshot test (§4.9 invariant 3) catches the change. Endpoints 2 / 3 keep plain `ResortSlug`.

**Request:** `PublishBody` — `{ confirm: true }`. The boolean is a guard against accidental publish; the SPA's confirm dialog sets it.

**Note:** despite the path including `:slug`, Phase 1 publish is **all-or-nothing** — the slug parameter is a path artefact for future Phase 2 per-resort publish. The handler asserts `slug === '__all__'` (catches accidental per-slug calls before Phase 2 widens the contract) then reads the **workspace ∪ published union** (per Codex P1 fold on `e8a2374`) and rebuilds the published JSON.

**Response:** `PublishResponse` — `{ version_id: string, archive_path: string, published_at: ISODateTimeString, resort_count: number }`.

**Handler logic** (`apps/admin/server/publish.ts`):
- Compose the **publish input set** as `workspace ∪ published`, mirroring §4.1.1's `GET /api/resorts` union semantics: read all workspace files; read `data/published/current.v1.json`; for resorts represented in both, the workspace state takes precedence (it's the staged change); for published-only resorts (analyst hasn't touched them this session), include the published `Resort` as-is. This is the load-bearing distinction — a Phase 1 normal state where the analyst publishes after editing 1 of 2 seed resorts MUST include the un-edited resort, otherwise publish silently drops it. Reading workspace files alone (the prior wording) would have failed `dataset_empty` whenever the workspace dir was empty AND published had resorts — exactly the cold-start-recovery case where the analyst is trying to publish from an empty workspace dir over an existing published doc.
- Compose the `PublishedDataset` envelope shape (per `packages/schema/src/published.ts`) from the merged set.
- Call `publishDataset(...)` from `@snowboard-trip-advisor/schema/node` — which runs `parse → validatePublishedDataset → atomic write → archive`.
- On success: respond with the version metadata.
- On `validatePublishedDataset` failure: respond `400 publish-validation-failed` with the issue list in `details`. The `dataset_empty` Zod issue (per `packages/schema/src/published.ts:15`'s `EMPTY_DATASET_ZOD_MESSAGE` constant — fires when `resorts.length === 0`) maps to a non-failure UI affordance: §4.3.1's `<PublishDialog>` disables the confirm button when `health.resorts_total === 0`, so the operator sees the friendlier "no resorts staged" tooltip before they ever submit. If a request reaches the handler with an empty dataset (e.g., the dialog disabled-state was bypassed), the response is still `400 publish-validation-failed` with `details` carrying the `dataset_empty` code so the SPA can fall back to the friendlier message.

**Draft resort inclusion in publish:** the publish handler reads ALL workspace files (drafts + edited-published), runs `validatePublishedDataset` against the composed envelope. A draft missing required fields (per `Resort` schema or `field_sources` invariants) fails the publish with `400 publish-validation-failed`. This is the intended UX: drafts must be complete before they can publish.

### 4.7 Endpoint 7 — `GET /api/publishes`

**Request:** `ListPublishesQuery` — `{ page?: { offset, limit } }`. Default `{ offset: 0, limit: 20 }`.

**Response:** `ListPublishesResponse` — `{ items: PublishMetadata[], page: { ... } }`. `PublishMetadata` includes `version_id`, `published_at`, `archive_path`, `resort_count`, `published_by` (Phase 1: hostname fingerprint per parent spec §4.5.1's `manifest.generated_by`).

**Handler logic:** read the history directory under `data/published/history/` (the directory `publishDataset` writes archived versions into; see `packages/schema/src/publishDataset.ts:30` — `HISTORY_DIR_NAME = 'history'`); list versions newest-first; respond.

### 4.8 Endpoint 8 — `GET /api/health`

**Request:** `HealthQuery` — `{}`.

**Response:** `HealthResponse` — `{ resorts_total, resorts_with_stale_fields, resorts_with_failed_fields, resorts_with_missing_provenance, resorts_with_corrupt_workspace, pending_integration_errors, last_published_at, archive_size_bytes }`.

- `resorts_total` counts the **workspace ∪ published union** — i.e., the would-publish set (workspace files take precedence; published-only resorts contribute the rest). Cold-start (`resorts_total === 0`) is reachable per §10.9 and gates `<PublishDialog>` per §4.3.1.
- `resorts_with_missing_provenance` counts workspace files where one or more `METRIC_FIELDS` entries lack a matching `field_sources` entry — surfaced to `<PublishDialog>` per §4.3.1.
- `resorts_with_corrupt_workspace` counts workspace files that fail `WorkspaceFile.parse()`. Corrupt files are silently skipped from `resorts_total` and the per-field aggregates (§10.3.1), but their existence is surfaced as this count so `<PublishDialog>` can pre-block — without it, publish would deterministically fail with `500 workspace-corrupt` while the dialog rendered "ready to publish."
- `last_published_at` is `null` when `data/published/current.v1.json` is missing (per §10.9 missing-published-doc handling); `archive_size_bytes` is `0` in that case.

**Handler logic:** `mkdir -p data/admin-workspace/` (lazy-create per §10.9); read all workspace files (skipping ones that fail `WorkspaceFile.parse()`, incrementing `resorts_with_corrupt_workspace` and logging the failing slug + Zod issues to stderr); fall back to published doc for resorts not represented in workspace; aggregate per-field statuses; respond.

### 4.9 Contract invariants (parent §8.4.1, enforced in Epic 4)

1. **Every Phase 1 endpoint has a Zod schema pair** in `packages/schema/api/*.ts`. The contract-snapshot test (4.1a) enforces this mechanically — `__snapshots__/contract.snap` lists every export from `packages/schema/api/index.ts`; diffs require maintainer review.
2. **`apps/admin` fetches go through the typed `apiClient`** generated from those schemas. ESLint rule (4.1a) bans `fetch(` and `XMLHttpRequest` references outside `apiClient.ts`.
3. **The contract-snapshot test** lives at `packages/schema/api/contract.test.ts`; it serializes every schema to JSON and asserts byte-equality with `__snapshots__/contract.snap`.
4. **Phase 2 route registration uses the same schemas** — when Phase 2 lands, route registration imports from `packages/schema/api/*` so a schema change is a Phase 2 compile error.
5. **`GET`/`HEAD` are idempotent and safe** (no `Idempotency-Key` needed; safe to retry). **`POST` for non-idempotent operations** — endpoint 6 publish (and Epic 5's sync POST when it lands) — **carries an `Idempotency-Key` header**; Phase 2 enforces deduplication on this header. **`PUT` for upsert (endpoint 3) does NOT require an `Idempotency-Key`** — the operation is naturally idempotent (a deterministic merge over the workspace state given the same body) and the high-frequency autosave (`useWorkspaceState` 500ms debounce per §6.1, many writes per editing session) would make per-PUT key generation + storage an enforcement burden without a correctness benefit. Phase 1's in-process middleware honors `Idempotency-Key` on `POST` but does not enforce; Phase 2 enforces on `POST` only.

### 4.10 Error envelope

All error responses share a single shape:

```ts
{
  error: {
    code: string,           // 'invalid-request' | 'invalid-resort' | 'not-found' | 'not-implemented' | 'publish-validation-failed' | 'workspace-corrupt' | 'internal'
    message: string,        // human-readable summary
    details?: unknown,      // Zod issue list, validator issues, etc.
  }
}
```

Schema lives at `packages/schema/api/errorEnvelope.ts`. Every handler wraps its body in a try/catch that produces this envelope on any thrown error. The middleware status codes: `400` for input/validation failures, `404` for not-found, `500` for unhandled errors.

---

## 5. Component Inventory

### 5.1 Design-system additions (PR 4.1c, with Toast moved to PR 4.5b)

Per Epic 3 spec §5.1 "Out of Epic 3" — these components are admin-only in Phase 1 (the public app does not consume them). All ship with the same TDD + axe + variant-matrix discipline as Epic 3's components.

- **`Sidebar`** — left-rail navigation. Renders an `aria-label` group of `<NavLink>`-style anchors. Supports an active-route highlight prop.
- **`StatusPill`** — small visual badge with 4 named variants: `Live` | `Stale` | `Failed` | `Manual`. Drives the editor's per-field status indicator. Must axe-clean in all 4 states; uses semantic color tokens from `packages/design-system/src/tokens.ts`.
- **`Tabs`** — top-of-panel tab affordance. Used in PR 4.4b's editor view (Durable / Live tabs); 4.4a is server-only and does not consume `<Tabs>`. Keyboard-navigable per ARIA pattern (Left/Right arrows, Home/End).
- **`Popover`** — anchored floating panel. Used in 4.4b's `FieldRow` for the per-field actions dropdown (Phase 1 has only the ModeToggle; Epic 5's Test/Sync extends it).
- **`DropdownMenu`** — keyboard-navigable menu for the HeaderBar's user identity placeholder + Sources / Integrations / History links. Distinct from `Popover` (menu items vs. arbitrary content).

**Deferred to PR 4.5b:** `Toast` — first real consumer is publish success/failure UI; component fan-out tightens by deferring until consumer exists.

**Deferred to analyst-notes follow-up:** `TextArea` — only the analyst-notes UI consumes it ([ADR-0012](../../adr/0012-defer-analyst-notes-to-post-epic-4-followup.md)).

### 5.2 App-level composites in `apps/admin/src/views/`

- **`Shell`** — admin-specific wrapper. Composes `<Sidebar>` (left rail) + `<HeaderBar>` (top, with Publish button + user identity placeholder) + `<main>` content area. Distinct from `apps/public`'s `Shell` — different chrome.
- **`Dashboard`** — health cards grid. Each card surfaces one metric from `GET /api/health`; clicking a card navigates to a filtered Resorts view.
- **`ResortsTable`** — table of resorts from `GET /api/resorts`. Columns: name, country, last updated, stale-field count, failed-field count, publish state. Click row → `ResortEditor` route.
- **`ResortEditor`** — the core. Composes `<DurablePanel>` and `<LivePanel>` inside a `<Tabs>` switch (or stacked, depending on viewport).
  - **`DurablePanel`** — renders the Resort doc's durable fields via `<FieldRow>` per field.
  - **`LivePanel`** — renders the latest `ResortLiveSignal` per field via `<FieldRow>`.
  - **`FieldRow`** — `<StatusPill>` + value display (or edit input in MANUAL mode) + `<ModeToggle>` + `<SourceBadge>` (the Epic-3 design-system component).
  - **`ModeToggle`** — `AUTO` ↔ `MANUAL` toggle. **Interactive in Epic 4** (shipped in PR 4.4d): clicking flips a field's mode in the workspace state, and MANUAL mode exposes the edit input that PR 4.4c's PUT handler accepts. What is **absent** in Epic 4 is the AUTO-side adapter-action buttons (Test / Sync) — those land in Epic 5 alongside the first real adapter per [ADR-0011](../../adr/0011-defer-test-sync-ux-to-epic-5.md). §1.1's parent-spec divergence row for §3.6 ("`AUTO` mode in Epic 4 displays the most recent value with `SourceBadge` (read-only); no refresh-from-adapter button. `MANUAL` mode is the only edit path.") is the canonical Epic 4 behavior.
- **`PublishDialog`** — modal confirm dialog before `POST /api/resorts/:slug/publish` (the canonical endpoint per §4.6; Phase 1 publish is all-or-nothing per §1 row 5, so the SPA hard-codes a sentinel slug `'__all__'` in the URL path while exposing a no-arg `apiClient.publish()` per §7.5 / B4 P1 fold). Lists workspace state (number of changed resorts; number of resorts with `Failed` fields blocking publish per parent §3.7 + §4.3.1).
- **`PublishHistory`** — list of past publishes from `GET /api/publishes`. Phase 1 read-only — no rollback action.

---

## 6. State, Theme, Testing

### 6.1 State surface (hooks)

Mirrors Epic 3's pattern (one hook per concern; `__resetForTests` exports for isolation). 7 hooks:

- `useResortList()` — wraps `apiClient.listResorts(query)`. Query state via URL params (admin's URL-state lib lives in `apps/admin/src/lib/urlState.ts`, parallel to Epic 3's `apps/public/src/lib/urlState.ts`).
- `useResortDetail(slug)` — wraps `apiClient.getResort(slug)`. Suspense-friendly via React 19 `use()` (same pattern as Epic 3's `useDataset`; same rejected-promise pinning per [ADR-0010](../../adr/0010-usedataset-rejected-promise-pinning.md)).
- `useWorkspaceState()` — local UI state for the editor's draft changes BEFORE PUT (debounced auto-save fires PUT through `apiClient`). Backed by `useState` + `useEffect`; not Suspense-driven.
- `useModeToggle(slug, fieldPath)` — per-field AUTO/MANUAL state. Local UI state; the mode is stored in the workspace file's top-level `editor_modes` map (a sparse `Partial<Record<MetricPath, 'manual' | 'auto'>>` per §10.2 — only metric paths that have been actively toggled appear; missing keys project as `'auto'`). The hook reads from `useResortDetail()`'s parsed `WorkspaceFile.editor_modes` and writes through `apiClient.upsertResort()` whose PUT body carries the (sparse) updated map. Cross-key invariant per §10.2: every `editor_modes` key MUST be a key in `resort.field_sources` — the hook computes `validPaths = Object.keys(resort.field_sources)` and **silently no-ops** `toggleMode(path)` when `path ∉ validPaths` (per Codex P2 fold on `e8a2374` — `eslint.config.js:90` enforces `'no-console': 'error'` for app code; the hook cannot use `console.warn`). The schema refinement at the server layer is the load-bearing safety; the hook's local guard exists to prevent obviously-impossible PUTs from leaving the SPA, not to surface diagnostics. The unit test pins the silent-no-op behavior; if a SPA bug ever sends a ghost path to `useModeToggle`, the missing UI feedback is acceptable because (a) it shouldn't be possible for the SPA to call `toggleMode` with a path not in the rendered field list, and (b) a server-side `400 invalid-resort` would surface the bug from any `editor_modes` PUT that bypassed the local guard.
- `usePublish()` — wraps `apiClient.publish()`. Returns `{ status: 'idle' | 'publishing' | 'success' | 'error', result?, error? }`.
- `usePublishes()` — wraps `apiClient.listPublishes()`.
- `useHealth()` — wraps `apiClient.getHealth()`.

**`apps/admin/src/lib/urlState.ts` is a pure helper module, not a hook** (per F3 P1 fold) — exports a `parseURL(search: string): RouteState` parser and a `serializeURL(state: RouteState): string` serializer. State hooks (`useResortList`, `useResortDetail`) call these helpers directly; the helpers themselves carry no React state. This matches Epic 3's pattern (`apps/public/src/lib/urlState.ts`).

### 6.2 Theme

Inherits semantic tokens from `packages/design-system/tokens.css`. No theme-toggle UI in Phase 1 (parent §6.5 of pivot spec — Phase 2 concern). Admin uses dark-by-default OR follows `prefers-color-scheme` — same posture as the public app per Epic 3 [ADR-0005](../../adr/0005-css-theme-no-js.md).

### 6.3 Testing strategy

Same Epic 3 patterns:

- **Unit tests** (`vitest` + jest-axe) for every component, hook, lib helper, and server handler. 100% line / branch / function / statement coverage gate; no `/* istanbul ignore */`.
- **Integration tests** under `tests/integration/apps/admin/*.test.tsx`. **Tiered MSW harness** — two interception modes:
  - **Tier 1 — Canned MSW (default).** `apps/admin/src/mocks/server.ts` returns canned responses keyed by URL pattern. Used by read-only / SPA-composition integration tests where no filesystem side effects are exercised. Fast.
  - **Tier 2 — Bridge MSW (`bridgeHandlers(workspaceDir)`).** `apps/admin/src/mocks/realHandlers.ts` exports a function that returns MSW handlers which decode the request via Zod, **invoke the real `apps/admin/server/*` handler** with the test's fixture workspace dir, and encode the response. Used by side-effect-bearing integration tests (write round-trip, publish, full-flow). Each test sets `server.use(...bridgeHandlers(tmpdir))` in `beforeEach` after creating a per-test workspace tmpdir. Catches "I forgot to wire the SPA → middleware → handler" regressions that canned MSW would mask.
  - Per-test interception choice (read-only tests use canned; side-effect tests use bridge) is the load-bearing distinction. The Vite plugin's lifecycle adapter is coverage-excluded per §10.1; the dispatch helper is what `bridgeHandlers` mirrors.
- **Integration test inventory:**
  - `shell.test.tsx` — Shell renders without errors (PR 4.1b). **Tier:** canned.
  - `resort-editor-read.test.tsx` — editor opens, durable + live render, MANUAL toggle visible-but-disabled (PR 4.4b — first PR with a rendered editor). **Tier:** canned.
  - `resort-editor-write.test.tsx` — ModeToggle flips, MANUAL edit triggers PUT, workspace file written, page reload preserves state (PR 4.4d — when the toggle becomes interactive). **Tier:** bridge.
  - `publish-flow.test.tsx` — PublishDialog opens, confirm runs through real `publishDataset()`, history dir grows, Toast on success/failure (PR 4.5b). **Tier:** bridge.
  - `dashboard.test.tsx` — health cards render + click-through-to-filtered-resorts (PR 4.6b — integration backfill closing PR). **Tier:** canned.
  - `resorts-table.test.tsx` — table renders + sort + filter + click row (PR 4.6b). **Tier:** canned.
  - `full-flow.test.tsx` — composite open admin → Resorts → row click → MANUAL edit → save → publish → see in history (PR 4.6b). **Tier:** bridge.
- **End-to-end Playwright tests** are deferred to Epic 6 (visual regression layer — same posture as Epic 3 per parent §6.5).
- **Server handler tests** live under `apps/admin/server/__tests__/`. Each handler is invocable directly with fixture inputs (no Vite required). The Vite middleware itself is a thin lifecycle adapter and is coverage-excluded with rationale (see §10.1).

---

## 7. PR Breakdown

### 7.1 TDD discipline

Tests-first ordering enforced by deliverable lists in §7.5–§7.16. Each PR's "Files" subsection lists test files BEFORE implementation files. Per AGENTS.md / CLAUDE.md TDD Workflow.

### 7.2 Subagent-review trigger matrix

PRs touching these paths require an independent subagent review per AGENTS.md:

| PR | Triggered paths |
|---|---|
| 4.1a | `packages/schema/**` (Zod surface + `FieldStateFor<T>` / `toFieldValue<T>` additions in `resortView.ts`), `eslint.config.js` (extending no-restricted-imports) |
| 4.1b | `apps/admin/vite.config.ts` (binding), `apps/admin/vite-plugin-admin-api.ts` |
| 4.1c | `packages/design-system/**` (component additions) |
| 4.4a | `apps/admin/server/**` (handler additions; Phase 2 portability surface) |
| 4.4b | (none — UI components only) |
| 4.4c | `apps/admin/server/**` (atomic-write semantics must match `packages/schema/src/publishDataset.ts:162-211` byte-for-byte; PUT validation contract) |
| 4.4d | (none — UI interaction only) |
| 4.5a | `apps/admin/server/publish.ts` (publish pipeline gate), `packages/schema/**` (touches `publishDataset` consumer) |
| 4.5b | `packages/design-system/**` (Toast component addition) |
| 4.6a | (none — UI polish + responsive only; no CODEOWNERS-protected paths) |
| 4.6b | (none — integration tests only; Dockerfile guard deferred to Epic 6 per §10.7 / C4) |

### 7.3 Cross-cutting assignments (every PR)

- **TDD** per the deliverable ordering.
- **README evaluation** — admin app is internal-only and not user-facing, so README updates are minimal. PRs 4.5b (publish UI) and 4.6b (integration backfill, closing PR) MAY warrant a README mention of the admin app's existence + how to start it; lower-numbered PRs may skip with a one-line note in the PR description.
- **DCO sign-off** on every commit (`git commit -s`, or auto-added by the `prepare-commit-msg` hook installed from `scripts/prepare-commit-msg` via `npm run setup`).
- **Subagent Review Discipline** — per the §7.2 matrix.
- **Pre-commit `npm run qa`** — runs before each commit.

### 7.4 Tiers, gates, and parallelism

Epic 4 ships across **5 tiers** (13 PRs total). **Inter-tier gates are blocking** — no Tier N+1 PR opens until all Tier N PRs are merged AND the gate verification below passes. Within a tier, PRs marked **‖** can land in any order (parallel-capable; same base commit, no shared files); PRs marked **→** are strictly sequential (later branches stack on the predecessor).

| Tier | Contents | Within-tier order |
|---|---|---|
| 1 — Foundation | 4.1a → 4.1b → 4.1c | Sequential (each builds on the prior PR's surface) |
| 2 — Navigation | 4.2 → 4.3 | Sequential (shared `apps/admin/src/lib/urlState.ts`) |
| 3 — Editor | (4.4a ‖ 4.4b) → 4.4c → 4.4d | 4.4a/4.4b parallel as planned; 4.4c → 4.4d sequential (4.4d's bridge integration test invokes 4.4c's handler). **Executed serial:** PR 4.4a split into 4.4a-1 + 4.4a-2 for file-budget reasons, which dropped the `4.4a ‖ 4.4b` parallelism (see §7.11). |
| 4 — Publish | 4.5a → 4.5b | Sequential (4.5b's bridge integration test invokes 4.5a's handler) |
| 5 — Closing | 4.6a ‖ 4.6b | Parallel (no shared files; 4.6a is polish, 4.6b is integration backfill) |

```
Tier 1 ─ Foundation
  4.1a (Foundation: schema/api + apiClient + FieldStateFor + WorkspaceFile.editor_modes refinement)
    ↓
  4.1b (Vite middleware skeleton + Shell + tiered MSW: server.ts canned + realHandlers.ts bridge)
    ↓
  4.1c (DS additions: 5 components, Epic-3-3.2 precedent)
    ↓
                              ─── Tier 1 → 2 GATE ───
Tier 2 ─ Navigation
  4.2 (Dashboard + GET /api/health real handler + cold-start empty state)
    ↓
  4.3 (Resorts table + GET /api/resorts real handler + cold-start empty state)
    ↓
                              ─── Tier 2 → 3 GATE ───
Tier 3 ─ Editor
  4.4a (Server read) ‖ 4.4b (Editor view, read-only)   ← parallel-capable
    ↓
  4.4c (Server write + atomic-write helper)
    ↓
  4.4d (Edit interactive: ModeToggle + useWorkspaceState + bridge write integration)
    ↓
                              ─── Tier 3 → 4 GATE ───
Tier 4 ─ Publish
  4.5a (Publish handler + listPublishes handler)
    ↓
  4.5b (Publish UI + Toast + 4-state PublishDialog gating)
    ↓
                              ─── Tier 4 → 5 GATE ───
Tier 5 ─ Closing
  4.6a (Polish: keyboard shortcuts + responsive read-only)
  4.6b (Integration backfill: dashboard + resorts-table + full-flow tests, bridge tier)
        ‖ ← parallel-capable
                              ─── Epic 4 done ───
```

**Inter-tier gates** (`npm run qa` green on `main` after the last tier-PR merges; maintainer verifies the items below before authorizing next-tier PRs):

- **Tier 1 → 2 gate (after 4.1a/b/c merged):**
  - `npm run dev:admin` boots on `127.0.0.1:5174` `strictPort:true`.
  - `fetch('/api/...')` returns `501` with the standard error envelope for all 6 endpoints.
  - Shell renders the real Sidebar + DropdownMenu (not placeholders).
  - Contract snapshot pinned at `packages/schema/api/__snapshots__/contract.snap`; every export from `packages/schema/api/index.ts` represented.
  - `WorkspaceFile.parse()` enforces the `editor_modes` cross-key invariant (per §10.2 / P0-2 fold).
  - Tiered MSW harness present: `apps/admin/src/mocks/server.ts` (canned) + `apps/admin/src/mocks/realHandlers.ts` (bridge) both exist and have unit tests.
- **Tier 2 → 3 gate (after 4.2 → 4.3 merged) — CLOSED.** Originally listed:
  - Dashboard renders against real `/api/health`; ResortsTable against real `/api/resorts`. ✅
  - Cold-start empty state visible per §10.9 (Dashboard "No resorts yet" card; ResortsTable empty-state row) when `data/admin-workspace/` is empty AND `data/published/current.v1.json` is missing. ✅
  - Card-click + row-click navigation works in browser smoke (URL state updates). ✅ (row-click closed by 4.3; card-click closed by PR 4.3.1 — see §7.9.1.)
  - Both real handlers tested against missing-`current.v1.json` fixtures. ✅
- **Tier 3 → 4 gate (after 4.4a/b/c/d merged) — CLOSED.** Originally listed:
  - Editor opens for both seed slugs (`kotelnica-bialczanska`, `spindleruv-mlyn`); MANUAL edit round-trips through PUT; page reload preserves the workspace state via `editor_modes`. ✅
  - Bridge integration test (`resort-editor-write.test.tsx`, Tier 2 of the test harness) green; per-test workspace tmpdir verified to receive the atomic-written file. ✅
  - `editor_modes` cross-key invariant rejects malformed PUTs (handler test asserts `400 invalid-resort` carrying the refinement message). ✅
- **Tier 4 → 5 gate (after 4.5a → 4.5b merged):**
  - Publish dialog → POST → `data/published/history/` grows (verified via bridge test); Toast on success/failure; PublishHistory shows the new version.
  - Pre-publish blocking-state surface (§4.3.1) gates correctly on all four conditions: `resorts_with_failed_fields > 0`, `resorts_with_missing_provenance > 0`, `resorts_with_corrupt_workspace > 0`, `resorts_total === 0`. Each disabled-state's tooltip text verified.
- **Tier 5 (Epic 4 done) gate (after 4.6a + 4.6b + 4.6c merged):**
  - `full-flow.test.tsx` green (bridge tier — composite open admin → Resorts → row click → MANUAL edit → save → publish → see in history).
  - Keyboard shortcuts work in browser smoke for the **4 shortcuts shipped in 4.6a** (`g r`, `g i` (Toast), `mod+enter` callback (true save flush wires in 4.6c), `Escape` callback). The `/` shortcut is **deferred to Phase 2** when search functionality lands per [Tier 5 plan Decision B1](../plans/2026-05-12-epic-4-tier-5-closing-plan.md).
  - Responsive read-only enforced via DOM **native `disabled`** attribute on Shell header action buttons (NOT `tabindex="-1"+aria-disabled` per [Tier 5 plan Decision D1](../plans/2026-05-12-epic-4-tier-5-closing-plan.md) — design-system Button.tsx convention + WAI-ARIA 1.2 normative behavior) + render-gate-hidden edit input below `md` (NOT CSS-only; tested via simulated viewport).
  - `useWorkspaceState` in-flight-clear race fix shipped in PR 4.6c (depends on 4.6a merge).
  - `npm run qa` green on `main`.

**Parallel-capable PRs** branch from the same base commit (the prior tier's last-merged commit). They MUST NOT modify shared files; each PR's "Files" subsection enumerates its surface so a reviewer can verify disjointness at a glance. If a parallel PR's review reveals a needed shared-file change, the maintainer collapses the pair to sequential.

**Sequential PRs** stack on the predecessor's branch. After the predecessor merges, rebase onto `main`. Each PR's `**Depends on:**` line names the immediate predecessor.

**Why parallelism is conservative.** Most Epic 4 PRs share file surface (`FieldRow.tsx`, `Shell.tsx`, `urlState.ts`) or runtime contract (bridge integration tests need the real handler to exist). Linear is the default. The two genuinely-disjoint pairs (4.4a‖4.4b, 4.6a‖4.6b) are the only safe parallelism. Aggressive parallelism (e.g., pre-skeletoning empty routes in 4.1b to enable 4.2‖4.3) is YAGNI per AGENTS.md "don't add features beyond what the task requires."

**Cross-tier notes** (per A2 P1 fold, retained):

- 4.4a depends on 4.1a's `apiClient` + the new `FieldStateFor<T>` projection helpers; 4.4b depends on 4.4a + 4.1c's `Tabs` / `StatusPill` primitives.
- 4.4a's row-click navigation uses the route schema introduced in 4.3, but the route shape is shared. The graph keeps 4.4a after 4.3 for clarity.

**Rollback** is `git revert <merge-sha>` directly on `main`, per parent spec §10.4 ("Phase 1 ships feature branches directly to `main`; no integration branch") and the PreToolUse hook (`scripts/hooks/deny-dangerous-git.sh`) that blocks force-push. Worktrees with downstream work (e.g., a stacked PR whose base just got reverted) rebase against post-revert `main`. DCO sign-off applies to revert commits per [ADR-0009](../../adr/0009-dco-exemption-for-dependabot.md).

### 7.5 PR 4.1a — Foundation: schema/api + apiClient + FieldStateFor + contract snapshot

Status: **DONE** — merged in [#79](https://github.com/mathvbarone/snowboard-trip-advisor/pull/79) (commit `0ad4992`). Delivered: `packages/schema/api/` typed wire contract for all 6 endpoints + contract snapshot test (`__snapshots__/contract.snap`) + `apps/admin/src/lib/apiClient.ts` + `WorkspaceFile` schema with the `editor_modes` cross-key invariant + `FieldStateFor<T>` / `toFieldValue<T>` projection types in `packages/schema/src/resortView.ts` + ESLint allow/ban rules for `apps/admin/**`. The `publish()` wrapper hard-codes the sentinel slug `'__all__'` per the all-or-nothing Phase 1 publish convention.

### 7.6 PR 4.1b — Vite middleware skeleton + admin Shell composition

Status: **DONE** — merged in [#80](https://github.com/mathvbarone/snowboard-trip-advisor/pull/80) (commit `79bb48f`). Delivered: `apps/admin/vite-plugin-admin-api.ts` (Connect middleware dispatching `/api/*` to `apps/admin/server/*` handlers) + 7 stub handlers returning 501 + `apps/admin/server/__tests__/dispatch.test.ts` + `127.0.0.1:5174 strictPort:true` binding + tiered MSW harness (`apps/admin/src/mocks/server.ts` canned + `mocks/realHandlers.ts` bridge with workspace-dir override). Lazy `mkdir -p data/admin-workspace/` on first dispatch per §10.9.

### 7.7 PR 4.1c — Design-system additions: Sidebar, StatusPill, Tabs, Popover, DropdownMenu

Status: **DONE** — merged in [#81](https://github.com/mathvbarone/snowboard-trip-advisor/pull/81) (commit `ee78d9c`). Delivered: 5 new DS components (`Sidebar`, `StatusPill` with 4 variants, `Tabs`, `Popover`, `DropdownMenu`) + barrel re-exports + Shell wiring with the real Sidebar + DropdownMenu chrome. Bundled multi-component PR per Epic 3 PR 3.2 precedent (design-system fan-out is one concern).

### 7.8 PR 4.2 — Dashboard view + GET /api/health endpoint

Status: **DONE** — merged in [#84](https://github.com/mathvbarone/snowboard-trip-advisor/pull/84) (commit `5bc1eb4`). Delivered: real `apps/admin/server/health.ts` aggregating workspace ∪ published per §4.8 + cold-start handling per §10.9 + `useHealth` hook + `Dashboard.tsx` rendering all 8 `HealthResponse` cards with the "No resorts yet" cold-start empty-state + admin URL-state foundation (`apps/admin/src/lib/urlState.ts` parse/serialize + `apps/admin/src/state/useURLState.ts` `useSyncExternalStore` writer with module-scoped subscriber broadcast for programmatic `pushState`). Stale-field staleness window is `default < ageDays <= max_stale` (Codex round-5 fold).

### 7.9 PR 4.3 — Resorts table + GET /api/resorts endpoint

Status: **DONE** — merged in [#85](https://github.com/mathvbarone/snowboard-trip-advisor/pull/85) (commit `27b5456`). Delivered: real `apps/admin/server/listResorts.ts` + `useResortList` hook + `ResortsTable.tsx` with sortable + filterable columns + filtered-empty / cold-start variants + extended `urlState.ts` (resorts + editor route variants with country / hasFailures filters) + Table primitive `onRowSelect` prop for whole-row click navigation + `setRoute` round-trip fix (pushes `serializeURL` output verbatim).

### 7.9.1 PR 4.3.1 — Dashboard "Failed fields" card-click + URL-state navigation (Tier 2 → Tier 3 gate fold)

Status: **DONE** — merged in [#88](https://github.com/mathvbarone/snowboard-trip-advisor/pull/88) (commit `4657df3`). Delivered: closes the deferred half of the Tier 2 → Tier 3 gate (§7.4 criterion 3, "Card-click + row-click navigation works in browser smoke"). The Dashboard's "Failed fields" `MetricCard` becomes clickable; click pushes `?route=resorts&hasFailures=true` via `setRoute`. `MetricCardProps` is now a discriminated union (inert vs clickable, both required when clickable) — eliminates dead-branch coverage gaps. Other counter cards stay inert by design (URL schema only supports `country` + `hasFailures` today; expansion is Tier 4/5 work). Spec PR [#86](https://github.com/mathvbarone/snowboard-trip-advisor/pull/86) (commit `85e90b3`) shipped the design rationale; the spec was merged into `main` then pruned in this post-Tier-2 doc-prune. Hook-test env unblocker [#87](https://github.com/mathvbarone/snowboard-trip-advisor/pull/87) (commit `a59006a`) shipped between #86 and #88 to make `npm run qa` green on macOS case-preserving filesystems.

### 7.10 PR 4.4a — Server read path (resortDetail + workspace read helpers)

Status: **DONE** — shipped as two PRs: [#91](https://github.com/mathvbarone/snowboard-trip-advisor/pull/91) (commit `7ca2611`, PR 4.4a-1) + [#92](https://github.com/mathvbarone/snowboard-trip-advisor/pull/92) (commit `4364a2b`, PR 4.4a-2). Delivered (4.4a-1): `projectFieldStates(resort, live, modes, now)` + `FRESHNESS_TTL_DAYS` reuse in `packages/schema/src/resortView.ts` + recovered seed fixtures at `tests/fixtures/admin-workspace/{kotelnica-bialczanska,spindleruv-mlyn}.json` (originally a §10.8 / PR 4.1a deliverable that didn't ship). Delivered (4.4a-2): real `apps/admin/server/resortDetail.ts` handler + `apps/admin/server/workspace.ts` read helpers + `apps/admin/src/state/useResortDetail.ts` hook with React-19 `use()` + Suspense + dual-cache (`cachedPromises` for Suspense reads, `cachedFulfilled` for sync sequel renders) per [ADR-0010](../../adr/0010-usedataset-rejected-promise-pinning.md) + HMR reset hook (`useResortDetail.hmr.ts`, coverage-excluded via `apps/admin/vite.config.ts` glob update). The spec originally scoped one PR; execution split for file-budget reasons. **Behavioural change to remember for Tier 4+:** `useResortDetail` now subscribes consumers via `useSyncExternalStore` (PR 4.4d round-2 P2-C fold uncovered a latent 4.4a-2 oversight — `prepopulateResortDetail` / `invalidateResortDetail` did not wake mounted consumers). Tier 4 publish-success can rely on `invalidateResortDetail()` (or per-slug variant) to re-render the editor cleanly.

### 7.11 PR 4.4b — Editor view (read-only)

Status: **DONE** — merged in [#93](https://github.com/mathvbarone/snowboard-trip-advisor/pull/93) (commit `8cfd5fd`). Delivered: `apps/admin/src/views/ResortEditor.tsx` composition shell + co-located `<EditorErrorBoundary>` (404 + `workspace-corrupt` 500 + retry) + parametrized `apps/admin/src/views/ResortEditor/MetricPanel.tsx` (spec planned separate `DurablePanel.tsx` + `LivePanel.tsx`; execution collapsed them into one `<MetricPanel kind="durable" | "live">` component) + `FieldRow.tsx` (StatusPill + value display + SourceBadge, render-only mode) + an inline render-only `<span role="switch">` ModeToggle inside FieldRow (PR 4.4d later replaced this with a button-based `<ModeToggle>` standalone component) + `tests/integration/apps/admin/resort-editor-read.test.tsx`. **Spec deviations:** parallelism with 4.4a (spec §7.4 marked `4.4a ‖ 4.4b`) was dropped — 4.4b shipped strictly serial after 4.4a-2 once 4.4a was split. `urlState.ts` MODIFY omitted — the editor route already shipped in PR 4.3, so no further extension was needed.

### 7.12 PR 4.4c — Server write path + workspace atomic-write

Status: **DONE** — merged in [#94](https://github.com/mathvbarone/snowboard-trip-advisor/pull/94) (commit `1a2c52e`). Delivered: `apps/admin/server/resortUpsert.ts` real handler (replaces 4.1b's 501 stub) with deep-merge for `Resort.field_sources`, shallow-merge for top-level `Resort` / `live_signal` / `editor_modes`, branded `modified_at` stamping, `WorkspaceFile.refine()` cross-key invariant rejecting unknown `editor_modes` keys as `400 invalid-resort`, empty-body reject as `400 invalid-request`, and corrupt-workspace handling returning `500 workspace-corrupt` while refusing to overwrite (per §10.3.1). `apps/admin/server/workspace.ts` gains `atomicWriteWorkspaceFile` consuming the now-exported `atomicWriteText` from `@snowboard-trip-advisor/schema/node` (single canonical implementation per §10.3 — write tmp → fsync(fd) → rename → fsync(parent_dir) with macOS APFS `EBADF` tolerance). `apps/admin/server/dispatch.ts` MODIFIED to read `(err as Error & { details? }).details` and pass it into the error envelope (per spec §4.10's `{ error: { code, message, details? } }` shape — required for the cross-key refinement to surface its actionable list of bad keys).

### 7.13 PR 4.4d — Editor edit interaction

Status: **DONE** — merged in [#95](https://github.com/mathvbarone/snowboard-trip-advisor/pull/95) (commit `07f2196`). Delivered: `apps/admin/src/state/useWorkspaceState.ts` (module-scoped per-slug `Map<ResortSlug, SlugStore>` singleton subscribed via `useSyncExternalStore`, 500ms debounce, in-flight token + revision counter + concurrent-PUT queue, draft reset + `prepopulateResortDetail` on PUT success per Decision D13, manual `FieldSource` provenance written on value edit per Decision D12) + `apps/admin/src/state/useModeToggle.ts` (silent no-op when path ∉ `validPaths`, since `eslint.config.js:90` blocks `console` in app code) + button-based `<ModeToggle>` (DS-Button-based, replacing 4.4b's inline `<span role="switch">` to comply with `RAW_HTML_ELS`) + MANUAL edit input via DS `Input type="text"` with JS-side numeric/range/integer validation for the 7 durable numeric paths + a minimal responsive read-only gate below the `md` breakpoint (Decision D11, polished in PR 4.6a) + `tests/integration/apps/admin/resort-editor-write.test.tsx` bridge integration asserting workspace files land on disk in a per-test tmpdir. **Spec deviations:** `useWorkspaceState` / `useModeToggle` derive `slug` internally via `useURLState` (Decision D7, avoids prop-drilling through `MetricPanel.tsx`); `<EditorErrorBoundary>` co-located inside `ResortEditor.tsx` rather than as a separate file (file budget); `useResortList.__resetForTests` remains unwired into `apps/admin/src/test-setup.ts` — pre-existing technical debt explicitly out-of-scope for Tier 3. **Phase-1 limitation carried forward (PR 4.6a polish):** `useWorkspaceState` in-flight-clear race (Codex P2-B family, surfaced across 3 of the 4 Codex review rounds on PR #95) — see [`docs/superpowers/handoffs/2026-05-11-post-epic-4-tier-3.md`](../handoffs/2026-05-11-post-epic-4-tier-3.md) for full reproducer + recovery + architectural-fix tradeoffs.

### 7.14 PR 4.5a — Publish handler + listPublishes handler

**Goal.** Server-side publish + history endpoints. POST publish runs `publishDataset()`; GET publishes lists `data/published/history/`.

**Branch:** `epic-4/pr-4.5a-publish-handler`. **Depends on:** 4.4d merged. **README:** skip.

**Files (tests first):**

- Create `apps/admin/server/__tests__/publish.test.ts` — happy path + `validatePublishedDataset` failure (assert error envelope + status 400 with code `publish-validation-failed` per §4.6).
- Create `apps/admin/server/__tests__/listPublishes.test.ts` — verifies history-dir entries returned newest-first.
- Create `apps/admin/src/state/usePublish.test.ts`.
- Create `apps/admin/src/state/usePublishes.test.ts`.
- Implement `apps/admin/server/publish.ts` — replace 4.1b's 501 stub. Compose the publish input as the **workspace ∪ published union** (per §4.6 / Codex P1 fold on `e8a2374`): workspace overrides published per slug; published-only resorts are kept as-is. Compose `PublishedDataset` from the merged set; call `publishDataset()`; respond per §4.6 (drafts must be complete before they can publish).
- `apps/admin/server/__tests__/publish.test.ts` — add the union case alongside the existing happy-path + `validatePublishedDataset` failure cases:
  - Union case (per `e8a2374` fold): fixture has 2 published resorts (`kotelnica-bialczanska`, `spindleruv-mlyn`) and only 1 workspace edit (one of the two has a workspace file with a `field_sources` mutation). Publish runs; the resulting `current.v1.json` contains BOTH resorts (workspace-edited one with the mutation, published-only one unchanged). Assert `resort_count === 2` in the response.
  - Empty-workspace + non-empty-published case: 0 workspace files + 2 published resorts. Publish runs successfully; resulting `current.v1.json` is byte-equivalent to the input published doc (no-op publish from the data side; new history-archive entry from the publish side). Confirms the dataset is not falsely flagged `dataset_empty` just because the workspace dir is empty.
- Implement `apps/admin/server/listPublishes.ts` — replace 4.1b's 501 stub. Read `data/published/history/`; respond per §4.7.
- Create `apps/admin/src/state/usePublish.ts`.
- Create `apps/admin/src/state/usePublishes.ts`.

**Subagent review trigger:** YES — `apps/admin/server/publish.ts` is the publish gate; review verifies it does NOT bypass `validatePublishedDataset` and DOES correctly compose the `PublishedDataset` envelope. Also touches `packages/schema/**` (the `publishDataset` consumer surface).

**Acceptance gate:** `npm run qa` green; publish handler validates + writes through `publishDataset()`; listPublishes returns history-dir entries newest-first.

### 7.15 PR 4.5b — Publish UI + Toast

**Goal.** PublishDialog + PublishHistory views; first real Toast consumer (publish success / failure surfaces via Toast). PublishDialog reads `useHealth()` to populate the pre-publish blocking-state surface per §4.3.1.

**Branch:** `epic-4/pr-4.5b-publish-ui`. **Depends on:** 4.5a merged. **README:** evaluation — admin app is now functional end-to-end; consider mentioning in README.

**Files (tests first):**

- Create `packages/design-system/src/components/Toast.test.tsx` (variants: `info`, `success`, `error`; auto-dismiss timing prop).
- Create `apps/admin/src/views/PublishDialog.test.tsx` — verifies confirm button is `disabled` when ANY of the **four blocking conditions** per §4.3.1 / P0-4 fold:
  - (a) `health.resorts_with_failed_fields > 0` — failures-tooltip.
  - (b) `health.resorts_with_missing_provenance > 0` — missing-provenance-tooltip.
  - (c) `health.resorts_with_corrupt_workspace > 0` — corrupt-workspace-tooltip ("1 workspace file is corrupt. Inspect `data/admin-workspace/` and either repair or `rm` the file before publishing. See server logs for the failing slug + Zod issue list.").
  - (d) `health.resorts_total === 0` — cold-start-tooltip per §10.9.
  Each disabled-state's tooltip text is asserted exactly.
- Create `apps/admin/src/views/PublishHistory.test.tsx`.
- Create `tests/integration/apps/admin/publish-flow.test.tsx` — **bridge tier per §6.3 / P0-3 fold**: `beforeEach` creates a per-test workspace + history tmpdir, calls `server.use(...bridgeHandlers(tmpdir))`. The test then verifies PublishDialog opens, confirm runs through real `publishDataset()`, **`data/published/history/` directory grows on disk** (filesystem assertion), Toast surfaces, PublishHistory shows the new version.
- Create `packages/design-system/src/components/Toast.tsx` — first real consumer is here. Variant matrix: `info`, `success`, `error`. Auto-dismiss timing prop.
- Modify `packages/design-system/src/index.ts` — re-export Toast.
- Create `apps/admin/src/views/PublishDialog.tsx` — reads `useHealth()` to render the pre-publish blocking-state surface (§4.3.1).
- Create `apps/admin/src/views/PublishHistory.tsx`.
- Wire Toast into `apps/admin/src/views/Shell.tsx` (top-level `<ToastProvider>`); modify HeaderBar to surface a "Publish" button that opens PublishDialog.

**Subagent review trigger:** YES — `packages/design-system/**` (Toast component addition).

**Acceptance gate:** End-to-end publish flow works — open dialog, confirm, see Toast, history directory (`data/published/history/`) grows, PublishHistory updates; pre-publish blocking-state UX exercised in integration test.

### 7.16 PR 4.6a — Polish (keyboard shortcuts + responsive read-only-below-md)

**Goal.** Ship the user-facing polish surface: global keyboard shortcuts (parent §3.10) + responsive read-only-below-md affordance (parent §3.2). Polish is one concern; integration backfill ships separately in 4.6b (per P1-5 fold). PR 4.6a ships **4 of the 5** spec §3.10 shortcuts; the `/` shortcut is **deferred to Phase 2** when search functionality lands per [Tier 5 plan Decision B1](../plans/2026-05-12-epic-4-tier-5-closing-plan.md). A focus-only target (placeholder `<input type="search">`) violates WCAG 3.3.2 + 4.1.2 — input claims search role, does nothing.

**Plan:** [docs/superpowers/plans/2026-05-12-epic-4-tier-5-closing-plan.md](../plans/2026-05-12-epic-4-tier-5-closing-plan.md).

**Branch:** `epic-4/pr-4.6a-polish`. **Depends on:** 4.5b merged. **README:** evaluation only.

**Parallel-capable with:** PR 4.6b (per §7.4 — both branch from the same base after 4.5b merges; no shared files; 4.6a is polish surface and 4.6b is integration backfill).

**Files (tests first):**

- Create `apps/admin/src/lib/shortcuts.test.ts` — assert `g r` → resorts, `g i` → integrations Toast (Tier 5 plan Decision G3), `mod+enter` callback fires (true save flush wires in PR 4.6c — Decision G2), `Escape` callback fires (Radix Dialog handles modal Escape internally — Decision G1) via `vitest` + `@testing-library/user-event`. Editable-target bypass (`g _` skip when active element is INPUT / TEXTAREA / SELECT / contenteditable) and cross-platform mod-key (Meta+Enter on macOS, Control+Enter elsewhere) covered. The `/` shortcut is NOT shipped per Decision B1.
- Create `apps/admin/src/lib/useResponsiveTabOrder.ts` + `.test.ts` — hook returning `{ readOnly: boolean }` keyed off `(min-width: ${tokens.breakpoint.md}px)` (= 900). matchMedia subscription via `useSyncExternalStore`; jsdom-friendly fallback to `readOnly: false` when `window.matchMedia` is unavailable (matches FieldRow PR 4.4d D11 pattern). No new shared `useMediaQuery` hook (Tier 5 plan Decision E2 — locality-of-behavior).
- Create `apps/admin/src/lib/shortcuts.ts` — global keyboard shortcut handler implementing the test cases. Single document-level `keydown` listener per consumer-mount; handlers pinned via `useRef` so re-renders with fresh handler closures don't tear down + re-attach the listener (Tier 5 plan Decision F5).
- Create `apps/admin/src/views/Shell.responsive.css.ts` — visual breakpoint styles only (header padding tightening + brand-text hidden below md). Tests bundled into Shell.test.tsx per Tier 5 plan Decision I2. **CSS cannot apply `tabindex` or `disabled` attributes**; the tab-order discipline lives in TSX render gates below.
- Create `apps/admin/src/views/Shell.test.tsx` — tests for the Shell tab-order discipline + responsive CSS injection + RESPONSIVE_CSS export shape. NEW file (no prior Shell unit-test coverage; PR 4.5d's coverage rode on Dashboard / ResortsTable / PublishDialog tests).
- Modify `apps/admin/src/views/ResortEditor/FieldRow.tsx` — when `useResponsiveTabOrder().readOnly === true`, render a read-only `<span>` instead of the edit input/select; this is the "removed from tab order" path per parent §3.2 (the edit controls aren't in the DOM at all below `md`, so they cannot receive focus). PR 4.6a additionally **drops the inlined `useIsAboveMd` impl + `MD_QUERY` constant + the `tokens` and `useSyncExternalStore` imports** (now-unused after the hook extraction) and consumes `useResponsiveTabOrder` instead.
- Modify `apps/admin/src/views/Shell.tsx` — apply native `disabled={readOnly}` JSX prop on header action buttons (Publish + the inner `<Button>` of the Account `<DropdownMenu>` trigger) that DO render below `md` but must not be tabbable. **Per [`packages/design-system/src/components/Button.tsx:35-40`](../../../packages/design-system/src/components/Button.tsx) ("we deliberately do NOT add a parallel `aria-disabled` prop — the native `disabled` attribute already conveys the disabled state to assistive tech")** AND WAI-ARIA 1.2 normative behavior ("aria-disabled does not change operability — the element is still focusable, perceivable, and operable to assistive technology and the user"). Native `disabled` removes from tab order, prevents mouse activation, AND triggers `:disabled` CSS for visual state. The earlier draft of this section mandated `tabIndex={-1}` + `aria-disabled` JSX props; that pattern is broken per WAI-ARIA 1.2 (the element remains mouse-clickable and AT-discoverable via roving cursors) AND directly contradicts the design-system Button.tsx convention. Tests assert the rendered DOM carries the `disabled` attribute (NOT `tabindex="-1"` and NOT `aria-disabled`). Sidebar nav links remain tabbable below md (spec §3.2's "Publish/approve/sync/test actions" carve-out targets action affordances, not navigation). PR 4.6a additionally wires `useShortcuts({ onGoResorts, onGoIntegrations, onModEnter, onEscape })`, mounts a `<style>{RESPONSIVE_CSS}</style>` overlay at the Shell root, and consumes `useResponsiveTabOrder` for the `readOnly` flag.
- Modify `docs/superpowers/specs/2026-05-01-epic-4-admin-app-design.md` (this section §7.16) — co-ships with PR 4.6a per AGENTS.md §95 documentation discipline ("treat README/spec drift as a documentation bug, not optional cleanup"). Triggers Subagent Review per AGENTS.md §60 (`docs/superpowers/specs/**` is a CODEOWNERS-protected path).

**Subagent review trigger:** **YES** (revised — `docs/superpowers/specs/**` is touched per the spec amendment, file 9). Brief the reviewer to verify the amendment cites both Button.tsx:35-40 AND WAI-ARIA 1.2 normative text; the `/` deferral is documented with the WCAG 3.3.2 / 4.1.2 rationale; the amendment does NOT modify any §7.4 done-gate criteria beyond replacing `tabindex="-1"` with `disabled`.

**Acceptance gate:** Keyboard-shortcut tests green (4 of 5 shortcuts shipped per Decision B1); responsive test asserts the rendered DOM at simulated `md`-1 viewport contains read-only `<span>` (not edit input) for `<FieldRow>` and **`disabled` attribute (NOT `tabindex="-1"+aria-disabled`)** on Shell header action buttons that still render, per Tier 5 plan Decision D1; `npm run qa` green.

### 7.17 PR 4.6b — Integration backfill (closing PR)

**Goal.** Ship Epic 4's closing integration suite — Dashboard, ResortsTable, and full-flow integration tests. Closes Epic 4. The Dockerfile prod-build guard that was originally scoped here is **deferred to Epic 6** per §10.7 / C4.

**Branch:** `epic-4/pr-4.6b-integration-backfill`. **Depends on:** 4.5b merged. **README:** consider mentioning admin app's `npm run dev:admin` entrypoint (Epic 4 is now end-to-end functional).

**Parallel-capable with:** PR 4.6a (per §7.4).

**Files (tests first):**

- Create / extend `tests/integration/apps/admin/dashboard.test.tsx` — **canned tier per §6.3**: health cards render + click-through-to-filtered-resorts. Cold-start empty state verified per §10.9.
- Create / extend `tests/integration/apps/admin/resorts-table.test.tsx` — **canned tier**: table renders + sort + filter + click row updates URL state. Cold-start empty-state row verified per §10.9.
- Create `tests/integration/apps/admin/full-flow.test.tsx` — **bridge tier per §6.3 / P0-3 fold**: `beforeEach` creates a per-test workspace + history tmpdir, calls `server.use(...bridgeHandlers(tmpdir))`. Composite: open admin → navigate to Resorts → click row → MANUAL edit (flips `editor_modes` and writes the workspace file) → save → publish (writes `data/published/current.v1.json` + grows `data/published/history/`) → see in PublishHistory. The test asserts both the SPA-visible state AND the on-disk filesystem state.

**Subagent review trigger:** NO (no CODEOWNERS-protected paths; Dockerfile guard deferred to Epic 6 per §10.7).

**Acceptance gate:** All three integration tests green; `npm run qa` green; **Tier 5 → Epic 4 done gate** verified per §7.4 (full-flow green; keyboard shortcuts work in browser smoke per 4.6a; responsive read-only enforced via DOM `tabindex="-1"`).

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
- **Publish-time diff preview** (per-field diff between current workspace state and last-published state, shown inline in `<PublishDialog>`) — Phase 2 concern; per parent §3.7's eventual UX, but not in Phase 1's `<PublishDialog>`. Phase 1's PublishDialog shows aggregate counts only (per §4.3.1's pre-publish blocking-state surface); per-field diff preview is a Phase 2 admin enhancement.
- **Resort deletion** (`DELETE /api/resorts/:slug`) — Phase 2 endpoint. Phase 1 deletion is manual: `rm data/admin-workspace/<slug>.json` removes a draft from the workspace, but already-published resorts cannot be removed via the admin UI without a fresh publish (which would still re-include them unless the published doc is also edited out-of-band). Designing the deletion UX safely (cascade rules, audit trail, soft-delete vs hard-delete) is gated on the audit-log + auth surfaces that are Phase-2-only.

---

## 10. Operational concerns

### 10.1 Vite middleware process model (the ADR-0014 that wasn't)

Parent §3.11 + §8.4 lock this decision: **one Node process** serves the SPA AND the `/api/*` surface. The middleware plugin (`apps/admin/vite-plugin-admin-api.ts`) registers a Connect handler that dispatches requests to `apps/admin/server/*.ts` modules.

**Phase 1 specifics:**

- The rate-limit bucket (parent §7.4) lives in-memory in the Vite dev-server process; there is no cross-process contention because the Phase 1 CLI does NOT fetch adapters (parent §7.9).
- Role checks (parent §8.4.1's "Role (P2)" column) are no-ops in Phase 1; the role column is populated in Zod schemas so Phase 2 can flip them on without schema churn.
- The middleware is **only** registered on `apps/admin`'s Vite dev server. `apps/public`'s dev server has no admin-api middleware.
- The middleware is **not bundled** into any container image; mechanical Dockerfile-build verification of this is deferred to Epic 6 per §10.7.

**Phase 2 lift path:**

The `/api/*` wire contract is the stability line. Phase 2 replaces the Vite middleware with a Hono service over Postgres/Drizzle (parent §8.2). The SPA's `apiClient.ts` does NOT change — it imports the same Zod schemas from `packages/schema/api/*` and still calls `fetch('/api/...')`. Only the server implementation differs.

**Alternatives considered (and rejected)** — per C1 P1 fold:

- **(a) Separate Express / Hono process for `/api/*` in Phase 1.** Rejected — adds inter-process communication overhead and a second deployment surface (a second Node process to start, monitor, restart) without buying anything for Phase 1's loopback / single-analyst topology. Phase 2 will introduce a separate service anyway, but only when a real backing store + auth justify the additional surface area.
- **(b) Vite SSR-only with a separate API endpoint.** Rejected — admin is a dev-only SPA in Phase 1; SSR adds rendering complexity that the public app already chose to avoid (parent spec §6.5). The admin's Phase 2 path goes through Hono, not Vite SSR.
- **(c) Worker thread for the `/api/*` handlers.** Rejected — sharing the rate-limit bucket (and any future in-memory state) across a worker boundary is awkward without `SharedArrayBuffer` and requires explicit serialization; the same-process middleware is simpler and reads the same files the SPA's tests can fixture, which keeps the Phase-1 admin-app testable end-to-end without a worker harness.

### 10.2 Workspace file format and forward-compat

The `WorkspaceFile` Zod schema (`packages/schema/src/workspaceFile.ts`) ships in PR 4.1a:

```ts
const WorkspaceFile = z.object({
  schema_version: z.literal(1),
  slug: ResortSlug,
  resort: Resort,
  live_signal: ResortLiveSignal.nullable(),
  modified_at: ISODateTimeString,
  // Sparse map: only metric paths that have been actively toggled appear.
  // Zod v4's z.record(z.enum(...), v) is exhaustive (requires all enum keys);
  // z.partialRecord is the canonical sparse-record constructor.
  editor_modes: z
    .partialRecord(z.enum(METRIC_FIELDS), z.enum(['manual', 'auto']))
    .default({}),
}).passthrough().refine(
  (wf) => Object.keys(wf.editor_modes).every(
    (path) => path in wf.resort.field_sources
  ),
  (wf) => ({
    message: `editor_modes contains paths not in resort.field_sources: ${
      Object.keys(wf.editor_modes).filter(p => !(p in wf.resort.field_sources)).join(', ')
    }`,
    path: ['editor_modes'],
  }),
)
```

The `.passthrough()` permits unknown top-level fields (forward-compat for the analyst-notes follow-up PR). The post-Epic-4 analyst-notes follow-up adds a `notes` field (a sparse `Partial<Record<MetricPath, AnalystNote>>` — only metric paths with authored notes appear); existing workspace files written without `notes` continue to parse.

**`editor_modes` cross-key invariant** (per P0-2 fold): every key in `editor_modes` MUST correspond to a metric path that exists in `resort.field_sources`. You can have a `field_source` without an `editor_mode` (read-time projection: missing entry = `'auto'`, matching §1.1's parent-spec divergence row for §3.6 — Epic 4 displays AUTO by default, MANUAL is the only mutation path). You cannot have an `editor_mode` for a metric path with no corresponding `field_source`.

The invariant is enforced via Zod `.refine()` at `WorkspaceFile.parse()` time, not just by convention. It catches three drift modes: (1) hand-edited workspace files setting a mode for a typo'd metric path, (2) buggy handlers dropping a `field_source` without clearing its mode, (3) SPA sending a PUT for a non-existent path. Without it, `editor_modes` and `field_sources` can disagree silently — a `'manual'` mode on a path the editor will never render is invisible until the analyst stumbles on it. Defense-in-depth: PR 4.4d's `useModeToggle` hook also computes `validPaths = Object.keys(resort.field_sources)` and **silently no-ops** `toggleMode(path)` when `path ∉ validPaths` (no `console` — `eslint.config.js:90` blocks it in app code; per Codex P2 fold on `e8a2374`), so the SPA never sends a PUT that would 400 against the refinement.

**`editor_modes` is admin-internal** — it lives in the workspace file alongside `resort` and `live_signal`, but is never written through to the published doc. The publish pipeline reads `WorkspaceFile.resort` (which contains `field_sources` but not `editor_modes`) and composes `PublishedDataset.resorts`; `editor_modes` stays behind in the workspace. This is the same isolation pattern the analyst-notes follow-up uses for `notes`.

**`notes` is pinned as a top-level workspace key** (per B2 P1 fold) to keep it collision-free with `Resort.field_sources`, `editor_modes`, and any future per-field provenance addition. The post-Epic-4 follow-up's `WorkspaceFile` shape is therefore:

```ts
{
  schema_version: 1,
  slug: ResortSlug,
  resort: Resort,
  live_signal: ResortLiveSignal | null,
  modified_at: ISODateTimeString,
  editor_modes: Partial<Record<MetricPath, 'manual' | 'auto'>>,  // sparse map per §4.3
  notes?: { [metricPath: string]: AnalystNote },                 // added by post-Epic-4 follow-up
}
```

`notes` is keyed by `metricPath` (the same path used in `Resort.field_sources` keys), values are `AnalystNote` records (Markdown-sanitized text + author + timestamp). Pinning `notes` at the top level — rather than nesting under `resort.notes` or `field_sources[].notes` — keeps the analyst-notes follow-up purely additive: no Resort-schema changes required, and no risk of colliding with provenance keys.

**Why this is admin-internal and NOT under `published.schema_version`:** workspace files are never shipped to `apps/public`. They live under `data/admin-workspace/`, never enter `data/published/`, and the publish pipeline reads them, validates against the published-doc schema, and writes a fresh `current.v1.json`. The workspace `schema_version` is a separate evolution track from the published one. A workspace `schema_version` bump would be needed if the workspace SHAPE changes incompatibly (e.g., merging `resort` and `live_signal` into a single `RecordEntry`); additive fields like `editor_modes` and `notes` are backwards-compatible by design.

### 10.3 Atomic-write semantics

Both workspace files (`data/admin-workspace/<slug>.json`) and the published file (`data/published/current.v1.json`) use the **4-step atomic-write pattern** from `packages/schema/src/publishDataset.ts:162-211` (`atomicWriteText`):

1. Write contents to `<target>.<random-suffix>.tmp`.
2. `fsync(fd)` on the temp file's file-descriptor — flushes the file's data + metadata to disk.
3. `rename(<target>.<random-suffix>.tmp, <target>)` — POSIX-atomic at the inode level.
4. `fsync(parent_dir)` — flushes the **directory entry** (the rename's effect is otherwise NOT crash-consistent on POSIX without this). On macOS APFS / HFS+, `fs.open(dir, 'r').sync()` returns `EBADF`; the existing `publishDataset.ts` handles this by ignoring `EBADF` and re-throwing all other errors (APFS guarantees the rename is durable without an explicit dir-fsync).

`publishDataset()` already implements this pattern. The admin workspace write helper (`apps/admin/server/workspace.ts`, PR 4.4c — see §7's PR breakdown) MUST use the same pattern; subagent review on 4.4c verifies this byte-for-byte against `atomicWriteText`'s structure.

**Lock semantics:** Phase 1 is single-process. `strictPort: true` on the dev server (§3.1, §2.5) blocks two-instance startup, so concurrent workspace writes are not a concern. If a future Phase 1 use case introduces concurrent writes, see `packages/schema/src/publishDataset.lockTimeout.test.ts` for the lock-timeout pattern reference. Phase 2 ships proper distributed locking when admin moves to a real service.

### 10.3.1 Workspace file corruption + recovery (Phase 1)

A workspace file (`data/admin-workspace/<slug>.json`) can become unparseable for three Phase 1 reasons: a partial disk fill that corrupted the rename's destination (rare given the §10.3 atomic write), a manual hand-edit by the analyst that violates the `WorkspaceFile` Zod schema, or external tooling deleting the file mid-edit.

**Handler behavior on corrupt workspace files:**

- **`GET /api/resorts` (endpoint 1, §4.1) + `GET /api/health` (endpoint 8, §4.8)** — these handlers iterate every workspace file. On Zod parse failure for any one file, the handler logs the failing slug (and the Zod issue list) to stderr, **excludes the corrupt file from the response's per-resort aggregates**, and continues. This degrades gracefully rather than failing the whole list. The health endpoint **surfaces the corrupt-file count via the `resorts_with_corrupt_workspace` field on `HealthResponse`** (per §4.8 / P0-4 fold) — this is the load-bearing signal that lets `<PublishDialog>` (§4.3.1) pre-block before the operator clicks Publish. Without this field surfaced, publish would deterministically fail with `500 workspace-corrupt` while the dialog rendered "ready to publish" — a deterministic UX lie. The corrupt count is therefore a **first-class Epic 4 deliverable**, not a deferred follow-up.
- **`GET /api/resorts/:slug` (endpoint 2, §4.2)** — single-slug read. On Zod parse failure of the corresponding workspace file, the handler responds `500 workspace-corrupt` (new error code, added to the `errorEnvelope.ts` schema in PR 4.1a) with `details` carrying the failing slug + the Zod issue list. The admin UI surfaces this via the existing error-envelope handling in the `<ResortEditor>` route.
- **`PUT /api/resorts/:slug` (endpoint 3, §4.3)** — write path. If the target workspace file is corrupt, the handler responds `500 workspace-corrupt` and refuses to overwrite (so the corrupted state is preserved for forensic recovery rather than silently masked). The analyst must `rm` the file manually before re-saving.
- **`POST /api/resorts/:slug/publish` (endpoint 6, §4.6)** — publish path. Per all-or-nothing publish, a single corrupt workspace file would otherwise block all publishing. On Zod parse failure, the publish handler responds `500 workspace-corrupt` with the failing slug; the operator must `rm` the corrupt file (which removes the resort from the next publish) or repair it before retrying. The error envelope's `details` includes the failing slug so the SPA can surface a "remove or repair `<slug>.json`" affordance.

**Recovery:** Phase 1 recovery is manual `rm` + re-edit (or `rm` + accept the deletion). Workspace backups / snapshots / point-in-time recovery are out of scope for Phase 1; if those are needed before Phase 2's real backing store, the Epic 4 post-milestone handoff should re-evaluate. The new `workspace-corrupt` error code is documented in §4.10 (error envelope code inventory).

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

### 10.7 Dockerfile prod-build guard — DEFERRED to Epic 6

Per parent §3.1: "`apps/admin` is **never** built into the production container image." Mechanical enforcement of this invariant is **deferred to Epic 6**.

**Why deferred:** the existing `Dockerfile` at the repo root is explicitly marked "DEFERRED — DO NOT BUILD UNTIL EPIC 6" (Dockerfile lines 3-13) with broken `COPY /app/dist` paths that pre-date the Epic 1 workspace pivot. `docker build` against the current Dockerfile fails. A guard that depends on `docker build` cannot ship until Epic 6 rewrites the Dockerfile for the post-pivot per-workspace `apps/*/dist/` layout.

**Phase 1 protection (non-mechanical):**

- The CODEOWNERS surface flags `Dockerfile` and `.github/workflows/**` as load-bearing; any PR introducing `COPY apps/admin` or equivalent triggers the Subagent Review Discipline.
- The Epic 4 post-milestone handoff calls out this gap explicitly so the next post-Epic-4 / Epic 5 / Epic 6 agent inherits awareness.
- Manual review by the maintainer at Epic 6 kickoff verifies the Dockerfile rewrite + the guard land together.

**Lift conditions:**

- Epic 6 PR rewrites `Dockerfile` for the post-pivot workspace layout.
- Same PR (or its stacked successor) ships `scripts/check-admin-not-in-prod.{ts,cli.ts,test.ts}` — either as a static grep of Dockerfile source for `apps/admin` references (no `docker build` required), or as a real multi-stage build assertion once the Dockerfile actually builds.
- Required-status adoption follows the same Epic 6 branch-protection rebuild path as `quality-gate / analyze`.

### 10.8 Test fixtures for workspace files

Hand-authored fixtures under `tests/fixtures/admin-workspace/` for both seed-dataset slugs (`kotelnica-bialczanska.json` for the PL Tatra resort, `spindleruv-mlyn.json` for the CZ Krkonoše resort — per parent pivot spec §1 line 34, both deliberately chosen to exercise the FX-conversion pattern of ADR-0003). Loaded by `apps/admin/server/__tests__/workspace.test.ts` and the integration tests under `tests/integration/apps/admin/`. The fixtures must match `WorkspaceFile` Zod parse — including the `editor_modes` cross-key invariant per §10.2 — they're the canonical examples.

When the analyst-notes follow-up PR adds the `notes` field, it adds NEW fixtures with `notes` populated; the Epic 4 fixtures (without `notes`) MUST continue to parse — that's the forward-compat invariant test.

### 10.9 Cold-start, missing files, and resort creation in Phase 1

**Repository default state.** A fresh checkout of `main` has `data/published/current.v1.json` (2 seed resorts: `kotelnica-bialczanska` (PL) + `spindleruv-mlyn` (CZ) per pivot spec §1) and **no `data/admin-workspace/` directory** — the workspace dir does not exist on `main` until the admin server first creates it.

**Server boot.** The dispatch helper in `apps/admin/vite-plugin-admin-api.ts` (PR 4.1b) **lazy-creates `data/admin-workspace/` via `mkdir -p`** on first invocation that needs to read or write it (matches `publishDataset.ts:30`'s pattern for `data/published/history/`). No explicit boot step is needed — the directory materializes on first read or first write. PR 4.1b's `dispatch.test.ts` verifies the lazy `mkdir`.

**Missing `data/published/current.v1.json`.** All read handlers (endpoints 1, 2, 8) treat the file as optional. If absent:

- `GET /api/resorts` returns workspace-only resorts (or empty list if no workspace files).
- `GET /api/resorts/:slug` returns 200 with `live_signal: null` for workspace-only slugs; 404 only when neither workspace nor published has the slug.
- `GET /api/health` responds with `last_published_at: null`, `archive_size_bytes: 0`, `resorts_total` = workspace-only count.
- Publish remains permitted IF workspace files validate against the published-doc schema (per §4.6's normal flow — a workspace-only set of resorts publishes cleanly to a brand-new `current.v1.json`).

PR 4.1a's `workspaceFile.test.ts` includes a "workspace file alone (no published-doc context) parses cleanly" case. PR 4.4a's `resortDetail.test.ts` and PR 4.2's `health.test.ts` + PR 4.3's `listResorts.test.ts` each include a missing-`current.v1.json` fixture.

**Cold-start UX (`health.resorts_total === 0`).** Reachable when both `data/published/current.v1.json` is missing AND `data/admin-workspace/` is empty:

- **Dashboard** renders zeros across all metrics + a "No resorts yet" empty-state card pointing the analyst at the "Adding a resort in Phase 1" instructions below.
- **ResortsTable** renders an empty-state row with the same pointer.
- **`<PublishDialog>`** confirm button is `disabled` per §4.3.1 (cold-start tooltip: "no resorts staged for publish. Add resorts in the editor before publishing.").

**Adding a resort in Phase 1.** Phase 1 has **no in-UI "Create resort" action.** The Phase 1 creation path is manual:

1. Author `data/admin-workspace/<slug>.json` matching the `WorkspaceFile` Zod shape (canonical examples: `tests/fixtures/admin-workspace/<slug>.json` per §10.8).
2. Reload the admin (or open a fresh browser tab to `127.0.0.1:5174`).
3. The new resort surfaces as `publish_state: 'draft'` in `GET /api/resorts` per §4.1.1.
4. Edit / publish via the normal Epic 4 flow.

The in-UI "Create resort" affordance is **Phase 2** (parent §3 + §13 future work). Documenting the manual creation path explicitly here is the spec's choice to ship Phase 1 with a deliberate friction surface that's honestly named, rather than waving the absence away.

**Why this is documented in spec, not just operational handoff.** §10.9 is reachable in normal Phase 1 use (the X1 fresh-checkout state is the day-1 boot path; X3 cold-start is reachable via `rm -rf data/admin-workspace/ data/published/current.v1.json`). Specifying the boot semantics + missing-file branches + creation path here removes ambiguity from 5+ PRs that would otherwise each invent their own answer.

---

## 11. Verification & next steps

0. **ADR cross-ref dependency.** This spec cites [ADR-0011](../../adr/0011-defer-test-sync-ux-to-epic-5.md) and [ADR-0012](../../adr/0012-defer-analyst-notes-to-post-epic-4-followup.md) extensively. Both ADRs **merged to `main`** as PRs [#63](https://github.com/mathvbarone/snowboard-trip-advisor/pull/63) and [#64](https://github.com/mathvbarone/snowboard-trip-advisor/pull/64); cross-references resolve.
1. This spec is committed to `docs/superpowers/specs/2026-05-01-epic-4-admin-app-design.md` on branch `docs/epic-4-admin-app-spec` (PR [#65](https://github.com/mathvbarone/snowboard-trip-advisor/pull/65)).
2. A spec-document-reviewer subagent runs against this doc; findings folded into the same branch before maintainer review. Multiple fold cycles have already landed (`6ed3df9`, `7af26d7`, `0d5f226`, `7e7d3c0`, `3470111`, plus the post-`50af331` fold that introduced this revision).
3. Maintainer reviews the committed spec.
4. `superpowers:writing-plans` produces the implementation plan against this spec — the plan decomposes each of the **13 PRs** in §7.5–§7.17 into TDD-ordered concrete tasks per the tier-and-gate workflow in §7.4.
5. `superpowers:using-git-worktrees` + `superpowers:subagent-driven-development` execute the plan PR by PR, honoring the inter-tier gates and the 4.4a‖4.4b / 4.6a‖4.6b parallel pairs per §7.4.
