import type { JSX } from 'react'

import type { IconProps } from '../types'

// Star glyph — used by ResortCard's shortlist toggle. `filled=true` is the
// "in shortlist" pressed state. Both filled + outline use `currentColor`,
// inheriting the surrounding text colour.
export interface StarGlyphProps extends IconProps {
  filled?: boolean
}

export function StarGlyph({ size, filled = false }: StarGlyphProps): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-filled={filled ? 'true' : 'false'}
    >
      <path d="M12 3l2.7 6.3L21 10l-5 4.6L17.4 21 12 17.6 6.6 21 8 14.6 3 10l6.3-.7L12 3Z" />
    </svg>
  )
}
