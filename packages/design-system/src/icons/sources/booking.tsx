import type { JSX } from 'react'

import type { IconProps } from '../types'

// Booking.com source glyph. Bed placeholder — reads as "lodging".
// `currentColor` only; no brand-specific colour or external favicon fetch.
export function BookingGlyph({ size }: IconProps): JSX.Element {
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
      {/* bed silhouette */}
      <path d="M3 10v8" />
      <path d="M21 18v-5a3 3 0 0 0-3-3H3" />
      <path d="M7 13h.01" />
      <path d="M3 18h18" />
    </svg>
  )
}
