import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// SourceBadge visual CSS. jsdom can't resolve the cascade/tokens, so the
// testable surface is CSS source text; real cascade is the gallery
// Playwright smoke (plan §Gallery smoke). The component emits
// `<span class="sta-source-badge" data-source="<SourceKey>">` wrapping a
// self-hosted glyph SVG plus `<span class="sta-source-badge__name">`. The
// full SourceKey set it can emit is: opensnow, snowforecast, resort-feed,
// booking, airbnb, manual. CSS styles the wrapper + the __name; it does NOT
// fight the SVG glyph (the glyph owns its own fill).
describe('SourceBadge.css', (): void => {
  const path = resolve(import.meta.dirname, 'SourceBadge.css')
  const source = readFileSync(path, 'utf8')

  it('declares the base selector', (): void => {
    expect(source).toContain('.sta-source-badge')
  })
  it('styles the __name label element', (): void => {
    expect(source).toContain('.sta-source-badge__name')
  })
  it('styles the opensnow source via data-source', (): void => {
    expect(source).toContain('.sta-source-badge[data-source="opensnow"]')
  })
  it('styles the manual source via data-source', (): void => {
    expect(source).toContain('.sta-source-badge[data-source="manual"]')
  })
  it('makes the broader data-source set addressable (attribute presence)', (): void => {
    // A single `[data-source]` attribute-presence rule covers every
    // SourceKey the component can emit (opensnow, snowforecast,
    // resort-feed, booking, airbnb, manual) so no source is left unstyled
    // even though only opensnow/manual get a per-source override.
    expect(source).toContain('.sta-source-badge[data-source]')
  })
  it('drives values from design tokens only', (): void => {
    expect(source).toMatch(/var\(--(color|space|radius|font|duration)-/)
    expect(source).not.toMatch(/:\s*#[0-9a-fA-F]{3,6}\b/)
  })
})
