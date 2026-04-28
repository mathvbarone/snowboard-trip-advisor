import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { StarGlyph } from './star'

describe('StarGlyph', (): void => {
  it('renders an SVG with currentColor (no hex literal) and the size prop', (): void => {
    const { container } = render(<StarGlyph size={20} />)
    const svg = container.querySelector('svg') as SVGSVGElement
    expect(svg).not.toBeNull()
    expect(svg.outerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}/)
    expect(svg.outerHTML).toMatch(/currentColor/)
    expect(svg.getAttribute('width')).toBe('20')
    expect(svg.getAttribute('height')).toBe('20')
    expect(svg.getAttribute('aria-hidden')).toBe('true')
  })

  it('renders a filled variant when filled=true', (): void => {
    const { container } = render(<StarGlyph size={20} filled />)
    const svg = container.querySelector('svg') as SVGSVGElement
    expect(svg.getAttribute('data-filled')).toBe('true')
  })

  it('renders an outline variant by default', (): void => {
    const { container } = render(<StarGlyph size={20} />)
    const svg = container.querySelector('svg') as SVGSVGElement
    expect(svg.getAttribute('data-filled')).toBe('false')
  })
})
