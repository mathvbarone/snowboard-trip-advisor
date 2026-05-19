import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// Chip visual CSS. jsdom can't resolve the cascade/tokens, so the testable
// surface is CSS source text; the real cascade is the gallery Playwright
// smoke (plan §Gallery smoke). Chip is a native `<button class="sta-chip"
// aria-pressed={bool} disabled={bool}>` toggle, so the state hooks are the
// native `:disabled`, the `[aria-pressed="true"]` on-state, and the
// `:focus-visible` keyboard ring (consistent with Button.css).
describe('Chip.css', (): void => {
  const path = resolve(import.meta.dirname, 'Chip.css')
  const source = readFileSync(path, 'utf8')

  it('declares the base selector', (): void => {
    expect(source).toContain('.sta-chip')
  })
  it('styles the focus-visible keyboard ring', (): void => {
    expect(source).toContain('.sta-chip:focus-visible')
  })
  it('styles the native disabled state', (): void => {
    expect(source).toContain('.sta-chip:disabled')
  })
  it('styles the pressed on-state via aria-pressed', (): void => {
    expect(source).toContain('.sta-chip[aria-pressed="true"]')
  })
  it('drives values from design tokens only', (): void => {
    expect(source).toMatch(/var\(--(color|space|radius|font|duration)-/)
    expect(source).not.toMatch(/:\s*#[0-9a-fA-F]{3,6}\b/)
  })
})
