import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { useEffect, type ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Toast, ToastProvider, useToast, type ToastInput, type ToastVariant } from './Toast'

// Toast — design-system primitive that backs the Tier 4 publish flow's
// success/failure notification surface (plan §4.5b, spec §5.1 + §7.15).
// Decisions exercised:
//   - C1: 3 variants — `info`/`success` → `role="status"` (polite live region),
//     `error` → `role="alert"` (assertive). Per-variant auto-dismiss defaults
//     (info=5s, success=5s, error=8s) satisfy WCAG 2.2 SC 2.2.1 timing-
//     adjustable. Pause-on-interaction (hover + focus parity) keeps keyboard
//     users on equal footing with mouse users.
//   - C2: single-slot replacement semantics — calling `useToast().show` while
//     a Toast is visible replaces it via the per-show counter `key`, which
//     remounts the visible <Toast> so the new dismissAfterMs is honored fresh
//     (not inherited from the prior `useRef`).
//
// Test-strategy notes:
//   - `vi.useFakeTimers()` for any assertion that advances the auto-dismiss
//     timer. Real timers are restored explicitly before each test exits so
//     axe scans (which may rely on real microtasks) work cleanly.
//   - jest-axe's `toHaveNoViolations` matcher is wired globally via
//     `src/test-setup.ts`; no per-file `expect.extend` needed.

