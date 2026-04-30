import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// Spec §3.3 + §7.11 acceptance gate: when the detail drawer is open on
// `view=matrix` at viewport `<lg` (1280), the matrix downgrades to a
// single-column layout under the drawer (matrix at <30% width is
// unreadable). JSDOM does not evaluate `@media`, so the testable surface
// at this PR is text-presence in the CSS module's source. Full media-
// query firing is deferred to Epic 6 Playwright (spec §7.11).
//
// The convention: an attribute on a parent layout element flips when
// `&detail=` is present so the `@media (max-width: 1279.98px)` rule can
// scope its downgrade. App.tsx will set `data-detail-open` on the matrix
// section root (or a parent) when the drawer is mounted; the CSS rule
// below targets that attribute under the `<lg` breakpoint.

describe('matrix.module.css', (): void => {
  const path = resolve(import.meta.dirname, 'matrix.module.css')
  const source = readFileSync(path, 'utf8')

  it('contains the @media (max-width: 1279.98px) downgrade breakpoint (<lg)', (): void => {
    expect(source).toContain('@media (max-width: 1279.98px)')
  })

  it('targets the [data-detail-open] attribute for the drawer-open downgrade', (): void => {
    // App.tsx will toggle `data-detail-open` on the matrix layout root when
    // `&detail=` is in the URL; the CSS rule scopes its single-column
    // downgrade to that attribute under the <lg breakpoint.
    expect(source).toContain('[data-detail-open]')
  })
})
