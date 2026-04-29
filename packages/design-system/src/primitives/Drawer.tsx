import * as RadixDialog from '@radix-ui/react-dialog'
import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type AnimationEventHandler,
  type JSX,
  type ReactNode,
  type RefObject,
} from 'react'

// Drawer — non-modal slide-in panel. Spec §7.9 contract:
//   - keyboard focus stays inside (Radix `trapFocus` is true; the dialog
//     traps Tab/Shift-Tab cycling);
//   - mouse-clicks behind the drawer continue to work — there is no
//     blocking overlay, and we mount Dialog with `modal={false}` so
//     `react-remove-scroll` is NOT engaged (cards remain clickable);
//   - Escape and outside-click dismiss (Radix builtin via DismissableLayer,
//     which Dialog composes internally);
//   - focus returns to the trigger on close (Radix behavior when triggered
//     via `Dialog.Trigger`; we additionally restore focus from a captured
//     activeElement so consumers using a controlled `open` prop with their
//     own trigger element get the same behavior);
//   - data attributes for token-driven CSS:
//       * data-position="left|right" — slide direction.
//       * data-reduced-motion="true" — set when the user has
//         `(prefers-reduced-motion: reduce)`; CSS collapses transition to
//         0ms via `[data-reduced-motion='true'] { transition: none; }`.
//
// Full prop superset is shipped now (per PR 3.3 spec acceptance gate +
// §5.5 "frozen interface" rule) so PR 3.5's DetailDrawer reuses the same
// primitive without amendments:
//   - `defaultOpen` — opens on first mount even when controlled `open=false`.
//   - `initialFocus` — RefObject to focus on open (overrides Radix's
//     "first focusable" auto-focus).
//   - `onAnimationEnd` — fires after the slide-in / slide-out animation;
//     used by ShortlistDrawer for "drawer fully closed → safe to mark seen".
//   - `position` — left or right edge.
//
// jsdom does not run real CSS animations, so onAnimationEnd is wired to the
// React `onAnimationEnd` event on the panel — a real `animationend` DOM
// event (synthetic or native) triggers it. The Drawer.test.tsx case
// dispatches a native event to assert the wiring.

export interface DrawerProps {
  /** Controlled open flag. */
  open: boolean
  /** Called with the next open state on Escape / outside-click / explicit
   *  close. */
  onOpenChange: (open: boolean) => void
  /** Required accessible name. Rendered visibly inside the drawer as the
   *  first heading. */
  title: string
  /** Drawer body. */
  children: ReactNode
  /** Slide direction. Defaults to 'right'. */
  position?: 'left' | 'right'
  /** Open on first mount even when `open` is initially false. Useful for
   *  ShortlistDrawer's "open after &shortlist=… on cold start" pathway —
   *  but kept here on the primitive so PR 3.5 can reuse it. */
  defaultOpen?: boolean
  /** Element to focus on open. Overrides Radix's default "first focusable
   *  inside the drawer" behavior. */
  initialFocus?: RefObject<HTMLElement | null>
  /** Fires after the slide animation completes (open or close). */
  onAnimationEnd?: AnimationEventHandler<HTMLDivElement>
}

export function Drawer({
  open,
  onOpenChange,
  title,
  children,
  position = 'right',
  defaultOpen = false,
  initialFocus,
  onAnimationEnd,
}: DrawerProps): JSX.Element {
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const reducedMotion = usePrefersReducedMotion()

  // `defaultOpen` semantics: when the parent has not yet set `open=true` on
  // mount, but `defaultOpen` is true, we tell the parent to open. After the
  // first render the parent owns the state. We do this in a one-shot
  // effect rather than inside render to avoid React's "setState during
  // render of another component" warning.
  const defaultOpenAppliedRef = useRef<boolean>(false)
  useEffect((): void => {
    if (defaultOpen && !defaultOpenAppliedRef.current) {
      defaultOpenAppliedRef.current = true
      if (!open) {
        onOpenChange(true)
      }
    }
  }, [defaultOpen, open, onOpenChange])

  // Capture / restore focus mirrors the Modal contract — see Modal.tsx for
  // the rationale. Radix's own focus-restore relies on its <Trigger>
  // wrapper, which our controlled-open API does not require consumers to
  // use, so we capture the active element ourselves on the open-edge.
  useEffect((): (() => void) | undefined => {
    if (!open) {
      return undefined
    }
    const active = document.activeElement
    previousFocusRef.current = active instanceof HTMLElement ? active : null
    return (): void => {
      previousFocusRef.current?.focus()
    }
  }, [open])

  // `onOpenAutoFocus` runs after Radix decides the auto-focus target. When
  // an `initialFocus` ref is supplied, we prevent the default and call
  // `.focus()` on the ref's current element instead. The ref must be
  // populated by render time; if it isn't, fall through to Radix's
  // default "first focusable" behavior.
  function handleOpenAutoFocus(event: Event): void {
    const target = initialFocus?.current
    if (target !== null && target !== undefined) {
      event.preventDefault()
      target.focus()
    }
  }

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <RadixDialog.Portal>
        <RadixDialog.Content
          className="sta-drawer"
          data-position={position}
          data-reduced-motion={reducedMotion ? 'true' : undefined}
          aria-describedby={undefined}
          onAnimationEnd={onAnimationEnd}
          onOpenAutoFocus={handleOpenAutoFocus}
        >
          <RadixDialog.Title className="sta-drawer__title">{title}</RadixDialog.Title>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}

// Inline matchMedia subscriber — duplicates apps/public's useMediaQuery on
// purpose. design-system depends only on schema (see CLAUDE.md "Workspace
// & Architecture Rules"); pulling apps/public's hook would invert the DAG.
// The hook here is private to the Drawer primitive.
//
// useSyncExternalStore subscribes to the MediaQueryList so the rendered
// `data-reduced-motion` attribute tracks live OS-preference changes — a
// bare snapshot would miss preference toggles between renders.
function usePrefersReducedMotion(): boolean {
  // No SSR in this app, so the optional getServerSnapshot is omitted —
  // useSyncExternalStore returns the client snapshot on every call.
  return useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
  )
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function subscribeReducedMotion(callback: () => void): () => void {
  const mql = window.matchMedia(REDUCED_MOTION_QUERY)
  mql.addEventListener('change', callback)
  return (): void => {
    mql.removeEventListener('change', callback)
  }
}

function getReducedMotionSnapshot(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}
