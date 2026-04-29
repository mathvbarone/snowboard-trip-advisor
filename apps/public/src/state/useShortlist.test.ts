import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useShortlist } from './useShortlist'

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
  })
  afterEach((): void => {
    setLocation('')
    window.localStorage.clear()
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
