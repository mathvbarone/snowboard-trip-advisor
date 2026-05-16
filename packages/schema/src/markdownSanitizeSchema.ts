import { defaultSchema } from 'rehype-sanitize'
import type { Options as Schema } from 'rehype-sanitize'

/**
 * SECURITY BOUNDARY (allowlist). This Schema is the value passed to
 * `rehype-sanitize` in the analyst-note render pipeline. It is an
 * ADDITIVE widening of `rehype-sanitize`'s `defaultSchema` (an
 * allowlist model — anything not listed is stripped).
 *
 * Any change here MUST go through ADR-0013 amendment + Subagent Review
 * per AGENTS.md §60. See spec §4.4 for the tag-by-tag justification and
 * `docs/adr/0013-markdown-sanitizer-choice.md` for the threat model.
 */

/**
 * Clobber prefix applied to user-supplied `id` / `name` attributes to
 * neutralise DOM-clobbering attacks (e.g. `<div id="defaultView">`
 * becomes `id="analyst-defaultView"`). Exported so `rehypeAnchorRewrite`
 * in `markdown.ts` can rewrite internal anchors to the same prefix.
 */
export const ID_CLOBBER_PREFIX = 'analyst-'

const HEADING_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const

// `rehype-sanitize`'s `defaultSchema` is a frozen library constant that
// ALWAYS defines `attributes` (with a `'*'` key) and `tagNames`. The
// `Schema` type marks them optional, but a `?? {}` / `?? []` fallback here
// is unreachable dead code (the project bans inline coverage suppression —
// vite.config.ts "Coverage Rules"). Assert the invariant once via typed
// non-null assertions; the disables are scoped to these three lines and
// justified by the frozen-constant invariant above.
type SchemaAttributes = NonNullable<Schema['attributes']>
type SchemaTagNames = NonNullable<Schema['tagNames']>

/* eslint-disable @typescript-eslint/no-non-null-assertion -- defaultSchema is a frozen library constant; attributes/'*'/tagNames are always defined (a ?? fallback would be uncovered dead code) */
const baseAttributes: SchemaAttributes = defaultSchema.attributes!
const baseTagNames: SchemaTagNames = defaultSchema.tagNames!
const baseUniversal: NonNullable<SchemaAttributes['*']> = baseAttributes['*']!
/* eslint-enable @typescript-eslint/no-non-null-assertion */
// `defaultSchema` does NOT define per-tag `th`/`td` attribute lists (the
// GFM cell attrs ride on `'*'`). We grant `colspan`/`rowspan`/`align`
// explicitly below; there is no base list to spread.

// `defaultSchema.attributes['*']` permits `id` globally. §4.4 narrows the
// `id` allowlist to headings + <figure> only — strip `id` from the
// universal list and re-grant it per-tag below. `name` is intentionally
// dropped entirely (no <input name>; the GFM task-list carve-out below
// admits only `type` + `disabled` + `checked`).
const universalAttributes = baseUniversal.filter(
  (attr) => attr !== 'id' && attr !== 'name',
)

const headingIdAttributes: SchemaAttributes = Object.fromEntries(
  HEADING_TAGS.map((tag) => [tag, ['id']]),
)

// `defaultSchema.tagNames` inherits `picture` + `source`, and
// `defaultSchema.attributes.source = ['srcSet']`. §4.4 allows only
// `<img>` (src/alt/title/width/height/loading) — `<picture>`/`<source>`
// and `srcset`/`srcSet` are NOT in the intended allowlist. The explicit
// `protocols` map below does NOT define `srcSet`, and `hast-util-sanitize`
// treats an attribute with no protocol entry as unrestricted, so an
// inherited `<source srcset="javascript:…">` (or a `data:` candidate)
// would survive unvalidated (Codex P2). Strip both tags from the inherited
// `tagNames` AND null the inherited `attributes.source` grant below —
// defense-in-depth: the tag is gone, and even a residue `<source>` from a
// future plugin carries no URL-bearing attribute.
const INHERITED_IMG_FALLBACK_TAGS: ReadonlySet<string> = new Set([
  'picture',
  'source',
])
const tagNamesWithoutImgFallback = baseTagNames.filter(
  (tag) => !INHERITED_IMG_FALLBACK_TAGS.has(tag),
)

