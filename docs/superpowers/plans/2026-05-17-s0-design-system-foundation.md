# S0 — Design-system Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the already-generated design tokens reach both apps' DOM, bring the token generator into ADR-0005 compliance (emit `@media (prefers-color-scheme: dark)`, drop the dead `[data-theme]` block), and add a minimal hand-written reset/base — styling no components or screens.

**Architecture:** Pure-function generator change (`scripts/generate-tokens.ts`) + regenerated `tokens.css` artifact + a new hand-written `base.css` + barrel side-effect imports in `packages/design-system/src/index.ts`. No `apps/*` source is edited; propagation rides the existing barrel side-effect mechanism that already loads `utilities.css`.

**Tech Stack:** TypeScript, Vitest (root project for `scripts/**`, jsdom project for `packages/design-system`), hand-written CSS, `npm run qa` gate.

**Spec:** [`docs/superpowers/specs/2026-05-17-s0-design-system-foundation-design.md`](../specs/2026-05-17-s0-design-system-foundation-design.md) (commit `5de4591`).

---

## Critical execution constraints (read before Task 1)

- **Pre-commit runs full `npm run qa`** on any non-docs commit (lint → check:agent-discipline-sync → typecheck → coverage → tokens:check → test:hooks → test:integration). A commit containing a *failing* test will be **rejected** by the hook. Therefore: within each task, write the test → run it red (do **not** commit) → implement → run it green → run `npm run qa` → **then** commit. Never commit at the red step.
- **`--no-verify` and force-push to main are hook-blocked.** Do not attempt them. If qa fails, fix the root cause.
- **`tokens.css` is a generated artifact.** After the generator change you MUST run `npm run tokens:generate` and commit the regenerated file in the same commit; the `tokens:check` qa step runs `tokens:generate && git diff --exit-code packages/design-system/tokens.css` and fails on drift.
- **Worktree discipline:** all paths below are relative to the worktree root `/Users/matheusbarone/Projects/snowboard-trip-advisor/.claude/worktrees/great-blackburn-ae704f`. Verify edits land here with `git status` in the worktree, not via Read.
- **One atomic PR**, ~5 commits / 5 files (within the ≤300 LOC / ≤8 files / ≤5 commits ceiling).

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `scripts/generate-tokens.ts` | Pure CSS renderer from `tokens.ts` | Modify emission (lines 44–50) |
| `scripts/generate-tokens.test.ts` | Generator unit tests (root vitest project) | Modify the dark-scope test |
| `packages/design-system/tokens.css` | Generated token artifact | Regenerate (committed) |
| `packages/design-system/src/base.css` | Minimal global reset/base | **Create** |
| `packages/design-system/src/base.css.test.ts` | base.css text-presence test (ds jsdom project) | **Create** |
| `packages/design-system/src/index.ts` | Package barrel + CSS side-effect loader | Add 2 imports |
| `packages/design-system/src/index.test.ts` | Barrel smoke tests (ds jsdom project) | Add 1 test |
| `packages/design-system/src/tokens.test.ts` | Tokens-object tests (ds jsdom project) | Add focus-ring contrast regression test |

---

## Task 1: Generator emits `@media (prefers-color-scheme: dark)`, not `[data-theme]`

**Files:**
- Modify: `scripts/generate-tokens.test.ts:23-27`
- Modify: `scripts/generate-tokens.ts:44-50`
- Regenerate: `packages/design-system/tokens.css`

- [ ] **Step 1: Rewrite the failing test**

Replace the existing `it('emits a [data-theme="dark"] scope for dark colors', …)` block (currently lines 23–27) with:

```ts
  it('emits dark colors inside a prefers-color-scheme:dark media query, not a [data-theme] scope', (): void => {
    const css = renderTokensCss(tokens)
    expect(css).toContain('@media (prefers-color-scheme: dark) {')
    // dark overrides live in a :root nested inside the media query
    const mediaIdx = css.indexOf('@media (prefers-color-scheme: dark) {')
    const darkRootIdx = css.indexOf(':root {', mediaIdx)
    expect(mediaIdx).toBeGreaterThan(-1)
    expect(darkRootIdx).toBeGreaterThan(mediaIdx)
    expect(css).toContain('--color-background: #0b0d10;')
    // the dead manual-toggle scope must be gone (ADR-0005 §Decision-3:
    // re-added additively only when a toggle UI ships)
    expect(css).not.toContain('[data-theme')
  })
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run scripts/generate-tokens.test.ts`
Expected: FAIL — current generator emits `[data-theme="dark"]`, so `expect(css).not.toContain('[data-theme')` fails and the `@media` assertion fails.

