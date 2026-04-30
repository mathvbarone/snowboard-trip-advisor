import { useEffect, useRef } from 'react'

import type { ViewValue } from '../lib/urlState'

// Resets window scroll on cards ↔ matrix transitions only. Spec §6.1
// (line 244) prescribes this — sort / country / shortlist / detail /
// highlight changes must NOT scroll-reset, so the dep array narrows to
// the single `view` argument. The first-mount fire is suppressed via a
// ref so cards-landing initial render keeps any scroll position the
// user navigated to (e.g. share-link with hash anchor, browser-restored
// scroll on back-nav).
export function useScrollReset(view: ViewValue): void {
  const isFirstRunRef = useRef<boolean>(true)
  useEffect((): void => {
    if (isFirstRunRef.current) {
      isFirstRunRef.current = false
      return
    }
    window.scrollTo(0, 0)
  }, [view])
}
