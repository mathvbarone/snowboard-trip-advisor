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

| # | Decision | Brainstorm option |
| --- | --- | --- |
| 1 | **Detail = right-side overlay drawer** (not a separate route) | A |
| 2 | **Lodging-near-resort grid** is Phase 2 only; Epic 3 ships only the deep-link CTA | B |
| 3 | **Sort options:** `name | price_asc | price_desc | snow_depth_desc`; default `name` A→Z; missing values sink | B |
| 4 | **No `#N` ranking badge on cards** — alphabetical / sort-positional indices removed | B |
| 5 | **Loading model:** runtime `fetch('/data/current.v1.json')` → Zod validate → project. Build-time bundle rejected | B |
| 6 | **Three font families** self-hosted via `@fontsource/*` (DM Serif Display 400, DM Sans 400 + 600, JetBrains Mono 500). Preload DM Sans 400 + JetBrains Mono 500 only | A |
| 7 | **Theme:** CSS-only via `prefers-color-scheme`, default dark; no JS theme branching; tokens semantic so a Phase 2 manual toggle is purely additive | B |
| 8 | **Implementation approach:** spec-faithful, minimal libraries; no Zustand, no router | Approach 1 |
| 9 | **Design system:** hand-built; no Pico / Tailwind / Radix Themes (ADR-0006 captures the rationale) | A |

Brainstorm trail records 14+ reviewer findings folded across Sections 1-6 (P0-P2 punch lists from a senior frontend reviewer per section; full punch lists are not reproduced here, but their resolutions appear inline below).

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
│   ├── App.tsx             # <AppShell />
│   ├── components/
│   │   └── AppShell.tsx    # <Shell><ShellErrorBoundary><Suspense fallback>...</Suspense></ShellErrorBoundary></Shell>
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
│   │   └── format.ts                  # app-specific formatter glue (delegates to design-system format.ts)
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

