import { describe, expect, it } from 'vitest'
import { tokens } from './tokens'

describe('tokens', (): void => {
  it('exposes a 4pt spacing scale (xs..4xl)', (): void => {
    expect(tokens.space).toMatchObject({
      xs: 4,
      sm: 8,
      md: 12,
      lg: 16,
      xl: 24,
      '2xl': 32,
      '3xl': 48,
      '4xl': 64,
    })
  })

  it('exposes named breakpoints (xs/sm/md/lg)', (): void => {
    expect(tokens.breakpoint).toMatchObject({
      xs: 360,
      sm: 600,
      md: 900,
      lg: 1280,
    })
  })

  it('exposes color tokens with light + dark scopes', (): void => {
    expect(tokens.color.light).toHaveProperty('background')
    expect(tokens.color.dark).toHaveProperty('background')
  })

  it('exposes typography family tokens', (): void => {
    expect(tokens.font.family.display).toContain('DM Serif Display')
    expect(tokens.font.family.body).toContain('DM Sans')
    expect(tokens.font.family.numeric).toContain('JetBrains Mono')
  })

  it('exposes radius/zIndex/duration/fontWeight/fontSize scales', (): void => {
    expect(tokens.radius).toMatchObject({ sm: 4, md: 8, lg: 12, pill: 9999 })
    expect(tokens.zIndex).toMatchObject({
      drawer: 50,
      modal: 60,
      toast: 70,
      tooltip: 80,
    })
    expect(tokens.duration).toMatchObject({ fast: 120, base: 180, slow: 280 })
    expect(tokens.fontWeight).toMatchObject({
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    })
    expect(tokens.fontSize).toMatchObject({
      xs: 12,
      sm: 14,
      md: 16,
      lg: 20,
      xl: 24,
      '2xl': 32,
    })
  })

  it('keeps light + dark color palettes structurally identical', (): void => {
    const lightKeys = Object.keys(tokens.color.light).sort()
    const darkKeys = Object.keys(tokens.color.dark).sort()
    expect(darkKeys).toEqual(lightKeys)
  })
})
