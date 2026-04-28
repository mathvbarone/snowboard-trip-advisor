import type { ResortSlug } from '@snowboard-trip-advisor/schema'
import type { JSX } from 'react'

// Frozen interface (spec §5.5). PR 3.5 ships the actual drawer; the throw
// keeps the call site honest until then — App.tsx already wires the lazy
// import + slug-existence guard, so any premature render surfaces as a clear
// error rather than a blank overlay.
export interface DetailDrawerProps {
  slug: ResortSlug
}

export default function DetailDrawer(props: DetailDrawerProps): JSX.Element {
  // Reference props.slug to avoid an unused-binding warning while the body is
  // a stub. PR 3.5 replaces this with the real drawer that consumes the slug.
  void props.slug
  throw new Error('detail route stub — lands in PR 3.5')
}
