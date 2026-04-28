import type { JSX } from 'react'

import type { IconProps } from '../types'

// Snow-Forecast source glyph. Placeholder forecast-arrow over a flake.
// `currentColor` only — no hex literal, no external fetch.
export function SnowForecastGlyph({ size }: IconProps): JSX.Element {
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
      {/* forecast bars trending up */}
      <path d="M3 19l5-5 4 4 9-9" />
      <path d="M14 9h7v7" />
    </svg>
  )
}
