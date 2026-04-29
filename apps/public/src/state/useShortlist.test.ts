import { act, render, renderHook } from '@testing-library/react'
import { Fragment, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { __resetShortlistForTests, useShortlist } from './useShortlist'
import { setURLState } from './useURLState'

function ShortlistConsumer(): null {
  // One hook instance per component — mirrors how each ResortCard / drawer
  // / dialog calls useShortlist() once in App.tsx's tree.
  useShortlist()
  return null
}

function renderMultiConsumer(count: number): void {
  // Mounts `count` ShortlistConsumer siblings in a single React root, which
  // is what App.tsx actually does (N ResortCards plus drawer + dialogs).
  // Single-root rendering ensures act() flushes all consumers' effects in
  // one work loop — multiple separate renderHook calls do not share that
  // flush domain and would mask the N-writes regression this test guards.
  const children = Array.from({ length: count }).map(
    (_, i): ReturnType<typeof createElement> =>
      createElement(ShortlistConsumer, { key: i }),
  )
  render(createElement(Fragment, null, ...children))
}

interface SetItemCounter {
  calls: () => number
  restore: () => void
}

function trackSetItemCalls(): SetItemCounter {
  // Patches Storage.prototype.setItem so tests can count writes regardless
  // of which method (instance or prototype) the implementation invokes.
  // jsdom's localStorage instance properties are non-writable; the
  // prototype is writable. Call-through preserves real LS semantics so
  // assertions on getItem after writes continue to work.
  const proto = Object.getPrototypeOf(window.localStorage) as Storage
  // eslint-disable-next-line @typescript-eslint/unbound-method -- prototype-patch idiom; the call below re-binds via .call(this, ...)
  const originalSetItem = proto.setItem
  let count = 0
  proto.setItem = function patched(this: Storage, k: string, v: string): void {
    count += 1
    originalSetItem.call(this, k, v)
  }
  return {
    calls: (): number => count,
    restore: (): void => {
      proto.setItem = originalSetItem
    },
  }
}

// Spec §6.1 + plan step 5.4 contract:
//   - Mount: parse URL `&shortlist=`. Absent → hydrate from
//     `sta-shortlist-last-known` localStorage. Both absent → empty.
//   - On URL change (post-mount): write the URL value to
//     `sta-shortlist-last-known` localStorage.
//   - Collision: `setEqual(urlSlugs, storedSlugs) === false` triggers
//     `pendingCollision` (which the consumer renders as a MergeReplaceDialog).
//     Order-only differences silently adopt URL order — no dialog.
//   - Setters: `toggle(slug)`, `add(slug)`, `remove(slug)`. `toggle` and
//     `add` dedupe and head-truncate to 6.
//   - Collision actions: `acceptUrl()` (Replace = drop pending),
//     `keepStored()` (writes stored back to URL), `merge()` (union; writes
//     unique-merged set to URL).

const STORAGE_KEY = 'sta-shortlist-last-known'

function setLocation(search: string): void {
  window.history.replaceState({}, '', `/${search.length > 0 ? `?${search}` : ''}`)
}

describe('useShortlist', (): void => {
  beforeEach((): void => {
    setLocation('')
    window.localStorage.clear()
    __resetShortlistForTests()
  })
  afterEach((): void => {
    setLocation('')
    window.localStorage.clear()
    __resetShortlistForTests()
  })

  describe('hydration', (): void => {
    it('returns empty when URL has no &shortlist= and localStorage is empty', (): void => {
      const { result } = renderHook(() => useShortlist())
      expect(result.current.shortlist).toEqual([])
    })

    it('returns the URL slugs when &shortlist= is present', (): void => {
      setLocation('shortlist=kotelnica-bialczanska,spindleruv-mlyn')
      const { result } = renderHook(() => useShortlist())
      expect(result.current.shortlist).toEqual([
        'kotelnica-bialczanska',
        'spindleruv-mlyn',
      ])
    })

    it('hydrates shortlist from localStorage when URL is empty', (): void => {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(['kotelnica-bialczanska']),
      )
      const { result } = renderHook(() => useShortlist())
      expect(result.current.shortlist).toEqual(['kotelnica-bialczanska'])
      // The hydrated set is also written to the URL so back/forward and
      // share-link semantics stay coherent.
      expect(window.location.search).toContain('shortlist=kotelnica-bialczanska')
    })

    it('does NOT hydrate from localStorage when URL already has slugs', (): void => {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(['kotelnica-bialczanska']),
      )
      setLocation('shortlist=spindleruv-mlyn')
      const { result } = renderHook(() => useShortlist())
      // URL wins on hydration; LS is the collision side-channel.
      expect(result.current.shortlist).toEqual(['spindleruv-mlyn'])
    })

    it('falls back to empty when localStorage payload is malformed JSON', (): void => {
      window.localStorage.setItem(STORAGE_KEY, '{not json')
      const { result } = renderHook(() => useShortlist())
      expect(result.current.shortlist).toEqual([])
    })

    it('falls back to empty when localStorage payload fails schema validation', (): void => {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ unexpected: 'shape' }),
      )
      const { result } = renderHook(() => useShortlist())
      expect(result.current.shortlist).toEqual([])
    })

    it('drops localStorage entries that fail the slug regex (no URL corruption)', (): void => {
      // Codex P2: without slug validation, a tampered or legacy LS entry like
      // 'foo&view=matrix' would be promoted into the URL via runBootstrap and
      // corrupt unrelated query keys (view, sort, …) on load. Validation must
      // mirror parseURL's per-item filter so only well-formed slugs survive.
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          'kotelnica-bialczanska',
          'foo&view=matrix',
          'UPPER-CASE',
          'spindleruv-mlyn',
        ]),
      )
      const { result } = renderHook(() => useShortlist())
      expect(result.current.shortlist).toEqual([
        'kotelnica-bialczanska',
        'spindleruv-mlyn',
      ])
      const search = window.location.search
      expect(search).toContain(
        'shortlist=kotelnica-bialczanska,spindleruv-mlyn',
      )
      expect(search).not.toContain('view=matrix')
      expect(search).not.toContain('UPPER-CASE')
    })
  })

  describe('mirror writes on URL change', (): void => {
    it('writes the new URL slugs to localStorage when toggle adds a slug', (): void => {
      const { result } = renderHook(() => useShortlist())
      act((): void => {
        result.current.toggle('kotelnica-bialczanska')
      })
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe(
        JSON.stringify(['kotelnica-bialczanska']),
      )
    })

    it('writes the empty array to localStorage when last slug is removed', (): void => {
      setLocation('shortlist=kotelnica-bialczanska')
      const { result } = renderHook(() => useShortlist())
      act((): void => {
        result.current.toggle('kotelnica-bialczanska')
      })
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify([]))
    })

    it('writes localStorage exactly once per URL change regardless of consumer count', (): void => {
      // Reviewer's BLOCKER: the mirror used to live in a per-instance
      // useEffect, so N hook consumers (every ResortCard + drawer + dialogs)
      // produced N redundant setItem calls per toggle. The fix moves the
      // mirror to a module-scoped subscriber so it fires once per URL
      // change, not once per consumer.
      renderMultiConsumer(12)
      const counter = trackSetItemCalls()
      try {
        act((): void => {
          setURLState({ shortlist: ['kotelnica-bialczanska'] })
        })
        expect(counter.calls()).toBe(1)
      } finally {
        counter.restore()
      }
    })

    it('does not write localStorage during bootstrap from LS-only path', (): void => {
      // Spec §6.1 LS-only hydration path: URL empty, LS has slugs → bootstrap
      // writes LS value into URL. The cascade must NOT also re-write LS
      // (LS already has the value the bootstrap is about to read; a write
      // would be redundant and on N consumers would scale to N writes).
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(['kotelnica-bialczanska']),
      )
      const counter = trackSetItemCalls()
      try {
        renderHook(() => useShortlist())
        expect(counter.calls()).toBe(0)
      } finally {
        counter.restore()
      }
    })

    it('mirror fires on popstate (back/forward navigation)', (): void => {
      // The previous per-instance mirror happened to cover popstate via the
      // `urlShortlist` dep in useEffect. The module-scoped mirror must
      // listen for popstate explicitly via useURLState's subscribe path.
      setLocation('shortlist=kotelnica-bialczanska')
      renderHook(() => useShortlist())
      // Simulate a back-navigation that lands on a different shortlist.
      window.history.replaceState({}, '', '/?shortlist=spindleruv-mlyn')
      act((): void => {
        window.dispatchEvent(new PopStateEvent('popstate'))
      })
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe(
        JSON.stringify(['spindleruv-mlyn']),
      )
    })

    it('__resetShortlistForTests unsubscribes the module-scoped mirror', (): void => {
      // Without unsubscribe, a leftover mirror from a prior test fires on
      // the next test's setURLState, polluting LS across tests.
      renderHook(() => useShortlist())
      __resetShortlistForTests()
      window.localStorage.clear()
      const counter = trackSetItemCalls()
      try {
        act((): void => {
          setURLState({ shortlist: ['leftover-write'] })
        })
        expect(counter.calls()).toBe(0)
      } finally {
        counter.restore()
      }
    })
  })

  describe('toggle / add / remove', (): void => {
    it('toggle adds a missing slug', (): void => {
      const { result } = renderHook(() => useShortlist())
      act((): void => {
        result.current.toggle('kotelnica-bialczanska')
      })
      expect(result.current.shortlist).toEqual(['kotelnica-bialczanska'])
    })

    it('toggle removes an existing slug', (): void => {
      setLocation('shortlist=kotelnica-bialczanska,spindleruv-mlyn')
      const { result } = renderHook(() => useShortlist())
      act((): void => {
        result.current.toggle('kotelnica-bialczanska')
      })
      expect(result.current.shortlist).toEqual(['spindleruv-mlyn'])
    })

    it('add dedupes — adding an existing slug is a no-op', (): void => {
      setLocation('shortlist=kotelnica-bialczanska')
      const { result } = renderHook(() => useShortlist())
      act((): void => {
        result.current.add('kotelnica-bialczanska')
      })
      expect(result.current.shortlist).toEqual(['kotelnica-bialczanska'])
    })

    it('add head-truncates to 6 (drops the oldest entry)', (): void => {
      // The 6-cap lives in lib/urlState.ts (parseURL/serializeURL); the hook
      // appends and lets the URL layer truncate. Asserting the cap here is
      // defensive — proves the contract still holds when the hook is the
      // entry point.
      setLocation('shortlist=a1,a2,a3,a4,a5,a6')
      const { result } = renderHook(() => useShortlist())
      act((): void => {
        result.current.add('a7')
      })
      // We do NOT specify head- vs tail-truncate here — spec §6.1 says
      // "head-truncate to 6", meaning the result has length <= 6.
      expect(result.current.shortlist.length).toBeLessThanOrEqual(6)
      expect(result.current.shortlist).toContain('a7')
    })

    it('remove drops the slug if present, no-op otherwise', (): void => {
      setLocation('shortlist=kotelnica-bialczanska,spindleruv-mlyn')
      const { result } = renderHook(() => useShortlist())
      act((): void => {
        result.current.remove('kotelnica-bialczanska')
      })
      expect(result.current.shortlist).toEqual(['spindleruv-mlyn'])
      // remove of a not-present slug is a no-op.
      act((): void => {
        result.current.remove('not-present')
      })
      expect(result.current.shortlist).toEqual(['spindleruv-mlyn'])
    })
  })

  describe('collision detection (setEqual)', (): void => {
    it('does NOT trigger a collision when URL and LS contain the same set in different order', (): void => {
      // setEqual([a,b,c], [c,b,a]) === true → URL order silently adopted.
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(['c', 'b', 'a']),
      )
      setLocation('shortlist=a,b,c')
      const { result } = renderHook(() => useShortlist())
      expect(result.current.pendingCollision).toBeNull()
      // URL order is what the consumer sees.
      expect(result.current.shortlist).toEqual(['a', 'b', 'c'])
    })

    it('triggers a collision when URL and LS sets differ', (): void => {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(['kotelnica-bialczanska']),
      )
      setLocation('shortlist=spindleruv-mlyn')
      const { result } = renderHook(() => useShortlist())
      expect(result.current.pendingCollision).toEqual({
        urlSlugs: ['spindleruv-mlyn'],
        storedSlugs: ['kotelnica-bialczanska'],
      })
    })

    it('does NOT trigger a collision when LS is empty (fresh hydration)', (): void => {
      setLocation('shortlist=kotelnica-bialczanska')
      const { result } = renderHook(() => useShortlist())
      expect(result.current.pendingCollision).toBeNull()
    })

    it('does NOT trigger a collision when URL is empty (LS hydrates)', (): void => {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(['kotelnica-bialczanska']),
      )
      const { result } = renderHook(() => useShortlist())
      expect(result.current.pendingCollision).toBeNull()
    })
  })

  describe('collision actions', (): void => {
    it('acceptUrl drops the pending collision (URL stays — Replace)', (): void => {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(['kotelnica-bialczanska']),
      )
      setLocation('shortlist=spindleruv-mlyn')
      const { result } = renderHook(() => useShortlist())
      expect(result.current.pendingCollision).not.toBeNull()
      act((): void => {
        result.current.acceptUrl()
      })
      expect(result.current.pendingCollision).toBeNull()
      expect(result.current.shortlist).toEqual(['spindleruv-mlyn'])
      // Replace persists the URL choice so a reload of the same shared
      // link doesn't re-trigger the collision dialog (Codex P2 fix).
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe(
        JSON.stringify(['spindleruv-mlyn']),
      )
    })

    it('acceptUrl is a no-op when there is no pending collision (does not overwrite LS)', (): void => {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(['kotelnica-bialczanska']),
      )
      setLocation('shortlist=kotelnica-bialczanska')
      const { result } = renderHook(() => useShortlist())
      expect(result.current.pendingCollision).toBeNull()
      const lsBefore = window.localStorage.getItem(STORAGE_KEY)
      act((): void => {
        result.current.acceptUrl()
      })
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe(lsBefore)
    })

    it('keepStored writes the stored set back to URL (Keep mine)', (): void => {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(['kotelnica-bialczanska']),
      )
      setLocation('shortlist=spindleruv-mlyn')
      const { result } = renderHook(() => useShortlist())
      act((): void => {
        result.current.keepStored()
      })
      expect(result.current.pendingCollision).toBeNull()
      expect(result.current.shortlist).toEqual(['kotelnica-bialczanska'])
    })

    it('merge writes the union (URL first then stored extras) and dismisses the dialog', (): void => {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(['a', 'b']),
      )
      setLocation('shortlist=b,c')
      const { result } = renderHook(() => useShortlist())
      act((): void => {
        result.current.merge()
      })
      expect(result.current.pendingCollision).toBeNull()
      // URL order first ('b','c'), then unique stored extras ('a').
      expect(result.current.shortlist).toEqual(['b', 'c', 'a'])
    })

    it('merge head-truncates the union to 6', (): void => {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(['a', 'b', 'c', 'd']),
      )
      setLocation('shortlist=e,f,g')
      const { result } = renderHook(() => useShortlist())
      act((): void => {
        result.current.merge()
      })
      expect(result.current.shortlist.length).toBe(6)
    })

    it('keepStored is a no-op when there is no pending collision', (): void => {
      // Defensive: a consumer wiring an "Always keep mine" preference may
      // call keepStored() even when no dialog is open. The hook must not
      // crash and must not pollute the URL.
      const { result } = renderHook(() => useShortlist())
      expect(result.current.pendingCollision).toBeNull()
      act((): void => {
        result.current.keepStored()
      })
      expect(result.current.shortlist).toEqual([])
    })

    it('merge is a no-op when there is no pending collision', (): void => {
      const { result } = renderHook(() => useShortlist())
      expect(result.current.pendingCollision).toBeNull()
      act((): void => {
        result.current.merge()
      })
      expect(result.current.shortlist).toEqual([])
    })
  })
})
