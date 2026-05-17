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
  it('addresses the view-toggle region via the data-region attribute', (): void => {
    // The view-toggle is the brand-adjacent region in the
    // (brand+toggle+shortlist) path, so it is right-aligned by the
    // generic `.sta-header-bar__brand + [data-region]` rule rather than
    // a view-toggle-specific selector.
    expect(source).toMatch(/\[data-region\]/)
  })
  it('styles the shortlist region', (): void => {
    expect(source).toContain('[data-region="shortlist"]')
  })
  it('right-aligns the first right-side region after the brand', (): void => {
    // viewToggleSlot is optional; the brand-adjacent sibling combinator
    // pushes whichever region comes first (view-toggle, else shortlist)
    // to the right so the shortlist-only path is still right-aligned.
    expect(source).toMatch(
      /\.sta-header-bar__brand\s*\+\s*\[data-region\][^}]*margin-left:\s*auto/,
    )
  })
  it('drives values from design tokens only', (): void => {
    expect(source).toMatch(/var\(--(color|space|radius|font|duration|z|shadow)-/)
    expect(source).not.toMatch(/:\s*#[0-9a-fA-F]{3,6}\b/)
  })
})
