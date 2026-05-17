import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// ToggleButtonGroup visual CSS. jsdom can't resolve the cascade/tokens, so
// the testable surface is CSS source text; real cascade is the gallery
// Playwright smoke (plan §Gallery smoke).
describe('ToggleButtonGroup.css', (): void => {
  const path = resolve(import.meta.dirname, 'ToggleButtonGroup.css')
  const source = readFileSync(path, 'utf8')

  it('declares the group container selector', (): void => {
    expect(source).toContain('.sta-toggle-button-group')
  })
  it('styles the toggle button and its pressed state', (): void => {
    expect(source).toContain('.sta-toggle-button')
    expect(source).toContain('.sta-toggle-button[aria-pressed="true"]')
  })
  it('styles the focus-visible and disabled states', (): void => {
    expect(source).toContain(':focus-visible')
    expect(source).toContain(':disabled')
  })
  it('drives values from design tokens only', (): void => {
    expect(source).toMatch(/var\(--(color|space|radius|font|duration)-/)
    expect(source).not.toMatch(/:\s*#[0-9a-fA-F]{3,6}\b/)
  })
})
