# Analyst Notes — post-Epic-4 follow-up design

- **Status:** Draft
- **Date:** 2026-05-12
- **Author:** @mathvbarone (brainstorm) + the post-Epic-4 admin agent
- **Parent spec:** [`docs/superpowers/specs/2026-04-22-product-pivot-design.md`](2026-04-22-product-pivot-design.md) §3.9 (Analyst notes), §4 footnote at line 266 ("Note on analyst notes"), §8.4.1 lines 768–769 (`/api/analyst-notes/:slug` endpoint rows 9 + 10)
- **Related ADRs:** [ADR-0012](../../adr/0012-defer-analyst-notes-to-post-epic-4-followup.md) — sets up this work; lift conditions satisfied at PR #106 merge. ADR-0013 (sanitizer choice) lands as part of PR N.b1 below.
- **Related Epic-4 spec:** [`docs/superpowers/specs/2026-05-01-epic-4-admin-app-design.md`](2026-05-01-epic-4-admin-app-design.md) — §4 (`/api/*` contract), §10.3 (atomic-write), §10.9 (cold-start).

---

## 0. Executive Summary

Phase 1 analyst notes: per-resort, per-field Markdown commentary stored in the admin workspace, never published. The maintainer adds notes alongside any Resort attribute (metric or non-metric) — for example, "slopes_km changed from 48 to 52 because the operator's 2026 PDF added the Skalka run; verified against ski-club newsletter."

The feature lands as **9 stacked PRs** (per AGENTS.md PR Sizing Discipline; the 3-PR sketch in ADR-0012 underestimated). The headline product surface is **inline expandable rows** in the Resort editor — clicking a "Notes" affordance on any `FieldRow` reveals a stacked Markdown editor + live preview with autosave (500 ms debounce) and explicit Delete (trash icon + `mod+backspace`). Notes accept **full GFM + raw HTML pass-through**, sanitized through a `unified`+`rehype-sanitize` pipeline shared between server (authoritative render) and client (live preview during typing).

The implementation closes ADR-0012's lift conditions, authors ADR-0013 for the sanitizer choice, introduces a per-slug write mutex (`withSlugLock`) that retrofits onto `resortUpsert`, and ships ~2,060 LOC across 9 PRs. Subagent Review fires on 5 of the 9 PRs — 3 mechanical (the spec-amendment-bearing N.b1 plus the `packages/schema/**`-touching N.a + N.b2) and 2 discretionary (the load-bearing server-handler PRs N.b3a + N.b3b). See §7.1 for the breakdown.

**What ships:**
- `AnalystNote` Zod schema + `notes` field on `WorkspaceFile` (forward-compatible with Epic-4 fixtures)
- `GET /api/analyst-notes/:slug` + `PUT /api/analyst-notes/:slug` handlers with cold-start hydration from published doc + server-side sanitization
- A shared `renderAnalystNoteMarkdown(markdown): string` function in `packages/schema/markdown.ts` (sub-export, NOT barrel)
- `useAnalystNotes(slug)` Suspense read hook + `useAnalystNoteDraft(slug, path)` per-path write hook + `flushAll` registry integrating with the existing `mod+enter` shortcut
- Per-row `<AnalystNoteSection>` UI in the Resort editor with delete-via-explicit-action UX
- `withSlugLock` per-slug write mutex (intra-process promise mutex; Phase 2 lifts to inter-process advisory lock)
- ADR-0013 documenting the sanitizer choice + allowlist + threat model

**What does NOT ship (out of scope):**
- Multi-user audit: tracking *who* wrote each note. Phase 2 (when auth + multi-analyst land).
- Per-field-name sanitization variance: every field uses the same allowlist.
- Markdown linting / formatting helpers (e.g., auto-prettify on save).
- Note search / filter UX.
- Note export / import.

---

## 1. Locked Decisions Summary

| # | Decision | Rationale |
|---|---|---|
| 1 | **Markdown subset = full GFM + raw HTML pass-through** (`unified` + `rehype-raw` + `rehype-sanitize` with allowlist) | Maintainer's "the most complete, the better" preference. Sanitizer schema is the security boundary. |
| 2 | **UI = inline expandable `FieldRow` extension** (Radix `Collapsible`-style) | Visual adjacency between value and annotation. Per-row affordance. |
| 3 | **Live preview = stacked client-side render** during typing (debounced 150 ms) | Single shared renderer (`packages/schema/markdown.ts`) imported by both server and client. No config drift. |
| 4 | **Save = autosave debounced 500 ms + `mod+enter`** via the existing `flushNow` shortcut from PR 4.6c | Consistency with the ResortEditor field-value pattern. |
| 5 | **Delete = explicit trash icon + `mod+backspace`** → `PUT { markdown: null }`. Empty Markdown body persists as empty. | Avoids accidental-delete-via-ctrl-A-delete. |
| 6 | **Storage = top-level `notes: Record<NotePath, AnalystNote>`** on `WorkspaceFile`. `NotePath` is a dot-separated lowercase-identifier regex (any Resort path, not just metric fields). | Per parent §4 footnote: admin-internal, separate from published Resort. Per spec §3.9 "per-field" — not restricted to metric fields. |
| 7 | **Sanitization = server-authoritative + client-mirrored** for live preview, sharing the same `Schema` config exported from `packages/schema/src/markdown.ts` | Defense-in-depth + single source of truth. Sub-export prevents `apps/public` from accidentally pulling unified deps. |
| 8 | **Concurrency = `withSlugLock` intra-process promise mutex** in `apps/admin/server/workspace.ts`. Both `resortUpsert` and the new `analystNotesPut` handler wrap their read-merge-write in it. | Single-process Vite middleware; Phase 1 correctness. Phase 2 Hono service swap will lift to `pg_advisory_lock` or equivalent. |
| 9 | **PR stack = 9 stacked PRs**, with parallel-capable triples (N.b1 ‖ N.b2 ‖ N.b3a) | AGENTS.md PR Sizing Discipline ceilings (≤300 LOC, ≤8 files). ADR-0012's 3-PR sketch was a target; execution expansion mirrors Tier 3/4/5 history. N.b3b and N.c2 exceed the 300 LOC target with documented inseparable-concern justification. |

---

## 2. Schema & workspace extension

### 2.1 `AnalystNote` (new module)

**File:** `packages/schema/src/analystNote.ts` (NEW)

```ts
import { z } from 'zod'
import { ISODateTimeString } from './branded'

/**
 * Note path — any dot-separated lowercase identifier path.
 *
 * Permits metric paths (`slopes_km`, `altitude_m.min`) AND non-metric Resort
 * paths (`name`, `country`, `region`). Phase 1 accepts that the schema does
 * NOT enforce the path resolves to a real Resort attribute — the UI is the
 * gatekeeper (only renders affordances on rendered rows). Manual JSON edits
 * could create ghost notes; documented as Phase-1 acceptance.
 *
 * Phase 2 may tighten via a path-superset enum (METRIC_FIELDS ∪ non-metric)
 * if a real need arises.
 */
export const NotePath = z.string().regex(
  /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)*$/,
  { message: 'note path must be dot-separated lowercase identifiers' },
)

export const AnalystNote = z.object({
  schema_version: z.literal(1),
  markdown: z.string()
    .refine(
      (s): boolean => new TextEncoder().encode(s).byteLength <= 10_000,
      { message: 'markdown body exceeds 10 KB (UTF-8)' },
    ),
  created_at: ISODateTimeString,
  updated_at: ISODateTimeString,
})

export const AnalystNotesMap = z.record(NotePath, AnalystNote).default({})

export type AnalystNote = z.infer<typeof AnalystNote>
export type AnalystNotesMap = z.infer<typeof AnalystNotesMap>
```

