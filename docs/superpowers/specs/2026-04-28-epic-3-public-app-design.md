# Epic 3 — Public App (`apps/public`) Design

| Field | Value |
| --- | --- |
| Status | Draft (brainstorm output; awaiting user review then `superpowers:writing-plans`) |
| Date | 2026-04-28 |
| Audience | Implementer agents + maintainer; assumes Epics 1 + 2 already merged |
| Scope | Public-facing data-transparency app at `apps/public/`; six PRs split into eight (3.1a–3.6) |
| Parent spec | [`2026-04-22-product-pivot-design.md`](2026-04-22-product-pivot-design.md) §2, §4, §5, §6, §9 |
| Related ADRs | [0001](../../adr/0001-pivot-to-data-transparency.md), [0002](../../adr/0002-durable-vs-live-split.md), [0003](../../adr/0003-fx-conversion-at-adapter-boundary.md). New ADRs 0004–0007 land in PR 3.1a (this spec). |

---

## 0. Executive Summary

`apps/public` is a Vite SPA that consumes the v1 published dataset (`data/published/current.v1.json`) and renders a data-transparency comparison view of European ski resorts. URL is the source of truth for shareable state (`view`, `sort`, `country`, `shortlist`, `detail`, `highlight`); `localStorage` carries non-shareable user state (`trip` dates only). The app fetches the dataset at runtime, validates with `validatePublishedDataset`, projects via a new browser-safe `loadResortDatasetFromObject`, and renders one of two presentations:

- **Cards landing** (default) — grid of resort cards with filter bar.
- **Matrix** (≥`md`, when shortlist is non-empty) — comparison table.

Plus two overlays:

- **Detail drawer** — right-side non-modal slide; URL key `&detail=<slug>` is independent of `view`.
- **Shortlist drawer** — left-side non-modal slide; always available.

The product principle is **no scoring, no ranking** — the user does the ranking themselves. Cards carry no `#N` badge; sort orders by user choice.

---

## 1. Locked Decisions Summary

Resolved during the brainstorm with the user. Each is load-bearing — do not re-litigate without an explicit user request.

| # | Decision | Why (decoded from brainstorm) |
| --- | --- | --- |
| 1 | **Detail = right-side overlay drawer** (not a separate route) | Visual `02.png` shows it; preserves user's scroll position in cards/matrix; "compare without losing context" matches the data-transparency comparison-tool premise |
| 2 | **Lodging-near-resort grid** is Phase 2 only; Epic 3 ships only the deep-link CTA | An in-app listings grid would require a Booking/Airbnb listings adapter (massive Epic 5 scope-up) and conflicts with the data-transparency premise — `03.png` represents the destination after deep-link, not a screen we build |
| 3 | **Sort options:** `name | price_asc | price_desc | snow_depth_desc`; default `name` A→Z; missing values sink | `snow_depth_desc` adds high product fit (trip-planning) at near-zero code cost; `name` default avoids missing-data bias on landing; geolocation-based "Nearest" deferred to Phase 2 |
| 4 | **No `#N` ranking badge on cards** | "No scoring, no ranking" is load-bearing in the spec; positional indices in the visual mock are removed in favor of cleaner default UX |
| 5 | **Loading model:** runtime `fetch('/data/current.v1.json')` → Zod validate → project | Survives Phase 2 unchanged (`/data/...` becomes an `/api/dataset` Hono handler; only the URL changes); build-time bundle would lock us into rebuild-on-publish once admin app exists in Epic 4 |
| 6 | **Three font families** self-hosted via `@fontsource/*` (DM Serif Display 400, DM Sans 400 + 600, JetBrains Mono 500); preload `latin-ext` for DM Sans 400 + JetBrains Mono 500 | Matches `tokens.ts` declarations + visual references; bundle math fits the budget; `latin-ext` covers Polish + Czech seed-resort characters (see §6.3 unicode-range note) |
| 7 | **Theme:** CSS-only via `prefers-color-scheme`, default dark; no JS branching; tokens semantic so a future manual toggle is purely additive | Avoids first-paint flash; tokens.ts already declares both scales; CSP `script-src 'self'` blocks the inline-script alternative anyway |
| 8 | **Implementation approach:** spec-faithful, minimal libraries; no Zustand, no router | 5-route ~15-component app; library tax doesn't earn its keep at this scale; URL-as-source-of-truth invariant is clearer with hand-rolled hooks |
| 9 | **Design system:** hand-built; no Pico / Tailwind / Radix Themes (ADR-0006) | `tokens.ts` is already shipped + tested; framework override cost ≥ savings; visual references are distinctly custom; agent-collaboration favors explicit hand-written components over framework-cascade behavior |

Brainstorm trail folded ~80 reviewer findings across six rounds of severity-tagged punch lists (one round per section from a senior frontend reviewer; roughly 20+ P0s, 30+ P1s, 30+ P2s; full punch lists not reproduced here, but their resolutions appear inline below). A seventh round on the assembled spec doc itself contributed an additional 16 findings (2 P0s + 11 P1s + 3 P2s) folded in this commit.

### 1.1 Parent-spec divergences

Where this spec deviates from `2026-04-22-product-pivot-design.md`, the divergence is named explicitly here. Implementer agents should not silently revert to parent-spec wording.

