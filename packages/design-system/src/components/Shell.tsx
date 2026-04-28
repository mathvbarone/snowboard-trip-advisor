import type { JSX, MouseEvent, ReactNode } from 'react'

// Outer layout chrome for the public app. Hosts the skip-link + the
// <main id="main"> landmark. No JS theme branching (CSS-only theme via
// prefers-color-scheme — spec §6.2). Composition lives in App.tsx, not
// in a wrapper file (spec §2.3 — AppShell wrapper dropped).
export function Shell({ children }: { children: ReactNode }): JSX.Element {
  function handleSkip(event: MouseEvent<HTMLAnchorElement>): void {
    // Don't preventDefault — the hash navigation is the visible affordance.
    // We only call .focus() because JSDOM (and several real browsers prior
    // to focusing-the-target-element fixes) don't move focus to the
    // hash-target on hash-link activation. tabIndex=-1 on <main> makes it
    // a programmatic focus target.
    event.currentTarget.blur()
    document.getElementById('main')?.focus()
  }
  return (
    <>
      <a className="sta-skip-link" href="#main" onClick={handleSkip}>
        Skip to main content
      </a>
      <main id="main" tabIndex={-1}>
        {children}
      </main>
    </>
  )
}