// Typed explicitly so the regex-validated tuples (`['className', /…/]`)
// and the value-restricted `input` carve-out infer as `PropertyDefinition`
// tuples rather than widening to `(string | RegExp)[]`.
const attributes: SchemaAttributes = {
  ...baseAttributes,
  '*': universalAttributes,
  // Override the inherited `attributes.source = ['srcSet']` (Codex P2).
  // `srcSet` carries a URL but has no `protocols` entry, so it would be
  // waved through unvalidated. `<source>` is also dropped from `tagNames`
  // above; this empty grant is the defense-in-depth second layer.
  source: [],
  ...headingIdAttributes,
  figure: ['id'],
  a: ['href', 'title', 'rel', 'target'],
  img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
  code: [['className', /^language-[\w-]+$/]],
  pre: [['className', /^language-[\w-]+$/]],
  span: [['className', /^[\w-]+$/]],
  details: ['open'],
  th: ['colspan', 'rowspan', 'align'],
  td: ['colspan', 'rowspan', 'align'],
  abbr: ['title'],
  q: ['cite'],
  time: ['datetime'],
  // GFM task-list carve-out — value-restricted `type` plus the boolean
  // attributes GFM emits for `- [x] / - [ ]`. `rehypeStripStrayInputs`
  // (runs AFTER sanitize) removes any <input> not matching this shape.
  input: [['type', 'checkbox'], 'disabled', 'checked'],
}

export const analystNoteSanitizeSchema: Schema = Object.freeze({
  ...defaultSchema,
  // Explicit clobber prefix — overrides defaultSchema's 'user-content-'.
  clobberPrefix: ID_CLOBBER_PREFIX,
  clobber: defaultSchema.clobber,
  // `required` (defaultSchema.input → {disabled:true,type:'checkbox'})
  // INJECTS the missing attrs onto a non-conforming <input>, which would
  // make `<input type="text">` survive as a synthesised disabled checkbox
  // and let `rehypeStripStrayInputs` wave it through. Drop it so the
  // post-sanitize pass is the SOLE input-shape gate (spec §4.1 / §4.4).
  required: {},
  // `strip` drops the listed tags AND their subtree (vs the default
  // unwrap-to-text behaviour). Without this, `<style>…javascript:…</style>`
  // and the `<noscript>` parser-confusion vector leak their bodies as
  // text/attribute nodes. `script` is defaultSchema's only strip entry;
  // extend it to every never-render container (spec §4.4 inherited blocks).
  strip: [
    'script', 'style', 'noscript', 'template',
    'iframe', 'object', 'embed', 'form',
  ],
  // ADD tags (spec §4.4) on top of the inherited base list, MINUS
  // `picture`/`source` (Codex P2 — filtered via INHERITED_IMG_FALLBACK_TAGS
  // above; spec §4.4 allows only `<img>`). `input` is still inherited (GFM
  // task-list carve-out); the post-sanitize `rehypeStripStrayInputs` pass
  // enforces the exact `type="checkbox"` + `disabled` shape.
  tagNames: [
    ...tagNamesWithoutImgFallback,
    'details', 'summary', 'kbd', 'sub', 'sup', 'mark',
    'figure', 'figcaption', 'abbr', 'dfn', 'cite', 'q',
    'time', 'div', 'span',
  ],
  attributes,
  // Explicit protocol enumeration (NOT inherited). `data:`, `javascript:`,
  // `vbscript:` are absent → stripped. Relative / fragment (`#…`) hrefs
  // carry no scheme and are admitted by rehype-sanitize's no-colon rule.
  protocols: {
    href: ['http', 'https', 'mailto', 'irc', 'ircs', 'tel'],
    src: ['http', 'https'],
    cite: ['http', 'https'],
  },
})
