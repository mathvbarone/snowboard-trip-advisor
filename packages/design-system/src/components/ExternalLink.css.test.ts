import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// ExternalLink visual CSS. jsdom can't resolve the cascade/tokens, so the
// testable surface is CSS source text; the real cascade is the gallery
// Playwright smoke (plan §Gallery smoke). The component emits a single
// `<a class="sta-external-link" data-variant="inline|button">`. The
// `button` variant must VISUALLY ECHO `.sta-button`'s primary look by
// referencing the SAME design tokens Button.css uses (accent fill on
// background-coloured text, the shared radius/spacing/typography tokens) —
// it must NOT import or duplicate Button's rule block. :focus-visible
// mirrors the shared keyboard-ring convention.
// The header comment legitimately explains the relationship to Button in
// prose; the "no duplication / no import" guard must inspect the RULE text,
// not the header. Strip /* ... */ comments before the negative assertion.
const stripComments = (css: string): string =>
  css.replace(/\/\*[\s\S]*?\*\//g, '')

describe('ExternalLink.css', (): void => {
  const path = resolve(import.meta.dirname, 'ExternalLink.css')
  const source = readFileSync(path, 'utf8')
  const rules = stripComments(source)

  it('declares the base selector', (): void => {
    expect(source).toContain('.sta-external-link')
  })
  it('styles the inline variant via data-variant', (): void => {
    expect(source).toContain('.sta-external-link[data-variant="inline"]')
  })
  it('styles the button variant via data-variant', (): void => {
    expect(source).toContain('.sta-external-link[data-variant="button"]')
  })
  it('styles the focus-visible keyboard ring', (): void => {
    expect(source).toContain('.sta-external-link:focus-visible')
  })
  it('echoes the Button accent tokens for the button variant', (): void => {
    expect(source).toContain('var(--color-accent')
    expect(source).toContain('var(--color-background')
    expect(source).toContain('var(--radius-md')
  })
  it('does not import or duplicate Button.css', (): void => {
    expect(rules).not.toContain('Button.css')
    expect(rules).not.toContain('.sta-button')
  })
  it('drives values from design tokens only', (): void => {
    expect(source).toMatch(/var\(--(color|space|radius|font|duration)-/)
    expect(source).not.toMatch(/:\s*#[0-9a-fA-F]{3,6}\b/)
  })
})
