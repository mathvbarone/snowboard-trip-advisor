import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// Spec §3.3 (right-side overlay) + §5.5 (Drawer primitive's data-position +
// reduced-motion contract). JSDOM does not honour real CSS transforms /
// transitions, so a runtime computed-style assertion is impossible — the
// testable surface at this layer is text-presence in the CSS source.
// Mirrors the Table.css.test.ts pattern. Full visual verification lands
// with the Epic 6 Playwright pass (spec §7.11).

describe('Drawer.css', (): void => {
  const path = resolve(import.meta.dirname, 'Drawer.css')
  const source = readFileSync(path, 'utf8')

  it('declares position: fixed for the slide-in panel', (): void => {
    expect(source).toContain('position: fixed')
  })

  it('targets data-position="right" for right-edge slide-in', (): void => {
    expect(source).toContain("data-position='right'")
  })

  it('targets data-position="left" for left-edge slide-in', (): void => {
    expect(source).toContain("data-position='left'")
  })

  it('targets data-state="open" to drive the slide-in transform', (): void => {
    expect(source).toContain("data-state='open'")
  })

  it('targets data-reduced-motion="true" to collapse the transition', (): void => {
    expect(source).toContain("data-reduced-motion='true'")
  })

  it('uses translateX() to drive the slide direction', (): void => {
    expect(source).toContain('transform: translateX(')
  })
})
