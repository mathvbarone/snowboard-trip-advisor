import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// Plan Decision C1/C2 invariants — Toast lives in a single fixed top-right
// slot above the modal. JSDOM does not compute layout / z-index, so a
// runtime style assertion is impossible at this layer; the testable
// surface is text-presence in the CSS source. Mirrors the
// Drawer.css.test.ts + Table.css.test.ts pattern. Full visual verification
// lands with the Epic 6 Playwright pass (spec §7.11).

describe('Toast.css', (): void => {
  const path = resolve(import.meta.dirname, 'Toast.css')
  const source = readFileSync(path, 'utf8')

  it('declares position: fixed for the single-slot notification', (): void => {
    expect(source).toContain('position: fixed')
  })

  it('uses the --z-toast token so the Toast stacks above --z-modal (PR 4.5c PublishDialog)', (): void => {
    expect(source).toContain('var(--z-toast')
  })

  it('positions the Toast at the top-right corner via design-token spacing', (): void => {
    expect(source).toContain('top: var(--space-lg')
    expect(source).toContain('right: var(--space-lg')
  })

  it('renders the three variants via .sta-toast--{variant} attribute classes (Decision C1)', (): void => {
    expect(source).toContain('.sta-toast--info')
    expect(source).toContain('.sta-toast--success')
    expect(source).toContain('.sta-toast--error')
  })
})
