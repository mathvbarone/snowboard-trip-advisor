import { renderHook } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useShortcuts } from './shortcuts'

describe('useShortcuts', (): void => {
  let user: ReturnType<typeof userEvent.setup>

  beforeEach((): void => {
    user = userEvent.setup()
    document.body.focus()
  })

  afterEach((): void => {
    document.body.replaceChildren()
  })

  describe('g r → onGoResorts', (): void => {
    it('fires onGoResorts when g then r is pressed within 1 second', async (): Promise<void> => {
      const onGoResorts = vi.fn()
      renderHook(() => { useShortcuts({ onGoResorts }); })
      await user.keyboard('g')
      await user.keyboard('r')
      expect(onGoResorts).toHaveBeenCalledOnce()
    })

    // Per Tier 5 plan reviewer P0 fold #1 (2026-05-12): vi.useFakeTimers +
    // userEvent deadlock is a known userEvent v14 trap. For this timeout-
    // expiry-only case we bypass userEvent entirely and dispatch raw
    // KeyboardEvents — the only thing under test is the sequence-window
    // setTimeout-clear behavior, not userEvent's keystroke modeling.
    it('does NOT fire if the sequence window expires (1.5 s gap)', (): void => {
      vi.useFakeTimers()
      try {
        const onGoResorts = vi.fn()
        renderHook(() => { useShortcuts({ onGoResorts }); })
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'g' }))
        vi.advanceTimersByTime(1500)
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }))
        expect(onGoResorts).not.toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    })

    it('does NOT fire when the active element is an INPUT (editable bypass)', async (): Promise<void> => {
      const onGoResorts = vi.fn()
      const input = document.createElement('input')
      document.body.appendChild(input)
      input.focus()
      renderHook(() => { useShortcuts({ onGoResorts }); })
      await user.keyboard('g')
      await user.keyboard('r')
      expect(onGoResorts).not.toHaveBeenCalled()
    })
  })

  describe('g i → onGoIntegrations', (): void => {
    it('fires onGoIntegrations on g then i within 1 second', async (): Promise<void> => {
      const onGoIntegrations = vi.fn()
      renderHook(() => { useShortcuts({ onGoIntegrations }); })
      await user.keyboard('g')
      await user.keyboard('i')
      expect(onGoIntegrations).toHaveBeenCalledOnce()
    })

    it('does NOT fire when active element is contenteditable', async (): Promise<void> => {
      const onGoIntegrations = vi.fn()
      const ce = document.createElement('div')
      ce.setAttribute('contenteditable', 'true')
      ce.tabIndex = 0
      document.body.appendChild(ce)
      ce.focus()
      renderHook(() => { useShortcuts({ onGoIntegrations }); })
      await user.keyboard('g')
      await user.keyboard('i')
      expect(onGoIntegrations).not.toHaveBeenCalled()
    })
  })

  describe('g <unknown> resets sequence without firing', (): void => {
    it('does NOT fire any callback for `g x`', async (): Promise<void> => {
      const onGoResorts = vi.fn()
      const onGoIntegrations = vi.fn()
      renderHook(() => { useShortcuts({ onGoResorts, onGoIntegrations }); })
      await user.keyboard('g')
      await user.keyboard('x')
      expect(onGoResorts).not.toHaveBeenCalled()
      expect(onGoIntegrations).not.toHaveBeenCalled()
    })
  })

  describe('mod+enter → onModEnter (cross-platform)', (): void => {
    it('fires onModEnter on Meta+Enter (macOS)', async (): Promise<void> => {
      const onModEnter = vi.fn()
      renderHook(() => { useShortcuts({ onModEnter }); })
      await user.keyboard('{Meta>}{Enter}{/Meta}')
      expect(onModEnter).toHaveBeenCalledOnce()
    })

    it('fires onModEnter on Control+Enter (Linux/Windows)', async (): Promise<void> => {
      const onModEnter = vi.fn()
      renderHook(() => { useShortcuts({ onModEnter }); })
      await user.keyboard('{Control>}{Enter}{/Control}')
      expect(onModEnter).toHaveBeenCalledOnce()
    })

    it('fires onModEnter even when active element is an INPUT (no editable bypass)', async (): Promise<void> => {
      const onModEnter = vi.fn()
      const input = document.createElement('input')
      document.body.appendChild(input)
      input.focus()
      renderHook(() => { useShortcuts({ onModEnter }); })
      await user.keyboard('{Meta>}{Enter}{/Meta}')
      expect(onModEnter).toHaveBeenCalledOnce()
    })

    it('does NOT fire on plain Enter (modifier required)', async (): Promise<void> => {
      const onModEnter = vi.fn()
      renderHook(() => { useShortcuts({ onModEnter }); })
      await user.keyboard('{Enter}')
      expect(onModEnter).not.toHaveBeenCalled()
    })
  })

  describe('Escape → onEscape', (): void => {
    it('fires onEscape on Escape press', async (): Promise<void> => {
      const onEscape = vi.fn()
      renderHook(() => { useShortcuts({ onEscape }); })
      await user.keyboard('{Escape}')
      expect(onEscape).toHaveBeenCalledOnce()
    })

    it('fires onEscape even when active element is an INPUT', async (): Promise<void> => {
      const onEscape = vi.fn()
      const input = document.createElement('input')
      document.body.appendChild(input)
      input.focus()
      renderHook(() => { useShortcuts({ onEscape }); })
      await user.keyboard('{Escape}')
      expect(onEscape).toHaveBeenCalledOnce()
    })
  })

  describe('cleanup', (): void => {
    it('removes the keydown listener on unmount', async (): Promise<void> => {
      const onGoResorts = vi.fn()
      const { unmount } = renderHook(() => { useShortcuts({ onGoResorts }); })
      unmount()
      await user.keyboard('g')
      await user.keyboard('r')
      expect(onGoResorts).not.toHaveBeenCalled()
    })
  })

  describe('Codex round-1 P3 fold (PR #103): editable bypass cancels pending chord', (): void => {
    // If the user starts a `g` chord outside an editor, then focuses an input
    // within the 1 s window and types, the editable-bypass path must clear
    // the pending chord. Otherwise a subsequent `r` outside the input (within
    // the timer window) would mis-fire the stale chord even though the user
    // already shifted intent to typing.
    it('cancels a pending g chord when a keystroke arrives at an editable target', async (): Promise<void> => {
      const onGoResorts = vi.fn()
      renderHook(() => { useShortcuts({ onGoResorts }); })

      // 1. Press g while body has focus → chord armed.
      await user.keyboard('g')

      // 2. Focus an input + type a key (editable bypass fires; pending chord
      //    must be cleared so the next non-editable r does NOT complete it).
      const input = document.createElement('input')
      document.body.appendChild(input)
      input.focus()
      await user.keyboard('x')

      // 3. Refocus body and press r — should NOT fire onGoResorts.
      input.blur()
      document.body.focus()
      await user.keyboard('r')
      expect(onGoResorts).not.toHaveBeenCalled()
    })
  })

  describe('null-activeElement guard', (): void => {
    // Per Tier 5 plan + AGENTS.md "restructure instead of suppress": the
    // isEditableTarget helper uses `document.activeElement ?? document.body`
    // so the null-branch collapses to body (BODY isn't editable). This test
    // exercises the ?? null-arm by stubbing activeElement to null and
    // dispatching a raw KeyboardEvent (userEvent's keyboard() targets
    // activeElement, which would short-circuit the test).
    it('treats null activeElement as body (shortcut still fires)', (): void => {
      const onGoResorts = vi.fn()
      const original = Object.getOwnPropertyDescriptor(Document.prototype, 'activeElement')
      Object.defineProperty(document, 'activeElement', { value: null, configurable: true })
      try {
        renderHook(() => { useShortcuts({ onGoResorts }); })
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'g' }))
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }))
        expect(onGoResorts).toHaveBeenCalledOnce()
      } finally {
        if (original !== undefined) {
          Object.defineProperty(Document.prototype, 'activeElement', original)
        }
      }
    })
  })

  describe('handlers-ref pattern (Decision F5)', (): void => {
    // Per Tier 5 plan reviewer P0 fold #6 (2026-05-12): without a useRef pin
    // on handlers, the useEffect dep `[handlers]` would tear down + re-attach
    // the document keydown listener every Shell render (Shell passes fresh
    // closure handlers each render since they aren't memoized). The hook pins
    // handlers to a ref AND keeps useEffect deps empty so the listener mounts
    // ONCE per consumer-mount; ref reads see the latest handlers.
    it('picks up swapped handlers without re-subscribing', async (): Promise<void> => {
      const first = vi.fn()
      const second = vi.fn()
      const { rerender } = renderHook(
        (props: { onGoResorts: () => void }) => { useShortcuts(props); },
        { initialProps: { onGoResorts: first } },
      )
      await user.keyboard('g')
      await user.keyboard('r')
      expect(first).toHaveBeenCalledOnce()
      expect(second).not.toHaveBeenCalled()
      rerender({ onGoResorts: second })
      await user.keyboard('g')
      await user.keyboard('r')
      expect(first).toHaveBeenCalledOnce() // unchanged from before
      expect(second).toHaveBeenCalledOnce()
    })
  })
})
