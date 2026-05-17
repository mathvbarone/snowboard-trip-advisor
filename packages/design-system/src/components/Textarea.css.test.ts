import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// Textarea visual CSS. jsdom can't resolve the cascade/tokens, so the
// testable surface is CSS source text; real cascade is the gallery
// Playwright smoke (plan §Gallery smoke). Note: the Textarea root IS the
// control element (no block/label wrapper) — it emits a bare
// <textarea class="sta-textarea__control"> with an aria-label.
describe('Textarea.css', (): void => {
  const path = resolve(import.meta.dirname, 'Textarea.css')
  const source = readFileSync(path, 'utf8')

  it('declares the base control selector', (): void => {
    expect(source).toContain('.sta-textarea__control')
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
