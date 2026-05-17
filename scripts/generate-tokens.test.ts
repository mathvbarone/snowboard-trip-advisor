import { describe, expect, it } from 'vitest'

import { tokens } from '../packages/design-system/src/tokens'

import { renderTokensCss } from './generate-tokens'

describe('renderTokensCss', (): void => {
  it('emits the GENERATED header comment', (): void => {
    const css = renderTokensCss(tokens)
    expect(
      css.startsWith(
        '/* GENERATED — do not edit; edit tokens.ts and run npm run tokens:generate */',
      ),
    ).toBe(true)
  })

  it('emits :root custom properties for spacing', (): void => {
    const css = renderTokensCss(tokens)
    expect(css).toContain('--space-xs: 4px;')
    expect(css).toContain('--space-4xl: 64px;')
  })

  it('emits dark colors inside a prefers-color-scheme:dark media query, not a [data-theme] scope', (): void => {
    const css = renderTokensCss(tokens)
    expect(css).toContain('@media (prefers-color-scheme: dark) {')
    // dark overrides live in a :root nested inside the media query
    const mediaIdx = css.indexOf('@media (prefers-color-scheme: dark) {')
    const darkRootIdx = css.indexOf(':root {', mediaIdx)
    expect(mediaIdx).toBeGreaterThan(-1)
    expect(darkRootIdx).toBeGreaterThan(mediaIdx)
    expect(css).toContain('--color-background: #0b0d10;')
    // the dead manual-toggle scope must be gone (ADR-0005 §Decision-3:
    // re-added additively only when a toggle UI ships)
    expect(css).not.toContain('[data-theme')
  })

  it('emits breakpoint, radius, zIndex, duration, fontWeight, fontSize, fontFamily custom properties', (): void => {
    const css = renderTokensCss(tokens)
    expect(css).toContain('--breakpoint-xs: 360px;')
    expect(css).toContain('--breakpoint-lg: 1280px;')
    expect(css).toContain('--radius-pill: 9999px;')
    expect(css).toContain('--z-drawer: 50;')
    expect(css).toContain('--z-tooltip: 80;')
    expect(css).toContain('--duration-fast: 120ms;')
    expect(css).toContain('--font-weight-regular: 400;')
    expect(css).toContain('--font-size-md: 16px;')
    expect(css).toContain('--font-family-body: "DM Sans", system-ui, sans-serif;')
  })

  it('emits the light color palette in :root', (): void => {
    const css = renderTokensCss(tokens)
    expect(css).toContain('--color-background: #ffffff;')
    expect(css).toContain('--color-accent: #0066cc;')
  })

  it('produces deterministic byte-stable output across calls', (): void => {
    expect(renderTokensCss(tokens)).toBe(renderTokensCss(tokens))
  })

  it('terminates the file with a trailing newline', (): void => {
    expect(renderTokensCss(tokens).endsWith('\n')).toBe(true)
  })
})
