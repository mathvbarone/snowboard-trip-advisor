import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// Card visual CSS. jsdom can't resolve the cascade/tokens, so the
// testable surface is CSS source text; real cascade is the gallery
// Playwright smoke (plan §Gallery smoke).
describe('Card.css', (): void => {
  const path = resolve(import.meta.dirname, 'Card.css')
  const source = readFileSync(path, 'utf8')

  it('declares the base selector', (): void => {
    expect(source).toContain('.sta-card')
  })
  it('styles the elevated variant', (): void => {
    expect(source).toContain('.sta-card[data-variant="elevated"]')
  })
  it('styles the flat variant', (): void => {
    expect(source).toContain('.sta-card[data-variant="flat"]')
  })
  it('styles the header region', (): void => {
    expect(source).toContain('[data-region="header"]')
  })
  it('styles the body region', (): void => {
    expect(source).toContain('[data-region="body"]')
  })
  it('styles the footer region', (): void => {
    expect(source).toContain('[data-region="footer"]')
  })
  it('drives values from design tokens only', (): void => {
    expect(source).toMatch(/var\(--(color|space|radius|font|duration|z|shadow)-/)
    expect(source).not.toMatch(/:\s*#[0-9a-fA-F]{3,6}\b/)
  })
})
