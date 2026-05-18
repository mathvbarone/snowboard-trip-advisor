import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// Button visual CSS. jsdom can't resolve the cascade/tokens, so the
// testable surface is CSS source text; real cascade is the gallery
// Playwright smoke (plan §Gallery smoke).
describe('Button.css', (): void => {
  const path = resolve(import.meta.dirname, 'Button.css')
  const source = readFileSync(path, 'utf8')

  it('declares the base selector', (): void => {
    expect(source).toContain('.sta-button')
  })
  it('styles all three variants via data-variant', (): void => {
    expect(source).toContain('.sta-button[data-variant="primary"]')
    expect(source).toContain('.sta-button[data-variant="secondary"]')
    expect(source).toContain('.sta-button[data-variant="ghost"]')
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
