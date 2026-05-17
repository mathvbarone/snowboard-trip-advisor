import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// Tooltip visual CSS. jsdom can't resolve the cascade/tokens, so the
// testable surface is CSS source text; the real cascade is the gallery
// Playwright smoke (plan §Gallery smoke). Tooltip wraps Radix Tooltip and
// authors two classes: `.sta-tooltip` (the portalled Content bubble,
// role="tooltip" implicit) and `.sta-tooltip__arrow` (the Radix Arrow).
// IMPORTANT: Radix injects `data-state` (delayed-open/closed) and
// `data-side` (top/bottom/left/right) on the Content node at RUNTIME — they
// are NOT present in the Tooltip.tsx source, so they are intentionally NOT
// asserted here (a source-text test can only see the AUTHORED `sta-*`
// classes). Side-/state-specific styling is out of scope; the base bubble
// + arrow surface is what this file owns.
describe('Tooltip.css', (): void => {
  const path = resolve(import.meta.dirname, 'Tooltip.css')
  const source = readFileSync(path, 'utf8')

  it('declares the base selector', (): void => {
    expect(source).toContain('.sta-tooltip')
  })
  it('styles the pointer arrow', (): void => {
    expect(source).toContain('.sta-tooltip__arrow')
  })
  it('drives values from design tokens only', (): void => {
    expect(source).toMatch(/var\(--(color|space|radius|font|duration|z)-/)
    expect(source).not.toMatch(/:\s*#[0-9a-fA-F]{3,6}\b/)
  })
})
