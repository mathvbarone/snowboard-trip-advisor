import type { JSX } from 'react'

import type { IconProps } from '../types'

// Resort-feed glyph. Mountain placeholder — the resort's own feed.
// `currentColor` only.
export function ResortFeedGlyph({ size }: IconProps): JSX.Element {
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
      {/* twin mountain peaks */}
      <path d="M3 20l6-10 4 6 3-4 5 8H3Z" />
    </svg>
  )
}
