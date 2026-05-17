import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// Popover visual CSS. jsdom can't resolve the cascade/tokens, so the
// testable surface is CSS source text; the real cascade is the gallery
// Playwright smoke (plan §Gallery smoke). Popover composes Radix
// DismissableLayer + FocusScope and authors exactly ONE class —
// `.sta-popover` on the floating `role="dialog"` panel (Popover.tsx). It is
// a non-modal anchored surface (consumer owns positioning, no Radix
// positioning dep in Phase 1). Radix's DismissableLayer does not inject
// `data-state`/`data-side` here, and the wrapper authors no other class —
// so only the base selector + token usage are text-testable.
describe('Popover.css', (): void => {
  const path = resolve(import.meta.dirname, 'Popover.css')
  const source = readFileSync(path, 'utf8')

  it('declares the base selector', (): void => {
    expect(source).toContain('.sta-popover')
  })
  it('drives values from design tokens only', (): void => {
    expect(source).toMatch(/var\(--(color|space|radius|font|duration|z)-/)
    expect(source).not.toMatch(/:\s*#[0-9a-fA-F]{3,6}\b/)
  })
})