- [ ] **Step 3: Change the generator emission**

In `scripts/generate-tokens.ts`, replace lines 44–50 (from `  lines.push('}')` through `  return lines.join('\n')`) with:

```ts
  lines.push('}')
  lines.push('', '@media (prefers-color-scheme: dark) {', '  :root {')
  for (const [k, v] of Object.entries(t.color.dark)) {
    lines.push(`    --color-${k}: ${v};`)
  }
  lines.push('  }', '}', '')
  return lines.join('\n')
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run scripts/generate-tokens.test.ts`
Expected: PASS (all cases in the file, including the existing header / spacing / light-palette / determinism / trailing-newline cases).

- [ ] **Step 5: Regenerate the token artifact**

Run: `npm run tokens:generate`
Then: `git diff packages/design-system/tokens.css`
Expected: the tail of the file changes from
`[data-theme="dark"] { … }` to
`@media (prefers-color-scheme: dark) {\n  :root { … }\n}` and a trailing newline. No other tokens change.

- [ ] **Step 6: Run the full gate**

Run: `npm run qa`
Expected: PASS. In particular `tokens:check` passes (committed `tokens.css` now matches generator output) and coverage stays 100%×4.

- [ ] **Step 7: Commit (green only)**

```bash
git add scripts/generate-tokens.ts scripts/generate-tokens.test.ts packages/design-system/tokens.css
git commit -m "fix(tokens): emit @media prefers-color-scheme:dark per ADR-0005"
```
(The prepare-commit-msg hook auto-appends the DCO `Signed-off-by:` trailer.)

---

## Task 2: Add the minimal hand-written `base.css`

**Files:**
- Create: `packages/design-system/src/base.css`
- Create: `packages/design-system/src/base.css.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/design-system/src/base.css.test.ts` (mirrors the `utilities.css.test.ts` / `Table.css.test.ts` text-presence pattern — jsdom computes no layout and resolves no `@media`/custom properties, so the testable surface is CSS source text):

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// S0 base reset/base. jsdom can't resolve @media or computed custom
// properties, so the assertion is on CSS source text. Full cascade
// verification is the dev-server smoke step in the plan (Task 5).
describe('base.css', (): void => {
  const path = resolve(import.meta.dirname, 'base.css')
  const source = readFileSync(path, 'utf8')

  it('applies a universal border-box box-sizing reset', (): void => {
    expect(source).toContain('box-sizing: border-box')
    expect(source).toContain('*, *::before, *::after')
  })

  it('zeroes the body margin', (): void => {
    expect(source).toContain('margin: 0')
  })

  it('drives body typography and colours from tokens', (): void => {
    expect(source).toContain('font-family: var(--font-family-body)')
    expect(source).toContain('color: var(--color-foreground)')
    expect(source).toContain('background: var(--color-background)')
  })

  it('declares a token-driven :focus-visible baseline', (): void => {
    expect(source).toContain(':focus-visible')
    expect(source).toContain('outline: 2px solid var(--color-accent)')
  })
})
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run packages/design-system/src/base.css.test.ts`
Expected: FAIL — `base.css` does not exist (`ENOENT` from `readFileSync`).

- [ ] **Step 3: Create `base.css`**

Create `packages/design-system/src/base.css`:

```css
/* Design-system global reset/base. Loaded as a side-effect of importing
 * anything from the design-system package root (see index.ts), AFTER
 * tokens.css so the custom properties below resolve.
 *
 * Scope is deliberately minimal (S0): only what makes the existing
 * unstyled sta-* class hooks legible. Element/form/table/heading resets
 * are owned by the slice that first styles that surface (S1+).
 */

*, *::before, *::after {
  box-sizing: border-box;
}

body {
  margin: 0;
}

html, body {
  min-height: 100%;
}

body {
  font-family: var(--font-family-body);
  color: var(--color-foreground);
  background: var(--color-background);
  font-size: var(--font-size-md);
  line-height: 1.5;
}

:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run packages/design-system/src/base.css.test.ts`
Expected: PASS (all four cases).

- [ ] **Step 5: Run the full gate**

Run: `npm run qa`
Expected: PASS. (`base.css` is not yet imported by the barrel — added in Task 3 — so this only proves the file + its test are green and coverage holds.)

- [ ] **Step 6: Commit (green only)**

```bash
git add packages/design-system/src/base.css packages/design-system/src/base.css.test.ts
git commit -m "feat(design-system): add minimal token-driven base.css reset"
```

---

## Task 3: Wire tokens.css + base.css through the barrel

**Files:**
- Modify: `packages/design-system/src/index.ts:1`
- Modify: `packages/design-system/src/index.test.ts`

- [ ] **Step 1: Write the failing test**

Append to the `describe('package barrel (index.ts)', …)` block in `packages/design-system/src/index.test.ts` a new case. (Import side-effect CSS is a no-op in Vitest, so assert on barrel **source order** — the same source-text approach the css tests use.)

```ts
  it('loads tokens.css then base.css then utilities.css as side-effects (order matters: tokens define the custom properties base.css consumes)', (): void => {
    const src = readFileSync(
      resolve(import.meta.dirname, 'index.ts'),
      'utf8',
    )
    const tokensIdx = src.indexOf("import './tokens.css'")
    const baseIdx = src.indexOf("import './base.css'")
    const utilIdx = src.indexOf("import './utilities.css'")
    expect(tokensIdx).toBeGreaterThan(-1)
    expect(baseIdx).toBeGreaterThan(tokensIdx)
    expect(utilIdx).toBeGreaterThan(baseIdx)
  })
```

Add the Node fs imports at the top of `index.test.ts` if not already present:

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run packages/design-system/src/index.test.ts`
Expected: FAIL — `index.ts` currently has only `import './utilities.css'`; `tokensIdx`/`baseIdx` are `-1`.

- [ ] **Step 3: Add the imports**

In `packages/design-system/src/index.ts`, replace line 1 (`import './utilities.css'`) with:

```ts
import './tokens.css'
import './base.css'
import './utilities.css'
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run packages/design-system/src/index.test.ts`
Expected: PASS (new case + existing barrel re-export cases).

- [ ] **Step 5: Run the full gate**

Run: `npm run qa`
Expected: PASS.

- [ ] **Step 6: Commit (green only)**

```bash
git add packages/design-system/src/index.ts packages/design-system/src/index.test.ts
git commit -m "feat(design-system): load tokens.css + base.css via barrel side-effect"
```

---

## Task 4: Pin focus-ring contrast (operationalizes spec-review advisory #2)

**Files:**
- Modify: `packages/design-system/src/tokens.test.ts`

Rationale: S0 bakes `:focus-visible { outline: … var(--color-accent) }` into `base.css`. A future token edit could silently drop the focus indicator below the WCAG 2.1 SC 1.4.11 non-text-contrast threshold (3:1) against the page background. Convert the advisory "sanity-check" into a pinned regression test.

- [ ] **Step 1: Write the failing test**

Append to `packages/design-system/src/tokens.test.ts` (the file already imports `{ tokens }` from `./tokens`; add `describe`/`it`/`expect` to its existing vitest import if needed). Test-local WCAG contrast helper (no new package export — avoids scope creep):

```ts
describe('focus-ring contrast (WCAG 2.1 SC 1.4.11 non-text, ≥ 3:1)', (): void => {
  const channel = (c: number): number => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const luminance = (hex: string): number => {
    const n = Number.parseInt(hex.replace('#', ''), 16)
    const r = channel((n >> 16) & 0xff)
    const g = channel((n >> 8) & 0xff)
    const b = channel(n & 0xff)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const ratio = (a: string, b: string): number => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y): number => y - x)
    return (hi + 0.05) / (lo + 0.05)
  }

  it('light: --color-accent on --color-background ≥ 3:1', (): void => {
    expect(
      ratio(tokens.color.light.accent, tokens.color.light.background),
    ).toBeGreaterThanOrEqual(3)
  })

  it('dark: --color-accent on --color-background ≥ 3:1', (): void => {
    expect(
      ratio(tokens.color.dark.accent, tokens.color.dark.background),
    ).toBeGreaterThanOrEqual(3)
  })
})
```

- [ ] **Step 2: Run the test, verify behaviour**

