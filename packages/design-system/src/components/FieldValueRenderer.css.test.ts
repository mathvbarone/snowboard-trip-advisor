import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// FieldValueRenderer visual CSS. jsdom can't resolve the cascade/tokens, so
// the testable surface is CSS source text; the real cascade is the gallery
// Playwright smoke (plan §Gallery smoke). The component emits a
// `<span class="sta-field-value" data-state="fresh|stale|never_fetched">`
// laying out its OWN parts only: `.sta-field-value__text` (the formatted
// value / missing placeholder), `.sta-field-value__info` (the provenance
// tooltip trigger button), and `.sta-field-value__missing` (the
// never_fetched tooltip trigger button). It COMPOSES <Pill>, <SourceBadge>
// and <Tooltip>; those carry their own co-located CSS and are intentionally
// NOT restyled here — these assertions only pin the `sta-field-value*`
// own-DOM selectors.
// Block comments legitimately reference the composed children by name in
// prose; the "does not restyle" guard must inspect the RULE text, not the
// header. Strip /* ... */ comments before the negative assertion.
const stripComments = (css: string): string =>
  css.replace(/\/\*[\s\S]*?\*\//g, '')

describe('FieldValueRenderer.css', (): void => {
  const path = resolve(import.meta.dirname, 'FieldValueRenderer.css')
  const source = readFileSync(path, 'utf8')
  const rules = stripComments(source)

  it('declares the base selector', (): void => {
    expect(source).toContain('.sta-field-value')
  })
  it('styles its own text part', (): void => {
    expect(source).toContain('.sta-field-value__text')
  })
  it('styles its own provenance info trigger', (): void => {
    expect(source).toContain('.sta-field-value__info')
  })
  it('styles its own missing-data trigger', (): void => {
    expect(source).toContain('.sta-field-value__missing')
  })
  it('styles the fresh state via data-state', (): void => {
    expect(source).toContain('.sta-field-value[data-state="fresh"]')
  })
  it('styles the stale state via data-state', (): void => {
    expect(source).toContain('.sta-field-value[data-state="stale"]')
  })
  it('styles the never_fetched state via data-state', (): void => {
    expect(source).toContain('.sta-field-value[data-state="never_fetched"]')
  })
  it('does not restyle the composed Pill/SourceBadge children', (): void => {
    expect(rules).not.toContain('.sta-pill')
    expect(rules).not.toContain('.sta-source-badge')
  })
  it('drives values from design tokens only', (): void => {
    expect(source).toMatch(/var\(--(color|space|radius|font|duration)-/)
    expect(source).not.toMatch(/:\s*#[0-9a-fA-F]{3,6}\b/)
  })
})
