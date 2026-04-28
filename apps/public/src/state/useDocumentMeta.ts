import { useEffect } from 'react'

import { serializeURL, type URLState } from '../lib/urlState'

// Effect-based hook that mirrors URL state into the document <title> and the
// <link rel="canonical"> href. Both writes are pure DOM mutations; no React
// state — they are observable side effects of route navigation.
//
// The base title comes from index.html ("Snowboard Trip Advisor"). The matrix
// view prefixes a route-specific phrase. (Detail-overlay titling lands with
// PR 3.5; the cards view uses the base title verbatim.)

const BASE_TITLE = 'Snowboard Trip Advisor'

function titleFor(state: URLState): string {
  if (state.view === 'matrix') {
    return `Comparison matrix — ${BASE_TITLE}`
  }
  return BASE_TITLE
}

function canonicalHref(state: URLState): string {
  const search = serializeURL(state)
  const base = `${window.location.origin}${window.location.pathname}`
  return search.length > 0 ? `${base}?${search}` : base
}

export function useDocumentMeta(state: URLState): void {
  useEffect((): void => {
    document.title = titleFor(state)

    let link = document.querySelector('link[rel="canonical"]')
    if (link === null) {
      link = document.createElement('link')
      link.setAttribute('rel', 'canonical')
      document.head.appendChild(link)
    }
    link.setAttribute('href', canonicalHref(state))
  }, [state])
}
