import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// Shell visual CSS. jsdom can't resolve the cascade/tokens, so the
// testable surface is CSS source text; real cascade is the gallery
// Playwright smoke (plan §Gallery smoke). Shell's only styled hook is
// the skip-link: off-screen until :focus, then a token-styled chip.
describe('Shell.css', (): void => {
  const path = resolve(import.meta.dirname, 'Shell.css')
  const source = readFileSync(path, 'utf8')

  it('declares the skip-link base selector', (): void => {
    expect(source).toContain('.sta-skip-link')
  })
  it('styles the focused/visible skip-link state', (): void => {
    expect(source).toContain('.sta-skip-link:focus')
  })
  it('does not redefine the S0 sta-visually-hidden utility', (): void => {
    expect(source).not.toContain('.sta-visually-hidden')
  })
  it('drives values from design tokens only', (): void => {
    expect(source).toMatch(/var\(--(color|space|radius|font|duration|z|shadow)-/)
    expect(source).not.toMatch(/:\s*#[0-9a-fA-F]{3,6}\b/)
  })
})
