# ADR-0005: Theme switches via CSS `prefers-color-scheme`; no JS theme branching

- **Status:** Accepted
- **Date:** 2026-04-28
- **Deciders:** @mathvbarone
- **Related spec:** [`docs/superpowers/specs/2026-04-22-product-pivot-design.md`](../superpowers/specs/2026-04-22-product-pivot-design.md) §6.4
- **Related ADRs:** [ADR-0001](./0001-pivot-to-data-transparency.md)

## Context

Two failure modes drive this decision.

1. **First-paint flash.** The browser-standard "read `prefers-color-scheme` from JS, then set `data-theme` on `<html>`" pattern requires JavaScript to run before the first paint. On any non-trivial bundle that JS doesn't run before the browser flashes the default theme — the user sees a light-mode layout for a frame, then a dark-mode swap when JS loads. The only reliable mitigation is an inline `<script>` at the top of `<head>` that synchronously reads the media query and sets the attribute.
2. **CSP forbids the inline-script mitigation.** The project's CSP is `script-src 'self'` (spec §6.5). Inline scripts are blocked by construction; nonce-based exceptions add deployment complexity that Phase 1 explicitly avoids (no SSR, no per-request HTML rewriting, static-file deploy only).

The combination — flash without inline script, no inline script available — means JS-driven theme branching is not viable for this app. The remaining options are: ship CSS that branches on `prefers-color-scheme` natively, or ship a single theme.

The `tokens.ts` → `tokens.css` generator (Epic 1 PR 1.4) already emits CSS custom properties under a `:root` selector. Extending the generator to emit a `@media (prefers-color-scheme: dark)` block alongside is a localized change with no consumer-side implications: components reference `var(--color-bg)` regardless of theme.

## Decision

**Theme switches happen entirely in CSS, via `@media (prefers-color-scheme: dark)` in the generated `tokens.css`. No JavaScript reads the theme; no component branches on it.**

Concretely:

1. **Tokens are semantic, not theme-scoped.** A token name describes its role (`--color-bg`, `--color-fg`, `--color-border-subtle`), never its value (`--color-dark-bg`, `--color-light-fg`). The generator emits the light values under `:root` and dark overrides under `@media (prefers-color-scheme: dark) { :root { ... } }`.
2. **Components consume tokens unconditionally.** Every component references `var(--color-bg)` etc.; the resolved value flips when the OS theme flips. No component-level theme awareness.
3. **A future manual toggle is purely additive.** If a per-user theme override is added later (Phase 2 or later), it overlays the media query as `:root[data-theme=light] { ... }` / `:root[data-theme=dark] { ... }` rules generated alongside the media-query block. The component-side code does not change. The toggle UI sets `document.documentElement.dataset.theme`; the flash problem returns *only* for users who actively opt into the manual override, and at that point we have explicit consent for one extra paint.
4. **`useMediaQuery` is reserved for layout-affecting media queries** — `prefers-reduced-motion` (animation gating) and the `md` breakpoint check (admin-app affordance gating, ADR-0002 follow-on). Theme is *never* read via `useMediaQuery`.

## Consequences

### Positive

- **No first-paint flash, ever, in Phase 1.** The browser resolves the media query before paint; the cascade applies dark or light tokens immediately. The user never sees the wrong theme.
- **No CSP exception required.** `script-src 'self'` stands; no nonces, no inline-script audit.
- **Testing is simpler.** Visual regression covers two states (light, dark) by toggling the OS-level media query in the harness — no app-state setup needed.
- **Bundle is smaller.** Zero JS for theme handling. The token CSS file gains one `@media` block; no JavaScript ships.

### Negative / costs

- **No manual theme toggle in Phase 1.** Users who want to override their OS preference cannot. This is the explicit trade — and is reversible by the additive `[data-theme=…]` rule described in the Decision.
- **Both themes have to be designed in lockstep.** Every token gets a light and a dark value; we cannot ship one and add the other later without a CSS regeneration. Acceptable cost — the designer is producing both anyway.

### Neutral / follow-on

- The token generator's contract widens by one keyword (`darkOverrides`) but the consumer-side type contract is unchanged.
- Future advanced themes (high-contrast, sepia, season-themed) are *additional* media-query branches in the generator, not new architectural surface.

## Alternatives considered

### A. JS reads the media query and sets `data-theme`

Rejected because the first-paint flash requires an inline `<script>` mitigation that CSP forbids. Even with the mitigation, the JS path is more code, more state, and a synchronization burden between media-query observation and DOM attribute writes.

### B. Ship light-only in Phase 1, defer dark to Phase 2

Rejected because dark mode is a low-cost addition to the CSS generator (one extra block) and is part of the visual reference already. Deferring it adds zero engineering benefit and removes a real user feature.

### C. Server-side theme detection from the `Sec-CH-Prefers-Color-Scheme` client hint

Rejected because Phase 1 ships as static files with no server-side rendering. There is no place to read the hint and emit divergent HTML.

## Notes

- The spec §6.4 inventory specifies a token system but does not pin the *theme-switching mechanism*. This ADR pins it.
- The `@media` block lives inside `tokens.css` so consumer components remain ignorant of the theme axis. Token-name discipline (semantic, never theme-scoped) is enforced by review; no automated lint rule today.
