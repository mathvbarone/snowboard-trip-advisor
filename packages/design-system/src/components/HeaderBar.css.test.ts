import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// HeaderBar visual CSS. jsdom can't resolve the cascade/tokens, so the
// testable surface is CSS source text; real cascade is the gallery
// Playwright smoke (plan §Gallery smoke).
describe('HeaderBar.css', (): void => {
  const path = resolve(import.meta.dirname, 'HeaderBar.css')
  const source = readFileSync(path, 'utf8')

  it('declares the base selector', (): void => {
    expect(source).toContain('.sta-header-bar')
  })
  it('styles the brand', (): void => {
    expect(source).toContain('.sta-header-bar__brand')
  })
  it('styles the view-toggle region', (): void => {
    expect(source).toContain('[data-region="view-toggle"]')
  })
  it('styles the shortlist region', (): void => {
    expect(source).toContain('[data-region="shortlist"]')
  })
  it('drives values from design tokens only', (): void => {
    expect(source).toMatch(/var\(--(color|space|radius|font|duration|z|shadow)-/)
    expect(source).not.toMatch(/:\s*#[0-9a-fA-F]{3,6}\b/)
  })
})