**`cspDevPlugin`** emits the dev CSP header with a per-request nonce:
- `configureServer` middleware generates a fresh nonce via `crypto.getRandomValues` per request and stashes it on `req`.
- `transformIndexHtml` reads the nonce from `req`, injects `<meta name="csp-nonce" content="...">` (debug aid only — React doesn't read it), and rewrites Vite HMR inline `<script>` tags with the nonce.
- Pure helpers: `generateNonce()` and `injectNonce(html, nonce)` are unit-tested for purity in `lib/csp.test.ts`.
- Smoke test: vitest `cspDevPlugin.test.ts` asserts two middleware invocations produce different `script-src 'nonce-...'` header values.

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
- On `view=matrix` + viewport `<lg`: a CSS rule downgrades the matrix layout to single-column cards under the drawer (matrix at <30% width is unreadable).
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
// AppShell with ShellErrorBoundary (sketch)
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

Render-lifecycle order asserted by `Shell.test.tsx`: mount → `use(promise)` throws the *promise* → Suspense catches, shows `<DatasetLoading />` → promise rejects → next render `use` throws the *Error* → ErrorBoundary catches, replaces tree with `<DatasetUnavailable />`.

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

### 5.5 Q1 — price filter

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

`main.tsx`:
```ts
import '@fontsource/dm-serif-display/400.css'
import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/600.css'
import '@fontsource/jetbrains-mono/500.css'
import dmSans400 from '@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff2?url'
import jetBrains500 from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2?url'
import { injectFontPreloads } from './lib/injectFontPreloads'
injectFontPreloads([dmSans400, jetBrains500])
```

`injectFontPreloads(urls)` is a pure helper that appends `<link rel="preload" as="font" type="font/woff2" crossorigin href={url}>` tags before render. Vite hashes the woff2 in build; imports resolve to hashed URLs that match `<link>` href values. `font-display: swap` from `@fontsource`.

CSP `font-src 'self'` satisfied (assets land under origin).

### 6.4 CSP wiring

`config/csp.ts` exposes `cspHeader({ mode: 'development' | 'production'; nonce?: string }): string`.

- **Dev:** `connect-src 'self' ws://localhost:* http://localhost:*` + `script-src 'self' 'nonce-${nonce}'`. Both branches unit-tested.
- **Prod (Epic 6 nginx):** dev `ws:` / `http:` allowances absent; `script-src 'self'` only.

`apps/public/main.tsx` does **not** read or use the nonce. The `<meta name="csp-nonce">` is dev-only debugging.

### 6.5 Testing strategy

- Workspace setup: root `vitest.workspace.ts` enumerates packages + apps + integration.
- `apps/public/src/test-setup.ts`:
  - `vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: noop, removeEventListener: noop, ... }))`.
  - `expect.extend({ toHaveNoViolations })` from `jest-axe` (ADR-0007).
  - MSW lifecycle: `beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))` + `afterEach(() => server.resetHandlers())` + `afterAll(() => server.close())`.
  - `afterEach(() => __resetForTests())` for the `useDataset` singleton.
- Unit per-component / per-hook with `jest-axe` per state (default + hover + focus + open/expanded + disabled).
- Integration: `tests/integration/apps/public/*.test.ts` for route-composition focus-order + axe + e2e flows. Lit up in PR 3.6.
- Bundle analysis: `npm run analyze` (root) using `rollup-plugin-visualizer`. PR 3.6 lands the script in `warn` mode (logs over-budget, exits 0); Epic 6 follow-up flips to `error`.
- Visual regression: out of scope (parent spec §6.5 — Epic 6).

### 6.6 Bundle accounting (estimate; verified by `npm run analyze` in PR 3.6)

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
| 3.1a | `packages/schema/**` + `eslint.config.js` + `docs/adr/**` (4 ADRs) |
| 3.1b | `apps/public/vite.config.ts` (CSP plugin); `config/csp.ts` |
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
| `lang` attr on resort names | PR 3.2 | `<h2 lang={resort.country.toLowerCase()}>` in ResortCard hero |
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

**Goal.** No app code. Foundational config + ADRs + the schema validator change with its test-migration sweep.

**Deliverables (tests first):**

- *Tests added/updated:*
  - `packages/schema/src/published.test.ts` — empty-array now fails with `dataset_empty`; one-resort fixture for happy path.
  - `packages/schema/src/publishDataset.test.ts` — fixture migrated.
  - `packages/schema/src/publishDataset.lockTimeout.test.ts` — fixture migrated.
  - `packages/schema/src/index.test.ts` — barrel re-export test updated for new exports landing in 3.1c (presence-by-key only).
  - `packages/schema/src/validatePublishedDataset.test.ts` — explicit `dataset_empty` issue code emission test.
  - `config/csp.test.ts` — both modes; dev includes `ws:` + nonce; prod excludes both. Pure helper purity assertions.
- *Implementation:*
  - `packages/schema/src/published.ts` — `resorts: z.array(...).min(1, { message: 'dataset_empty' })`.
  - `packages/schema/src/validatePublishedDataset.ts` — emit `dataset_empty` on `min: 1` failure.
  - `eslint.config.js` — `no-restricted-imports` rule banning `loadResortDataset` from `apps/public/**`.
  - `config/csp.ts` — `cspHeader({ mode, nonce? })` refactor.
  - Root `package.json` — `engines: { "node": ">=20.11" }`.
- *Docs:*
  - `docs/adr/0004-public-app-form-controls-native.md`.
  - `docs/adr/0005-css-theme-no-js.md`.
  - `docs/adr/0006-public-app-no-css-framework.md`.
  - `docs/adr/0007-axe-library-jest-axe-with-vitest.md`.

**Acceptance gate:** `npm run qa` green; new `dataset_empty` issue code asserted in test; ADR index reflects 0004–0007.

### 7.6 PR 3.1b — Vite plugins + entry + test infra

**Goal.** `apps/public` boots with CSP nonce per request, fonts preloaded, dataset served from `data/published/`. App is still a stub.

**Deliverables (tests first):**

- *Tests added:*
  - `apps/public/src/lib/datasetPlugin.test.ts` — `serveDatasetMiddleware` happy + ENOENT; `copyDataset` against tmpdir.
  - `apps/public/src/lib/csp.test.ts` — `generateNonce` purity (uses `crypto.getRandomValues`, distinct values), `injectNonce` purity.
  - `apps/public/src/__tests__/cspDevPlugin.test.ts` — middleware invoked twice, asserts `Content-Security-Policy` `script-src 'nonce-...'` differs.
  - `apps/public/src/lib/injectFontPreloads.test.ts` — pure; appends N `<link>` tags with correct attributes.
- *Implementation:*
  - `apps/public/src/lib/{datasetPlugin,csp,injectFontPreloads}.ts`.
  - `apps/public/vite.config.ts` — registers `datasetPlugin()` and `cspDevPlugin()` (5-line lifecycle adapters; coverage-excluded with rationale).
  - `apps/public/index.html` — `<html lang="en">`, `<meta name="description">`, two `<meta name="theme-color">` with `media`, `<link rel="canonical">` placeholder.
  - `apps/public/src/main.tsx` — `@fontsource` CSS + `injectFontPreloads([dmSans400, jetBrains500])` + mount.
  - `apps/public/src/App.tsx` — temporary stub returning `<main className="app-shell" />` (real composition lands in 3.1c).
  - `apps/public/src/test-setup.ts` — `matchMedia` stub; `expect.extend({ toHaveNoViolations })`; MSW lifecycle.
  - `apps/public/src/mocks/server.ts`.

**Acceptance gate:** `npm run qa` green; `npm run dev` boots; nonce-diff vitest passes; `dist/data/current.v1.json` exists after `npm run build`.

### 7.7 PR 3.1c — Foundation lib + state + states + Shell composition

**Goal.** Every hook is testable in isolation; foundation states render; design-system Shell/Skeleton/EmptyStateLayout ship; the frozen DetailRoute stub lands.

**Deliverables (tests first):**

- *Tests added:*
  - `packages/schema/src/loadResortDatasetFromObject.test.ts` — projection branches migrated from existing `loadResortDataset.test.ts`.
  - `packages/schema/src/loadResortDataset.test.ts` — slim happy-path Node wrapper test.
  - `packages/design-system/src/components/{Shell,Skeleton,EmptyStateLayout}.test.tsx` — render contract + axe per state.
  - `packages/design-system/src/format.test.ts` — destructured-primitive formatters.
  - `apps/public/src/lib/{urlState,router,datasetFetch,errors,format,deepLinks}.test.ts` — pure helpers.
  - `apps/public/src/state/{useURLState,useLocalStorageState,useDataset,useShortlist,useMediaQuery,useDocumentMeta,useScrollReset,useDroppedSlugs}.test.ts` — each hook drives the underlying API directly.
  - `apps/public/src/state/dataset.test.ts` — contamination regression: two consecutive renders, independent fetch counts asserted via MSW request log.
  - `apps/public/src/views/states/{DatasetLoading,DatasetUnavailable,NoResorts}.test.tsx`.
  - `apps/public/src/components/AppShell.test.tsx` — render lifecycle order assertion (fallback → content; fallback → error UI); retry via `startTransition`; skip-link focus assertion.
- *Implementation:*
  - `packages/schema/src/loadResortDatasetFromObject.ts` (NEW, pure).
  - `packages/schema/src/loadResortDataset.ts` (refactored Node wrapper; existing tests stay green by virtue of the wrapper).
  - `packages/schema/src/index.ts` — export both.
  - `packages/design-system/src/components/{Shell,Skeleton,EmptyStateLayout}.tsx`.
  - `packages/design-system/src/format.ts`.
  - `packages/design-system/src/index.ts` — re-export new components.
  - `apps/public/src/lib/{urlState,router,datasetFetch,errors,format,deepLinks}.ts`.
  - `apps/public/src/state/` — all 8 hooks; `useDataset` exports `__resetForTests`.
  - `apps/public/src/views/states/{DatasetLoading,DatasetUnavailable,NoResorts}.tsx`.
  - `apps/public/src/views/cards.tsx` — Landing placeholder rendering `views.length` count.
  - `apps/public/src/views/detail.tsx` — frozen interface; body throws `'detail route stub — lands in PR 3.5'`.
  - `apps/public/src/components/AppShell.tsx` — composes `<Shell><ShellErrorBoundary><Suspense>...</Suspense></ShellErrorBoundary></Shell>`.
  - `apps/public/src/App.tsx` — replaces 3.1b stub with `<AppShell />`.

**Acceptance gate:** `npm run qa` green; foundation states render; nav-to-detail throws (gated by URL state, untriggered by tests); contamination regression passes.

### 7.8 PR 3.2 — CardsView

**Goal.** Cards landing renders the seed dataset with full filter bar (sans view toggle); per-component axe-clean.

**Deliverables (tests first):**

- *Tests added:*
  - `packages/design-system/src/components/{Button,IconButton,Input,Select,Chip,Pill,Card,SourceBadge,FieldValueRenderer}.test.tsx` — variant matrix + axe per state.
  - `packages/design-system/src/icons/{sources,ui}/*.test.tsx` — `currentColor` assertion + size-prop test.
  - `packages/design-system/src/primitives/Tooltip.test.tsx`.
  - `apps/public/src/views/{cards,ResortCard,Hero,FilterBar}.test.tsx` — composition + axe; FilterBar country chip hidden on ≤1 country; ResortCard CTA carries `rel="noopener noreferrer"` + `referrerpolicy="no-referrer"`.
- *Implementation:*
  - All design-system components and icons named in tests above.
  - `packages/design-system/src/primitives/Tooltip.tsx`.
  - `apps/public/src/views/{cards,ResortCard,Hero,FilterBar}.tsx`.
  - `apps/public/public/hero.jpg` (self-hosted hero image; no external CDN).
  - FilterBar accepts `slot?: ReactNode` prop; PR 3.4 fills it.
- *Docs:* README pointer added (cards landing is product-facing).

**Acceptance gate:** `npm run qa` green; cards re-sort live on `&sort=` change; star toggles `aria-pressed`; visual smoke matches `docs/reference/01.png` modulo native form controls and the dropped #N badge.

### 7.9 PR 3.3 — Shortlist & sharing

**Goal.** Star-toggle drives the shortlist; drawer renders on every breakpoint; merge/replace dialog handles collisions; share URL works with clipboard fallback.

**Deliverables (tests first):**

- *Tests added:*
  - `packages/design-system/src/primitives/Modal.test.tsx` — focus trap; scroll lock; Escape.
  - `packages/design-system/src/primitives/Drawer.test.tsx` — non-modal: keyboard focus inside, mouse-clicks behind work; Escape; outside-click; focus return; full prop superset exercised.
  - `apps/public/src/views/{ShortlistDrawer,MergeReplaceDialog,ShareUrlDialog}.test.tsx`.
  - `apps/public/src/state/useShortlist.test.ts` extension — hydration only when URL is empty; mirror writes on URL change; `setEqual([a,b,c],[c,b,a]) === true` (no dialog).
- *Implementation:*
  - `packages/design-system/src/primitives/Modal.tsx`.
  - `packages/design-system/src/primitives/Drawer.tsx` (full prop superset).
  - `apps/public/src/views/{ShortlistDrawer,MergeReplaceDialog,ShareUrlDialog}.tsx`.
- *Docs:* README pointer (shortlist is product-facing).

**Acceptance gate:** `npm run qa` green; star → drawer ↔ URL ↔ localStorage three-way coherence asserted; share-URL paste in fresh session triggers MergeReplaceDialog when local exists; same-set/different-order does NOT trigger.

### 7.10 PR 3.4 — MatrixView

**Goal.** Matrix route renders comparison table; `<md` shows redirect message; `&highlight=` activates column highlight; cards/matrix toggle lands in the slot.

**Deliverables (tests first):**

- *Tests added:*
  - `packages/design-system/src/components/{Table,ToggleButtonGroup}.test.tsx`.
  - `apps/public/src/views/matrix.test.tsx` — empty shortlist → "Add resorts to compare"; non-empty → table; `&highlight=snow_depth_cm` highlights column; viewport `<md` → redirect; lazy chunk loaded only when navigating.
  - `apps/public/src/views/FilterBar.test.tsx` extension — view toggle pushes `&view=` (PUSH transition).
- *Implementation:*
  - `packages/design-system/src/components/{Table,ToggleButtonGroup}.tsx`.
  - `apps/public/src/views/matrix.tsx` (lazy).
  - `apps/public/src/views/FilterBar.tsx` — fills the `slot` prop with the `ToggleButtonGroup`.
  - `apps/public/src/views/matrix.module.css` — when `<lg` and `&detail=` set, downgrade matrix to cards under the drawer.
- *Docs:* README pointer (matrix is product-facing).

**Acceptance gate:** `npm run qa` green; navigating cards → matrix produces a chunk fetch (asserted via MSW request log); back-button returns to cards; bundle visualizer shows matrix in its own chunk.

### 7.11 PR 3.5 — DetailDrawer body

**Goal.** Detail drawer renders full resort detail with deep-link section. Frozen interface from PR 3.1c gets its body. **Can ship in parallel with 3.2/3.3/3.4** because the interface is locked.

**Deliverables (tests first):**

- *Tests added:*
  - `apps/public/src/lib/deepLinks.test.ts` — `encodeURIComponent` round-trip; malicious slug doesn't escape; security attributes present on every external `<a>`.
  - `apps/public/src/views/detail.test.tsx` — drawer mounts when `&detail=<slug>` set + slug exists; hides when slug missing; close → URL clears; focus returns to triggering card star button (`data-detail-trigger`); axe in drawer-open state.
- *Implementation:*
  - `apps/public/src/lib/deepLinks.ts` — pure builder for booking + airbnb deep-link URLs.
  - `apps/public/src/views/detail.tsx` — replaces 3.1c's stub-throw body. **`App.tsx` is NOT touched** (frozen interface).
- *Acceptance addendum:* attach `npm run analyze` advisory output to PR description.
- *Docs:* README pointer (detail view is product-facing).

**Acceptance gate:** `npm run qa` green; opening detail produces a lazy chunk fetch; drawer-on-matrix CSS rule fires at `<lg`; bundle visualizer shows detail in its own chunk.

### 7.12 PR 3.6 — Integration tests + bundle analysis

**Goal.** Route-composition axe sweep; bundle analyze script in `warn` mode; final wiring of `DroppedSlugsBanner` and `useScrollReset`.

**Deliverables (tests first):**

- *Tests added:*
  - `tests/integration/apps/public/cards-empty.test.ts` — focus order across Shell + FilterBar + empty grid; skip-link target.
  - `tests/integration/apps/public/cards-loaded.test.ts` — focus order with cards rendered.
  - `tests/integration/apps/public/matrix.test.ts` — matrix-route composition.
  - `tests/integration/apps/public/detail-open.test.ts` — drawer-open composition; focus return path.
  - `apps/public/src/views/DroppedSlugsBanner.test.tsx` — final wiring scenarios.
  - `apps/public/src/state/useScrollReset.test.ts` — fires on view transition; doesn't fire on sort/filter.
- *Implementation:*
  - `apps/public/src/views/DroppedSlugsBanner.tsx` final wiring (PR 3.1c shipped a stub).
  - `apps/public/src/state/useScrollReset.ts` final wiring.
  - Root `package.json` — `npm run analyze` script using `rollup-plugin-visualizer`.
  - `scripts/check-bundle-budget.ts` — reads visualizer JSON, computes initial chunk gzip, **warns** (exits 0) on >100 KB. Epic 6 follow-up flips to `error`.
  - `.github/workflows/quality-gate.yml` — adds `npm run analyze` step (warn mode).

**Acceptance gate:** `npm run qa` + `npm run test:integration` green; axe-clean per route composition; bundle visualizer report attached.

### 7.13 Cross-cutting (every PR)

- **TDD enforced via deliverable ordering** — tests first, implementation after.
- **README pointer** — only PRs 3.2 / 3.3 / 3.4 / 3.5 (product-facing). 3.1a updates ADR index. 3.1b/3.1c/3.6 update no README.
- **Subagent Review Discipline** — per the trigger matrix above.
- **DCO sign-off** on every commit (`git commit -s`).
- **Pre-commit `npm run qa`** runs before each commit; PreToolUse hook blocks `--no-verify`.

---

## 8. ADRs landing in PR 3.1a

| # | Title | Decision summary |
| --- | --- | --- |
| 0004 | `public-app-form-controls-native.md` | Phase 1 ships native `<input type="date">` and `<select>` with documented a11y trade-offs; revisit when Phase 2 design refresh demands custom popovers. Includes the bucketed-price-filter mini-decision (revisit when N≥10 resorts and price variance >€20). |
| 0005 | `css-theme-no-js.md` | Theme switches via `prefers-color-scheme` in generated `tokens.css`; no JS theme branching; tokens semantic; future manual toggle is purely additive. |
| 0006 | `public-app-no-css-framework.md` | Hand-built design system rejected in favor of Pico/Tailwind/Radix Themes after explicit user-reviewed brainstorm. Documents the cost-of-pivot trigger condition. |
| 0007 | `axe-library-jest-axe-with-vitest.md` | A11y test library: `jest-axe` consumed via Vitest's `expect.extend({ toHaveNoViolations })`. |

---

## 9. Out of Scope (Phase 2 / Epic 6)

- Service-worker offline shell — Phase 2.
- Sentry / observability wiring — Epic 6 (`onDatasetError` seam in place).
- Polling / revalidate-on-focus — Epic 6.
- Storybook + Playwright visual regression + `visual:approve` label — Epic 6 per parent spec §6.5.
- Manual theme toggle UI — Phase 2 (CSS invariant kept ready).
- i18n translation framework — Phase 2; `lang` attribute on resort names only in Phase 1.
- `Reporting-Endpoints` / `report-to` CSP telemetry — Epic 6.
- `prefers-reduced-data` image preload variants — Phase 2 (no images Phase 1 except a single self-hosted hero).
- Stylelint enforcement of no-px-literal in CSS modules — Epic 6 polish (PR 3.1a ESLint rule covers `style={{}}` immediately).
- Lodging-near-resort grid (visual ref `03.png`) — Phase 2 only.
- Geolocation-based "Nearest first" sort — Phase 2 with the lodging grid.
- "Nearest" / IP geo / location services of any kind — Phase 2.
- Bundle-budget enforcement at `error` severity — Epic 6 follow-up (PR 3.6 ships at `warn`).

---

## 10. Verification & next steps

1. This spec is committed to `docs/superpowers/specs/2026-04-28-epic-3-public-app-design.md` on branch `docs/epic-3-public-app-spec`.
2. `spec-document-reviewer` subagent runs against this doc; findings folded into the same branch before maintainer review.
3. User reviews the committed spec.
4. `superpowers:writing-plans` produces the implementation plan against this spec.
5. `superpowers:using-git-worktrees` + `superpowers:subagent-driven-development` execute the plan PR by PR, in the dependency-graph order from §7.4.
