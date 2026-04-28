import type { JSX } from 'react'

import type { IconProps } from '../types'

// OpenSnow source glyph. Geometric placeholder — a snow-cloud reads as the
// "snow forecast / conditions" source family. Real branded artwork is not
// fetched at runtime (CSP `img-src 'self'` + zero-tracking). Stroke +
// fill use `currentColor` so the glyph inherits the surrounding text
// colour (consumers control colour via the design-token palette).
export function OpenSnowGlyph({ size }: IconProps): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* cloud */}
      <path d="M6 14a4 4 0 1 1 1.5-7.7A5 5 0 0 1 17 8a3.5 3.5 0 0 1 .5 7H6Z" />
      {/* snowflake */}
      <path d="M12 17v4" />
      <path d="M10 19l4 2" />
      <path d="M14 19l-4 2" />
    </svg>
  )
}
