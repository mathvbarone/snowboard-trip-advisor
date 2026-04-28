import { useEffect, useState } from 'react'

// Subscribes to a CSS media query via window.matchMedia and re-renders when
// the query result flips. Cleanup removes the listener on unmount.
//
// The hook re-evaluates `matchMedia(query)` only when the `query` string
// itself changes (effect dependency); per-query listeners are independent so
// multiple call sites don't share state.
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(
    (): boolean => window.matchMedia(query).matches,
  )

  useEffect((): (() => void) => {
    const mql = window.matchMedia(query)
    setMatches(mql.matches)
    const listener = (event: MediaQueryListEvent): void => {
      setMatches(event.matches)
    }
    mql.addEventListener('change', listener)
    return (): void => {
      mql.removeEventListener('change', listener)
    }
  }, [query])

  return matches
}
