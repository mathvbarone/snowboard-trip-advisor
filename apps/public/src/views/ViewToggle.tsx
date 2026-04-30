import {
  ToggleButtonGroup,
  type ToggleButtonOption,
} from '@snowboard-trip-advisor/design-system'
import type { JSX } from 'react'

import { VIEW_VALUES, type ViewValue } from '../lib/urlState'
import { setURLState, useURLState } from '../state/useURLState'

// Cards/Matrix view toggle. Lives at App level (above the View dispatch),
// not inside FilterBar, so the toggle is reachable from BOTH views — once
// the user enters matrix, FilterBar is unmounted (matrix has no
// country/sort/price filters) and an in-FilterBar toggle would disappear,
// leaving the user with no UI affordance to return to cards.
//
// PUSH transition on `&view=` so browser-back returns to the previous view.

const VIEW_LABELS: Record<ViewValue, string> = {
  cards: 'Cards',
  matrix: 'Matrix',
}

const VIEW_OPTIONS: ReadonlyArray<ToggleButtonOption> = VIEW_VALUES.map(
  (v): ToggleButtonOption => ({ value: v, label: VIEW_LABELS[v] }),
)

export default function ViewToggle(): JSX.Element {
  const url = useURLState()

  function onViewChange(next: string): void {
    // Safe cast: option values are VIEW_OPTIONS-bound (cards | matrix); the
    // ToggleButtonGroup contract is `string` because the primitive is
    // generic, not view-specific.
    setURLState({ view: next as ViewValue })
  }

  return (
    <div data-region="view-toggle">
      <ToggleButtonGroup
        label="View"
        options={VIEW_OPTIONS}
        selected={url.view}
        onChange={onViewChange}
      />
    </div>
  )
}
