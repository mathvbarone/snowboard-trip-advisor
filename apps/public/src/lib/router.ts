import type { URLState } from './urlState'

// Pure URL-state → active-view selector. The detail drawer is an overlay
// (spec §3.3) so it doesn't participate in this dispatch — App.tsx mounts
// <DetailDrawer /> independently when `&detail=<slug>` is present and
// the slug exists in the dataset.
export function urlToView(state: URLState): 'cards' | 'matrix' {
  return state.view
}
