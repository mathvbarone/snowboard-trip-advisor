import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// EmptyStateLayout visual CSS. jsdom can't resolve the cascade/tokens,
// so the testable surface is CSS source text; real cascade is the
// gallery Playwright smoke (plan §Gallery smoke).
describe('EmptyStateLayout.css', (): void => {
  const path = resolve(import.meta.dirname, 'EmptyStateLayout.css')
  const source = readFileSync(path, 'utf8')

  it('declares the base selector', (): void => {
    expect(source).toContain('.sta-empty-state')
  })
  it('styles the heading', (): void => {
    expect(source).toContain('.sta-empty-state__heading')
  })
  it('styles the body', (): void => {
    expect(source).toContain('.sta-empty-state__body')
  })
  it('styles the icon region', (): void => {
    expect(source).toContain('[data-region="icon"]')
  })
  it('styles the cta region', (): void => {
    expect(source).toContain('[data-region="cta"]')
  })
  it('styles the details region', (): void => {
    expect(source).toContain('[data-region="details"]')
  })
  it('drives values from design tokens only', (): void => {
    expect(source).toMatch(/var\(--(color|space|radius|font|duration|z|shadow)-/)
    expect(source).not.toMatch(/:\s*#[0-9a-fA-F]{3,6}\b/)
  })
})
