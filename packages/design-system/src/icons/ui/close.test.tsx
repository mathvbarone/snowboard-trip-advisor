import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CloseGlyph } from './close'

describe('CloseGlyph', (): void => {
  it('renders an SVG with currentColor (no hex literal) and the size prop', (): void => {
    const { container } = render(<CloseGlyph size={16} />)
    const svg = container.querySelector('svg') as SVGSVGElement
    expect(svg).not.toBeNull()
    expect(svg.outerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}/)
    expect(svg.outerHTML).toMatch(/currentColor/)
    expect(svg.getAttribute('width')).toBe('16')
    expect(svg.getAttribute('height')).toBe('16')
    expect(svg.getAttribute('aria-hidden')).toBe('true')
  })
})
