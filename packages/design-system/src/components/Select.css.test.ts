import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// Select visual CSS. jsdom can't resolve the cascade/tokens, so the
// testable surface is CSS source text; real cascade is the gallery
// Playwright smoke (plan §Gallery smoke).
describe('Select.css', (): void => {
  const path = resolve(import.meta.dirname, 'Select.css')
  const source = readFileSync(path, 'utf8')

  it('declares the base selector', (): void => {
    expect(source).toContain('.sta-select')
  })
  it('styles the label and control parts', (): void => {
    expect(source).toContain('.sta-select__label')
    expect(source).toContain('.sta-select__control')
  })
  it('styles the disabled state', (): void => {
    expect(source).toContain(':disabled')
  })
  it('drives values from design tokens only', (): void => {
    expect(source).toMatch(/var\(--(color|space|radius|font|duration)-/)
    expect(source).not.toMatch(/:\s*#[0-9a-fA-F]{3,6}\b/)
  })
})
