import { tokens } from '@snowboard-trip-advisor/design-system'
import { useCallback, useSyncExternalStore } from 'react'

// Returns { readOnly: true } when the viewport is below the design-system `md`
// breakpoint (= 900px per packages/design-system/src/tokens.ts:21). Below md,
// the admin editor is read-only per AGENTS.md "Admin App Rules" + spec §3.2 —
// edit controls are removed from the tab order, action buttons are
// `disabled={readOnly}` per Tier 5 plan Decision D1.
//
// Internals: matchMedia subscription via useSyncExternalStore. jsdom-friendly
// fallback to readOnly: false (= aboveMd: true) when window.matchMedia is
// unavailable, matching the FieldRow useIsAboveMd pattern (PR 4.4d D11). This
// lets test files that mount components indirectly skip the matchMedia stub.

const ABOVE_MD_QUERY = `(min-width: ${tokens.breakpoint.md.toString()}px)`

function hasMatchMedia(): boolean {
  return typeof window.matchMedia === 'function'
}

function getAboveMdSnapshot(): boolean {
  if (!hasMatchMedia()) { return true }
  return window.matchMedia(ABOVE_MD_QUERY).matches
}

export function useResponsiveTabOrder(): { readonly readOnly: boolean } {
  const subscribe = useCallback((cb: () => void): (() => void) => {
    if (!hasMatchMedia()) { return (): void => {} }
    const mql = window.matchMedia(ABOVE_MD_QUERY)
    mql.addEventListener('change', cb)
    return (): void => { mql.removeEventListener('change', cb) }
  }, [])
  const aboveMd = useSyncExternalStore(subscribe, getAboveMdSnapshot)
  return { readOnly: !aboveMd }
}
