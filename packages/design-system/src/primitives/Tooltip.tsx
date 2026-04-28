import * as RadixTooltip from '@radix-ui/react-tooltip'
import type { JSX, ReactElement, ReactNode } from 'react'

// Wraps Radix's tooltip primitive. Tooltips show on focus + hover and dismiss
// on Escape; the floating element carries `role="tooltip"` (Radix sets this
// implicitly on the Content element). Used by `<FieldValueRenderer>` to
// surface `observed_at` / `age_days` provenance on the value pill.
//
// Default `delayDuration` is 200ms (responsive without being jumpy). The
// `<Provider>` wrapper is co-located with the trigger so consumers don't
// have to mount a global provider tree.

export interface TooltipProps {
  /** The trigger element (must accept focus). */
  children: ReactElement
  /** The tooltip body. Plain text is the typical case; ReactNode for richer content. */
  content: ReactNode
  /** ms before the tooltip opens after focus/hover; defaults to 200. */
  delayDuration?: number
}

export function Tooltip({
  children,
  content,
  delayDuration = 200,
}: TooltipProps): JSX.Element {
  return (
    <RadixTooltip.Provider delayDuration={delayDuration}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content className="sta-tooltip" sideOffset={4}>
            {content}
            <RadixTooltip.Arrow className="sta-tooltip__arrow" />
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  )
}
