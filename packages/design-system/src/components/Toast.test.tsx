import { act, fireEvent, render, screen } from '@testing-library/react'
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
})
