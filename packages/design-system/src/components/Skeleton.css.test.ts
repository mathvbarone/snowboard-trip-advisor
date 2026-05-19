import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// Skeleton visual CSS. jsdom can't resolve the cascade/tokens, so the
// testable surface is CSS source text; real cascade is the gallery
// Playwright smoke (plan §Gallery smoke). The component emits
// `<div role="status" aria-busy="true" data-variant="line|block|card"
//  class="sta-skeleton sta-skeleton--<variant>">`. We assert the
// `[data-variant]` attribute form (consistent with the other S1c
// components) plus the `role="status"` hook. A subtle shimmer animation is
// required and MUST be disabled under prefers-reduced-motion.
describe('Skeleton.css', (): void => {
  const path = resolve(import.meta.dirname, 'Skeleton.css')
  const source = readFileSync(path, 'utf8')

  it('declares the base selector', (): void => {
    expect(source).toContain('.sta-skeleton')
  })
  it('styles the line variant via data-variant', (): void => {
    expect(source).toContain('.sta-skeleton[data-variant="line"]')
  })
  it('styles the block variant via data-variant', (): void => {
    expect(source).toContain('.sta-skeleton[data-variant="block"]')
  })
  it('styles the card variant via data-variant', (): void => {
    expect(source).toContain('.sta-skeleton[data-variant="card"]')
  })
  it('styles the role=status live-region hook', (): void => {
    expect(source).toContain('.sta-skeleton[role="status"]')
  })
  it('declares a shimmer keyframe animation', (): void => {
    expect(source).toContain('@keyframes')
    expect(source).toContain('animation:')
  })
  it('disables the shimmer under prefers-reduced-motion: reduce', (): void => {
    expect(source).toContain('@media (prefers-reduced-motion: reduce)')
    expect(source).toMatch(/animation:\s*none/)
  })
  it('drives values from design tokens only', (): void => {
    expect(source).toMatch(/var\(--(color|space|radius|font|duration)-/)
    expect(source).not.toMatch(/:\s*#[0-9a-fA-F]{3,6}\b/)
  })
})
