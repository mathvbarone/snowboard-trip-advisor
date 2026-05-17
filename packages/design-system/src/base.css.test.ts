import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// S0 base reset/base. jsdom can't resolve @media or computed custom
// properties, so the assertion is on CSS source text. Full cascade
// verification is the dev-server smoke step in the plan (Task 5).
describe('base.css', (): void => {
  const path = resolve(import.meta.dirname, 'base.css')
  const source = readFileSync(path, 'utf8')

  it('applies a universal border-box box-sizing reset', (): void => {
    expect(source).toContain('box-sizing: border-box')
    expect(source).toContain('*, *::before, *::after')
  })

  it('zeroes the body margin', (): void => {
    expect(source).toContain('margin: 0')
  })

  it('drives body typography and colours from tokens', (): void => {
    expect(source).toContain('font-family: var(--font-family-body)')
    expect(source).toContain('color: var(--color-foreground)')
    expect(source).toContain('background: var(--color-background)')
  })

  it('declares a token-driven :focus-visible baseline', (): void => {
    expect(source).toContain(':focus-visible')
    expect(source).toContain('outline: 2px solid var(--color-accent)')
  })
})
