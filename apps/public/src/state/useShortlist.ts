import { useURLState } from './useURLState'

// Skeleton hook — PR 3.1c only exposes the URL-derived shortlist read path.
// Full hydration-from-localStorage + collision-aware merge/replace lands in
// PR 3.3 (spec §6.1 "useShortlist rules"); this scaffolding lets App.tsx
// import the hook today without coupling to the unimplemented dialog flow.
export function useShortlist(): { shortlist: ReadonlyArray<string> } {
  const url = useURLState()
  return { shortlist: url.shortlist }
}
