import type { JSX } from 'react'

import type { IconProps } from '../types'

// Manual-entry source glyph. Pencil placeholder — reads as "human-entered".
// `currentColor` only.
export function ManualGlyph({ size }: IconProps): JSX.Element {
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
      {/* pencil */}
      <path d="M14 4l6 6L9 21H3v-6L14 4Z" />
      <path d="M13 5l6 6" />
    </svg>
  )
}
