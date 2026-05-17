# Gallery smoke (per-PR cascade verification — identical every PR)

From the MAIN checkout `/Users/matheusbarone/Projects/snowboard-trip-advisor`
with this branch checked out there (or post-merge on `main`):

1. `npm run dev:admin` (admin dev server, binds 127.0.0.1:5174).
2. Playwright MCP: `browser_navigate` → `http://127.0.0.1:5174/?route=gallery`.
3. For each component this PR styled, `browser_evaluate` `getComputedStyle`
   on its `[data-gallery-component="<Name>"]` root: assert it resolves
   token-derived values (non-default `background-color` / `border` / `color`
   / `font-family`, NOT the defaults `rgba(0, 0, 0, 0)` / `Times`).
4. Repeat under emulated dark via the MCP color-scheme emulation if available,
   else document dark is verified by the S0 `@media` cascade + a second
   OS-level check. Record BOTH results in the PR body. A default/unstyled
   computed value = the CSS import didn't take — STOP and investigate before
   claiming success.

NOTE: this smoke is NOT runnable from a git worktree (worktree has no
node_modules; the app dev server resolves @snowboard-trip-advisor/design-system
via the main-checkout symlink → pre-branch code). Run from the main checkout
with the branch checked out, or post-merge.
