import type { JSX } from 'react'

import type { IconProps } from '../types'

// "X" close glyph. `currentColor` only.
export function CloseGlyph({ size }: IconProps): JSX.Element {
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
      <path d="M5 5l14 14" />
      <path d="M19 5L5 19" />
    </svg>
  )
}
