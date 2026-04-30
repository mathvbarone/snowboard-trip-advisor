import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// Global utilities loaded as a side-effect of the design-system root
// import (see index.ts). `.sta-visually-hidden` is referenced by Skeleton,
// Table, Pill, and DetailDrawer; without the rule, the elements that
// should be SR-only render visibly. JSDOM doesn't compute layout, so the
// testable surface is text-presence in the CSS source. Mirrors the
// Table.css.test.ts pattern.

describe('utilities.css', (): void => {
  const path = resolve(import.meta.dirname, 'utilities.css')
  const source = readFileSync(path, 'utf8')

  it('declares the .sta-visually-hidden class hook', (): void => {
    expect(source).toContain('.sta-visually-hidden')
  })

  it('uses clip: rect(0, 0, 0, 0) to remove the element from visual flow', (): void => {
    expect(source).toContain('clip: rect(0, 0, 0, 0)')
  })

  it('uses position: absolute so the visually-hidden box does not occupy layout space', (): void => {
    expect(source).toContain('position: absolute')
  })
})
