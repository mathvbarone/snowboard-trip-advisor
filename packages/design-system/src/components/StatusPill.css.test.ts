import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// StatusPill visual CSS. jsdom can't resolve the cascade/tokens, so the
// testable surface is CSS source text; real cascade is the gallery
// Playwright smoke (plan §Gallery smoke). The component emits
// `<span class="sta-status-pill" data-variant="live|stale|failed|manual">`;
// `variant` is required (no `default`). The SR-only state-label span is the
// S0 `sta-visually-hidden` utility and is NOT restyled here.
describe('StatusPill.css', (): void => {
  const path = resolve(import.meta.dirname, 'StatusPill.css')
  const source = readFileSync(path, 'utf8')

  it('declares the base selector', (): void => {
    expect(source).toContain('.sta-status-pill')
  })
  it('styles the live variant via data-variant', (): void => {
    expect(source).toContain('.sta-status-pill[data-variant="live"]')
  })
  it('styles the stale variant via data-variant', (): void => {
    expect(source).toContain('.sta-status-pill[data-variant="stale"]')
  })
  it('styles the failed variant via data-variant', (): void => {
    expect(source).toContain('.sta-status-pill[data-variant="failed"]')
  })
  it('styles the manual variant via data-variant', (): void => {
    expect(source).toContain('.sta-status-pill[data-variant="manual"]')
  })
  it('drives values from design tokens only', (): void => {
    expect(source).toMatch(/var\(--(color|space|radius|font|duration)-/)
    expect(source).not.toMatch(/:\s*#[0-9a-fA-F]{3,6}\b/)
  })
})
