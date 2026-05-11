import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from 'react'

// Toast — design-system primitive for the Tier 4 publish flow's success /
// failure notification surface (plan §4.5b, spec §5.1 + §7.15). See
// `Toast.test.tsx`'s top-of-file commentary for the Decision C1/C2 rules
// this implementation honors.
//
// Codex round 22 (PR #97) P2 fold: import the scoped CSS at the top so the
// Toast renders as a fixed top-right notification (mirrors Drawer.tsx:12).
import './Toast.css'
import { Button } from './Button'

export type ToastVariant = 'info' | 'success' | 'error'

export interface ToastProps {
  readonly variant: ToastVariant
  readonly message: string
  readonly onDismiss: () => void
  readonly dismissAfterMs?: number
}

// Per-variant auto-dismiss defaults per Decision C1 (P2-1 fold — WCAG 2.2
// SC 2.2.1 timing-adjustable). `error` lingers longer because the user is
// likely re-reading + recovering, while `info`/`success` are confirmatory
// signals that the user already expected.
const DEFAULT_DISMISS_MS: Record<ToastVariant, number> = {
  info: 5000,
  success: 5000,
  error: 8000,
}

export function Toast(props: ToastProps): JSX.Element {
  const { variant, message, onDismiss } = props
  const dismissAfterMs = props.dismissAfterMs ?? DEFAULT_DISMISS_MS[variant]
  // Track the remaining time so hover / focus pause can preserve user-
  // perceived progress: pausing snapshots `(now - startedAt)` and subtracts
  // from `remainingRef`; resume restarts a setTimeout for that remainder.
  const remainingRef = useRef<number>(dismissAfterMs)
  const startedAtRef = useRef<number>(Date.now())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Codex round 5 PR #100 P2 fold: track the previously-rendered
  // `dismissAfterMs` so the main effect can distinguish "duration swap"
  // (must reset `remainingRef` to the full new duration) from
  // "onDismiss-only swap" (must preserve elapsed progress). Without this,
  // a parent re-rendering more often than `dismissAfterMs` with an inline
  // `onDismiss` arrow kept resetting `remainingRef` to full and the toast
  // lived indefinitely.
  //
  // Codex round 10 PR #100 P2 fold: track previous `message` and
  // `variant` too. A direct-consumer rerender with a NEW message (or a
  // variant swap whose default duration is the same — e.g. info → success
  // both default to 5000ms) must restart the timer at the full duration,
  // not inherit the previous toast's remainder. The single-slot
  // <ToastProvider> path key-remounts so it's not affected; this matters
  // only for the exported direct-<Toast> API.
  const prevDismissAfterMsRef = useRef<number>(dismissAfterMs)
  const prevMessageRef = useRef<string>(message)
  const prevVariantRef = useRef<ToastVariant>(variant)
  // Codex round 2 PR #100 P2 fold: track hover + focus independently so a
  // mouseleave-after-mouseenter does NOT resume the timer while the
  // keyboard user is still focused (and vice versa). The timer resumes only
  // after BOTH interactions have left the toast.
  const isHoveredRef = useRef<boolean>(false)
  const isFocusedRef = useRef<boolean>(false)

  // Codex round 1 PR #100 P2 fold: include `dismissAfterMs` in the effect
  // dep-array so consumers re-rendering <Toast> in place with a new variant
  // or `dismissAfterMs` adopt the new duration. The single-slot
  // <ToastProvider> path remounts <Toast> via the per-show key
  // (Decision C2), so this effect only re-runs for direct-consumer use;
  // that path was previously stuck on the first-render duration.
  //
  // Codex round 3 PR #100 P2 fold: when the effect restarts while either
  // pause flag is active (e.g. consumer passes a new inline `onDismiss`
  // identity during a parent re-render, or swaps `dismissAfterMs` while the
  // user is still hovering / focused), leave the timer cleared instead of
  // unconditionally scheduling. Resume runs from `handleMouseLeave` /
  // `handleBlur` when both flags clear.
  //
  // Codex round 5 PR #100 P2 fold: only reset `remainingRef` when
  // `dismissAfterMs` ACTUALLY changes — onDismiss-identity-only swaps must
  // preserve elapsed progress, otherwise a parent that re-renders more
  // often than `dismissAfterMs` keeps the toast alive indefinitely. The
  // cleanup snapshots elapsed time into `remainingRef` BEFORE clearing the
  // timer so the next effect run picks up where this one left off.
  //
  // Codex round 10 PR #100 P2 fold: also reset on `message` or `variant`
  // change — a new notification text or variant swap must restart the
  // timer at the full new duration instead of inheriting the previous
  // toast's near-expiry remainder. onDismiss-identity-only swaps still
  // preserve elapsed progress (the round-5 invariant).
  useEffect((): (() => void) => {
    const isReplacement =
      prevDismissAfterMsRef.current !== dismissAfterMs ||
      prevMessageRef.current !== message ||
      prevVariantRef.current !== variant
    if (isReplacement) {
      remainingRef.current = dismissAfterMs
      prevDismissAfterMsRef.current = dismissAfterMs
      prevMessageRef.current = message
      prevVariantRef.current = variant
    }
    startedAtRef.current = Date.now()
    if (!isHoveredRef.current && !isFocusedRef.current) {
      timerRef.current = setTimeout(onDismiss, remainingRef.current)
    }
    return (): void => {
      if (timerRef.current !== null) {
        remainingRef.current = Math.max(
          0,
          remainingRef.current - (Date.now() - startedAtRef.current),
        )
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [onDismiss, dismissAfterMs, message, variant])

  // Internal pause primitive: clears the timer + snapshots elapsed time.
  // No-op when the timer is already paused (idempotent for double-pause via
  // hover + focus overlap).
  const pauseTimerInternal = useCallback((): void => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
      remainingRef.current = Math.max(
        0,
        remainingRef.current - (Date.now() - startedAtRef.current),
      )
    }
  }, [])

  // Internal resume primitive: starts a new timer for the captured
  // remainder. No-op when a timer is already active.
  const resumeTimerInternal = useCallback((): void => {
    if (timerRef.current !== null) {
      return
    }
    startedAtRef.current = Date.now()
    timerRef.current = setTimeout(onDismiss, remainingRef.current)
  }, [onDismiss])

  const handleMouseEnter = useCallback((): void => {
    isHoveredRef.current = true
    pauseTimerInternal()
  }, [pauseTimerInternal])

  const handleMouseLeave = useCallback((): void => {
    isHoveredRef.current = false
    // Only resume when neither interaction is active. If focus is still
    // inside the toast, keep paused so the keyboard user controls dismissal.
    if (!isFocusedRef.current) {
      resumeTimerInternal()
    }
  }, [resumeTimerInternal])

  const handleFocus = useCallback((): void => {
    isFocusedRef.current = true
    pauseTimerInternal()
  }, [pauseTimerInternal])

  const handleBlur = useCallback((): void => {
    isFocusedRef.current = false
    if (!isHoveredRef.current) {
      resumeTimerInternal()
    }
  }, [resumeTimerInternal])

  // ARIA per Decision C1: info/success → polite (`role="status"`); error →
  // assertive (`role="alert"`). The polite/assertive split matches AT
  // conventions: assertive interrupts current speech; polite waits.
  //
  // Codex round 4 PR #100 P2 fold: the live-region role lives on the message
  // <span>, NOT the outer wrapper. ARIA live regions are intended for
  // text-only announcements; embedding a focusable control (the Dismiss
  // <Button>) inside the alert region can cause AT to announce the control
  // as part of the message. Keep the wrapper as a plain interactive
  // container (hover/focus pause handlers); confine the live-region role to
  // the text span.
  const role = variant === 'error' ? 'alert' : 'status'

  // Codex round 7 PR #100 P3 fold: do NOT add `tabIndex={0}` to the outer
  // wrapper. With a tabindex but no role/name, keyboard users tab to a
  // non-control before reaching the actual Dismiss button. The
  // focus-pause behavior still works via React's bubbling synthetic
  // `onFocus`/`onBlur` events when the inner Dismiss <Button> gains/
  // loses focus.
  return (
    <div
      className={`sta-toast sta-toast--${variant}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      <span role={role} className="sta-toast__message">{message}</span>
      <Button variant="ghost" onClick={onDismiss} aria-label="Dismiss notification">
        ×
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ToastProvider + useToast — single-slot per Decision C2.
// ---------------------------------------------------------------------------
//
// Codex round 6 PR #100 P2 fold — modal-coordination constraint:
// Toasts must NOT be shown while a Radix `Dialog`/`Modal` is open. Radix's
// modal `Dialog.Content` calls `hideOthers()` which sets
// `aria-hidden="true"` on siblings of the modal content, and
// `disableOutsidePointerEvents` blocks pointer interaction outside the
// modal. A Toast rendered as a fixed-position element OUTSIDE the modal
// hierarchy would therefore be aria-hidden to assistive tech and
// unreachable via pointer — defeating both its live-region announcement
// and its Dismiss control. The planned publish flow per spec §3.7
// (`Success — dialog closes; toast`) closes the PublishDialog BEFORE
// `showToast()` runs, so the aria-hide window never materializes for the
// 4.5c consumer. Any future consumer pairing Toast with a modal must
// follow the same close-modal-first pattern, OR mount its own toast
// surface inside the dialog content.

export interface ToastInput {
  readonly variant: ToastVariant
  readonly message: string
  readonly dismissAfterMs?: number
}

interface ToastContextValue {
  readonly show: (input: ToastInput) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

interface CurrentToast {
  readonly input: ToastInput
  readonly key: number
}

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [current, setCurrent] = useState<CurrentToast | null>(null)
  // Codex round 8 PR #100 P2 fold: persistent polite live region content.
  // ARIA polite regions must exist in the DOM BEFORE their content arrives
  // for AT to announce changes (per MDN). Mounting a fresh `role="status"`
  // span with the message inline (as the visible Toast does) is often
  // silently ignored by polite-region announcers. The persistent region
  // below sits in the DOM from provider initialization; `show()` updates
  // its content for info/success variants so AT detects a content change
  // in an existing live region. Error variant relies on the visible
  // Toast's `role="alert"`, which IS reliably announced on insertion per
  // MDN's dynamic-insertion exception.
  const [politeAnnouncement, setPoliteAnnouncement] = useState<string>('')
  const keyRef = useRef<number>(0)
  // Codex round 12 PR #100 P2 fold: per-show counter used to invalidate
  // stale queueMicrotask populate callbacks. When show() is called
  // repeatedly before the deferred populate fires (e.g. show(success)
  // immediately followed by show(error) in the same event/effect tick),
  // the earlier microtask would otherwise write the now-stale message
  // into the polite region after the visible toast has already been
  // replaced. The microtask captures the counter at schedule time and
  // skips the populate if the counter has advanced. Bumped by EVERY
  // show() — including error replacements — so error invalidates a
  // prior info/success microtask too.
  const politeShowCounterRef = useRef<number>(0)

  // Codex round 23 (PR #97) P2 fold: useCallback-stable `onDismiss`.
  // Without this, the inline arrow we previously passed to <Toast> got a new
  // identity every parent render → <Toast>'s useEffect (deps include
  // onDismiss) tore down + restarted the timer with the original duration →
  // ambient re-renders (e.g. URL state changes after a publish) extended the
  // window indefinitely. `setCurrent` is stable, so the dep array is [].
  const dismissCurrent = useCallback((): void => {
    setCurrent(null)
  }, [])

  // Codex round 2 (PR #97) P1 fold: memoize the context value so consumers'
  // useEffect deps including the context don't see a new object every render
  // (which would cause infinite re-loops in PublishDialog's success/error
  // effect once PR 4.5c lands).
  //
  // Codex round 2 (PR #97) P2 fold: increment `keyRef` on every show() so a
  // replacement Toast un-mounts/re-mounts (fresh `useRef(dismissAfterMs)`).
  // Otherwise the second toast inherits the first one's `remainingRef`.
  const value = useMemo<ToastContextValue>(
    () => ({
      show: (input: ToastInput): void => {
        keyRef.current += 1
        setCurrent({ input, key: keyRef.current })
        // Update the persistent polite live region for non-error variants.
        // Error variant uses the visible Toast's role="alert" path.
        //
        // Codex round 9 PR #100 P2 fold: when consecutive toasts have
        // IDENTICAL text (e.g. two publishes in a row both showing
        // "Published successfully"), setPoliteAnnouncement(same) is a
        // state-equality no-op → no DOM update → AT doesn't detect a
        // content change → silent toast. Force a textContent diff by
        // clearing the region first, then populating with the message.
        //
        // Codex round 11 PR #100 P2 fold: schedule the populate call via
        // `queueMicrotask` (NOT `flushSync`). flushSync is a no-op when
        // called from inside a React render or effect, and the planned
        // PublishDialog (PR 4.5c) calls `show()` from a `useEffect` after
        // publish completes. queueMicrotask defers the second setState
        // to a microtask that fires AFTER React's flush microtask
        // commits the cleared state to the DOM, so the empty
        // intermediate is observable to AT in both event-handler and
        // effect contexts.
        //
        // Codex round 12 PR #100 P2 fold: bump the show-counter on
        // EVERY show() (including error) and clear the region on every
        // show(). Each queueMicrotask captures the counter at schedule
        // time and skips the populate if a later show() has bumped it.
        // Without this, a queued info/success populate could fire AFTER
        // a subsequent error replacement and write the now-stale message
        // into the polite region.
        politeShowCounterRef.current += 1
        const myShowKey = politeShowCounterRef.current
        setPoliteAnnouncement('')
        if (input.variant !== 'error') {
          queueMicrotask((): void => {
            if (myShowKey === politeShowCounterRef.current) {
              setPoliteAnnouncement(input.message)
            }
          })
        }
      },
    }),
    [],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        data-sta-toast-live="polite"
        aria-live="polite"
        className="sta-toast-sr-only"
      >
        {politeAnnouncement}
      </div>
      {current !== null && renderCurrent(current, dismissCurrent)}
    </ToastContext.Provider>
  )
}

// `dismissAfterMs` is forwarded only when present; under
// `exactOptionalPropertyTypes` we cannot pass an explicit `undefined` for an
// optional prop, so this helper picks the branch with or without the prop.
function renderCurrent(current: CurrentToast, dismissCurrent: () => void): JSX.Element {
  const { input, key } = current
  if (input.dismissAfterMs !== undefined) {
    return (
      <Toast
        key={key}
        variant={input.variant}
        message={input.message}
        dismissAfterMs={input.dismissAfterMs}
        onDismiss={dismissCurrent}
      />
    )
  }
  return (
    <Toast
      key={key}
      variant={input.variant}
      message={input.message}
      onDismiss={dismissCurrent}
    />
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- hook co-located with its <ToastProvider> per the plan's 7-file budget (matches the FieldRow.tsx precedent at apps/admin/src/views/ResortEditor/FieldRow.tsx:132). Splitting useToast into its own file would inflate the file count + break the canonical "Provider + hook live together" React pattern. The fast-refresh tradeoff (whole-file remount on edit instead of hook-only) is negligible here — Toast is a leaf primitive.
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (ctx === null) {
    throw new Error('useToast() called outside <ToastProvider>')
  }
  return ctx
}