| Parent §  | Parent text | Epic-3 deviation | Rationale |
| --- | --- | --- | --- |
| §2.1 `view=cards|matrix|detail` | three views | `view=cards|matrix` only; detail is overlay (`&detail=<slug>`) | Detail-as-drawer per locked decision #1; matches visual reference `02.png`; preserves user's place in the cards/matrix viewport |
| §2.1 `&resort=<slug>` | resort key gates detail view | `&detail=<slug>` replaces `&resort=`; orthogonal to `view` | Same as above; key now overlay-only |
| §2.1 `&sort=price_asc|price_desc|name` | three sort keys | adds `snow_depth_desc` (4 keys) | Locked decision #3; trip-planning-fit sort is high-value at near-zero implementation cost |
| §2.4 "drawer and modal overlays use `inert` on background content" | `inert` for both | Drawer is **non-modal**; background stays mouse-clickable; `inert` does NOT apply to drawer | Locked decision #1 (drawer overlay) implies the user can still interact with cards behind; `Modal` retains `inert`/focus-trap |
| §6.4 component inventory | hand-built + Radix primitives | Same overall, but `<Dialog>` split into `<Modal>` + `<Drawer>` (separate primitives) | Section-4 frontend reviewer P0 — Radix `Dialog` is modal-only; non-modal drawer needs `FocusScope` + `DismissableLayer` directly |
| §9 PR 3.1 | one PR | 1→3 split of PR 3.1 into 3.1a / 3.1b / 3.1c (total 6→8 PRs) | 100% coverage gate makes a single PR unreviewable at the original scope; sub-split halves the rebase blast radius |
| §9 PR 3.5 | "Detail route: durable + live panels..." | "Detail drawer body" | Same content; route → drawer per locked decision #1 |
| §9 PR 2.2 (validator) | `validatePublishedDataset` exists; no min-cardinality rule on `resorts` | `resorts: z.array(...).min(1)` emitting `dataset_empty` issue code (lands in PR 3.1a) | Empty published dataset is a publishing bug, not a render-time mystery; named issue code lets Epic 4 admin render a useful message |
| §2.1 routing | implicit (parent spec doesn't prescribe `popstate` vs subscriber pattern) | `useSyncExternalStore` + module-scoped `Set<() => void>` pubsub + `popstate` listener | Section-2 frontend reviewer P0 — pure `popstate` is insufficient because programmatic `pushState`/`replaceState` doesn't fire it; module-scoped pubsub avoids global event-name collision |
| §2.4 share URL | "fallback modal for unsupported browsers" (no implementation guidance) | `<Modal>`-based clipboard fallback with copyable `<input>` (PR 3.3) | New addition — parent spec mandates the affordance, not the implementation; called out so future readers don't dismiss the dialog as out-of-scope |

---

## 2. Architecture & Package Layout

### 2.1 Workspace dependencies

`apps/public` depends on:

- `@snowboard-trip-advisor/schema` — `validatePublishedDataset`, `loadResortDatasetFromObject` (NEW), `ResortView`, `FieldValue<T>`, `MetricPath` / `METRIC_FIELDS`, `SourceKey`, `ValidationIssue`.
- `@snowboard-trip-advisor/design-system` — tokens + components + primitives + icons + `format.ts`.
- `react@19`, `react-dom@19`, `@fontsource/{dm-serif-display,dm-sans,jetbrains-mono}`.

No router, no state library, no CSS-in-JS framework. Radix is consumed only via design-system primitive wrappers.

### 2.2 Schema-package additions (PR 3.1a + 3.1c)

PR 3.1a:
- `validatePublishedDataset` adds `resorts: z.array(...).min(1)` rule emitting a new `dataset_empty` issue code (not opaque `zod_parse_failed`).
- Existing tests (`publishDataset.test.ts`, `publishDataset.lockTimeout.test.ts`, `published.test.ts`, `index.test.ts`) migrate to a one-resort minimum fixture.

PR 3.1c:
- New `packages/schema/src/loadResortDatasetFromObject.ts` — pure, browser-safe; takes already-parsed `unknown`, runs validator + projection, returns `LoadResult`.
- Existing `loadResortDataset.ts` becomes a 4-line Node wrapper: `JSON.parse(await readFile(path, 'utf8'))` → `loadResortDatasetFromObject`. Its existing projection-branch tests migrate to `loadResortDatasetFromObject.test.ts`.
- Both re-exported from `index.ts`.
- New ESLint `no-restricted-imports` rule (PR 3.1a) blocks `apps/public/**` from importing `loadResortDataset` (the path-taking variant) so `node:fs/promises` cannot transitively reach the browser bundle.

### 2.3 `apps/public/src/` layout

Layered organisation (per Approach 1) — no feature folders:

```
apps/public/
├── index.html              # <html lang="en">; <meta name="description">; two <meta name="theme-color"> with media; <link rel="canonical">
├── src/
│   ├── main.tsx            # @fontsource CSS imports; injectFontPreloads([dmSans400, jetBrains500]); mount
│   ├── App.tsx             # <Shell> + <ShellErrorBoundary> + <Suspense fallback> + URL→view dispatch + drawer mounts (composition inlined; ai-clean-code-adherence audit dropped the AppShell wrapper file)
│   ├── views/              # screens — composite components co-located here
│   │   ├── cards.tsx       # CardsView (eager)
│   │   ├── matrix.tsx      # MatrixView (lazy)
│   │   ├── detail.tsx      # DetailDrawer (lazy; frozen interface from PR 3.1c)
│   │   ├── ResortCard.tsx
│   │   ├── Hero.tsx
│   │   ├── FilterBar.tsx   # accepts slot?: ReactNode (view toggle filled in PR 3.4)
│   │   ├── ShortlistDrawer.tsx
│   │   ├── ShareUrlDialog.tsx
│   │   ├── MergeReplaceDialog.tsx
│   │   ├── DroppedSlugsBanner.tsx
│   │   └── states/
│   │       ├── DatasetLoading.tsx
│   │       ├── DatasetUnavailable.tsx
│   │       └── NoResorts.tsx
│   ├── lib/
│   │   ├── router.ts                  # urlToView pure
│   │   ├── urlState.ts                # Zod schema; parseURL/serializeURL; PUSH_KEYS; head-6 truncation
│   │   ├── datasetFetch.ts            # fetch + loadResortDatasetFromObject
│   │   ├── datasetPlugin.ts           # serveDatasetMiddleware + copyDataset (extracted pure helpers)
│   │   ├── csp.ts                     # generateNonce + injectNonce (extracted pure helpers)
│   │   ├── injectFontPreloads.ts
│   │   ├── deepLinks.ts               # builders for booking + airbnb deep-link URLs
│   │   ├── errors.ts                  # DatasetFetchError, DatasetValidationError, onDatasetError no-op
│   │   └── lang.ts                    # countryToPrimaryLang BCP 47 map per §6.6
│   │                                    # NOTE: NO `apps/public/src/lib/format.ts` — call sites import format helpers from
│   │                                    # @snowboard-trip-advisor/design-system directly. The wrapper file was dropped per the
│   │                                    # ai-clean-code-adherence audit (no app-specific glue).
│   ├── state/                         # 8 hooks — Section 6
│   │   ├── useURLState.ts
│   │   ├── useLocalStorageState.ts
│   │   ├── useDataset.ts              # use(loadOnce()); exports __resetForTests
│   │   ├── useShortlist.ts
│   │   ├── useMediaQuery.ts
│   │   ├── useDocumentMeta.ts         # title + canonical
│   │   ├── useScrollReset.ts
│   │   └── useDroppedSlugs.ts
│   ├── mocks/
│   │   └── server.ts                  # MSW server with default /data/current.v1.json handler
│   └── test-setup.ts                  # matchMedia stub, jest-axe extend, MSW lifecycle
└── vite.config.ts                     # registers datasetPlugin() + cspDevPlugin() (5-line lifecycle adapters; coverage-excluded with rationale)
```

### 2.4 Vite plugins

Two custom plugins, factored for coverage (pure helpers in `lib/`, lifecycle adapters in `vite.config.ts`).

**`datasetPlugin`** serves `data/published/current.v1.json` to the browser at `/data/current.v1.json`:
- Dev: `configureServer` middleware reads from the workspace `data/published/` on every request — admin re-publish lands on next reload, no copy.
- Build: `writeBundle` copies once into `dist/data/current.v1.json`.
- Pure helpers: `serveDatasetMiddleware(srcPath): RequestHandler` and `copyDataset(src, dest): Promise<void>` are unit-tested in `lib/datasetPlugin.test.ts`.

**`cspDevPlugin`** emits the dev CSP header with a per-request nonce. **Pattern:** all per-request work happens inside a single `configureServer` middleware that calls `server.transformIndexHtml(...)` itself — Vite's `transformIndexHtml` *hook* receives only `(html, ctx)` with no `req`, so reading the nonce off `req` from inside the hook is not possible. Doing the HTML transform from inside the middleware is the supported way to share per-request state with the resulting markup.

```ts
// apps/public/vite.config.ts (5-line lifecycle adapter; coverage-excluded)
configureServer(server) {
  return () => {
    server.middlewares.use(async (req, res, next) => {
      if (!req.url || (!req.url.endsWith('.html') && req.url !== '/')) return next()
      const nonce = generateNonce()
      const indexPath = resolve(import.meta.dirname, 'index.html')
      const transformed = await server.transformIndexHtml(req.url, await readFile(indexPath, 'utf-8'), req.originalUrl)
      const withNonce = injectNonce(transformed, nonce)        // rewrites Vite HMR <script> tags + injects <meta name="csp-nonce">
      res.setHeader('Content-Security-Policy', cspHeader({ mode: 'development', nonce }))
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.end(withNonce)
    })
  }
}
```

- Pure helpers: `generateNonce()` and `injectNonce(html, nonce)` are unit-tested for purity in `lib/csp.test.ts`. `injectNonce` rewrites every Vite-emitted inline `<script>` tag (recognized by absence of `src=` and presence of HMR client markers) and adds `<meta name="csp-nonce" content="...">` (debug aid only — React doesn't read it).
- Smoke test: vitest `cspDevPlugin.test.ts` invokes the middleware twice via stub `req`/`res`/`next` and asserts the `Content-Security-Policy` header's `script-src 'nonce-...'` value differs across requests **and** that the response body's HMR script tags carry the matching nonce.

Prod CSP (Epic 6 nginx) carries no nonce — `script-src 'self'` covers Vite's hashed bundle filenames.

### 2.5 Engines pin

Root `package.json` adds `engines: { "node": ">=20.11" }` (PR 3.1a) — required by `import.meta.dirname` in the Vite plugins.

---

## 3. Routing & URL State

### 3.1 URL key schema

```
?view=cards|matrix                            default: cards   (PUSH on change)
&sort=name|price_asc|price_desc|snow_depth_desc   default: name; missing values sink (REPLACE)
&country=PL[,CZ,FR,AT,...]*                   ISO 3166-1 alpha-2 multi (REPLACE)
&shortlist=<slug>[,<slug>]*                   ordered, head-truncated to 6 (REPLACE)
&detail=<slug>                                drawer-open marker, overlay (PUSH on change)
&highlight=<field_key>                        z.enum(METRIC_FIELDS); preserved outside matrix (REPLACE)
```

**Deviations from parent spec §2.1:**
- `view=detail` removed — detail is an overlay, not a view.
- `&resort=<slug>` removed; replaced by `&detail=<slug>`.
- `&sort` adds `snow_depth_desc`.

### 3.2 Validation

`apps/public/src/lib/urlState.ts` exposes a Zod schema (`URLStateSchema`), `parseURL(search): URLState`, and `serializeURL(state): string`. Stable key order; defaults omitted; head-6 on `shortlist`. Unknown keys ignored. Invalid values dropped silently and the URL is rewritten to its valid subset on the same render commit. Dev-only failure log via `window.__sta_debug.urlParseFailures` (gated on `import.meta.env.DEV`); zero prod runtime cost; no `console` rule violation.

### 3.3 `detail` as overlay

When `&detail=<slug>` is present:
- Drawer renders over whichever `view` is active.
- On `view=matrix` + viewport `<lg` (1280): a CSS rule downgrades the matrix layout to single-column cards under the drawer (matrix at <30% width is unreadable). **Distinct from the `<md` (900) matrix-redirect** — at viewports `<md`, matrix is replaced by a redirect message regardless of `&detail=`; the `<lg` rule applies only when `&detail=` is set in the `md ≤ viewport < lg` band.
- Closing the drawer removes the key via `pushState` so back closes it.
- Slug-existence: `App.tsx` gates the drawer on `slugs.has(url.detail)`; missing slugs surface in the dropped-slugs banner.

### 3.4 Share URL

`navigator.clipboard.writeText(window.location.href)` with a fallback modal showing a copyable text input for unsupported browsers. `trip` is never on the URL (localStorage `sta-trip`). `&detail=` is shareable.

### 3.5 Merge/replace on shortlist collision

Per parent spec §2.1: URL ∪ local; URL entries first; local-only appends; head-6 truncation. Modal previews exact result before confirm. "Keep mine" cancels (URL entries dropped from the merge, local untouched).

**Collision detection rule:** `setEqual(urlSlugs, storedSlugs) === false`. Same membership ⇒ no dialog, URL order silently adopted. Different membership ⇒ dialog. Order-only differences treated as "user re-sorted, URL wins".

### 3.6 URL-wins-on-mount per-key

Each URL key independently overrides localStorage on mount; non-URL keys (`trip`) load from storage.

### 3.7 Implementation

- `lib/urlState.ts` — `URLStateSchema` (with `z.enum(METRIC_FIELDS)` for `highlight`); `parseURL` / `serializeURL`. Pure.
- `lib/router.ts` — `urlToView(state): 'cards' | 'matrix'`. Pure.
- `state/useURLState.ts` — module-scoped `subscribers: Set<() => void>` pub-sub (no custom DOM event); `useSyncExternalStore` driven by it + `popstate`. The setter `setURLState(partial)`:
  ```ts
  function setURLState(partial: Partial<URLState>): void {
    const current = parseURL(window.location.search)
    const next = { ...current, ...partial }
    const transition = inferTransition(current, next)   // PUSH if any PUSH_KEY changed; else REPLACE
    history[transition === 'push' ? 'pushState' : 'replaceState'](null, '', '?' + serializeURL(next))
    subscribers.forEach((fn) => fn())
  }
  ```
  Setter writes are synchronous (event-handler context; safe). Two same-tick setters: second reads first's already-written `window.location.search` and merges.
- `state/useDocumentMeta.ts` — single hook writes `<title>` and `<link rel="canonical">` from URL state.
- `state/useScrollReset.ts` — `window.scrollTo(0, 0)` only on `view` transition.

### 3.8 Browser-back semantics (worked examples)

| Current URL | Action | Result |
| --- | --- | --- |
| `?view=cards&detail=foo` | Click ✕ | `?view=cards` (push consumed; back closes) |
| `?view=cards&detail=foo` | Browser back | `?view=cards` (drawer closes) |
| `?view=cards` | Click "Matrix" | `?view=matrix` (push) |
| `?view=matrix` | Browser back | `?view=cards` |
| `?view=cards&sort=name` | Change sort to `price_asc` | `?view=cards&sort=price_asc` (replace; back skips) |

---

## 4. Data Loading & Error Handling

### 4.1 Schema split (PR 3.1c)

```ts
// packages/schema/src/loadResortDatasetFromObject.ts (NEW, pure)
export async function loadResortDatasetFromObject(
  raw: unknown,
  { now = new Date() }: LoadOptions = {},
): Promise<LoadResult> { ... }

// packages/schema/src/loadResortDataset.ts (Node wrapper)
export async function loadResortDataset(path: string, opts: LoadOptions = {}): Promise<LoadResult> {
  const raw: unknown = JSON.parse(await readFile(path, 'utf8'))
  return loadResortDatasetFromObject(raw, opts)
}
```

### 4.2 Browser fetch

```ts
// apps/public/src/lib/datasetFetch.ts
export class DatasetFetchError extends Error {
  constructor(
    message: string,
    readonly kind: 'fetch' | 'parse',
    readonly status?: number,
    options?: ErrorOptions,
  ) { super(message, options) }
}
export class DatasetValidationError extends Error {
  constructor(message: string, readonly issues: ReadonlyArray<ValidationIssue>) { super(message) }
}

export async function fetchDataset(now: Date = new Date()): Promise<LoadResult> {
  let res: Response
  try {
    res = await fetch('/data/current.v1.json', { cache: 'no-cache', referrerPolicy: 'no-referrer' })
  } catch (cause) {
    throw new DatasetFetchError('Network error', 'fetch', undefined, { cause })
  }
  if (!res.ok) throw new DatasetFetchError(`HTTP ${res.status}`, 'fetch', res.status)
  let raw: unknown
  try {
    raw = await res.json()
  } catch (cause) {
    throw new DatasetFetchError('Malformed JSON', 'parse', res.status, { cause })
  }
  return loadResortDatasetFromObject(raw, { now })
}
```

`ValidationIssue` imported via `import type` from `@snowboard-trip-advisor/schema` (no runtime cycle; package DAG already permits `apps/public → schema`).

### 4.3 `useDataset` hook

```ts
// apps/public/src/state/useDataset.ts
let cached: Promise<{ views: ReadonlyArray<ResortView>; slugs: ReadonlySet<ResortSlug> }> | null = null

function loadOnce(): NonNullable<typeof cached> {
  if (cached) return cached
  cached = fetchDataset()
    .then((result) => {
      if (!result.ok) throw new DatasetValidationError('Dataset failed validation', result.issues)
      return { views: result.views, slugs: new Set(result.views.map((v) => v.slug)) }
    })
    .catch((err: unknown) => {
      cached = null                          // don't pin a rejected promise
      throw err
    })
  return cached
}

export function useDataset(): { views: ReadonlyArray<ResortView>; slugs: ReadonlySet<ResortSlug> } {
  return use(loadOnce())                     // React 19 use() — suspends until resolve, throws to ErrorBoundary on reject
}

export function invalidateDataset(): void { cached = null }
export function __resetForTests(): void { cached = null }   // called in afterEach
```

### 4.4 Error UI & retry

```tsx
// apps/public/src/App.tsx — Shell + ShellErrorBoundary inlined (no AppShell wrapper file; see §2.3)
class ShellErrorBoundary extends Component<...> {
  state = { hasError: false, retryKey: 0, error: undefined }
  retry = (): void => {
    invalidateDataset()
    startTransition(() =>
      this.setState((s) => ({ hasError: false, retryKey: s.retryKey + 1, error: undefined })),
    )
  }
  render(): JSX.Element {
    if (this.state.hasError) return <DatasetUnavailable error={this.state.error} onRetry={this.retry} />
    return <Fragment key={this.state.retryKey}>{this.props.children}</Fragment>
  }
}
```

Top-level layout:
```tsx
<Shell>
  <ShellErrorBoundary>
    <Suspense fallback={<DatasetLoading />}>
      <DroppedSlugsBanner />
      <View />
      {url.detail && slugs.has(url.detail) && <DetailDrawer slug={url.detail} />}
      <ShortlistDrawer />
    </Suspense>
  </ShellErrorBoundary>
</Shell>
```

Render-lifecycle order asserted by `App.test.tsx`: mount → `use(promise)` throws the *promise* → Suspense catches, shows `<DatasetLoading />` → promise rejects → next render `use` throws the *Error* → ErrorBoundary catches, replaces tree with `<DatasetUnavailable />`. (The composition lives in `App.tsx`, not in a separate `AppShell.tsx` wrapper file — see §2.3.)

### 4.5 `<DatasetUnavailable />` copy

- **Always:** `role="alert"`, focus-on-mount, "Couldn't load resort data." + Retry button.
- **`error.kind === 'fetch'`:** "Please refresh or try again."
- **`error.kind === 'parse'`:** "The site received malformed data."
- **`error instanceof DatasetValidationError`:** "The published data is invalid."
- **Dev-only `<details>` (`import.meta.env.DEV`):** raw `error.message` + (validation only) `issues` listing.
- A no-op `onDatasetError(err)` from `lib/errors.ts` is invoked here so Epic 6 can wire Sentry without touching this code.

### 4.6 Cache & revalidation

Dev: `Cache-Control: no-cache` from the middleware. Prod (Epic 6 nginx): `Cache-Control: no-cache, must-revalidate`. Phase 1 deploys-on-publish; cache-busting by filename not used. Revalidate-on-focus / polling deferred to Epic 6.

### 4.7 Empty-dataset semantics

The validator's `min: 1` rule (PR 3.1a) treats an empty published dataset as a publishing bug, surfaces as `DatasetValidationError` with `dataset_empty`. The `<NoResorts />` component still ships as defence-in-depth for `views.length === 0`.

---

## 5. Component Inventory (design-system + app-level)

### 5.1 Design-system additions

```
packages/design-system/src/
├── components/
│   ├── Shell.tsx                # outer layout + skip-link + main landmark; no JS theme branch
│   ├── HeaderBar.tsx
│   ├── Button.tsx               # primary | secondary | ghost
│   ├── IconButton.tsx           # square hit-area; aria-label required
│   ├── Input.tsx                # text + date variants (native; JSDoc trade-off + ADR-0004)
│   ├── Select.tsx               # native <select>; "a11y > pixel-match" trade-off documented + ADR-0004
│   ├── Chip.tsx                 # filter chip with aria-pressed
│   ├── Pill.tsx
│   ├── ToggleButtonGroup.tsx    # aria-pressed group (cards | matrix toggle)
│   ├── Card.tsx
│   ├── Table.tsx                # sticky header only (no horizontal scroll)
│   ├── Skeleton.tsx             # variants: 'line' | 'block' | 'card'
│   ├── EmptyStateLayout.tsx     # icon + heading + body + cta slots
│   ├── SourceBadge.tsx          # bundled glyph + name; SOURCE_GLYPHS satisfies Record<SourceKey, IconComponent>
│   └── FieldValueRenderer.tsx   # formatter as typed key, not function
├── primitives/                  # consumers never import Radix directly
│   ├── Modal.tsx                # Radix Dialog (focus-trap + scroll-lock)
│   ├── Drawer.tsx               # Radix FocusScope + DismissableLayer (non-modal)
│   └── Tooltip.tsx              # Radix Tooltip
├── icons/
│   ├── sources/{opensnow,snowforecast,resort-feed,booking,airbnb,manual}.tsx
│   └── ui/{star,close,info,chevron-down}.tsx
├── format.ts                    # destructured-primitive signatures (NEVER imports schema branded types)
├── tokens.ts                    # source of truth (existing)
├── tokens.css                   # generated; @media (prefers-color-scheme: light) overrides under :root
└── index.ts                     # named re-exports
```

**Out of Epic 3** (Epic 4 admin app): `Sidebar`, `StatusPill`, `TextArea`, `DropdownMenu`, `Popover`, `Tabs`, `Toast`.

### 5.2 Non-obvious component contracts

**`<FieldValueRenderer<T>>`:**
```ts
type FormatterKey = 'number' | 'money' | 'percent' | 'months' | 'date-relative'

type Props<T> = {
  field: FieldValue<T>
  formatter: FormatterKey                  // dispatches into format.ts
  unit?: string                            // appended verbatim ("km", "cm")
  missingLabel?: string                    // default "—"
  missingTooltip?: string                  // default "No data yet"
}
```
- `fresh`: `{format[formatter](value)} {unit}` + `<SourceBadge>` + `<Tooltip>observed {observed_at}</Tooltip>`
- `stale`: same + `<Pill variant="stale">` + tooltip notes age days
- `never_fetched`: `{missingLabel}` with `<Tooltip>{missingTooltip}</Tooltip>`

**`<SourceBadge>`** — `source: SourceKey`. Bundled glyph from `const SOURCE_GLYPHS = { ... } satisfies Record<SourceKey, IconComponent>` (compile-time exhaustive via TypeScript). Glyph sized by token; `currentColor` for theme.

**`<Modal>`** — Radix Dialog wrapper. Focus trap, scroll lock, Escape to dismiss. Used by `ShareUrlDialog`, `MergeReplaceDialog`.

**`<Drawer>`** — non-modal. Radix `FocusScope` (focus trap inside drawer when keyboard-active; cards behind stay clickable via mouse) + `DismissableLayer` (Escape + outside-click + manual close). Used by `DetailDrawer`, `ShortlistDrawer`. `position: 'right' | 'left'`. Reduced-motion collapses slide via design-token CSS-var override (no JS branch). Ships with full prop superset (`defaultOpen`, `initialFocus`, `onAnimationEnd`) tested in PR 3.3 even when ShortlistDrawer doesn't use every one — so PR 3.5 has zero primitive amendments.

**`<Shell>`** — provides `<main id="main" tabIndex={-1}>` landmark + skip-link. No JS theme tracking. Skip-link focus assertion in tests.

### 5.3 App-level composites in `apps/public/src/views/`

See §2.3 layout. Each composite is a thin orchestrator over design-system primitives + state hooks. Inline styles only for prop-derived dynamic values (e.g. `style={{ width: percent + '%' }}`); CSS modules for static styling.

### 5.4 CSS approach

- **CSS modules primary**, inline styles only for prop-derived dynamic values.
- Dark/light overrides in generated `tokens.css` via `@media (prefers-color-scheme)` on CSS custom properties.
- Per-component `.module.css` consumes vars; never re-declares colors.
- Stylelint enforcement of no-px-literal in CSS modules → Epic 6 polish (the PR 3.1a ESLint rule covers `style={{}}` immediately).

### 5.5 Frozen DetailDrawer interface (PR 3.1c → 3.5)

The `views/detail.tsx` interface is **fixed at PR 3.1c** so PRs 3.2 / 3.3 / 3.4 / 3.5 can ship in parallel without `App.tsx` refactors. PR 3.1c ships a stub-throw body; PR 3.5 fills the body without touching the import path, the default-export shape, the prop signature, or the trigger-element protocol.

**Contract:**

```ts
// apps/public/src/views/detail.tsx
// Frozen at PR 3.1c. PR 3.5 fills the body only — App.tsx is untouched.
import type { JSX } from 'react'
import type { ResortSlug } from '@snowboard-trip-advisor/schema'

export interface DetailDrawerProps {
  slug: ResortSlug
}

export default function DetailDrawer(_: DetailDrawerProps): JSX.Element {
  // PR 3.1c body:
  throw new Error('detail route stub — lands in PR 3.5')
  // PR 3.5 body replaces the throw with the real composition.
}
```

**Trigger-element protocol** (lifted from §7.11 acceptance into the contract):
- Every shortlist-or-card affordance that opens the detail drawer must render a focusable element carrying `data-detail-trigger="<slug>"` (typically the star `<IconButton>` on `ResortCard`).
- On drawer close, focus returns to the element with the matching `data-detail-trigger` attribute.
- ResortCard's contract (PR 3.2) includes this attribute; tested in `ResortCard.test.tsx`.

**Lazy-import shape** (PR 3.1c):
```ts
// apps/public/src/App.tsx
const DetailDrawer = lazy(() => import('./views/detail'))
```
The `default` re-export from `views/detail.tsx` is what `lazy()` consumes; PR 3.5 does not change this line.

**Test coverage on the stub-throw line** (PR 3.1c): `views/detail.test.tsx` calls `expect(() => render(<DetailDrawer slug={someSlug} />)).toThrow('detail route stub — lands in PR 3.5')`. The throw line is covered immediately at 100%; PR 3.5's body replaces the throw and ships its own happy-path test in the same file.

**Extension rule (PR 3.5).** PR 3.5 may *extend* `DetailDrawerProps` with **optional** props only (e.g. `onClose?`). Adding required props breaks the freeze and forces a synchronized update across PR 3.1c, 3.2 (ResortCard's drawer-trigger composition), and any other intervening consumer. If PR 3.5 finds a required-prop need, it triggers a follow-up amendment to this spec rather than a silent widening.

### 5.6 Q1 — price filter

Bucketed `<Select>` with three options (`≤€40 / €40–80 / €80+`). Mini-ADR inside ADR-0004: *"revisit when N≥10 resorts and price variance >€20"*. No slider in Phase 1.

---

## 6. State, Theme, Fonts, CSP, Testing

### 6.1 State surface (8 hooks)

```
state/
├── useURLState.ts          # useSyncExternalStore + module-scoped pubsub + popstate
├── useLocalStorageState.ts # generic; browser-only contract; Zod-validated reads
├── useDataset.ts           # use(loadOnce()); exports __resetForTests
├── useShortlist.ts         # URL-primary; sta-shortlist-last-known is hydration-only
├── useMediaQuery.ts        # prefers-reduced-motion + md breakpoint (NOT theme)
├── useDocumentMeta.ts      # writes <title> + <link rel="canonical">
├── useScrollReset.ts       # scrollTo(0,0) only on view transition
└── useDroppedSlugs.ts      # surfaces share-URL slugs not in dataset
```

**localStorage keys** (`sta-` prefix):
- `sta-trip` — `{ start, end, party_size }`. Never on URL.
- `sta-shortlist-last-known` — hydration-only on first mount when URL has no `&shortlist=`. Not a sync mechanism (JSDoc explicit).

**`useShortlist` rules:**
- Mount: parse URL `&shortlist=`; absent → hydrate from `sta-shortlist-last-known`; both absent → empty.
- On URL change: write to `sta-shortlist-last-known`.
- Add: dedupe, head-truncate to 6.
- Collision: `setEqual(urlSlugs, storedSlugs) === false` triggers `MergeReplaceDialog`. Order-only differences silently adopt URL order.

### 6.2 Theme — CSS-only, semantic tokens, future-toggle-ready

```css
:root {
  --color-bg: #0b0d10;        /* dark default */
  --color-fg: #f4f5f7;
  /* ... */
}
@media (prefers-color-scheme: light) {
  :root {
    --color-bg: #ffffff;
    --color-fg: #0b0d10;
  }
}
```

**Invariant** (Section 6 contract): tokens are semantic (`--color-bg`, never `--color-dark-bg`). Components never branch on theme in JS. A future manual toggle adds `:root[data-theme=light] { ... }` overrides to `tokens.css`; zero component changes required.

`useMediaQuery` is reserved for `prefers-reduced-motion` (consumed by `<Drawer>`) and the `md` breakpoint affordance check.

### 6.3 Fonts

`apps/public/package.json` adds `@fontsource/{dm-serif-display,dm-sans,jetbrains-mono}`.

**Subset selection.** The seed dataset contains Polish (`Białczańska` — `ł`, `ą`, `ń`) and Czech (`Špindlerův Mlýn` — `Š`, `ů`, `ý`) characters, all in the `latin-ext` Unicode subset (not the basic `latin` subset). `@fontsource` declares both subsets via `unicode-range` in the same `*.css` payload, so resort names render correctly regardless — but **preloaded** files only cover characters in the preloaded subset. Preloading `latin-400-normal.woff2` would mean Polish/Czech characters fall back to a separately-fetched `latin-ext-400-normal.woff2` not on the critical path, defeating the LCP optimization for the very strings our seed dataset relies on.

**Decision.** Preload the `latin-ext` subset for both above-the-fold weights. (`latin-ext` is a superset of `latin` for our purposes — it contains the full Latin-1 + Latin Extended-A range.)

`main.tsx`:
```ts
import '@fontsource/dm-serif-display/400.css'
import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/600.css'
import '@fontsource/jetbrains-mono/500.css'
import dmSans400 from '@fontsource/dm-sans/files/dm-sans-latin-ext-400-normal.woff2?url'
import jetBrains500 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-ext-500-normal.woff2?url'
import { injectFontPreloads } from './lib/injectFontPreloads'
injectFontPreloads([dmSans400, jetBrains500])
```

`injectFontPreloads(urls)` is a pure helper that appends `<link rel="preload" as="font" type="font/woff2" crossorigin href={url}>` tags before render. Vite hashes the woff2 in build; imports resolve to hashed URLs that match `<link>` href values. `font-display: swap` from `@fontsource`. PR 3.6 ships a CI smoke test that asserts each emitted preload href resolves to a real file in `dist/` (catches the silent 404 mode where Vite renames the asset but the import URL doesn't update — see §10.7).

CSP `font-src 'self'` satisfied (assets land under origin).

### 6.4 CSP wiring

`config/csp.ts` exposes `cspHeader({ mode: 'development' | 'production'; nonce?: string }): string`. Both modes' full directive lists below; both branches unit-tested.

**Dev:**
```
default-src 'self'
img-src 'self' data: https:
font-src 'self'
connect-src 'self' ws://localhost:* wss://localhost:* http://localhost:*
script-src 'self' 'nonce-{nonce}'
style-src 'self' 'unsafe-inline'
frame-ancestors 'none'
base-uri 'self'
form-action 'self'
upgrade-insecure-requests
```

**Prod (Epic 6 nginx):** identical to dev except (a) `connect-src 'self'` only (no `ws:` / `wss:` / `http://localhost:*`), and (b) `script-src 'self'` only (no nonce — Vite's hashed bundle filenames are covered by `'self'`).

`style-src 'self' 'unsafe-inline'` retained in both modes (Vite injects HMR style-update payloads inline in dev; design-token CSS-vars and inline style attributes via `style={{ width: percent + '%' }}` rely on this in prod). `img-src 'self' data: https:` retained per parent §2.6 — `data:` URIs are emitted by Vite for inline SVG icon assets in dev.

`apps/public/main.tsx` does **not** read or use the nonce. The `<meta name="csp-nonce">` is dev-only debugging.

### 6.5 Testing strategy

- Workspace setup: root `vitest.workspace.ts` enumerates packages + apps + integration.
- `apps/public/src/test-setup.ts`:
  - `vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: noop, removeEventListener: noop, ... }))`.
  - `expect.extend({ toHaveNoViolations })` from `jest-axe` (ADR-0007).
  - MSW lifecycle:
    - `beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))`
    - `afterEach(() => { server.resetHandlers(); server.events.removeAllListeners() })` — request-log isolation alongside handler isolation (see §10.6).
    - `afterAll(() => server.close())`.
  - `afterEach(() => __resetForTests())` for the `useDataset` singleton.
- Unit per-component / per-hook with `jest-axe` per state (default + hover + focus + open/expanded + disabled).
- Integration: `tests/integration/apps/public/*.test.ts` for route-composition focus-order + axe + e2e flows. Lit up in PR 3.6.
- Bundle analysis: `npm run analyze` (root) using `rollup-plugin-visualizer`. PR 3.6 lands the script in `warn` mode (logs over-budget, exits 0); Epic 6 follow-up flips to `error`.
- Visual regression: out of scope (parent spec §6.5 — Epic 6).

### 6.6 BCP 47 language tags from country codes

ISO 3166-1 alpha-2 country codes (`PL`, `CZ`, `AT`, ...) are **not** valid BCP 47 language tags (Czech Republic country `CZ` → Czech language `cs`; Austria country `AT` → German language `de`). For the `lang` attribute on resort-name elements (parent §2.4 + cross-cutting assignments table), use a country → primary-language map.

```ts
// apps/public/src/lib/lang.ts
export function countryToPrimaryLang(country: ISOCountryCode): string {
  return COUNTRY_TO_PRIMARY_LANG[country] ?? 'en'      // safe default; misannouncement < no annouancement
}

const COUNTRY_TO_PRIMARY_LANG = {
  PL: 'pl',     // Poland → Polish
  CZ: 'cs',     // Czech Republic → Czech
  AT: 'de',     // Austria → German
  CH: 'de',     // Switzerland → German (primary; FR/IT/RM secondary)
  FR: 'fr',     // France → French
  IT: 'it',     // Italy → Italian
  ES: 'es',     // Spain → Spanish (primary; CA/EU/GL secondary)
  SE: 'sv',     // Sweden → Swedish
} as const satisfies Partial<Record<ISOCountryCode, string>>
```

The map covers parent §2.1's country list. Multi-language countries (CH, ES) take the official primary; secondary-language resorts can override via a future `name_lang` field on `Resort` (Phase 2 schema change). Tests in `lib/lang.test.ts`: every entry yields a valid BCP 47 tag (`/^[a-z]{2,3}(-[A-Z]{2,4})?$/`); unknown countries fall back to `'en'`.

### 6.7 Bundle accounting (estimate; verified by `npm run analyze` in PR 3.6)

| Component | Estimate gzip |
| --- | --- |
| React 19 + ReactDOM | ~45 KB |
| Zod 4 | ~5–13 KB |
| `@snowboard-trip-advisor/schema` | ~3 KB |
| `@snowboard-trip-advisor/design-system` initial path | ~12 KB |
| `apps/public` initial path (lib + state + cards view) | ~12 KB |
| `@fontsource` CSS | 0 KB JS |
| **Initial total (conservative)** | **~85 KB** |

Headroom against the 180 KB budget: ≥95 KB. Code-split chunks: matrix view (~8 KB), detail drawer (~10 KB).

---

## 7. PR Breakdown

### 7.1 TDD discipline

**Every PR's deliverable list is ordered tests-first.** A test file appears before the implementation file it covers. Where the implementation refactors existing tested code (no new tests), that's called out explicitly. CLAUDE.md mandates TDD at execution; this section enforces it at the planning level so deliverable lists don't drift toward implementation-first.

### 7.2 Subagent-review trigger matrix

| PR | Triggers (per CLAUDE.md "Subagent Review Discipline") |
| --- | --- |
| 3.1a | `packages/schema/**` (validator + `published.ts`) + `eslint.config.js` (DAG ban) + `docs/adr/**` (4 ADRs) + root `package.json` (engines pin) |
| 3.1b | `config/csp.ts` (mode-aware refactor) + `apps/public/vite.config.ts` (CSP + dataset plugins) |
| 3.1c | `packages/schema/**` + `packages/design-system/**` |
| 3.2 | `packages/design-system/**` (cards-path components + icons) |
| 3.3 | `packages/design-system/**` (Modal/Drawer primitives) |
| 3.4 | `packages/design-system/**` (Table/ToggleButtonGroup) |
| 3.5 | none (apps-only); subagent review optional |
| 3.6 | `.github/workflows/**` (bundle-budget CI step) |

The review brief per PR includes: (a) load-bearing invariants of the touched paths, (b) specific things to grep for, (c) explicit instruction to be critical.

### 7.3 Cross-cutting assignments

| Concern | Lands in | Notes |
| --- | --- | --- |
| `lang` attr on resort names | PR 3.2 | `<h2 lang={countryToPrimaryLang(resort.country)}>` in ResortCard hero. Country code → BCP 47 primary language tag via the map in `apps/public/src/lib/lang.ts` (see §6.6) — country code ≠ language tag (e.g. CZ country → `cs` language). |
| `<link rel="canonical">` | PR 3.1c | Wired by `useDocumentMeta` |
| Two `<meta name="theme-color">` tags | PR 3.1b | Static in `index.html` |
| `prefers-reduced-motion` plumbing | PR 3.3 | Drawer `onAnimationEnd` prop + tokens-based motion override |
| `onDatasetError` telemetry seam | PR 3.1c | Exported from `lib/errors.ts` as `() => void` no-op |

### 7.4 Dependency graph + rollback

```
3.1a (config/CI/ADRs)
  └─ 3.1b (Vite plugins + entry + test infra)
       └─ 3.1c (lib + state + states + Shell composition + frozen DetailRoute stub)
            ├─ 3.2 (CardsView + ViewToggleSlot placeholder)
            │    └─ 3.3 (Shortlist + Modal/Drawer primitives)
            │         └─ 3.4 (MatrixView + view-toggle slot fill)
            └─ 3.5 (DetailDrawer body)        ← can ship in parallel with 3.2/3.3/3.4
                                                 because of frozen interface
3.{2..5}
  └─ 3.6 (Integration tests + bundle analysis)
```

Parallel pairs: `3.5 ⫛ 3.2`, `3.5 ⫛ 3.3`, `3.5 ⫛ 3.4`. Rollback rules: 3.4 revert leaves 3.5 unblocked; 3.1c revert pauses every downstream PR.

CODEOWNER review request order: `3.1a → 3.1b → 3.1c`, then concurrent group, then `3.6`.

### 7.5 PR 3.1a — Config / CI / ADRs

Status: **DONE** — merged in [#14](https://github.com/mathvbarone/snowboard-trip-advisor/pull/14) (commit `bb58ae8`). Delivered: workspace ESLint flat-config + `engines.node ≥ 20.11` pin + `dataset_empty` Zod issue code (`packages/schema/src/published.ts` + `validatePublishedDataset.ts`) + `no-restricted-imports` ban on `loadResortDataset` from `apps/public/**` + ADRs 0004–0007.

### 7.6 PR 3.1b — Vite plugins + entry + test infra

Status: **DONE** — merged in [#15](https://github.com/mathvbarone/snowboard-trip-advisor/pull/15) (commit `80d4465`). Delivered: `cspDevPlugin` (per-request nonce) + `datasetPlugin` (dev-serve + writeBundle copy) + `injectFontPreloads` + `apps/public/index.html` shell + MSW lifecycle + `apps/public/vite.config.ts` registration + the `config/csp.ts` `cspHeader({ mode, nonce? })` refactor.

### 7.7 PR 3.1c — Foundation lib + state + states + Shell composition

Status: **DONE** — merged in [#16](https://github.com/mathvbarone/snowboard-trip-advisor/pull/16) (commit `a34e6e3`). Delivered: 8 hooks (`useURLState`, `useLocalStorageState`, `useDataset`, `useShortlist`, `useMediaQuery`, `useDocumentMeta`, `useScrollReset`, `useDroppedSlugs`) — note `useScrollReset` and `useDroppedSlugs` shipped as stubs in 3.1c and were finalized in 3.6a; design-system Shell + Skeleton + EmptyStateLayout; foundation view-states (`DatasetLoading`, `DatasetUnavailable`, `NoResorts`); the frozen `DetailDrawer` stub-throw (body landed in 3.5); `App.tsx` composition with `ShellErrorBoundary` + lazy detail mount; `loadResortDatasetFromObject` pure projection in schema.

### 7.8 PR 3.2 — CardsView

Status: **DONE** — merged in [#18](https://github.com/mathvbarone/snowboard-trip-advisor/pull/18) (commit `126e8b5`). Delivered: 9 design-system components (Button, IconButton, Input, Select, Chip, Pill, Card, SourceBadge, FieldValueRenderer) + Tooltip primitive + cards/ResortCard/Hero/FilterBar views + self-hosted `hero.jpg` + per-resort `lang` attribute (`countryToPrimaryLang`) + ResortCard CTA security attributes + `data-detail-trigger="<slug>"` per §5.5 frozen-interface contract + FilterBar `slot?` prop (filled by 3.4).

### 7.9 PR 3.3 — Shortlist & sharing

Status: **DONE** — merged in [#21](https://github.com/mathvbarone/snowboard-trip-advisor/pull/21) (commit `296d529`). Delivered: Modal + Drawer primitives (full prop superset) + ShortlistDrawer + MergeReplaceDialog + ShareUrlDialog + URL/localStorage three-way coherence (`useShortlist` extension) + clipboard-share with fallback.

### 7.10 PR 3.4 — MatrixView

Status: **DONE** — merged in [#49](https://github.com/mathvbarone/snowboard-trip-advisor/pull/49) (commit `5e60c18`). Delivered: Table + ToggleButtonGroup design-system primitives + lazy matrix view + `&highlight=<METRIC_FIELDS entry>` row affordance + cards/matrix toggle in the FilterBar slot + `matrix.module.css` drawer-downgrade rule for `<lg` viewports.

### 7.11 PR 3.5 — DetailDrawer body

Status: **DONE** — merged in [#52](https://github.com/mathvbarone/snowboard-trip-advisor/pull/52) (commit `1f90f89`). Delivered: `detail.tsx` body replacing the 3.1c frozen-interface stub-throw + pure `deepLinks.ts` builder (booking + airbnb) + drawer-open axe assertion. Per §5.5, `App.tsx` was not touched (interface frozen at 3.1c).

### 7.12 PR 3.6 — Integration tests + bundle analysis

Status: **DONE** in three sub-PRs:

- **3.6a** — integration test infra + final wiring of `DroppedSlugsBanner`, `useScrollReset`, and `<NoResorts>` — merged in [#53](https://github.com/mathvbarone/snowboard-trip-advisor/pull/53) (commit `c82bc9e`).
- **3.6b** — bundle analysis tooling: `check-bundle-budget` (warn mode) + `check-preload-hrefs` (error mode) + `check-dist-dataset` (error mode) + `npm run analyze` + `rollup-plugin-visualizer` plugin — merged in [#55](https://github.com/mathvbarone/snowboard-trip-advisor/pull/55) (commit `9e8ac47`).
- **3.6c** — `.github/workflows/quality-gate.yml` adds the `analyze` job depending on `qa` — merged in [#57](https://github.com/mathvbarone/snowboard-trip-advisor/pull/57). (PR #56 was the original 3.6c; it was phantom-merged when its base branch `epic-3/pr-3.6b-analysis` was deleted after #55's squash. PR #57 re-applied the same content. See §10.8.)

**Operational deviations from the original deliverable list (load-bearing for future agents):**

- `check-preload-hrefs` was originally specified to parse `dist/index.html` only. Production scope expanded during 3.6b review to also walk `dist/assets/*.js` for runtime-injected `/assets/*.woff2?` URL string literals — the public app's `injectFontPreloads` path resolves the `?url` imports to hashed strings that land in JS, not in the HTML. The script also rejects hrefs whose resolved path escapes `dist/` (containment guard).
- `check-bundle-budget` is warn-mode only (always exits 0); Epic 6 follow-up flips to error per §6.7. The CLI now prints the actual gzip total even under budget so PR descriptions can attach the audit-trail line.
- The `analyze` CI job uses `if: success() || failure()` with `if-no-files-found: warn` on the artifact upload (subagent-review fold; avoids double-failing the job when a pre-build error means `dist/stats.html` doesn't exist).
- `quality-gate / analyze` is **not** yet on `main`'s required-status set; adoption deferred to Epic 6's branch-protection script rebuild (same cadence as `quality-gate / qa`).

### 7.13 Cross-cutting (every PR)

- **TDD enforced via deliverable ordering** — tests first, implementation after.
- **README evaluation** — PRs 3.2 / 3.3 / 3.4 / 3.5 (product-facing) **must evaluate** whether README.md needs an update per CLAUDE.md "Documentation Discipline"; the evaluation outcome is documented in the PR description even if no README change lands. PRs 3.1a / 3.1b / 3.1c / 3.6 are foundation/test-infra and do not move user-visible behavior — README evaluation may be skipped (with a one-line note in the PR description). 3.1a updates the ADR index in `docs/adr/README.md` (or wherever the ADR index lives).
- **Subagent Review Discipline** — per the trigger matrix above.
- **DCO sign-off** on every commit (`git commit -s`).
- **Pre-commit `npm run qa`** runs before each commit; PreToolUse hook blocks `--no-verify`.

---

## 8. ADRs landing in PR 3.1a

| # | Title | Decision summary |
| --- | --- | --- |
| 0004 | `public-app-form-controls-native.md` | Phase 1 ships native `<input type="date">` and `<select>` with documented a11y trade-offs; revisit when Phase 2 design refresh demands custom popovers. Includes the bucketed-price-filter mini-decision (revisit when N≥10 resorts and price variance >€20). |
| 0005 | `css-theme-no-js.md` | Theme switches via `prefers-color-scheme` in generated `tokens.css`; no JS theme branching; tokens semantic; future manual toggle is purely additive. |
| 0006 | `public-app-no-css-framework.md` | Pico / Tailwind / Radix Themes rejected in favor of a hand-built design system after explicit user-reviewed brainstorm. Documents the cost-of-pivot trigger condition (revisit when N≥30 design-system components or `tokens.ts` maintenance becomes a bottleneck). |
| 0007 | `axe-library-jest-axe-with-vitest.md` | A11y test library: `jest-axe` consumed via Vitest's `expect.extend({ toHaveNoViolations })`. |

---

## 9. Out of Scope (Phase 2 / Epic 6)

- Service-worker offline shell — Phase 2.
- Sentry / observability wiring — Epic 6 (`onDatasetError` seam in place).
- Polling / revalidate-on-focus — Epic 6.
- Storybook + Playwright visual regression + `visual:approve` label — Epic 6 per parent spec §6.5.
- Manual theme toggle UI — Phase 2 (CSS invariant kept ready).
- i18n translation framework — Phase 2; `lang` attribute on resort names only in Phase 1. Per-resort `lang` on `region` and `attribution_block` strings — Phase 2 i18n work.
- `Reporting-Endpoints` / `report-to` CSP telemetry — Epic 6.
- `prefers-reduced-data` image preload variants — Phase 2 (no images Phase 1 except a single self-hosted hero).
- `prefers-reduced-motion` plumbing beyond Drawer animations (e.g. scroll-reset, view-toggle transitions) — Epic 6 polish.
- Stylelint enforcement of no-px-literal in CSS modules — Epic 6 polish (PR 3.1a ESLint rule covers `style={{}}` immediately).
- Lodging-near-resort grid (visual ref `03.png`) — Phase 2 only.
- Geolocation-based "Nearest first" sort — Phase 2 with the lodging grid.
- "Nearest" / IP geo / location services of any kind — Phase 2.
- Bundle-budget enforcement at `error` severity — Epic 6 follow-up (PR 3.6 ships at `warn`).
- Per-route LCP / CLS automated measurement — Epic 6 (`size-limit` + Lighthouse CI per parent §2.5).
- Skip-link visible-on-focus styling beyond the focus assertion test — handled in PR 3.1c `Shell.tsx` (in scope; not a deferral, just naming where it lands).
- ESLint enforcement that `setURLState` is never invoked inside `startTransition` — discipline note in §10.5; an ESLint `no-restricted-syntax` rule is a Phase-2 hardening pass.

---

## 10. Operational concerns

### 10.1 Mid-epic rollback procedure

If a merged PR turns out to be broken or incompatible with a downstream PR in flight:

1. **`git revert <merge-sha>`** on the integration branch. Never force-push; rely on a new commit (parent spec §10.4 plus CLAUDE.md "PreToolUse hook blocks `git push --force` to main").
2. **Worktrees with downstream work** rebase against the post-revert head. Worktree convention from CLAUDE.md (`.worktrees/` gitignored) keeps in-flight branches isolated.
3. **Dependency-graph rules from §7.4 still apply** to the revert: if 3.1c reverts, every downstream PR pauses until 3.1c relands. If 3.4 reverts, 3.5 stays unblocked.
4. **Re-run the affected sub-agent reviews** on the relanding PR — review state is per-commit, not per-branch.

DCO sign-off applies to revert commits as well. CI's `dco` check fails the relanding PR otherwise.

### 10.2 Epic 6 nginx coupling — dataset-serving handoff

PR 3.1b's `writeBundle` adapter copies `data/published/current.v1.json` into `dist/data/current.v1.json`. The path under which this dist file is served at the edge (`/data/current.v1.json`) is implicit in `apps/public/src/lib/datasetFetch.ts`'s `fetch('/data/current.v1.json', ...)`. Epic 6 owns the nginx config; Epic 3 declares the contract:

- **Epic-3 contract:** the deployed bundle places `current.v1.json` at `<bundle-root>/data/current.v1.json`. Static-file serving must expose it at the URL `/data/current.v1.json` (relative to the SPA's origin) with `Cache-Control: no-cache, must-revalidate` and `Content-Type: application/json; charset=utf-8`.
- **Handoff item for Epic 6 nginx config:** add a `location /data/` directive serving from the bundle root with the cache headers above. Without it, prod 404s.
- **Verification at Epic 3 close:** PR 3.6's CI step asserts `dist/data/current.v1.json` exists post-build; the URL-routing contract is asserted in Epic 6.

### 10.3 Validator-issue-flooding UI cap

`<DatasetUnavailable />`'s dev-only `<details>` block (§4.5) renders `error.issues` for `DatasetValidationError`. To avoid memory + screen-reader floods when the validator returns many issues:

- **Cap rendered issues at 20.** Display `+N more` count for the tail.
- `<details>` carries `aria-live="off"` so SR readers don't announce the listing on collapse/expand.
- The cap and ellipsis are tested in `DatasetUnavailable.test.tsx` with a fixture of 100 issues.
- Prod build does not render the `<details>` block (`import.meta.env.DEV` gate); production users see only the generic copy.

### 10.4 HMR cache-reset hazard for `useDataset`

`useDataset`'s module-scoped `cached` promise (§4.3) survives Vite HMR module-replacement, so a developer editing `useDataset.ts` would otherwise hit a stale promise across reloads. PR 3.1c adds:

```ts
if (import.meta.hot) {
  import.meta.hot.accept(() => { cached = null })
}
```

at the bottom of `state/useDataset.ts`. The 3-line `import.meta.hot` block is added to `apps/public/vite.config.ts`'s `coverage.exclude` list with the rationale: `// state/useDataset.ts HMR-only branch — import.meta.hot undefined in vitest; dev-only safety net, not a runtime branch`.

### 10.5 URL-state setters and React 19 `startTransition`

`setURLState` (§3.7) writes `history.pushState` / `replaceState` synchronously inside event handlers. **It must never be invoked inside `startTransition`** because the synchronous DOM write would race the deferred render. Documented as a JSDoc `@warning` block on `setURLState`. `useURLState.test.ts` reads the source text and asserts the `@warning` block is present (so the discipline note doesn't silently rot if the JSDoc is later edited away). An ESLint `no-restricted-syntax` rule that mechanically enforces the rule is deferred to a Phase-2 hardening pass — single-call-site discipline suffices in Phase 1.

### 10.6 MSW default handler

`apps/public/src/mocks/server.ts` ships a default handler for `GET /data/current.v1.json` that responds with the seed fixture (the same JSON file at `data/published/current.v1.json`, read at test-server-startup time). Tests override per-suite via `server.use(http.get(...))` for failure-mode scenarios. Without the default handler, `onUnhandledRequest: 'error'` would fail every test that doesn't mock the dataset fetch.

**Request-log isolation.** Tests that assert on MSW request counts (e.g. `dataset.test.ts`'s contamination regression — §7.7) must see independent counts per test. `apps/public/src/test-setup.ts`'s `afterEach` therefore calls **both** `server.resetHandlers()` (handler isolation) **and** `server.events.removeAllListeners()` (request-log isolation), in addition to `__resetForTests()` for the `useDataset` singleton.

### 10.7 Bundle-fail mode for emitted preload hrefs

`scripts/check-preload-hrefs.{ts,cli.ts}` (PR 3.6b → #55) walks two URL sources to catch the failure mode where Vite renames a woff2 asset but the import URL doesn't update (silent 404 in prod):

- `dist/index.html` `<link rel="preload">` tags (none today; reserved for future Vite-emitted preloads).
- JS string literals in `dist/assets/*.js` matching `/assets/<name>.<woff2|woff>` — the runtime-injected preloads created by `apps/public/src/lib/injectFontPreloads.ts` from `?url` imports in `main.tsx`. Vite resolves each `?url` import to a hashed string at build time; the literal lands in the emitted JS chunk and the helper appends a `<link rel="preload" as="font" crossorigin>` at module-eval. Quote-class regex accepts `"`, `'`, and backtick template literals (esbuild's minifier emits backtick strings for these refs).

The script also rejects hrefs whose resolved path escapes `dist/` (containment guard), so a malformed href like `/../etc/secret` cannot validate a file outside the build output.

### 10.8 PR-#56 phantom-merge incident (Epic 3 close)

PR #56 (the original 3.6c) was opened with `baseRefName: epic-3/pr-3.6b-analysis` (stacked on PR #55's branch). When PR #55 was squash-merged to `main`, GitHub auto-deleted the source branch `epic-3/pr-3.6b-analysis` and marked PR #56 as `MERGED` because its base was gone — but #56's actual commit `eccb24a259...` never landed on `main` (only #55's squash `9e8ac47` did). The workflow YAML diff was lost.

PR #57 re-applied the same content (verbatim cherry-pick of `f089972` onto current main).

**Future agent guidance:** when stacking PRs (`gh pr create --base <other-branch>`), confirm via `gh pr view <stacked-PR> --json baseRefName,mergeCommit` after the parent PR merges. If `baseRefName` points to a now-deleted branch and the stacked PR's `mergeCommit.oid` is not reachable from `main`, the diff was lost and must be re-applied. GitHub's "MERGED" badge on a stacked PR after its base is deleted is a false positive in this scenario.
