import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// Modal visual CSS. jsdom can't resolve the cascade/tokens, so the testable
// surface is CSS source text; the real cascade is the gallery Playwright
// smoke (plan §Gallery smoke). Modal wraps Radix Dialog: the AUTHORED
// classes are `.sta-modal` (Content, also carries `data-modal="true"`),
// `.sta-modal__overlay` (Overlay) and `.sta-modal__title` (Title). The
// `data-modal="true"` shape is the one attribute the wrapper itself sets
// (Modal.tsx) so it IS in the source text and is asserted; Radix's runtime
// `data-state` open/closed attrs are injected at RUNTIME, not present in
// the wrapper source, so they are intentionally NOT asserted here.
describe('Modal.css', (): void => {
  const path = resolve(import.meta.dirname, 'Modal.css')
  const source = readFileSync(path, 'utf8')

  it('declares the base selector', (): void => {
    expect(source).toContain('.sta-modal')
  })
  it('styles the portalled overlay backdrop', (): void => {
    expect(source).toContain('.sta-modal__overlay')
  })
  it('styles the dialog title heading', (): void => {
    expect(source).toContain('.sta-modal__title')
  })
  it('attaches elevation via the authored data-modal attribute', (): void => {
    expect(source).toContain('[data-modal="true"]')
  })
  it('drives values from design tokens only', (): void => {
    expect(source).toMatch(/var\(--(color|space|radius|font|duration|z)-/)
    expect(source).not.toMatch(/:\s*#[0-9a-fA-F]{3,6}\b/)
  })
})
