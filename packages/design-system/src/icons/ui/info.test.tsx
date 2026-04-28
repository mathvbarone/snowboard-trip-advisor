import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { InfoGlyph } from './info'

describe('InfoGlyph', (): void => {
  it('renders an SVG with currentColor (no hex literal) and the size prop', (): void => {
    const { container } = render(<InfoGlyph size={14} />)
    const svg = container.querySelector('svg') as SVGSVGElement
    expect(svg).not.toBeNull()
    expect(svg.outerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}/)
    expect(svg.outerHTML).toMatch(/currentColor/)
    expect(svg.getAttribute('width')).toBe('14')
    expect(svg.getAttribute('height')).toBe('14')
    expect(svg.getAttribute('aria-hidden')).toBe('true')
  })
})
