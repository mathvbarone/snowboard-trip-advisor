import { act, render, type RenderResult } from '@testing-library/react'
import { type ReactNode } from 'react'

// Shared helpers for the integration suite. Hoisted out of individual
// .test.tsx files so future scenarios import a single source of truth
// rather than copy-pasting boilerplate (which drifts silently). Lives
// in its own module — `test-setup.ts` is reserved for global lifecycle
// (MSW server, jest-axe matcher, jsdom stubs) and runs implicitly via
// vite.config's `setupFiles`; helpers should be explicit imports so
// reading any test file shows what it depends on.

/**
 * Render a React node and drain ten microtask turns inside a single
 * `act()` so React 19 `use()` Promise resolutions, MSW responses, and
 * the resulting `useDataset` re-renders all flush before the test
 * begins asserting. The drain count (10) matches what
 * `apps/public/src/test-utils.tsx`'s `renderAsync` uses; ten turns is
 * empirically enough for the `useDataset` chain (load → fetch → parse
 * → useShortlist hydration → final render) to settle without
 * leaving the test wrapped in `waitFor` boilerplate at every call
 * site.
 */
export async function renderAsync(node: ReactNode): Promise<RenderResult> {
  let view!: RenderResult
  await act(async (): Promise<void> => {
    view = render(node)
    for (let i = 0; i < 10; i += 1) {
      await Promise.resolve()
    }
  })
  return view
}

/**
 * Replace the current `window.location.search` without triggering a
 * navigation. The integration tests drive the App's URL-state hook
 * (`useUrlState`) by setting `?...` before calling `renderAsync`; the
 * App reads `window.location.search` on mount. Pass an empty string to
 * clear the query (used in `afterEach` to keep tests isolated).
 */
export function setLocation(search: string): void {
  window.history.replaceState({}, '', `/${search.length > 0 ? `?${search}` : ''}`)
}

/**
 * Document-order check: returns true when `a` follows `b` in the
 * document tree. Wraps `Node.compareDocumentPosition` and masks the
 * `DOCUMENT_POSITION_FOLLOWING` (4) bit — DOM Living Standard
 * guarantees this constant is stable. Used for focus-order assertions
 * (skip-link → ViewToggle → first content button) without coupling to
 * `tabIndex` numerics.
 */
export function follows(a: Node, b: Node): boolean {
  const FOLLOWING = 4
  return (b.compareDocumentPosition(a) & FOLLOWING) === FOLLOWING
}
