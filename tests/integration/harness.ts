import axe from 'axe-core'
import type { AxeResults } from 'axe-core'

// Shared integration test harness. Per-route extensions (MSW handlers,
// Testing Library renders, axe-core/playwright wrappers) land in Epic 3
// PR 3.6. Spec ref: §6.6 (integration harness).

// Default viewport for mobile-first integration tests. 360×780 mirrors
// the smallest reasonable Android viewport we target; widen per-test
// when the scenario requires it.
export const MOBILE_VIEWPORT = { width: 360, height: 780 } as const

// Run axe-core against an HTML string. Writes the markup into the test
// runner's `document` and runs axe against it; the caller workspace
// must therefore run in a `jsdom` environment. We use the live document
// (rather than a `DOMParser`-detached one) because axe-core's
// `document-title` and similar rules read from the owning document's
// global state, which only exists on the live document.
export async function runAxe(html: string): Promise<AxeResults> {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  document.replaceChild(
    document.importNode(parsed.documentElement, true),
    document.documentElement,
  )
  return axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    resultTypes: ['violations'],
  })
}