describe('Toast — variants + ARIA', (): void => {
  it('info renders role="status"; success renders role="status"; error renders role="alert"', (): void => {
    const { rerender } = render(
      <Toast variant="info" message="Hello" onDismiss={(): void => undefined} />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Hello')
    rerender(<Toast variant="success" message="Done" onDismiss={(): void => undefined} />)
    expect(screen.getByRole('status')).toHaveTextContent('Done')
    rerender(<Toast variant="error" message="Oops" onDismiss={(): void => undefined} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Oops')
  })

  it('is axe-clean in all 3 variants', async (): Promise<void> => {
    for (const variant of ['info', 'success', 'error'] as const) {
      const { container, unmount } = render(
        <Toast variant={variant} message="X" onDismiss={(): void => undefined} />,
      )
      expect(await axe(container)).toHaveNoViolations()
      unmount()
    }
  })

  // Codex round 4 PR #100 P2 fold: ARIA live regions are intended for
  // text-only announcements. Placing the focusable Dismiss <Button> inside
  // the alert region can cause AT to announce the control as part of the
  // message. Confine the live-region role to the message span; keep the
  // dismiss control outside it.
  it.each<[ToastVariant, 'status' | 'alert']>([
    ['info', 'status'],
    ['success', 'status'],
    ['error', 'alert'],
  ])(
    'variant %s confines role="%s" to the message span; dismiss control sits outside the live region',
    (variant, expectedRole): void => {
      render(<Toast variant={variant} message="Hello" onDismiss={(): void => undefined} />)
      const liveRegion = screen.getByRole(expectedRole)
      expect(liveRegion.tagName).toBe('SPAN')
      expect(liveRegion).toHaveTextContent('Hello')
      const dismissButton = screen.getByLabelText('Dismiss notification')
      expect(liveRegion.contains(dismissButton)).toBe(false)
    },
  )

  it('auto-dismisses after the explicit dismissAfterMs', (): void => {
    vi.useFakeTimers()
    try {
      const onDismiss = vi.fn()
      render(<Toast variant="info" message="X" onDismiss={onDismiss} dismissAfterMs={5000} />)
      expect(onDismiss).not.toHaveBeenCalled()
      act((): void => {
        vi.advanceTimersByTime(5000)
      })
      expect(onDismiss).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('hover pauses the timer; mouse-leave resumes from the captured remainder', (): void => {
    // fireEvent (synchronous) instead of userEvent.hover (advances time
    // internally and races the fake-timer setTimeout(0) ticks). The pause /
    // resume logic only cares about the React mouseenter / mouseleave
    // synthetic handlers; pointer-event nuances aren't part of the contract.
    vi.useFakeTimers()
    try {
      const onDismiss = vi.fn()
      const { container } = render(
        <Toast variant="info" message="X" onDismiss={onDismiss} dismissAfterMs={5000} />,
      )
      act((): void => {
        vi.advanceTimersByTime(2000)
      })
      const root = container.firstChild as HTMLElement
      fireEvent.mouseEnter(root)
      act((): void => {
        vi.advanceTimersByTime(10_000)
      })
      expect(onDismiss).not.toHaveBeenCalled()
      fireEvent.mouseLeave(root)
      act((): void => {
        vi.advanceTimersByTime(5000)
      })
      expect(onDismiss).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('blur without a prior pause is a no-op (resume-when-active is idempotent)', (): void => {
    // The Toast root receives both `onMouseLeave` and `onBlur` for "resume".
    // When neither pause path ran (e.g. blur fires on a Toast that was never
    // hovered or focused), `resumeTimer` must short-circuit so it does not
    // start a second setTimeout and double-fire `onDismiss`. This pins the
    // defensive `if (timerRef.current !== null) return` branch.
    vi.useFakeTimers()
    try {
      const onDismiss = vi.fn()
      const { container } = render(
        <Toast variant="info" message="X" onDismiss={onDismiss} dismissAfterMs={5000} />,
      )
      const root = container.firstChild as HTMLElement
      // No mouseEnter/focus first — fire blur on an active timer.
      fireEvent.blur(root)
      act((): void => {
        vi.advanceTimersByTime(5000)
      })
      // The single original timer must still fire exactly once.
      expect(onDismiss).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('focus pauses the timer; blur resumes (keyboard parity)', (): void => {
    vi.useFakeTimers()
    try {
      const onDismiss = vi.fn()
      const { container } = render(
        <Toast variant="info" message="X" onDismiss={onDismiss} dismissAfterMs={5000} />,
      )
      act((): void => {
        vi.advanceTimersByTime(2000)
      })
      const root = container.firstChild as HTMLElement
      fireEvent.focus(root)
      act((): void => {
        vi.advanceTimersByTime(10_000)
      })
      expect(onDismiss).not.toHaveBeenCalled()
      fireEvent.blur(root)
      act((): void => {
        vi.advanceTimersByTime(5000)
      })
      expect(onDismiss).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  // Codex round 7 PR #100 P3 fold: the outer toast wrapper must NOT carry
  // its own tabindex — that adds an unnamed tab stop ahead of the actual
  // Dismiss button. The focus-pause behavior still works via React's
  // bubbling synthetic onFocus/onBlur when the inner Dismiss <Button>
  // gains/loses focus.
  it('does not add an unnamed tab stop on the outer wrapper (no tabindex)', (): void => {
    const { container } = render(
      <Toast variant="info" message="X" onDismiss={(): void => undefined} />,
    )
    const root = container.firstChild as HTMLElement
    expect(root.hasAttribute('tabindex')).toBe(false)
    // Sanity: the only focusable element inside the toast is the Dismiss button.
    const dismissButton = screen.getByLabelText('Dismiss notification')
    expect(root.tabIndex).toBe(-1)
    expect(dismissButton.tagName).toBe('BUTTON')
  })

  it('pauses the timer when the Dismiss button gains focus (bubbling onFocus from inner control)', (): void => {
    vi.useFakeTimers()
    try {
      const onDismiss = vi.fn()
      render(<Toast variant="info" message="X" onDismiss={onDismiss} dismissAfterMs={5000} />)
      act((): void => {
        vi.advanceTimersByTime(2000)
      })
      const dismissButton = screen.getByLabelText('Dismiss notification')
      // Real keyboard users tab to the Dismiss button — focus bubbles up
      // via React's synthetic event system to the wrapper's onFocus.
      fireEvent.focus(dismissButton)
      act((): void => {
        vi.advanceTimersByTime(10_000)
      })
      expect(onDismiss).not.toHaveBeenCalled()
      fireEvent.blur(dismissButton)
      act((): void => {
        vi.advanceTimersByTime(5000)
      })
      expect(onDismiss).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  // Codex round 2 PR #100 P2 fold: hover and focus must be tracked
  // independently. Otherwise mouseleave (resume) can defeat an active focus
  // (pause), and the timer fires while the keyboard user is still
  // interacting with the toast.
  it('keeps the timer paused when focus is still active after mouseleave (hover + focus independence)', (): void => {
    vi.useFakeTimers()
    try {
      const onDismiss = vi.fn()
      const { container } = render(
        <Toast variant="info" message="X" onDismiss={onDismiss} dismissAfterMs={5000} />,
      )
      const root = container.firstChild as HTMLElement
      // User hovers + focuses (both pause).
      fireEvent.mouseEnter(root)
      fireEvent.focus(root)
      act((): void => {
        vi.advanceTimersByTime(20_000)
      })
      expect(onDismiss).not.toHaveBeenCalled()
      // Mouse leaves but focus remains — timer must stay paused.
      fireEvent.mouseLeave(root)
      act((): void => {
        vi.advanceTimersByTime(20_000)
      })
      expect(onDismiss).not.toHaveBeenCalled()
      // Only when focus also leaves does the timer resume.
      fireEvent.blur(root)
      act((): void => {
        vi.advanceTimersByTime(5000)
      })
      expect(onDismiss).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the timer paused when hover is still active after blur (hover + focus independence)', (): void => {
    vi.useFakeTimers()
    try {
      const onDismiss = vi.fn()
      const { container } = render(
        <Toast variant="info" message="X" onDismiss={onDismiss} dismissAfterMs={5000} />,
      )
      const root = container.firstChild as HTMLElement
      // User focuses + hovers (both pause).
      fireEvent.focus(root)
      fireEvent.mouseEnter(root)
      act((): void => {
        vi.advanceTimersByTime(20_000)
      })
      expect(onDismiss).not.toHaveBeenCalled()
      // Focus leaves but hover remains — timer must stay paused.
      fireEvent.blur(root)
      act((): void => {
        vi.advanceTimersByTime(20_000)
      })
      expect(onDismiss).not.toHaveBeenCalled()
      // Only when hover also leaves does the timer resume.
      fireEvent.mouseLeave(root)
      act((): void => {
        vi.advanceTimersByTime(5000)
      })
      expect(onDismiss).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('clicking the Dismiss button calls onDismiss immediately', async (): Promise<void> => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()
    // dismissAfterMs is large so the real auto-dismiss timer cannot race the
    // userEvent click in a slow test environment.
    render(<Toast variant="error" message="X" onDismiss={onDismiss} dismissAfterMs={60_000} />)
    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  // Codex round 1 PR #100 P2 fold: when a consumer re-renders <Toast> in
  // place with a different `dismissAfterMs` (or a different variant whose
  // default differs), the timer must adopt the new duration. Without
  // including `dismissAfterMs` in the effect's dep-array, `remainingRef`
  // stays pinned to the first-render value and the toast dismisses on the
  // wrong schedule. Pin the regression here.
  it('re-rendering with a longer dismissAfterMs adopts the new duration', (): void => {
    vi.useFakeTimers()
    try {
      const onDismiss = vi.fn()
      const { rerender } = render(
        <Toast variant="info" message="X" onDismiss={onDismiss} dismissAfterMs={3000} />,
      )
      // Switch to a longer duration before the original 3000ms expires.
      act((): void => {
        vi.advanceTimersByTime(1000)
      })
      rerender(<Toast variant="info" message="X" onDismiss={onDismiss} dismissAfterMs={10_000} />)
      // The original 3000ms boundary must NOT fire — the re-render adopted
      // the new 10_000ms duration.
      act((): void => {
        vi.advanceTimersByTime(3000)
      })
      expect(onDismiss).not.toHaveBeenCalled()
      // The new 10_000ms boundary fires.
      act((): void => {
        vi.advanceTimersByTime(7000)
      })
      expect(onDismiss).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('re-rendering from info to error in place adopts the error variant default (8s, not 5s)', (): void => {
    // Default-duration counterpart of the explicit-duration test above.
    vi.useFakeTimers()
    try {
      const onDismiss = vi.fn()
      const { rerender } = render(
        <Toast variant="info" message="X" onDismiss={onDismiss} />,
      )
      // Switch to error variant — default 8000ms — before the info 5000ms expires.
      rerender(<Toast variant="error" message="X" onDismiss={onDismiss} />)
      // Cross the info default boundary; must NOT fire.
      act((): void => {
        vi.advanceTimersByTime(5000)
      })
      expect(onDismiss).not.toHaveBeenCalled()
      // Cross the error default boundary.
      act((): void => {
        vi.advanceTimersByTime(3000)
      })
      expect(onDismiss).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it.each<[ToastVariant, number]>([
    ['info', 5000],
    ['success', 5000],
    ['error', 8000],
  ])(
    'variant %s default-dismisses at %i ms when dismissAfterMs is unspecified (Decision C1)',
    (variant, expectedMs): void => {
      vi.useFakeTimers()
      try {
        const onDismiss = vi.fn()
        render(<Toast variant={variant} message="X" onDismiss={onDismiss} />)
        act((): void => {
          vi.advanceTimersByTime(expectedMs - 1)
        })
        expect(onDismiss).not.toHaveBeenCalled()
        act((): void => {
          vi.advanceTimersByTime(1)
        })
        expect(onDismiss).toHaveBeenCalledOnce()
      } finally {
        vi.useRealTimers()
      }
    },
  )

  // Codex round 3 PR #100 P2 fold: an effect restart (e.g. consumer passes a
  // new inline `onDismiss` identity, or swaps `dismissAfterMs`) while the
  // user is still hovering or keyboard-focused must NOT schedule a fresh
  // timeout — that would break the pause-on-interaction guarantee from the
  // round-2 fold. Pin the regression for both interaction paths.
  it('re-rendering with a new dismissAfterMs while hovered keeps the timer paused (effect-restart pause-guard)', (): void => {
    vi.useFakeTimers()
    try {
      const onDismiss = vi.fn()
      const { container, rerender } = render(
        <Toast variant="info" message="X" onDismiss={onDismiss} dismissAfterMs={5000} />,
      )
      const root = container.firstChild as HTMLElement
      fireEvent.mouseEnter(root)
      // Effect restart with a new duration while still hovered.
      rerender(<Toast variant="info" message="X" onDismiss={onDismiss} dismissAfterMs={10_000} />)
      // Cross both the old and new durations — timer must stay paused.
      act((): void => {
        vi.advanceTimersByTime(20_000)
      })
      expect(onDismiss).not.toHaveBeenCalled()
      // Releasing hover schedules a fresh timer for the FULL new duration.
      fireEvent.mouseLeave(root)
      act((): void => {
        vi.advanceTimersByTime(9999)
      })
      expect(onDismiss).not.toHaveBeenCalled()
      act((): void => {
        vi.advanceTimersByTime(1)
      })
      expect(onDismiss).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('re-rendering with a new dismissAfterMs while focused keeps the timer paused (effect-restart pause-guard)', (): void => {
    vi.useFakeTimers()
    try {
      const onDismiss = vi.fn()
      const { container, rerender } = render(
        <Toast variant="info" message="X" onDismiss={onDismiss} dismissAfterMs={5000} />,
      )
      const root = container.firstChild as HTMLElement
      fireEvent.focus(root)
      rerender(<Toast variant="info" message="X" onDismiss={onDismiss} dismissAfterMs={10_000} />)
      act((): void => {
        vi.advanceTimersByTime(20_000)
      })
      expect(onDismiss).not.toHaveBeenCalled()
      fireEvent.blur(root)
      act((): void => {
        vi.advanceTimersByTime(9999)
      })
      expect(onDismiss).not.toHaveBeenCalled()
      act((): void => {
        vi.advanceTimersByTime(1)
      })
      expect(onDismiss).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  // Codex round 5 PR #100 P2 fold: when only the onDismiss callback
  // identity changes (e.g. a parent re-rendering with an inline arrow
  // every N seconds), the effect must preserve elapsed progress. Otherwise
  // a parent that re-renders more often than `dismissAfterMs` keeps the
  // toast alive indefinitely.
  it('preserves elapsed time when onDismiss identity changes without dismissAfterMs change', (): void => {
    vi.useFakeTimers()
    try {
      const onDismissA = vi.fn()
      const onDismissB = vi.fn()
      const { rerender } = render(
        <Toast variant="info" message="X" onDismiss={onDismissA} dismissAfterMs={5000} />,
      )
      // 3s pass on the first callback.
      act((): void => {
        vi.advanceTimersByTime(3000)
      })
      // Parent re-renders with a fresh callback identity (e.g. inline arrow).
      // dismissAfterMs is UNCHANGED — toast must respect the 5000ms boundary
      // from mount, NOT reset to a fresh 5000ms.
      rerender(<Toast variant="info" message="X" onDismiss={onDismissB} dismissAfterMs={5000} />)
      act((): void => {
        vi.advanceTimersByTime(1999)
      })
      expect(onDismissA).not.toHaveBeenCalled()
      expect(onDismissB).not.toHaveBeenCalled()
      act((): void => {
        vi.advanceTimersByTime(1)
      })
      // 5000ms total from mount → fires the CURRENT callback identity.
      expect(onDismissA).not.toHaveBeenCalled()
      expect(onDismissB).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  // Codex round 10 PR #100 P2 fold: direct-consumer rerender with a new
  // message (or a variant swap whose default duration is unchanged — e.g.
  // info → success both default to 5000ms) must restart the timer at the
  // full duration. Without this, the round-5 "preserve elapsed" path
  // captures the previous toast's remainder and the replacement message
  // can dismiss almost immediately.
  it('resets the timer when rerendered with a new message (codex round 10 P2 fold)', (): void => {
    vi.useFakeTimers()
    try {
      const onDismiss = vi.fn()
      const { rerender } = render(
        <Toast variant="info" message="First" onDismiss={onDismiss} dismissAfterMs={5000} />,
      )
      // 4s pass on the first message — 1s remaining.
      act((): void => {
        vi.advanceTimersByTime(4000)
      })
      // Rerender with a NEW message; dismissAfterMs unchanged. Timer must
      // restart at 5000ms instead of inheriting the 1000ms remainder.
      rerender(
        <Toast variant="info" message="Second" onDismiss={onDismiss} dismissAfterMs={5000} />,
      )
      // After 1000ms the old remainder would have fired — must NOT.
      act((): void => {
        vi.advanceTimersByTime(1000)
      })
      expect(onDismiss).not.toHaveBeenCalled()
      // After the full new 5000ms — fires.
      act((): void => {
        vi.advanceTimersByTime(4000)
      })
      expect(onDismiss).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('resets the timer when rerendered with a new variant whose default duration matches (info → success)', (): void => {
    // info → success: both default to 5000ms, so dismissAfterMs is
    // unchanged. The variant change alone must still restart the timer.
    vi.useFakeTimers()
    try {
      const onDismiss = vi.fn()
      const { rerender } = render(<Toast variant="info" message="X" onDismiss={onDismiss} />)
      act((): void => {
        vi.advanceTimersByTime(4000)
      })
      rerender(<Toast variant="success" message="X" onDismiss={onDismiss} />)
      // 1000ms (the old remainder) must NOT fire after variant swap.
      act((): void => {
        vi.advanceTimersByTime(1000)
      })
      expect(onDismiss).not.toHaveBeenCalled()
      // Full new 5000ms boundary — fires.
      act((): void => {
        vi.advanceTimersByTime(4000)
      })
      expect(onDismiss).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not extend toast lifetime when parent re-renders more often than dismissAfterMs (codex round 5 regression)', (): void => {
    vi.useFakeTimers()
    try {
      const onDismiss = vi.fn()
      const { rerender } = render(
        <Toast variant="info" message="X" onDismiss={onDismiss} dismissAfterMs={5000} />,
      )
      // Simulate a chatty parent: re-render every 1000ms with a fresh
      // inline callback identity. After 5 re-renders (5000ms elapsed), the
      // toast must dismiss on its original schedule.
      for (let i = 0; i < 5; i += 1) {
        act((): void => {
          vi.advanceTimersByTime(1000)
        })
        // Fresh callback identity every iteration — simulates an inline
        // arrow that the parent re-creates on each render.
        rerender(
          <Toast
            variant="info"
            message="X"
            onDismiss={(): void => {
              onDismiss()
            }}
            dismissAfterMs={5000}
          />,
        )
      }
      // Cumulative wall time = 5000ms (5 × 1000) → exactly at the boundary.
      expect(onDismiss).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('ToastProvider + useToast', (): void => {
  function Probe(): ReactElement {
    const { show } = useToast()
    return (
      <button
        type="button"
        onClick={(): void => {
          show({ variant: 'success', message: 'Yay' })
        }}
      >
        fire
      </button>
    )
  }

  it('shows a Toast when useToast().show is called', async (): Promise<void> => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <Probe />
      </ToastProvider>,
    )
    expect(screen.queryByRole('status')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'fire' }))
    // Note: this Toast (default success, 5s timer) is allowed to auto-dismiss
    // after the assertion; the test does not await anything beyond the click.
    expect(screen.getByRole('status')).toHaveTextContent('Yay')
  })

  it('throws when useToast() is called outside <ToastProvider>', (): void => {
    function Bare(): ReactElement {
      useToast()
      return <div />
    }
    // Silence the React error-boundary console.error noise this throw emits.
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((): void => undefined)
    try {
      expect((): void => {
        render(<Bare />)
      }).toThrow(/useToast/)
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })

  it('useToast().show is referentially stable across re-renders of ToastProvider (Codex round 2 P1 fold)', (): void => {
    const captured: Array<{ show: (input: ToastInput) => void }> = []
    function CaptureProbe(): ReactElement | null {
      const toast = useToast()
      captured.push(toast)
      return null
    }
    const { rerender } = render(
      <ToastProvider>
        <CaptureProbe />
      </ToastProvider>,
    )
    rerender(
      <ToastProvider>
        <CaptureProbe />
      </ToastProvider>,
    )
    expect(captured.length).toBeGreaterThanOrEqual(2)
    const [first, second] = captured
    if (first === undefined || second === undefined) {
      throw new Error('expected two captured useToast() returns')
    }
    expect(first.show).toBe(second.show)
  })

  // Round-23 fold (PR #97 P2): ambient parent re-renders must NOT reset the
  // auto-dismiss timer. With a non-stable `onDismiss` (e.g. inline arrow),
  // <Toast>'s useEffect dep-array invalidates on every parent render → the
  // timer is torn down + restarted with the original duration → the window
  // is extended indefinitely. The useCallback-stable `dismissCurrent` in
  // <ToastProvider> is the fix; this test pins the regression.
  it('Toast auto-dismisses on schedule even when ToastProvider parent re-renders mid-flight', (): void => {
    vi.useFakeTimers()
    try {
      function ReRenderParent({ tick }: { tick: number }): ReactElement {
        const { show } = useToast()
        useEffect((): void => {
          if (tick === 0) {
            show({ variant: 'info', message: 'X', dismissAfterMs: 5000 })
          }
        }, [tick, show])
        return <div data-tick={tick} />
      }
      const { rerender } = render(
        <ToastProvider>
          <ReRenderParent tick={0} />
        </ToastProvider>,
      )
      expect(screen.getByRole('status')).toBeInTheDocument()
      for (let i = 1; i <= 4; i += 1) {
        act((): void => {
          vi.advanceTimersByTime(1000)
        })
        rerender(
          <ToastProvider>
            <ReRenderParent tick={i} />
          </ToastProvider>,
        )
      }
      // 4s elapsed; Toast still visible.
      expect(screen.getByRole('status')).toBeInTheDocument()
      // Final second crosses the 5s threshold.
      act((): void => {
        vi.advanceTimersByTime(1000)
      })
      expect(screen.queryByRole('status')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  // Decision C2 / Codex round 2 P2 fold: replacement uses its own timing.
  it('replacement Toast remounts with fresh timing (key-by-show-counter)', (): void => {
    // fireEvent (synchronous) for click — userEvent.click under fake-timers
    // serializes through setTimeout(0) ticks and races vi.advanceTimersByTime
    // in this scenario.
    vi.useFakeTimers()
    try {
      function DoubleFire(): ReactElement {
        const { show } = useToast()
        return (
          <>
            <button
              type="button"
              onClick={(): void => {
                show({ variant: 'info', message: 'First', dismissAfterMs: 100_000 })
              }}
            >
              fire1
            </button>
            <button
              type="button"
              onClick={(): void => {
                show({ variant: 'error', message: 'Second', dismissAfterMs: 1000 })
              }}
            >
              fire2
            </button>
          </>
        )
      }
      render(
        <ToastProvider>
          <DoubleFire />
        </ToastProvider>,
      )
      fireEvent.click(screen.getByRole('button', { name: 'fire1' }))
      expect(screen.getByRole('status')).toHaveTextContent('First')
      fireEvent.click(screen.getByRole('button', { name: 'fire2' }))
      expect(screen.getByRole('alert')).toHaveTextContent('Second')
      // The replacement's 1000ms window — NOT the first's 100_000ms.
      act((): void => {
        vi.advanceTimersByTime(1000)
      })
      expect(screen.queryByRole('alert')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('the Dismiss button inside a provider-shown Toast clears the slot', (): void => {
    function Probe2(): ReactElement {
      const { show } = useToast()
      return (
        <button
          type="button"
          onClick={(): void => {
            show({ variant: 'info', message: 'Hi', dismissAfterMs: 60_000 })
          }}
        >
          fire
        </button>
      )
    }
    render(
      <ToastProvider>
        <Probe2 />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'fire' }))
    expect(screen.getByRole('status')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    expect(screen.queryByRole('status')).toBeNull()
  })

  // Codex round 8 PR #100 P2 fold: polite live regions must exist in the
  // DOM BEFORE content arrives for AT to announce the change (per MDN's
  // ARIA live-region guidance). Mounting a fresh role="status" span
  // with the message inline (as the visible Toast does) is unreliable for
  // info/success variants. The persistent `[aria-live="polite"]` region
  // below sits in the DOM from provider initialization and gets its
  // content updated on show(); AT detects the diff and announces. Error
  // variant uses the visible Toast's role="alert", which IS announced
  // reliably on insertion per MDN's dynamic-insertion exception.
  function ProbeShow({ variant, message }: {
    readonly variant: 'info' | 'success' | 'error'
    readonly message: string
  }): ReactElement {
    const { show } = useToast()
    return (
      <button type="button" onClick={(): void => { show({ variant, message }) }}>
        trigger
      </button>
    )
  }

  function getPoliteRegion(): HTMLElement {
    const region = document.querySelector<HTMLElement>(
      '[data-sta-toast-live="polite"]',
    )
    if (region === null) {
      throw new Error('persistent polite live region not found')
    }
    return region
  }

  it('mounts a persistent polite live region at provider initialization (empty before any show)', (): void => {
    render(
      <ToastProvider>
        <div>app</div>
      </ToastProvider>,
    )
    const region = getPoliteRegion()
    expect(region.getAttribute('aria-live')).toBe('polite')
    expect(region.textContent).toBe('')
  })

  it('populates the polite live region when show({variant: "info"}) is called', async (): Promise<void> => {
    render(
      <ToastProvider>
        <ProbeShow variant="info" message="Heads up" />
      </ToastProvider>,
    )
    expect(getPoliteRegion().textContent).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'trigger' }))
    // Round-11 fold: the message is populated via queueMicrotask (so the
    // empty intermediate clears for AT to detect the diff). React commits
    // the deferred update on the next act cycle; waitFor polls until it
    // lands.
    await waitFor((): void => {
      expect(getPoliteRegion().textContent).toBe('Heads up')
    })
  })

  it('populates the polite live region when show({variant: "success"}) is called', async (): Promise<void> => {
    render(
      <ToastProvider>
        <ProbeShow variant="success" message="Published version 7" />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'trigger' }))
    await waitFor((): void => {
      expect(getPoliteRegion().textContent).toBe('Published version 7')
    })
  })

  it('does NOT populate the polite live region for error variant (uses visible role="alert" instead)', (): void => {
    render(
      <ToastProvider>
        <ProbeShow variant="error" message="Publish failed" />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'trigger' }))
    // Persistent polite region stays empty (error path doesn't use it).
    expect(getPoliteRegion().textContent).toBe('')
    // The visible Toast renders with role="alert" — reliably announced on
    // insertion per MDN's dynamic-insertion exception.
    expect(screen.getByRole('alert')).toHaveTextContent('Publish failed')
  })

  // Codex round 9 PR #100 P2 fold: two consecutive shows with identical
  // message text would be a `setPoliteAnnouncement(same)` state-equality
  // no-op without the clear-then-set pattern, so the persistent region's
  // textContent never changes and AT doesn't announce the second toast.
  // The implementation uses `flushSync` to commit an empty intermediate
  // state before populating with the message; MutationObserver verifies
  // that BOTH a text-node removal AND a text-node addition occur on the
  // second show (proving the intermediate empty commit happened).
  it('clears the polite live region before re-setting on identical successive shows', async (): Promise<void> => {
    render(
      <ToastProvider>
        <ProbeShow variant="success" message="Published successfully" />
      </ToastProvider>,
    )
    // First show — establishes the baseline content in the region.
    fireEvent.click(screen.getByRole('button', { name: 'trigger' }))
    await waitFor((): void => {
      expect(getPoliteRegion().textContent).toBe('Published successfully')
    })

    // Track per-record added/removed text nodes on the persistent region.
    const region = getPoliteRegion()
    const removals: Array<string> = []
    const additions: Array<string> = []
    const observer = new MutationObserver((records): void => {
      for (const record of records) {
        for (const node of record.removedNodes) {
          removals.push(node.textContent ?? '')
        }
        for (const node of record.addedNodes) {
          additions.push(node.textContent ?? '')
        }
      }
    })
    observer.observe(region, { characterData: true, childList: true, subtree: true })

    try {
      // Second show with the IDENTICAL message — clear-then-set must
      // produce both a removal (the prior text node) and an addition
      // (the new text node), even though both carry the same text.
      fireEvent.click(screen.getByRole('button', { name: 'trigger' }))
      // queueMicrotask defers the populate to a separate React commit;
      // waitFor + final MutationObserver flush gives both microtask
      // batches time to land in the DOM.
      await waitFor((): void => {
        expect(additions.length).toBeGreaterThan(0)
      })
    } finally {
      observer.disconnect()
    }

    // The clear committed an empty state, removing the prior text node;
    // the queueMicrotask-deferred set re-added it.
    expect(removals).toContain('Published successfully')
    expect(additions).toContain('Published successfully')
    // Final state: region remains populated with the message.
    expect(region.textContent).toBe('Published successfully')
  })

  // Codex round 11 PR #100 P2 fold: the planned PublishDialog (PR 4.5c)
  // calls `show()` from a `useEffect` after publish completes. flushSync
  // (the round-9 implementation) was a no-op inside React effects, so
  // identical successive toasts in effect-driven flows would be silent
  // for assistive tech. The queueMicrotask approach works in both event
  // handlers AND effects — pin the invariant for the effect path here.
  it('clears+re-sets the polite live region when show() is called from a useEffect (effect-driven path)', async (): Promise<void> => {
    function EffectProbe({ trigger }: { readonly trigger: number }): ReactElement {
      const { show } = useToast()
      useEffect((): void => {
        if (trigger > 0) {
          show({ variant: 'success', message: 'Published successfully' })
        }
      }, [trigger, show])
      return <div />
    }

    // First effect run with trigger=1 → first toast.
    const { rerender } = render(
      <ToastProvider>
        <EffectProbe trigger={1} />
      </ToastProvider>,
    )
    await waitFor((): void => {
      expect(getPoliteRegion().textContent).toBe('Published successfully')
    })

    // Track text-node mutations on the persistent region.
    const region = getPoliteRegion()
    const removals: Array<string> = []
    const additions: Array<string> = []
    const observer = new MutationObserver((records): void => {
      for (const record of records) {
        for (const node of record.removedNodes) {
          removals.push(node.textContent ?? '')
        }
        for (const node of record.addedNodes) {
          additions.push(node.textContent ?? '')
        }
      }
    })
    observer.observe(region, { characterData: true, childList: true, subtree: true })

    try {
      // Second effect run (trigger=2) → effect re-fires, show() called
      // again with identical message from inside useEffect. Must still
      // produce empty→content text-node diff for AT.
      rerender(
        <ToastProvider>
          <EffectProbe trigger={2} />
        </ToastProvider>,
      )
      await waitFor((): void => {
        expect(additions.length).toBeGreaterThan(0)
      })
    } finally {
      observer.disconnect()
    }

    // The clear-then-deferred-set pattern produces both a text-node
    // removal AND an addition, even from inside a useEffect. The
    // round-9 flushSync approach would have no-op'd here.
    expect(removals).toContain('Published successfully')
    expect(additions).toContain('Published successfully')
    expect(region.textContent).toBe('Published successfully')
  })
})
