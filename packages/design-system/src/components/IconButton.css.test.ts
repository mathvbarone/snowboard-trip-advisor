import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// IconButton visual CSS. jsdom can't resolve the cascade/tokens, so the
// testable surface is CSS source text; real cascade is the gallery
// Playwright smoke (plan §Gallery smoke).
describe('IconButton.css', (): void => {
  const path = resolve(import.meta.dirname, 'IconButton.css')
  const source = readFileSync(path, 'utf8')

  it('declares the base selector', (): void => {
    expect(source).toContain('.sta-icon-button')
  })
  it('styles the square hit-area variant', (): void => {
    expect(source).toContain('.sta-icon-button[data-hit-area="square"]')
  })
  it('styles focus-visible, disabled, and pressed state', (): void => {
    expect(source).toContain(':focus-visible')
    expect(source).toContain(':disabled')
    expect(source).toContain('[aria-pressed="true"]')
  })
  it('drives values from design tokens only', (): void => {
    expect(source).toMatch(/var\(--(color|space|radius|font|duration)-/)
    expect(source).not.toMatch(/:\s*#[0-9a-fA-F]{3,6}\b/)
  })
})