### 2.2 `WorkspaceFile` extension

**File:** `packages/schema/src/workspaceFile.ts` (MODIFY)

Add `notes: AnalystNotesMap` to the top-level object schema. The existing `.loose()` + `.superRefine` block stays unchanged. No new refinement (per the §2 v2 reviewer's MUST-FIX: ghost-notes check would block the most-useful cold-start case where the analyst notes a missing field).

### 2.3 Forward compatibility

The existing `.loose()` modifier (Zod v4 passthrough equivalent) plus `AnalystNotesMap.default({})` means **Epic-4-era workspace files (without `notes`) continue to parse**. No migration, no `schema_version` bump on `WorkspaceFile`. Pinned by a new test in `packages/schema/src/workspaceFile.test.ts`:

```ts
it('parses Epic-4-era workspace fixtures without notes; notes defaults to empty map', () => {
  const epicFourFixture = JSON.parse(readFileSync(
    'tests/fixtures/admin-workspace/kotelnica-bialczanska.json',
    'utf-8',
  ))
  const wf = WorkspaceFile.parse(epicFourFixture)
  expect(wf.notes).toStrictEqual({})
})
```

### 2.4 Storage shape on disk

```jsonc
// data/admin-workspace/kotelnica-bialczanska.json (post-feature)
{
  "schema_version": 1,
  "slug": "kotelnica-bialczanska",
  "resort": { /* ... */ },
  "live_signal": { /* ... */ },
  "modified_at": "2026-05-12T15:30:00.000Z",
  "editor_modes": { "slopes_km": "manual" },
  "notes": {
    "slopes_km": {
      "schema_version": 1,
      "markdown": "Operator's 2026 PDF added the Skalka run. [source](https://example.com).",
      "created_at": "2026-05-10T09:00:00.000Z",
      "updated_at": "2026-05-12T15:25:43.000Z"
    },
    "region": {
      "schema_version": 1,
      "markdown": "Ambiguous between Lesser Poland and Subcarpathia — picking Lesser Poland per Wikipedia consensus.",
      "created_at": "2026-05-11T14:00:00.000Z",
      "updated_at": "2026-05-11T14:00:00.000Z"
    }
  }
}
```

### 2.5 Why store only `markdown` + timestamps (not pre-rendered HTML)

- Render via `renderAnalystNoteMarkdown` is cheap (sub-ms for short notes; ~5–10 ms for 5 KB markdown warm).
- Avoids cache invalidation when the sanitizer config changes (e.g., dependency upgrade tightens the allowlist — all stored notes re-render with new rules immediately, no batch job).
- Smaller file footprint.
- The `AnalystNotesGetResponse` API shape DOES include rendered HTML — server renders at the boundary.

### 2.6 Notes never published

Workspace files are admin-internal; `notes` never reaches `data/published/current.v1.json`. The publish handler (Epic-4 PR 4.5a, [`apps/admin/server/publish.ts`](../../../apps/admin/server/publish.ts)) reads workspace ∪ published and composes a `PublishedDataset`, which has no `notes` field by design. Notes survive only on the maintainer's filesystem.

---

## 3. API contract (endpoints 9 + 10)

### 3.1 New schemas

**File:** `packages/schema/api/analystNotes.ts` (NEW)

```ts
import { z } from 'zod'
import { ResortSlug } from '../src/branded'
import { AnalystNote, NotePath } from '../src/analystNote'
import { ResortSlugParam } from './resortDetail'  // REUSE — do NOT redefine

// Server-rendered + sanitized HTML attached to the storage shape
const RenderedAnalystNote = AnalystNote.extend({ html: z.string() })

/** GET /api/analyst-notes/:slug response — full notes map for this slug */
export const AnalystNotesGetResponse = z.object({
  slug: ResortSlug,
  notes: z.record(NotePath, RenderedAnalystNote),
})

/**
 * PUT /api/analyst-notes/:slug request body — single-path delta.
 *
 * Semantics:
 *   markdown: string        → upsert (set markdown; stamp updated_at; preserve created_at if exists)
 *   markdown: null          → delete (key removed from notes map)
 *   markdown: '' (empty)    → upsert with empty body (rare; future-proofing — NOT deletion)
 */
export const AnalystNoteUpsertBody = z.object({
  path: NotePath,
  markdown: z.string()
    .refine(
      (s): boolean => new TextEncoder().encode(s).byteLength <= 10_000,
      { message: 'markdown body exceeds 10 KB (UTF-8)' },
    )
    .nullable(),
})

/**
 * PUT /api/analyst-notes/:slug response — affected path only.
 *
 * Client merges into its slug-keyed cache by path. Smaller bandwidth during
 * autosave than full-map echo; matches the partial-PUT mental model.
 */
export const AnalystNoteUpsertResponse = z.object({
  slug: ResortSlug,
  path: NotePath,
  note: RenderedAnalystNote.nullable(),  // null = deletion confirmed
})

export type AnalystNotesGetResponse = z.infer<typeof AnalystNotesGetResponse>
export type AnalystNoteUpsertBody = z.infer<typeof AnalystNoteUpsertBody>
export type AnalystNoteUpsertResponse = z.infer<typeof AnalystNoteUpsertResponse>
```

### 3.2 Handler behaviour

**File:** `apps/admin/server/analystNotes.ts` (NEW)

Handler signature matches the existing `apps/admin/server/*.ts` pattern. `HandlerDeps` is `{ workspaceRoot: string }` only (per [`apps/admin/server/listResorts.ts:16-17`](../../../apps/admin/server/listResorts.ts)); each handler derives its workspace and published paths in a fixed two-line pattern (verified against `resortDetail.ts:33-34` and `resortUpsert.ts:97-99`):

```ts
const workspaceDir = join(deps.workspaceRoot, 'data', 'admin-workspace')
const publishedPath = join(deps.workspaceRoot, 'data', 'published', 'current.v1.json')
```

**GET `/api/analyst-notes/:slug`:**
1. Derive `workspaceDir` + `publishedPath` per the snippet above.
2. `readWorkspaceFileForSlug(workspaceDir, slug)` — if exists, use its `notes`. If missing → `readPublishedDocOrNull(publishedPath)`.
3. If neither workspace nor published has the slug → **404 `not-found`** (mirrors [`resortDetail.ts:46-67`](../../../apps/admin/server/resortDetail.ts)).
4. If workspace JSON corrupt → **500 `workspace-corrupt`** (per Epic-4 spec §10.3.1).
5. For each `[path, note]` in `wf?.notes ?? {}`, compute `html = renderAnalystNoteMarkdown(note.markdown)` inside a `try`; on render exception → **500 `internal`** (the workspace data is preserved; analyst sees a banner). See §3.3.
6. Return `{ slug, notes: { [path]: { ...note, html } } }`. Cold-start path returns `{ slug, notes: {} }` when only the published doc exists.
7. No lock — reads are concurrent-safe.

**PUT `/api/analyst-notes/:slug`:**
1. Validate body via `AnalystNoteUpsertBody.parse(body)`. Fail → **400 `invalid-request`** with Zod issues in `.details`.
2. Derive `workspaceDir` + `publishedPath` per the snippet above; `targetPath = join(workspaceDir, ${slug}.json)`.
3. Acquire `withSlugLock(slug, async () => { ... })`:
   - `readWorkspaceFileForSlug(workspaceDir, slug)` — if missing, hydrate from `readPublishedDocOrNull(publishedPath)` (mirrors `resortUpsert.ts:117-127`). If neither → **404 `not-found`**.
   - Apply patch:
     - `markdown === null` → `delete wf.notes[path]`
     - else → `wf.notes[path] = { schema_version: 1, markdown, created_at: existing?.created_at ?? now, updated_at: now }`
   - Stamp `wf.modified_at = now`.
   - Validate via `const parsed = WorkspaceFile.safeParse(wf); if (!parsed.success) throw new InvalidWorkspaceError(parsed.error.issues)` (mirrors [`resortUpsert.ts:145-148`](../../../apps/admin/server/resortUpsert.ts) precedent — `safeParse` then access `.data`, since `parse()` would return the value directly with no `.data` wrapper).
   - **Render BEFORE write** (recovery-preserving order): on upsert (`markdown !== null`), compute `html = renderAnalystNoteMarkdown(parsed.data.notes[path].markdown)` inside a `try`; on render exception → throw **500 `internal`** *before* `atomicWriteWorkspaceFile` runs, so no corrupt note ever lands on disk and the analyst can edit the markdown + retry through the same UI. On delete (`markdown === null`), skip render (`html = null`; nothing to render).
   - `atomicWriteWorkspaceFile(targetPath, JSON.stringify(parsed.data, null, 2))`.
   - Return `{ slug, path, note: { ...parsed.data.notes[path], html } | null }`.

### 3.3 Error envelope (uses existing codes)

| Status | Code | Trigger |
|---|---|---|
| 400 | `invalid-request` | Body Zod-parse fail (markdown > 10 KB UTF-8, path regex, missing field) |
| 404 | `not-found` | Slug exists in neither workspace nor published doc |
| 500 | `workspace-corrupt` | JSON parse fail on existing workspace file (per §10.3.1) |
| 500 | `internal` | fs write fail (EACCES, ENOSPC, EBADF — inherits the macOS-APFS tolerance from `publishDataset`'s `atomicWriteText`), render-pipeline exception (rare; `processor.processSync` can throw on adversarial input that breaks a plugin) |

All codes already in [`packages/schema/api/errorEnvelope.ts`](../../../packages/schema/api/errorEnvelope.ts). **No `ErrorCode` enum extension; no `STATUS_FOR_CODE` change; no contract-snapshot churn beyond the additive new types.**

### 3.4 Dispatcher integration

**File:** `apps/admin/server/dispatch.ts` (MODIFY)

Two new entries in the `routes` array. The shape mirrors existing entries at `dispatch.ts:68-110` (verified against the actual `Route` interface at `:47-54`):

```ts
{
  method: 'GET',
  pathPattern: '/api/analyst-notes/:slug',
  paramSchema: ResortSlugParam,
  // No `bodySchema` field — `Route.bodySchema` is optional (`?: z.ZodType`),
  // and the dispatcher at `dispatch.ts:267-269` treats only `undefined`
  // as "no body schema". Setting `null` would crash with
  // `Cannot read properties of null (reading 'parse')`.
  handler: async (args, deps): Promise<unknown> =>
    analystNotesGet({ params: args.params as never }, deps),
},
{
  method: 'PUT',
  pathPattern: '/api/analyst-notes/:slug',
  paramSchema: ResortSlugParam,
  bodySchema: AnalystNoteUpsertBody,
  handler: async (args, deps): Promise<unknown> =>
    analystNotesPut({ params: args.params as never, body: args.body as never }, deps),
},
```

### 3.5 No `Idempotency-Key`

PUTs are naturally idempotent (same body produces same end state). The K1 AbortController machinery from PR 4.6c covers retry safety. `apiClient.getAnalystNotes` + `apiClient.upsertAnalystNote` thread `{ signal }` per the K1 pattern at [`apiClient.ts:27, 119`](../../../apps/admin/src/lib/apiClient.ts).

### 3.6 Partial PUT rationale

Single-path delta, not full-map replace, because:
- Autosave debounced 500 ms; bandwidth-light when the analyst edits one note at a time
- Matches `resortUpsert`'s precedent (partial top-level fields with server-side deep-merge)
- Natural mental model: "I edited slopes_km's note; tell the server"

Server validates the *full* `WorkspaceFile` after merge — atomic semantics; the existing `superRefine` invariants stay enforced.

---

## 4. Sanitizer architecture

### 4.1 Library: `unified` ecosystem

- `unified` (pipeline)
- `remark-parse` (Markdown → MDAST)
- `remark-gfm` (GFM extensions: tables, task lists, strikethrough, autolinks)
- `remark-rehype` with `{ allowDangerousHtml: true }` (MDAST → HAST, raw HTML preserved as HAST nodes)
- `rehype-raw` (parse raw HTML in the AST)
- `rehype-external-links` with `{ target: '_blank', rel: ['nofollow', 'noopener', 'noreferrer'], protocols: ['http', 'https'] }` (auto-inject `rel` to prevent tabnabbing)
- `rehype-sanitize` with the custom Schema below
- `rehypeAnchorRewrite` (custom ~15 LOC pass — rewrites `<a href="#X">` to `<a href="#analyst-X">` so internal anchors hop to the clobber-prefixed `id`s)
- `rehype-stringify` (HAST → HTML string)

**Bundle:** ~150–200 KB gzip on the admin SPA (loopback-only; not a deploy concern but HMR cold-start cost). Mitigated via `React.lazy` on the analyst-notes editor view — bundle splits and only loads when the analyst opens a note for editing.

### 4.2 Module structure

```
packages/schema/src/
  analystNote.ts                   (PR N.a)
  markdownSanitizeSchema.ts        (PR N.b1) — Schema + ID_CLOBBER_PREFIX
  markdown.ts                      (PR N.b1) — renderAnalystNoteMarkdown + rehypeAnchorRewrite
  markdown.test.ts                 (PR N.b1) — plugin-order pin + OWASP corpus + GFM + c2-widening positives
  markdown.fuzz.test.ts            (PR N.b1) — fast-check fuzz: no <script, javascript:, on*=
```

**Sub-export:** `packages/schema/package.json` exports map gains `"./markdown": "./src/markdown.ts"` (verified against the existing pattern: `"./node": "./src/node.ts"` + `"./api": "./api/index.ts"` — bare string values, NOT conditional-object format). The `exports-map.test.ts:18-21` test pins exactly this `./src/*.ts` shape. **`apps/public` cannot accidentally pull `unified`** — barrel imports from `@snowboard-trip-advisor/schema` do not include the markdown surface; consumers must explicitly import from `@snowboard-trip-advisor/schema/markdown`.

### 4.3 Plugin order is a security invariant

The chain is load-bearing — `remark-rehype({allowDangerousHtml:true})` → `rehype-raw` → `rehype-external-links` → `rehype-sanitize` → `rehypeAnchorRewrite` → `rehype-stringify`. Reordering breaks sanitization (e.g., if `rehype-sanitize` runs before `rehype-raw`, raw HTML strings pass straight to the stringifier unsanitized).

Pinned by `markdown.test.ts`:

```ts
it('plugin order is the documented security invariant', () => {
  const names = processor.attachers.map((a) => a[0].name)
  expect(names).toStrictEqual([
    'remarkParse', 'remarkGfm', 'remarkRehype', 'rehypeRaw',
    'rehypeExternalLinks', 'rehypeSanitize', 'rehypeAnchorRewrite',
    'rehypeStringify',
  ])
})
```

### 4.4 Allowlist Schema

**File:** `packages/schema/src/markdownSanitizeSchema.ts` (NEW)

Extends `rehype-sanitize`'s `defaultSchema` (GFM-aware baseline) with:

- **ADD tags:** `details`, `summary`, `kbd`, `sub`, `sup`, `mark`, `figure`, `figcaption`, `abbr`, `dfn`, `cite`, `q`, `time`, `div`, `span`.
- **ADD attributes:**
  - `<a>`: `href`, `title`, `rel`, `target` (with M2 auto-injection)
  - `<img>`: `src`, `alt`, `title`, `width`, `height`, `loading`
  - `<code>`/`<pre>`: `className` regex-validated `/^language-[\w-]+$/`
  - `<span>`: `className` regex-validated `/^[\w-]+$/`
  - `<h1>`–`<h6>`, `<figure>`: `id` (heading-only — narrowed from `*`)
  - `<details>`: `open`
  - `<th>`, `<td>`: + `colspan`, `rowspan`, `align`
  - `<abbr>`: `title`; `<q>`: `cite`; `<time>`: `datetime`
- **Protocols (explicit enumeration, NOT inheritance):**
  - `href`: `http`, `https`, `mailto`, `irc`, `ircs`, `tel`, `#`
  - `src`: `http`, `https`
  - `cite`: `http`, `https`
- **`clobberPrefix: 'analyst-'`** — prefixes user-supplied `id`/`name` attributes to prevent DOM-clobbering attacks (e.g., `<div id="defaultView">` becomes `<div id="analyst-defaultView">`).

Inherited from `defaultSchema` (do NOT override):
- Block: `<script>`, `<iframe>`, `<style>`, `<object>`, `<embed>`, `<form>`, `<input>`, `<noscript>`, `<template>`
- Block: `on*` event handlers, `srcset`, `crossorigin`, `referrerpolicy`
- Block: `data:`, `javascript:`, `vbscript:` URLs

### 4.5 Render function

**File:** `packages/schema/src/markdown.ts` (NEW)

```ts
/**
 * SECURITY BOUNDARY. The output of this function is rendered via
 * dangerouslySetInnerHTML in analyst-note views. Any change to the
 * plugin chain, plugin order, allowlist schema, or auxiliary passes
 * MUST go through ADR amendment + CODEOWNERS review per AGENTS.md §60.
 *
 * Plugin order is load-bearing:
 *   parse → gfm → rehype(allowDangerousHtml) → raw → externalLinks
 *   → sanitize → anchorRewrite → stringify
 *
 * Locked test in markdown.test.ts pins this sequence by name.
 *
 * Security contract: any input string → output HTML where no script
 * execution is possible in any browser parsing context. Verified by
 * markdown.test.ts XSS corpus (OWASP Filter Evasion Cheat Sheet).
 */
export function renderAnalystNoteMarkdown(markdown: string): string {
  if (typeof markdown !== 'string') {
    throw new TypeError('renderAnalystNoteMarkdown: markdown must be string')
  }
  if (markdown.length === 0) return ''
  return String(processor.processSync(markdown))
}
```

### 4.6 Test corpus

- **OWASP XSS Filter Evasion Cheat Sheet** adopted wholesale: `<script>`, `<img onerror>`, `javascript:` href, `<iframe>`, `<style>`, `<details ontoggle>`, `<svg onload>`, `<math><annotation-xml encoding=text/html><script>` (mXSS classic), `<iframe srcdoc>`, `<noscript>` parser confusion, `<template>` content escapes, CRLF in attribute values, percent-encoded `javascript:` (`javascript&#58;`), reference-style link defs with `javascript:` URLs (`[x][y]\n\n[y]: javascript:...`).
- **GFM correctness:** tables, task lists, autolinks, strikethrough, fenced code blocks with language hints.
- **c2-widening positives:** `<kbd>Cmd+K</kbd>`, `<details open>…</details>`, `<sub>2</sub>`, `<sup>3</sup>`, `<abbr title="…">…</abbr>`, `<figure>…<figcaption>…</figcaption></figure>`.
- **DOM-clobbering:** `<h2 id="head">` → `<h2 id="analyst-head">`; `<a href="#section">` → `<a href="#analyst-section">` via `rehypeAnchorRewrite`. (Uses a heading because §4.4 narrows the `id` allowlist to `<h1>`–`<h6>` + `<figure>`; a `<div id=…>` would have its `id` stripped before the rewrite step ever runs.)
- **Empty / non-string contract:** `renderAnalystNoteMarkdown('') === ''`; `renderAnalystNoteMarkdown(null as never)` throws `TypeError`.

Plus `markdown.fuzz.test.ts` (fast-check): asserts output never contains `<script`, `javascript:`, `on\w+=` (case-insensitive) for any random string input.

### 4.7 Maintenance discipline

- Allowlist widening = ADR-0013 amendment + Subagent Review per AGENTS.md §60.
- New XSS vectors discovered (e.g., via security advisory feeds) land as test additions **before** any allowlist widening.
- `rehype-sanitize` pin: exact version in `package.json`; Dependabot tracks.

### 4.8 ADR-0013 outline

PR N.b1 authors `docs/adr/0013-markdown-sanitizer-choice.md`:

1. **Decision summary** — chosen library + version pin + allowlist scope + render architecture.
2. **Rejected alternatives** — `marked`+`isomorphic-dompurify` (harder to extend allowlist, no typed Schema), `markdown-it`+`DOMPurify` (extra dep surface, no GFM by default), `react-markdown` (produces React elements, not HTML strings; doesn't fit server-side render), `markdown-to-jsx` (doesn't support full raw HTML pass-through).
3. **Allowlist tag-by-tag justification** — each `tagNames` and `attributes` addition cited with use case + threat assessment.
4. **Threat model** — trusted single-analyst input in Phase 1; defense-in-depth against future multi-user lift.
5. **Out of scope** — no CSP (per Epic-4 spec §10.6 admin-is-dev-only); no rate limiting; no content audit log.
6. **Lift conditions** — any move toward multi-author content REQUIRES a fresh threat model + sanitizer config review.

---

## 5. Client state hooks + server concurrency

### 5.1 Hook split (mirrors `useResortDetail` + `useWorkspaceState`)

- **`useAnalystNotes(slug): AnalystNotesGetResponse`** — Suspense-friendly read; module-level dual cache (`cachedPromises` + `cachedFulfilled`) per [ADR-0010](../../adr/0010-usedataset-rejected-promise-pinning.md); subscribed via `useSyncExternalStore`. Mirrors [`useResortDetail.ts`](../../../apps/admin/src/state/useResortDetail.ts) exactly. HMR reset in sibling `.hmr.ts`.
- **`useAnalystNoteDraft(slug, path)`** — per-path write-side state. Mirrors [`useWorkspaceState`](../../../apps/admin/src/state/useWorkspaceState.ts)'s SlugStore pattern; module-level `Map<ResortSlug, SlugNotesStore>`. Per-path `NotesPathState` carries `{ draft, lastSent, status, debounceTimer, abortController }`.

### 5.2 `useAnalystNoteDraft` lifecycle (per-path, mirrors K1 machinery)

The per-path SlugStore makes path-gating implicit — each path has its own `NotesPathState` with its own `abortController` and `rev`. K1's "abort only when the cleared path was in the in-flight body" check is unnecessary because the per-path store eliminates the cross-path interference window.

1. **`setDraft(markdown)`** — `state.draft = markdown; state.status = 'dirty'; state.rev++`. Cancel previous debounce timer; schedule new at 500 ms. Notify subscribers.
2. **Flush (debounce OR `flushNow()`):**
   - Cancel debounce timer.
   - Structural equality short-circuit: if `state.draft === state.lastSent && state.status !== 'save-failed'` → return.
   - `state.abortController?.abort()` (fire-and-forget previous in-flight).
   - Capture `const flightRev = state.rev` (rev-counter race guard).
   - `const localController = (state.abortController = new AbortController()); state.status = 'saving'`. The `localController` capture is the **controller-identity guard** — any subsequent cleanup that clears `state.abortController` MUST first verify `state.abortController === localController`. Without it, a `deleteNote` that runs between this flight's start and its terminal handler will install a fresh controller; clearing unconditionally would lose the ability to abort that newer request.
   - `apiClient.upsertAnalystNote(slug, body, { signal })`.
   - On success:
     - **Rev-counter guard** (mirrors `useWorkspaceState.ts:369-371`): if `flightRev !== state.rev`, a newer `setDraft` / `deleteNote` happened during the flight — skip the prepopulate, leave status as the caller set it (do NOT clobber newer state with this stale response).
     - Else: `state.lastSent = state.draft; state.status = 'saved'`. **Controller-identity guard:** `if (state.abortController === localController) state.abortController = undefined` (else a fresh `deleteNote` / `setDraft` already installed a newer controller — do not clobber it). Then `prepopulateAnalystNotes(slug, merge(slug, response.path, response.note))`. (Do NOT reassign `state.draft` — the analyst may keep editing the same path; preserving the textarea content is the natural UX.)
   - On `AbortError`: **Controller-identity guard:** `if (state.abortController === localController) state.abortController = undefined` (else `deleteNote` / `setDraft` installed a fresh controller after triggering this abort; clearing unconditionally would lose the ability to abort that newer flight, opening a server-side `withSlugLock` ordering race where the stale upsert outraces the delete). Do **not** transition status — `deleteNote` and `setDraft` already updated status before triggering the abort. Mirrors PR 4.6c's path-gated abort branch but path-gating is implicit per the per-path store.
   - On other error (rev-guarded the same way): `state.status = 'save-failed'`.
3. **`deleteNote()`:**
   - `state.rev++` (advances the rev so any in-flight upsert's response will fail the rev guard).
   - `state.abortController?.abort()` (fire-and-forget previous in-flight upsert).
   - `state.draft = ''; state.lastSent = null; state.status = 'saving'`.
   - Capture `const flightRev = state.rev` (same race guard pattern as step 2).
   - PUT `{ markdown: null }` with a FRESH controller — capture both rev and controller: `const localController = (state.abortController = new AbortController())`. Fire-and-forget the previous abort, no polling. The `localController` capture is the **controller-identity guard** (same pattern as step 2): cleanup that clears `state.abortController` MUST verify `state.abortController === localController`, else a fresh `setDraft` mid-flight will be silently disarmed.
   - On success:
     - **Rev-counter guard** (same pattern as step 2): if `flightRev !== state.rev`, a newer `setDraft` / `deleteNote` happened mid-flight — skip the prepopulate, leave status as the caller set it. Without this, a `setDraft('x')` racing the delete response would be clobbered by `prepopulateAnalystNotes(... null)` while the user has 'x' typed.
     - Else: `state.status = 'saved'`. **Controller-identity guard:** `if (state.abortController === localController) state.abortController = undefined`. Then `prepopulateAnalystNotes(slug, merge(slug, path, null))` (note removed from cache). Status terminal-after-success; next `setDraft` re-enters the upsert path with `lastSent === null`.
   - On `AbortError` (the delete itself got aborted by ANOTHER `setDraft`): leave status (the new `setDraft` already updated status); leave `state.abortController` alone (the new `setDraft` already installed its own).
   - On other error (rev-guarded the same way): `state.status = 'save-failed'`.
4. **Unmount:** clean up subscriber; do NOT abort in-flight saves (analyst-walks-away convention); debounce timer lives on the module store (not the component), so the timer fires post-unmount and the flush proceeds without a consumer. Next mount reads the prepopulated value. Documented trade-off: navigation away has up to 500 ms tail latency before the save completes — `flushAllForSlug` on route-change is a Phase 2 question.

### 5.2.1 No tab/window-focus refresh

`useAnalystNotes` does NOT refetch on tab/window focus (matches `useResortDetail`'s mount-only semantics). Phase 1 is single-analyst loopback; the analyst's edits ARE the canonical truth between mounts. Phase 2 multi-user may revisit if cross-tab editing becomes a concern.

### 5.3 Initial-state + cache invalidation contract

- **Initial state** — `draft` initialized from `useAnalystNotes()[path]?.markdown ?? ''` ONLY when `state.paths.get(path) === undefined`. Re-renders use the stored state.
- **`invalidateAnalystNotes(slug)`** — clears `cachedPromises` + `cachedFulfilled`, notifies subscribers. **Does NOT touch drafts** (analyst edits survive cache invalidation).
- **`prepopulateAnalystNotes(slug, response)`** — replaces `cachedFulfilled` + `cachedPromises` with the new response; notifies subscribers.

### 5.4 `flushAll` registry

**File:** `apps/admin/src/state/flushAll.ts` (NEW)

```ts
const flushers: Map<ResortSlug, Set<() => Promise<void> | void>> = new Map()

export function registerSlugFlusher(slug: ResortSlug, fn: () => Promise<void> | void): () => void
export async function flushAllForSlug(slug: ResortSlug): Promise<void>  // Promise.all internally
```

- `useWorkspaceState` and `useAnalystNoteDraft` both register their flushers on mount via `useEffect` (empty deps); deregister returned cleanup runs on unmount.
- `Shell.tsx`'s `onModEnter` callback refactors to `void flushAllForSlug(route.slug)` instead of the direct `useWorkspaceState.flushNow(slug)`.
- React 19 auto-batches the resulting prepopulates within one tick — single re-render even if N flushers complete in the same tick.

### 5.5 Server-side `withSlugLock`

**File:** `apps/admin/server/workspace.ts` (MODIFY)

```ts
const slugLocks = new Map<ResortSlug, Promise<unknown>>()

/**
 * Serializes write operations for a slug. INTRA-PROCESS promise mutex —
 * distinct from `publishDataset`'s `withPublishLock`, which is an
 * INTER-PROCESS file lock (O_EXCL).
 *
 * Phase 1: Vite middleware runs single-process; in-memory Map serializes.
 * Phase 2: Hono service may run multi-instance; lift to inter-process
 *   (Postgres `pg_advisory_lock` or equivalent).
 *
 * Readers do NOT acquire — atomic rename gives readers old-or-new file,
 * never partial.
 */
export async function withSlugLock<T>(slug: ResortSlug, fn: () => Promise<T>): Promise<T> {
  const prev = slugLocks.get(slug) ?? Promise.resolve()
  const next = prev.then(fn, fn)  // run fn after prev settles (success or fail)
  slugLocks.set(slug, next)
  void next.catch(() => {})  // `void` satisfies AGENTS.md §"Code Rules → TypeScript" ("Do not leave promises unhandled. Await them or mark them with `void`."); the `.catch` suppresses unhandled-rejection without rebinding the lock entry
  try {
    return await next
  } finally {
    if (slugLocks.get(slug) === next) slugLocks.delete(slug)  // strict identity compare
  }
}
```

**Critical correctness:** the cleanup compares against the SAME `next` Promise we stored. The bug pattern `slugLocks.set(slug, next.catch(() => {}))` creates a different Promise; cleanup never matches; map leaks. The `void next.catch(() => {})` line in the body suppresses unhandled rejection without rebinding the lock entry — a common gotcha. The `void` prefix is required by AGENTS.md §"Code Rules → TypeScript" (`no-floating-promises`); the `.catch` is what actually attaches a handler.

### 5.6 `resortUpsert` retrofit

**File:** `apps/admin/server/resortUpsert.ts` (MODIFY)

The existing handler reads workspace + published OUTSIDE any lock at `resortUpsert.ts:105-158`. Retrofit moves those reads INSIDE the lock-wrapped function:

```ts
// Path derivation stays at top of handler — unchanged from current
// resortUpsert.ts:97-99 (two-arg signatures verified against
// apps/admin/server/workspace.ts:42 + :109).
const workspaceDir = join(deps.workspaceRoot, 'data', 'admin-workspace')
const publishedPath = join(deps.workspaceRoot, 'data', 'published', 'current.v1.json')
const targetPath = join(workspaceDir, `${slug}.json`)

return withSlugLock(slug, async (): Promise<ResortUpsertResponse> => {
  // MOVED INSIDE the lock — was outside previously
  const [workspaceFile, publishedDoc] = await Promise.all([
    readWorkspaceFileForSlug(workspaceDir, slug),
    readPublishedDocOrNull(publishedPath),
  ])
  // ... existing merge logic (resort / live_signal / editor_modes) ...
  const candidate: unknown = {
    schema_version: 1,
    slug,
    resort: mergedResort,
    live_signal: mergedLive,
    modified_at: ISODateTimeString.parse(new Date().toISOString()),
    editor_modes: mergedModes,
    // MUST carry forward `notes` — §2.2 adds `notes: AnalystNotesMap.default({})`
    // to `WorkspaceFile`, so omitting this key would let `safeParse` fill it with
    // `{}` and `atomicWriteWorkspaceFile` would silently wipe every analyst note
    // for the slug on every resort upsert. `workspaceFile` is the in-scope
    // workspace read (renamed from `existing` in the legacy snippet at
    // `resortUpsert.ts:113`).
    notes: workspaceFile?.notes ?? {},
  }
  // ... atomicWriteWorkspaceFile(targetPath, JSON.stringify(parsed.data, null, 2)) ...
  // ... return response ...
})
```

**Notes-preservation invariant.** Resort upsert and analyst-note upsert are independent write paths against the same `WorkspaceFile` shape. A new candidate-construction test in `apps/admin/server/resortUpsert.test.ts` must pin this carry-forward: seed a workspace fixture with non-empty `notes`, drive a resort field edit through `resortUpsert`, assert the post-write workspace file still contains the original `notes` map verbatim. Without that test, a future refactor that drops the `notes:` line is silent corruption.

This is a structural change to a CODEOWNERS-protected handler — triggers Subagent Review on PR N.b3a. The K1 race-fix client-side assumption is unaffected (response shape unchanged).

### 5.7 apiClient additions

**File:** `apps/admin/src/lib/apiClient.ts` (MODIFY)

```ts
async getAnalystNotes(slug: ResortSlug, options?: { signal?: AbortSignal }): Promise<AnalystNotesGetResponse>
async upsertAnalystNote(
  slug: ResortSlug,
  body: AnalystNoteUpsertBody,
  options?: { signal?: AbortSignal },
): Promise<AnalystNoteUpsertResponse>
```

Both thread AbortSignal per the existing K1 pattern. No `Idempotency-Key` — PUTs are naturally idempotent.

---

## 6. UI

### 6.1 Read-mode affordance

Each `FieldRow` in the durable + live panels gets a `<Button variant="ghost" size="sm">` affordance on the right (next to the existing `ModeToggle`), labeled `"📝 N"` where `N` is the rendered HTML's text-character count (0 when empty).

- `N > 0` → icon filled; tooltip shows first ~80 chars (text-only, no HTML rendering on hover).
- `N === 0` → icon outlined; tooltip shows `"Add note"`.

### 6.2 Edit-mode expansion

Clicking the affordance toggles a `Collapsible`-style expansion that reveals two stacked panels inside the row:

- **Source pane** (top, ~6 rows tall): NEW DS `Textarea` primitive (we don't have one yet; `Input` doesn't support multi-line). Monospace font. `Tab` inserts 2 spaces. Autosave fires 500 ms after last keystroke. Status indicator next to the affordance (`saving…` → `saved` → `save-failed`).
- **Preview pane** (below, min-height matching the source): renders the client-side sanitized HTML via `dangerouslySetInnerHTML`. Small `"sanitized preview"` label in the corner. Live updates ~150 ms after each keystroke (client-side render is cheap).

> **Parent-spec amendment.** Parent spec §3.9 reads "no `dangerouslySetInnerHTML`; Markdown-to-AST parser + sanitizer." The Phase-0 wording over-prescribed the *means* alongside the *requirement*. The actual security requirement is "no UNSANITIZED HTML injection" — satisfied by the shared `renderAnalystNoteMarkdown` (plugin-order test pinned, OWASP corpus pinned, allowlist Schema in `packages/schema/`). The sanitized HTML string output is consumed via `dangerouslySetInnerHTML` ONLY by the analyst-notes view; the sanitizer IS the security boundary; the React API is the only available way to render arbitrary HTML in this codebase. PR N.b1 ships the amendment alongside the sanitizer code per AGENTS.md §95 documentation discipline. See §11.1 for the amendment plan.

### 6.3 Save / cancel / delete

- **Autosave** debounced 500 ms; mirrors the ResortEditor field-value pattern.
- **`mod+enter`** forces immediate flush via `flushAllForSlug(route.slug)`.
- **`Escape`** collapses the row without explicit discard; any pending edits are already in-flight or about to flush — consistent with the rest of the editor's autosave semantics.
- **Delete** = small trash icon `<Button variant="ghost" size="sm" aria-label="Delete note">` at the top-right of the expanded section. Click → direct delete (Phase-1: no confirmation; analyst is alone, no undo needed beyond the workspace directory's filesystem-level version control). Sends `PUT { markdown: null }` and removes from the cache. **`mod+backspace`** keyboard shortcut also triggers delete (matches GitHub-comment-delete convention).

### 6.4 Affordance scope

Only metric fields (rows in the durable + live panels) and Resort attributes that render in the editor. Non-metric fields like `name` / `country` / `region` are set at resort-creation per Epic-4 spec §10.9 and don't currently render rows — they don't get notes affordances until a future "Resort attributes panel" PR. The `NotePath` regex permits them at the schema level for forward compat; the UI gates rendering.

### 6.5 Accessibility

- Affordance is a `<Button>` (DS primitive, focusable, native `disabled` below `md` via the existing `useResponsiveTabOrder` hook).
- Expansion uses `aria-expanded` + `aria-controls`.
- Preview pane has `aria-label="sanitized preview of the note above"`.
- Read-only below `md` per the existing PR 4.6a responsive rule — affordance still renders but disabled.
- Delete button has `aria-label="Delete note"`.

### 6.6 Lazy-load

The analyst-notes editor view (`AnalystNoteSection.tsx`) uses `React.lazy`:

```ts
const AnalystNoteSection = React.lazy(() => import('./AnalystNoteSection'))
```

`FieldRow` renders `<Suspense fallback={null}><AnalystNoteSection ... /></Suspense>` only when the row's `notesExpanded` state is true. The ~150 KB `unified` chunk is only fetched when the analyst clicks "Notes" for the first time. Dashboard, ResortsTable, PublishDialog, PublishHistory — none pull the renderer.

---

## 7. PR stack & workflow

ADR-0012 sketched 3 PRs ((a) schema + (b) sanitizer+endpoints+handlers + (c) UI). The locked design exceeds that; the expansion mirrors Tier 3/4/5 execution-time splits per AGENTS.md PR Sizing Discipline. **Net: 9 stacked PRs** (revised from initial 8-PR sketch after the spec-document-reviewer flagged that N.c1's combined read+write hooks would push it to ~685 LOC; split into N.c1 read + N.c2 write).

### 7.1 The stack

Subagent Review column distinguishes:
- **YES (mech.)** = AGENTS.md §60 mechanical trigger fires automatically per the closed path list (PR touches `packages/schema/**`, `docs/superpowers/specs/**`, or `docs/adr/**`).
- **YES (disc.)** = no mechanical trigger but Subagent Review is the disciplined call for risk reasons (load-bearing handler change, concurrency primitive). Per AGENTS.md §60 paragraph 4: "discretionary subagent review" is allowed and documented in the PR body.
- **NO** = neither mechanical nor discretionary.

| # | Branch | Concern | Files | LOC est. | Subagent Review | Depends on |
|---|---|---|---|---|---|---|
| **N.a** | `analyst-notes/n.a-schema` | `AnalystNote` Zod + workspace `notes` field + forward-compat test | 5–6 | ~80 | **YES (mech.)** — `packages/schema/**` | `main` (this spec merged) |
| **N.b1** | `analyst-notes/n.b1-sanitizer` | `unified` deps + `markdown.ts` + `markdownSanitizeSchema.ts` + plugin-order test + OWASP corpus + fuzz + **ADR-0013** + `package.json` exports map + **parent-spec §3.9 amendment** (see §11.1) | 6–7 | ~250 | **YES (mech.)** — `packages/schema/**` + `docs/adr/**` + `docs/superpowers/specs/**` | N.a |
| **N.b2** | `analyst-notes/n.b2-api` | `packages/schema/api/analystNotes.ts` + barrel + contract snapshot regen + `apiClient.getAnalystNotes` / `upsertAnalystNote` + tests | 5 | ~120 | **YES (mech.)** — `packages/schema/**` | N.a |
| **N.b3a** | `analyst-notes/n.b3a-lock` | `withSlugLock` in `workspace.ts` + lock tests + `resortUpsert` retrofit (reads moved inside lock) + no-regression test | 4 | ~140 | **YES (disc.)** — load-bearing concurrency primitive + handler retrofit; document in PR body | N.a |
| **N.b3b** | `analyst-notes/n.b3b-handler` | `analystNotes.ts` handler (GET + PUT) + handler unit tests + `dispatch.ts` route registration + dispatch tests + bridge integration (concurrent `resortUpsert` + `analystNotesPut` determinism) | 5 | **~400** (over 300 target; justified — single-concern handler + 8+ test cases + bridge integration are inseparable; split would orphan the bridge integration's pre-condition) | **YES (disc.)** — new server endpoint + cross-handler concurrency assertion | N.b1, N.b2, N.b3a |
| **N.c1** | `analyst-notes/n.c1-read-hook` | `useAnalystNotes` (Suspense + `.hmr.ts`) + `flushAll` registry + their tests + `vite.config.ts` HMR coverage-exclusion glob | 5 | ~285 | NO | N.b2 |
| **N.c2** | `analyst-notes/n.c2-write-hook` | `useAnalystNoteDraft` (per-path SlugStore, mirrors `useWorkspaceState` K1 machinery; rev-counter, AbortController, debounce) + comprehensive K1-mirror tests | 2 | **~450** (over 300 target; justified — the SlugStore state machine + 12+ K1-mirror test cases are inseparable; mirror of `useWorkspaceState.ts`'s 721 LOC pattern but ~38% smaller per-path scope) | NO | N.c1 |
| **N.c3** | `analyst-notes/n.c3-flush-refactor` | `useWorkspaceState` retrofit (register via `flushAll` instead of direct flushNow) + `Shell.tsx` `onModEnter` refactor + tests | 4 | ~60 | NO | N.c2 |
| **N.c4** | `analyst-notes/n.c4-ui` | `AnalystNoteSection.tsx` (the inline expanded editor) + `FieldRow.tsx` modify (lazy-load notes section + affordance) + UI tests + UI bridge integration (full flow: open → type → debounce → save → see preview → delete) | 5–6 | ~280 | NO | N.b3b, N.c3 |

**Totals:** 9 PRs · ~2,060 LOC added · 5 PRs trigger Subagent Review (3 mechanical + 2 discretionary). Two PRs (N.b3b, N.c2) exceed the 300 LOC target with inline justification; both are inseparable single-concern PRs whose split would orphan test pre-conditions.

### 7.2 Parallelism

- **N.b1 ‖ N.b2 ‖ N.b3a** — all three branch from N.a; no shared files (sanitizer/`markdown.ts` vs API types vs server `workspace.ts`). Three independent reviewers could fold in parallel.
- **N.c1** strictly serial after N.b2 (consumes API types via apiClient).
- **N.c2** strictly serial after N.c1 (consumes `flushAll` from N.c1).
- **N.c3** strictly serial after N.c2 (refactors `useWorkspaceState` to use `flushAll`; depends on N.c1's `flushAll` and N.c2's pattern).
- **N.c4** strictly serial after N.c3 + N.b3b (consumes the hooks + the server routes).

### 7.3 TDD discipline (cross-cutting, every PR)

- Each PR's plan task list orders **tests before implementation** per AGENTS.md "TDD Workflow" + saved memory `feedback_tdd_in_plans_and_specs.md`.
- Coverage 100% × 4 throughout (line / branch / function / statement).
- Pre-commit hook runs `npm run qa` per the SessionStart enforcement summary.

### 7.4 Per-PR workflow (every PR)

1. **Plan write** (using `superpowers:writing-plans`) — TDD-ordered task list against this spec; section reviewer for any user-facing UX section.
2. **Subagent Review** (for the 4 PRs that touch CODEOWNERS-protected paths).
3. **Open PR + `@codex review`** — per saved memory `feedback_codex_review_per_pr.md`. Wait for review, fold findings, REST cross-check both `/issues/<N>/comments` and `/pulls/<N>/comments` endpoints with `jq 'sort_by(.created_at) | reverse'` every round, resolve threads via GraphQL.
4. **Local test plan** — per saved memory `feedback_local_test_per_pr.md`. Run `npm run qa`, dev-server smoke, Playwright MCP browser checks where UI changes ship (N.c4 in particular; lighter smoke on N.c1–N.c3 since they're state-only). Execute, don't describe.
5. **Maintainer merge**.

---

## 8. ADRs

In flight at spec time:

- [ADR-0013](../../adr/) — Markdown sanitizer choice (lands with PR N.b1).

No additional ADRs anticipated for this follow-up. If new architectural decisions emerge during implementation (e.g., a Phase-1 concession that requires explicit documentation), they get an ADR at that time.

---

## 9. Out of Scope

- **Multi-user audit** — tracking *who* wrote each note. Phase 2 only.
- **Per-field-name sanitization variance** — every field uses the same allowlist.
- **Markdown linting / formatting helpers** — no auto-prettify on save.
- **Note search / filter UX** — no `?notes=keyword` route.
- **Note export / import** — analyst can `cat data/admin-workspace/*.json` if they want a dump.
- **Notes on non-metric fields (UI)** — schema permits, UI defers. Future "Resort attributes panel" PR will widen the affordance scope.
- **Allowlist widening for `<iframe>`, `<style>`, `<noscript>`, `<template>`** — explicitly out of scope; would require a fresh ADR + threat model.

---

## 10. Operational concerns

### 10.1 Cold-start interaction with Epic-4 §10.9

The analyst-notes PUT handler hydrates a workspace file from the published doc if no workspace file exists (mirrors `resortUpsert.ts:117-127`). The analyst can add a note to a resort that exists only in `data/published/current.v1.json` without first running an explicit `resortUpsert`. The resulting workspace file carries the published Resort data + the new note.

If neither workspace nor published has the slug → 404 `not-found`. There is no mechanism to create a brand-new resort via the analyst-notes endpoint; that path stays on `resortUpsert` per Epic-4 spec §10.9.

### 10.2 Phase 2 lift

The Phase 1 → Phase 2 transition for analyst notes is additive:
- `withSlugLock` lifts to inter-process (Postgres `pg_advisory_lock` or equivalent).
- The wire contract (`AnalystNotesGetResponse` + `AnalystNoteUpsertBody` + `AnalystNoteUpsertResponse`) stays unchanged. SPA `apiClient` unchanged.
- The sanitizer schema is Phase-2-stable. Any allowlist tightening / widening requires ADR amendment.
- Multi-user enters as a new field on `AnalystNote` (e.g., `author: UserID`). Workspace file's `.loose()` accepts the new field; existing Phase-1 files (without `author`) parse as before.

### 10.3 Performance budget

| Operation | Cold | Warm |
|---|---|---|
| `processor.processSync('# Hello\n\nworld')` | ~30 ms | ~1–3 ms |
| `processor.processSync(5KB-of-markdown)` | ~50 ms | ~5–10 ms |
| GET response render (12 notes × 5 KB each) | ~60–80 ms | ~12–24 ms |
| PUT response render (1 note × 5 KB) | — | ~5–10 ms |

Synchronous render is fine for the handler — sub-100 ms is well below the SPA's perceptible latency budget. Live-preview client-side render fires debounced 150 ms after keystroke; render itself is ~5 ms — no UI jank.

### 10.4 Bundle impact

- **`apps/admin`** gains ~150 KB gzip when the analyst opens a note (lazy-loaded chunk). Initial admin SPA bundle stays at its current size.
- **`apps/public`** unchanged — sub-export `@snowboard-trip-advisor/schema/markdown` is NOT in the barrel; public app cannot accidentally pull `unified`.
- **`packages/schema`** distribution: `dist/markdown.js` ships as a separate entry point; tree-shaking continues to work.

### 10.5 Security maintenance

- **Dependabot** tracks `rehype-sanitize`, `rehype-raw`, `remark-gfm`, `unified` exact versions.
- **CODEOWNERS** protects `packages/schema/src/markdown.ts` and `packages/schema/src/markdownSanitizeSchema.ts`.
- **XSS corpus expansion** — new vectors from security advisory feeds (e.g., HackerOne reports, OWASP updates) land as test additions before any allowlist widening.
- **Phase 1 single-analyst threat model** — the analyst is the trusted maintainer; the sanitizer is defense-in-depth against accidental paste of malicious content (e.g., a Stack Overflow snippet that happens to contain `<script>`). The boundary becomes load-bearing in Phase 2 when multi-user content lands.

---

### 10.6 Notes-on-resort-delete (forward-compat)

Phase 1 has no resort-deletion endpoint per Epic-4 spec §10.9; manual deletion is `rm data/admin-workspace/<slug>.json`. If the analyst deletes the workspace file by hand, the notes go with it (correct behavior).

When Phase 2 introduces a deletion endpoint (`DELETE /api/resorts/:slug` per parent §13), the handler must also handle orphan-notes cleanup. Either: (a) cascade delete (the resort and its notes go together), or (b) preserve notes under a separate "deleted-resorts" namespace for audit. ADR-TBD will pick.

---

## 11. Verification & next steps

### 11.1 Parent-spec amendment (co-ships with PR N.b1)

Per §6.2 above, parent spec [`docs/superpowers/specs/2026-04-22-product-pivot-design.md`](2026-04-22-product-pivot-design.md) §3.9 reads:

> Per-resort, per-field Markdown-formatted notes stored alongside the workspace. Rendered safely (no `dangerouslySetInnerHTML`; Markdown-to-AST parser + sanitizer). Not published; internal-only.

PR N.b1 amends to:

> Per-resort, per-field Markdown-formatted notes stored alongside the workspace. Rendered safely via a Markdown-to-AST parser + allowlist sanitizer (`@snowboard-trip-advisor/schema/markdown`); the sanitized HTML output is consumed via `dangerouslySetInnerHTML` ONLY by the analyst-notes view, which is the sanctioned single boundary. The sanitizer config is the security boundary; see `packages/schema/src/markdownSanitizeSchema.ts` and ADR-0013. Not published; internal-only.

The amendment ships alongside the sanitizer implementation per AGENTS.md §95 documentation discipline. Subagent Review fires mechanically per §60 (`docs/superpowers/specs/**` is in the trigger list).

### 11.2 Verification steps

1. **This spec** lands on `main` via a docs-only PR. Spec-document-reviewer subagent runs against this doc; findings fold into the same branch before maintainer review.
2. Maintainer reviews the committed spec.
3. `superpowers:writing-plans` produces the implementation plan against this spec — one plan file per PR in the stack, or one plan file decomposing all 9 PRs (mirroring Tier 3's plan structure).
4. `superpowers:using-git-worktrees` + `superpowers:subagent-driven-development` execute the plan PR by PR, honoring the parallelism opportunities in §7.2.
5. ADR-0013 lands in PR N.b1 (alongside the sanitizer implementation).
6. The follow-up closes before any Epic 5 scoping begins — per ADR-0012's "ships before Epic 5" framing.

---

## Appendix A — Reviewer-fold log

Format mirrors the Tier-3 / Tier-4 / Tier-5 plan reviewer-fold logs.

### Spec-document-reviewer rounds (during brainstorming)

- **Round 1 (2026-05-12)** — 10 MUST-FIX + 11 SHOULD-FIX + 6 NIT folded into commit `272a067`. Highlights: ErrorCode enum value (`internal` not `internal-error`); `Buffer.byteLength` → `TextEncoder` for Node + browser compatibility; `readWorkspaceFileForSlug(workspaceDir, slug)` signature; `atomicWriteWorkspaceFile(targetPath, body)` signature; `Route.pathPattern` field name + RouteHandler wrapping; `packages/schema/package.json` exports map uses bare strings (`"./src/markdown.ts"`); Subagent Review triggers split mechanical-vs-discretionary per AGENTS.md §60 closed list; 9 PRs (not 8) after splitting N.c1 read+write; lifecycle typo fix (`state.draft = state.lastSent` no-op dropped); rev-counter race guard on upsert success branch (mirrors `useWorkspaceState.ts:369-371`); render-pipeline exception path; fs error path; parent-spec §3.9 amendment scoped to PR N.b1 to justify `dangerouslySetInnerHTML`.
- **Round 2 (2026-05-12)** — 1 MUST-FIX + 1 SHOULD-FIX folded into commit `1518ea3`. M3: HandlerDeps is `{ workspaceRoot: string }` only (not `{ workspaceRoot, publishedPath }`); handlers derive both paths in-body per the two-line snippet at `resortDetail.ts:33-34` / `resortUpsert.ts:97-99`. S1: rev-counter guard extended to `deleteNote` success + error branches (was only on upsert in round 1).
- **Round 3 (2026-05-12)** — 1 MUST-FIX + 1 NIT folded into a follow-up commit. M4: §5.6 `resortUpsert` retrofit snippet still showed single-arg `readWorkspaceFileForSlug(slug)` / `readPublishedDocOrNull(slug)` after round 2's §3.2 fix; updated to match the codebase + show the path-derivation lines above the lock-wrapped function. N1: this appendix backfilled (was placeholder).

(Future Codex / subagent rounds during PR execution will append here as each PR ships.)
