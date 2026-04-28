import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ManualGlyph } from './manual'

describe('ManualGlyph', (): void => {
  it('renders an SVG', (): void => {
    const { container } = render(<ManualGlyph size={16} />)
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('uses currentColor for stroke and/or fill (no hex literals)', (): void => {
    const { container } = render(<ManualGlyph size={16} />)
    const svg = container.querySelector('svg') as SVGSVGElement
    const html = svg.outerHTML
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}/)
    expect(html).toMatch(/currentColor/)
  })

  it('honours the size prop on width/height', (): void => {
    const { container } = render(<ManualGlyph size={24} />)
    const svg = container.querySelector('svg') as SVGSVGElement
    expect(svg.getAttribute('width')).toBe('24')
    expect(svg.getAttribute('height')).toBe('24')
  })

  it('marks the SVG as decorative by default (aria-hidden)', (): void => {
    const { container } = render(<ManualGlyph size={16} />)
    const svg = container.querySelector('svg') as SVGSVGElement
    expect(svg.getAttribute('aria-hidden')).toBe('true')
  })
})
