import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// Spec §5.1 sticky-header invariant: the matrix view's column headers must
// remain pinned to the viewport top while the body scrolls. JSDOM does not
// honour `position: sticky`, so a runtime computed-style assertion is
// impossible — the testable surface at this layer is text-presence in the
// CSS source. Full visual verification lands with the Epic 6 Playwright
// pass (spec §7.11).

describe('Table.css', (): void => {
  const path = resolve(import.meta.dirname, 'Table.css')
  const source = readFileSync(path, 'utf8')

  it('declares position: sticky for the table head cells', (): void => {
    expect(source).toContain('position: sticky')
  })

  it('pins the sticky head cells to top: 0', (): void => {
    expect(source).toContain('top: 0')
  })
})
