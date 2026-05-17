import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// DropdownMenu visual CSS. jsdom can't resolve the cascade/tokens, so the
// testable surface is CSS source text; the real cascade is the gallery
// Playwright smoke (plan §Gallery smoke). DropdownMenu composes Radix
// DismissableLayer + FocusScope but renders its own nodes INLINE (no Radix
// portal — `DismissableLayer asChild` wraps the in-tree
// `<div class="sta-dropdown-menu">`). It authors three classes:
// `.sta-dropdown-menu` (root wrapping trigger + menu),
// `.sta-dropdown-menu__menu` (the `role="menu"` panel) and
// `.sta-dropdown-menu__item` (each `role="menuitem"` `<button>`). Radix
// DismissableLayer/FocusScope do not inject `data-state`/`data-side` here,
// and the only state hooks are the native `:hover` / `:focus-visible` on
// the item buttons (roving tabindex drives keyboard focus) — both AUTHORED
// in this CSS, so both are asserted.
describe('DropdownMenu.css', (): void => {
  const path = resolve(import.meta.dirname, 'DropdownMenu.css')
  const source = readFileSync(path, 'utf8')

  it('declares the base selector', (): void => {
    expect(source).toContain('.sta-dropdown-menu')
  })
  it('styles the role="menu" panel', (): void => {
    expect(source).toContain('.sta-dropdown-menu__menu')
  })
  it('styles each menu item', (): void => {
    expect(source).toContain('.sta-dropdown-menu__item')
  })
  it('styles the item focus-visible keyboard ring', (): void => {
    expect(source).toContain('.sta-dropdown-menu__item:focus-visible')
  })
  it('styles the item hover state', (): void => {
    expect(source).toContain('.sta-dropdown-menu__item:hover')
  })
  it('drives values from design tokens only', (): void => {
    expect(source).toMatch(/var\(--(color|space|radius|font|duration|z)-/)
    expect(source).not.toMatch(/:\s*#[0-9a-fA-F]{3,6}\b/)
  })
})
