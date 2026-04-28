// Browser-only helper: append `<link rel="preload" as="font">` tags to
// `document.head` for each URL. Vite's `?url` import emits hashed
// filenames; main.tsx feeds those into this helper to put the LCP-
// critical WOFF2 subsets on the preload list.
//
// Idempotent: a no-op for any URL whose preload link already exists.
// This keeps `<StrictMode>` double-effect (and HMR re-runs) from
// duplicating tags.

export function injectFontPreloads(urls: ReadonlyArray<string>): void {
  for (const url of urls) {
    const existing = document.head.querySelector(
      `link[rel="preload"][href="${url}"]`,
    )
    if (existing !== null) {
      continue
    }
    const link = document.createElement('link')
    link.setAttribute('rel', 'preload')
    link.setAttribute('as', 'font')
    link.setAttribute('type', 'font/woff2')
    link.setAttribute('crossorigin', 'anonymous')
    link.setAttribute('href', url)
    document.head.appendChild(link)
  }
}
