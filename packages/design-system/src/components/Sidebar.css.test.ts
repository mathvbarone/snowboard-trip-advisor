import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// Sidebar visual CSS. jsdom can't resolve the cascade/tokens, so the
// testable surface is CSS source text; real cascade is the gallery
// Playwright smoke (plan §Gallery smoke).
describe('Sidebar.css', (): void => {
  const path = resolve(import.meta.dirname, 'Sidebar.css')
  const source = readFileSync(path, 'utf8')

  it('declares the base selector', (): void => {
    expect(source).toContain('.sta-sidebar')
  })
  it('styles the list', (): void => {
    expect(source).toContain('.sta-sidebar__list')
  })
  it('styles the item', (): void => {
    expect(source).toContain('.sta-sidebar__item')
  })
  it('styles the link', (): void => {
    expect(source).toContain('.sta-sidebar__link')
  })
  it('styles the active link via aria-current', (): void => {
    expect(source).toContain('.sta-sidebar__link[aria-current="page"]')
  })
  it('styles the keyboard focus state', (): void => {
    expect(source).toContain(':focus-visible')
  })
  it('drives values from design tokens only', (): void => {
    expect(source).toMatch(/var\(--(color|space|radius|font|duration|z|shadow)-/)
    expect(source).not.toMatch(/:\s*#[0-9a-fA-F]{3,6}\b/)
  })
})
