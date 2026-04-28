import type { JSX } from 'react'

// Shared icon component shape. Every glyph renders an aria-hidden SVG sized
// from a `size` prop; colour comes from `currentColor` so the glyph inherits
// the surrounding text colour (no per-glyph hex literal). Consumers wrap the
// glyph in a labelled element when an SR-visible name is required (e.g.
// `<SourceBadge>` provides the label, the glyph stays decorative).
export interface IconProps {
  size: number
}

export type IconComponent = (props: IconProps) => JSX.Element
