# Gallery smoke (per-PR cascade verification — identical every PR)

From the MAIN checkout `/Users/matheusbarone/Projects/snowboard-trip-advisor`
with this branch checked out there (or post-merge on `main`):

1. `npm run dev:admin` (admin dev server, binds 127.0.0.1:5174).
2. Playwright MCP: `browser_navigate` → `http://127.0.0.1:5174/?route=gallery`.
3. For each component this PR styled, `browser_evaluate` `getComputedStyle`
   on the component's **own design-system styled root** (its `.sta-<name>`
   class node), NOT on the `[data-gallery-component="<Name>"]` wrapper.
   Assert it resolves token-derived values (non-default `background-color`
   / `border` / `color` / `font-family`, NOT the defaults
   `rgba(0, 0, 0, 0)` / `Times`).
4. Repeat under emulated dark via the MCP color-scheme emulation if available,
   else document dark is verified by the S0 `@media` cascade + a second
   OS-level check. Record BOTH results in the PR body. A default/unstyled
   computed value = the CSS import didn't take — STOP and investigate before
   claiming success.

## Smoke-target rule (generalizable — every S1 PR follows this)

The `[data-gallery-component="<Name>"]` `<section>` is an **anchor / human
label only**. It is NOT the node to measure: none of the S1 design-system
components forward an arbitrary `data-*` onto their own `.sta-*` root, and the
portalled ones render their styled node OUTSIDE the gallery section entirely
(via a Radix or provider portal appended to `document.body`). Measuring the
section wrapper would read inherited page styles and miss broken component
CSS. So target the component's own root selector:

- **Inline components** (styled root is a descendant of its section — e.g.
  Table → `<table class="sta-table">`): query the root from the section to
  scope it precisely:
  `document.querySelector('[data-gallery-component="Table"] .sta-table')`.
- **Portalled components** (styled root is rendered through a portal OUTSIDE
  its section — e.g. Drawer → `<div class="sta-drawer">` via Radix
  `Dialog.Portal`): query the `.sta-<name>` root directly off `document`,
  since it is NOT a descendant of the section:
  `document.querySelector('.sta-drawer')`.
- **Provider-rendered components** (styled root is rendered by a context
  provider, NOT a portal — e.g. Toast → `<div class="sta-toast">` via the
  gallery-LOCAL `<ToastProvider>` that wraps the Toast exemplar; S1.0 Codex
  P2 scoping fix): the node is an inline child of the Toast section rather
  than portalled to `document.body`, but the gallery still mounts exactly
  one Toast exemplar, so querying `.sta-toast` directly off `document`
  resolves it regardless of nesting depth:
  `document.querySelector('.sta-toast')`. (Querying off `document` — not the
  section — also keeps the selector identical to the old app-wide-provider
  shape, so no smoke step changes.)

General rule for any future component (Modal `.sta-modal`, Popover
`.sta-popover`, Tooltip `.sta-tooltip`, DropdownMenu `.sta-dropdown-menu`,
etc.): the smoke target is always the component's own `.sta-<component>`
root class. Scope it with the `[data-gallery-component]` section when the
root renders inside that section; query it directly off `document` when the
component portals its root out. If unsure whether a component portals, query
`.sta-<component>` off `document` (it resolves whether portalled or not, as
long as exactly one instance is mounted on the gallery — which the gallery
guarantees by rendering one exemplar per component).

The three S1.0 exemplars and their exact targets:

| Component | Renders | Smoke target |
|-----------|---------|--------------|
| Table  | inline in section    | `[data-gallery-component="Table"] .sta-table` |
| Toast  | gallery-local `<ToastProvider>` (inline child of Toast section, NOT portalled) | `.sta-toast`  |
| Drawer | portal (Radix `Dialog.Portal`) | `.sta-drawer` |

The Toast exemplar is shown on mount with an effectively-non-expiring
`dismissAfterMs` (24h) so `.sta-toast` stays in the DOM for the duration of
the smoke — Toast has no `persist` option, and its per-variant default
(success = 5000ms) would otherwise auto-dismiss it before measurement. As of
the S1.0 Codex P2 scoping fix the exemplar is wrapped in a gallery-LOCAL
`<ToastProvider>` (not Shell's app-wide one) so the toast is destroyed the
instant the gallery route unmounts instead of persisting app-wide for 24h;
the 24h value is retained but is now capped by the route lifetime. The smoke
target is unchanged — still `document.querySelector('.sta-toast')`, exactly
one instance while on `?route=gallery`. The Drawer exemplar is seeded `open`
so `.sta-drawer` is mounted. No click is needed for either.

NOTE: this smoke is NOT runnable from a git worktree (worktree has no
node_modules; the app dev server resolves @snowboard-trip-advisor/design-system
via the main-checkout symlink → pre-branch code). Run from the main checkout
with the branch checked out, or post-merge.
