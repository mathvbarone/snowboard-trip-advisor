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
//
// Not safe under concurrent execution: this swaps the runner's shared
// `document.documentElement`. Vitest runs tests sequentially within a file
// by default; do not call `runAxe` from `Promise.all`, `it.concurrent`, or
// parallel `describe` blocks until the harness is hardened to use a per-call
// JSDOM Window (Epic 3 PR 3.6).
export async function runAxe(html: string): Promise<AxeResults> {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  document.replaceChild(
    document.importNode(parsed.documentElement, true),
    document.documentElement,
  )
  return axe.run(document, {
    // Tags: wcag2a (Level A) + wcag2aa (the AA-only delta).
    // Level AAA is intentionally not included here — spec §2.4 mandates AAA
    // only for body-text contrast, which is verified at the token level
    // (packages/design-system/src/tokens.ts), not per-route via axe.
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    resultTypes: ['violations'],
  })
}
