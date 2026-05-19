import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// Tabs visual CSS. jsdom can't resolve the cascade/tokens, so the testable
// surface is CSS source text; the real cascade is the gallery Playwright
// smoke (plan §Gallery smoke). Tabs is the one INLINE (NOT portalled)
// member of the S1d family — its `.sta-tabs` root and descendants render
// as ordinary children of the consumer's tree. It authors four classes:
// `.sta-tabs` (root), `.sta-tabs__list` (role=tablist), `.sta-tabs__tab`
// (role=tab `<button>`) and `.sta-tabs__panel` (role=tabpanel). The
// selected-tab state is the WAI-ARIA `aria-selected` attribute the Tab
// `<button>` already sets (`aria-selected={selected}` in Tabs.tsx) — this
// is an AUTHORED attribute (not a Radix runtime injection; Tabs is a
// hand-rolled compound, no Radix), so styling the on-state via
// `.sta-tabs__tab[aria-selected="true"]` is the correct contract hook and
// is asserted below. `:focus-visible` is the keyboard ring (roving
// tabindex moves focus between tabs).
describe('Tabs.css', (): void => {
  const path = resolve(import.meta.dirname, 'Tabs.css')
  const source = readFileSync(path, 'utf8')

  it('declares the base selector', (): void => {
    expect(source).toContain('.sta-tabs')
  })
  it('styles the tablist row', (): void => {
    expect(source).toContain('.sta-tabs__list')
  })
  it('styles the individual tab control', (): void => {
    expect(source).toContain('.sta-tabs__tab')
  })
  it('styles the selected tab via aria-selected', (): void => {
    expect(source).toContain('.sta-tabs__tab[aria-selected="true"]')
  })
  it('styles the active tab panel', (): void => {
    expect(source).toContain('.sta-tabs__panel')
  })
  it('styles the focus-visible keyboard ring', (): void => {
    expect(source).toContain(':focus-visible')
  })
  it('drives values from design tokens only', (): void => {
    expect(source).toMatch(/var\(--(color|space|radius|font|duration|z)-/)
    expect(source).not.toMatch(/:\s*#[0-9a-fA-F]{3,6}\b/)
  })
})
