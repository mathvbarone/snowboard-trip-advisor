import { useEffect, useRef } from 'react'

// Tier 5 PR 4.6a — global keyboard shortcuts hook (parent spec §3.10).
//
// Phase 1 ships 4 of the 5 spec §3.10 shortcuts; the `/` shortcut is deferred
// to Phase 2 when search functionality lands per Tier 5 plan Decision B1
// (a focus-only target violates WCAG 3.3.2 / 4.1.2 — input claims search role,
// does nothing).
//
// Conventions:
//   - Single document-level `keydown` listener per consumer-mount (Decision F5).
//   - Handlers are pinned via useRef so re-renders with fresh handler closures
//     don't tear down + re-attach the listener (would silently drop keystrokes
//     mid-render). useEffect dep array is empty; ref reads see latest handlers.
//   - `g _` chord uses a 1000 ms sequence window; the next `g` after expiry
//     restarts the window (Decision F2).
//   - Editable-target bypass: `g _` skip when document.activeElement is INPUT,
//     TEXTAREA, SELECT, or contenteditable. `mod+enter` and `Escape` fire
//     regardless (intentional cross-context shortcuts per spec §3.10) — Decision F3.
//   - Cross-platform `mod+enter`: matches both Meta+Enter (macOS) and
//     Control+Enter (Linux/Windows).

const SEQUENCE_WINDOW_MS = 1000

export interface ShortcutHandlers {
  readonly onGoResorts?: () => void
  readonly onGoIntegrations?: () => void
  readonly onModEnter?: () => void
  readonly onEscape?: () => void
}

const EDITABLE_TAGS: ReadonlySet<string> = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

function isEditableTarget(): boolean {
  // document.activeElement is Element | null; treat null as <body> so the
  // null branch collapses (BODY isn't in EDITABLE_TAGS and has no
  // contenteditable ancestor, so the function still returns false). Avoids
  // a defensive `if (el === null)` that's unreachable through jsdom (where
  // activeElement defaults to body) and would otherwise fail the 100%-coverage
  // gate per AGENTS.md "restructure instead of suppress."
  const el = document.activeElement ?? document.body
  if (EDITABLE_TAGS.has(el.tagName)) { return true }
  // contenteditable detection via attribute walk: matches the live-DOM
  // definition (any ancestor with contenteditable="true" makes its descendants
  // editable). closest() walks up so the bypass fires even when focus is on a
  // child of the editing host. We use closest() rather than HTMLElement
  // isContentEditable because jsdom does not implement isContentEditable, and
  // having an untested fast-path branch would fail the 100%-coverage gate.
  // Element.closest is defined on every Element subclass (HTML / SVG / MathML)
  // so no `instanceof HTMLElement` guard is needed.
  return el.closest('[contenteditable="true"], [contenteditable=""]') !== null
}

export function useShortcuts(handlers: ShortcutHandlers): void {
  // Decision F5 + plan-reviewer P0 fold #6: pin handlers via ref so the
  // useEffect body runs ONCE per consumer-mount and ref reads see the latest
  // handler closures. Without the ref, the [handlers] dep would re-trigger the
  // effect on every Shell render (handlers are inline closures, not memoized).
  const handlersRef = useRef<ShortcutHandlers>(handlers)
  handlersRef.current = handlers

  useEffect((): (() => void) => {
    let pendingG: ReturnType<typeof setTimeout> | null = null
    let awaitingChord = false

    const clearPending = (): void => {
      if (pendingG !== null) {
        clearTimeout(pendingG)
        pendingG = null
      }
      awaitingChord = false
    }

    const onKeydown = (event: KeyboardEvent): void => {
      const h = handlersRef.current

      // Escape: fire regardless of focus target. Radix Dialog handles modal
      // Escape internally — Shell's wired callback is a no-op in Phase 1
      // (Tier 5 plan Decision G1).
      if (event.key === 'Escape') {
        h.onEscape?.()
        return
      }

      // mod+enter (Meta+Enter on macOS, Ctrl+Enter on Linux/Windows): fire
      // regardless of focus target (spec §3.10 expects this from inside
      // editor inputs).
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        h.onModEnter?.()
        return
      }

      // g _ chord: bypass when an editable element has focus. Codex round-1 P3
      // (PR #103, 2026-05-12): when the bypass fires WHILE a chord is pending,
      // clear the chord — otherwise a user who pressed `g` outside the editor,
      // then focused an input within the 1 s window and typed, would have a
      // stale chord re-fire if they later pressed `r`/`i` outside the input
      // before the timer expired.
      if (isEditableTarget()) {
        if (awaitingChord) { clearPending() }
        return
      }

      if (awaitingChord) {
        const second = event.key
        clearPending()
        if (second === 'r') { h.onGoResorts?.(); return }
        if (second === 'i') { h.onGoIntegrations?.(); return }
        // Unknown second key: silently drop the chord; do NOT re-arm on this
        // keystroke (would surprise the user typing an unrelated key).
        return
      }

      if (event.key === 'g') {
        awaitingChord = true
        pendingG = setTimeout(clearPending, SEQUENCE_WINDOW_MS)
      }
    }

    document.addEventListener('keydown', onKeydown)
    return (): void => {
      clearPending()
      document.removeEventListener('keydown', onKeydown)
    }
  }, [])
}
