import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// Pill visual CSS. jsdom can't resolve the cascade/tokens, so the
// testable surface is CSS source text; real cascade is the gallery
// Playwright smoke (plan §Gallery smoke). The component emits
// `<span class="sta-pill" data-variant="default|stale">`; the
// `sta-visually-hidden` SR span is the S0 utility and is NOT restyled here.
describe('Pill.css', (): void => {
  const path = resolve(import.meta.dirname, 'Pill.css')
  const source = readFileSync(path, 'utf8')

  it('declares the base selector', (): void => {
    expect(source).toContain('.sta-pill')
  })
  it('styles the default variant via data-variant', (): void => {
    expect(source).toContain('.sta-pill[data-variant="default"]')
  })
  it('styles the stale variant via data-variant', (): void => {
    expect(source).toContain('.sta-pill[data-variant="stale"]')
  })
  it('does not restyle the S0 sta-visually-hidden utility', (): void => {
    expect(source).not.toContain('.sta-visually-hidden')
  })
  it('drives values from design tokens only', (): void => {
    expect(source).toMatch(/var\(--(color|space|radius|font|duration)-/)
    expect(source).not.toMatch(/:\s*#[0-9a-fA-F]{3,6}\b/)
  })
})
