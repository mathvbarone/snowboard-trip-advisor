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
  // Codex round 2 PR #100 P2 fold: track hover + focus independently so a
  // mouseleave-after-mouseenter does NOT resume the timer while the
  // keyboard user is still focused (and vice versa). The timer resumes only
  // after BOTH interactions have left the toast.
  const isHoveredRef = useRef<boolean>(false)
  const isFocusedRef = useRef<boolean>(false)

  // Codex round 1 PR #100 P2 fold: include `dismissAfterMs` in the effect
  // dep-array and reset `remainingRef` at the top of each run so consumers
  // re-rendering <Toast> in place with a new variant or `dismissAfterMs`
  // adopt the new duration. The single-slot <ToastProvider> path remounts
  // <Toast> via the per-show key (Decision C2), so this effect only re-runs
  // for direct-consumer use; that path was previously stuck on the
  // first-render duration.
  //
  // Codex round 3 PR #100 P2 fold: when the effect restarts while either
  // pause flag is active (e.g. consumer passes a new inline `onDismiss`
  // identity during a parent re-render, or swaps `dismissAfterMs` while the
  // user is still hovering / focused), leave the timer cleared instead of
  // unconditionally scheduling. Resume runs from `handleMouseLeave` /
  // `handleBlur` when both flags clear, using the fresh `remainingRef`
  // captured above for the full new duration.
  useEffect((): (() => void) => {
    remainingRef.current = dismissAfterMs
    startedAtRef.current = Date.now()
    if (!isHoveredRef.current && !isFocusedRef.current) {
      timerRef.current = setTimeout(onDismiss, remainingRef.current)
    }
    return (): void => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [onDismiss, dismissAfterMs])

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
  const role = variant === 'error' ? 'alert' : 'status'

  return (
    <div
      role={role}
      tabIndex={0}
      className={`sta-toast sta-toast--${variant}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      <span className="sta-toast__message">{message}</span>
      <Button variant="ghost" onClick={onDismiss} aria-label="Dismiss notification">
        ×
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ToastProvider + useToast — single-slot per Decision C2.
// ---------------------------------------------------------------------------

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
  const keyRef = useRef<number>(0)

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
      },
    }),
    [],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
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