Run: `npx vitest run packages/design-system/src/tokens.test.ts`
Expected: PASS — light `#0066cc` on `#ffffff` ≈ 4.5:1; dark `#5aa6ff` on `#0b0d10` ≈ 8:1. (This test is green on the current token values by construction; it is a *regression guard*, not red-first. If either assertion is unexpectedly red, STOP — the accent token violates the focus-contrast requirement and the spec's `:focus-visible` choice must be revisited before proceeding.)

- [ ] **Step 3: Run the full gate**

Run: `npm run qa`
Expected: PASS, coverage 100%×4 (the helper is fully exercised by both `it` cases).

- [ ] **Step 4: Commit**

```bash
git add packages/design-system/src/tokens.test.ts
git commit -m "test(design-system): pin focus-ring accent/bg contrast ≥ 3:1"
```

---

## Task 5: Dev-server DOM smoke + PR (operationalizes spec-review advisory #1)

The whole point of S0 is "tokens actually reach the DOM." jsdom can't verify the cascade, so this is a concrete, executable browser smoke — not prose. Uses the Playwright MCP browser available in this environment.

**Files:** none modified (verification + PR only).

- [ ] **Step 1: Start the admin dev server**

Run (background): `npm run dev:admin`
Wait for `http://127.0.0.1:5174/` ready in the log.

- [ ] **Step 2: Load a styled route in the browser**

Playwright MCP: `browser_navigate` → `http://127.0.0.1:5174/?route=editor&slug=kotelnica-bialczanska` (use `127.0.0.1` consistently with Step 1 — admin runs `strictPort` on `127.0.0.1`; avoids any IPv6/`localhost` resolution surprise)

- [ ] **Step 3: Assert the body resolves token-driven styles (light theme)**

Playwright MCP `browser_evaluate`:

```js
() => {
  const cs = getComputedStyle(document.body);
  return { bg: cs.backgroundColor, font: cs.fontFamily };
}
```

Expected: `bg` is `rgb(255, 255, 255)` (light `--color-background: #ffffff` resolved — proves `tokens.css` reached the DOM via the barrel) and `font` contains `"DM Sans"` (proves `base.css` body rule applied). If `bg` is the jsdom/unstyled default (`rgba(0, 0, 0, 0)` / transparent) the barrel side-effect did not propagate — STOP and investigate a deep-import bypass before claiming success.

- [ ] **Step 4: Repeat the smoke on the public app**

Run (background): `npm run dev` → wait for the public dev server (Vite default, no port override → `http://127.0.0.1:5173/`).
Playwright MCP `browser_navigate` → `http://127.0.0.1:5173/`, repeat the Step 3 evaluate. Expected: same light-token resolution (`rgb(255, 255, 255)` bg, DM Sans font).

> **Dark-theme note:** Playwright MCP exposes no `prefers-color-scheme` emulation tool, so runtime dark-cascade is *not* asserted here. Dark correctness is pinned upstream by Task 1's generator test (the `@media (prefers-color-scheme: dark)` block is emitted and `tokens.css` is loaded). This split is intentional and honest — record it in the PR body.

- [ ] **Step 5: Stop dev servers, confirm no app source changed**

```bash
pkill -f "vite.js"
git diff --stat main...HEAD -- apps/
```
Expected: empty (no `apps/*` file modified — S0 propagates purely via the barrel). Branch-relative `main...HEAD` is robust to extra fixup commits added during the Codex-review fold; do not use a fixed `HEAD~N` offset.

- [ ] **Step 6: Final gate + open the PR**

```bash
npm run qa
git push origin claude/great-blackburn-ae704f
```
Then open one atomic PR (base `main`). PR body MUST state: ADR-0005 compliance fix (no ADR change); the dark-theme verification split from Step 4; "no `apps/*` source touched"; links to spec `5de4591`. After opening, follow the per-PR workflow (post `@codex review`, fold findings on-branch, run the local acceptance plan) per the project's standing review discipline.

---

## Out of scope (do not do in S0)

- Styling any design-system component or any screen (S1+).
- Any `[data-theme]` manual-toggle layer or per-app fixed theming.
- Any `apps/*` source edit.
- Element/form/table/heading/link/list resets beyond the body baseline.
- New dependencies.

## Done criteria

- `npm run qa` green; `tokens:check` clean.
- `tokens.css` tail is `@media (prefers-color-scheme: dark) { :root { … } }`, no `[data-theme]`.
- Browser smoke: both apps' `document.body` resolve `rgb(255, 255, 255)` background + DM Sans font.
- No `apps/*` file modified.
- One atomic PR opened; Codex review loop + local acceptance executed.
