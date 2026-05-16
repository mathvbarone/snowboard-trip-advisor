import { ResortSlug } from '@snowboard-trip-advisor/schema'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { __resetForTests, flushAllForSlug, registerSlugFlusher } from './flushAll'

afterEach((): void => {
  __resetForTests()
})

describe('flushAll registry (PR N.c1 — spec §5.4)', (): void => {
  it('registers and deregisters a flusher', async (): Promise<void> => {
    // Step 12: registerSlugFlusher returns a deregistration fn
    const fn = vi.fn()
    const slug = ResortSlug.parse('kotelnica-bialczanska')
    const dispose = registerSlugFlusher(slug, fn)

    await flushAllForSlug(slug)
    expect(fn).toHaveBeenCalledTimes(1)

    dispose()

    // After dispose, flushAllForSlug should NOT call the flusher again.
    await flushAllForSlug(slug)
    expect(fn).toHaveBeenCalledTimes(1)   // still 1
  })

  it('runs all registered flushers concurrently via Promise.all', async (): Promise<void> => {
    // Step 13: flushAllForSlug calls all registered flushers in parallel
    const order: string[] = []
    const slug = ResortSlug.parse('kotelnica-bialczanska')

    registerSlugFlusher(slug, async (): Promise<void> => {
      await new Promise((r) => setTimeout(r, 30))
      order.push('slow')
    })
    registerSlugFlusher(slug, (): void => {
      order.push('fast')
    })

    await flushAllForSlug(slug)
    // fast finished first under parallel execution
    expect(order).toStrictEqual(['fast', 'slow'])
  })

  it('flushAllForSlug rejects if a flusher rejects (rejection-propagation per spec §5.4 + Promise.all semantics)', async (): Promise<void> => {
    // Step 14: rejection-propagation — per spec §5.4 and AGENTS.md "do not leave
    // promises unhandled". flushAllForSlug uses Promise.all internally, so a
    // rejecting flusher causes the whole Promise to reject. The caller (N.c3's
    // Shell.tsx) wraps in try/catch. Pin this behavior here.
    const slug = ResortSlug.parse('kotelnica-bialczanska')

    registerSlugFlusher(slug, (): void => {
      throw new Error('flusher-boom')
    })

    await expect(flushAllForSlug(slug)).rejects.toThrow('flusher-boom')
  })

  it('flushAllForSlug resolves immediately when no flushers are registered for the slug', async (): Promise<void> => {
    const slug = ResortSlug.parse('kotelnica-bialczanska')
    // No flushers registered — should resolve to undefined.
    await expect(flushAllForSlug(slug)).resolves.toBeUndefined()
  })

  it('multiple slugs are isolated — flusher for slug A does not fire for slug B', async (): Promise<void> => {
    const slugA = ResortSlug.parse('kotelnica-bialczanska')
    const slugB = ResortSlug.parse('spindleruv-mlyn')
    const fnA = vi.fn()
    const fnB = vi.fn()

    registerSlugFlusher(slugA, fnA)
    registerSlugFlusher(slugB, fnB)

    await flushAllForSlug(slugA)
    expect(fnA).toHaveBeenCalledTimes(1)
    expect(fnB).not.toHaveBeenCalled()
  })

  it('disposing a flusher when it is the last one cleans up the slug entry', async (): Promise<void> => {
    const slug = ResortSlug.parse('kotelnica-bialczanska')
    const fn = vi.fn()
    const dispose = registerSlugFlusher(slug, fn)
    dispose()

    // Flusher removed and slug entry cleaned up — should resolve immediately.
    await expect(flushAllForSlug(slug)).resolves.toBeUndefined()
    expect(fn).not.toHaveBeenCalled()
  })

  it('disposing one flusher from a set with multiple leaves the remaining flushers intact', async (): Promise<void> => {
    // Covers the if (set.size === 0) false branch: after deleting fnA the set
    // still has fnB, so flushers.delete(slug) should NOT fire yet.
    const slug = ResortSlug.parse('kotelnica-bialczanska')
    const fnA = vi.fn()
    const fnB = vi.fn()
    const disposeA = registerSlugFlusher(slug, fnA)
    registerSlugFlusher(slug, fnB)

    // Dispose only A — B must still be registered.
    disposeA()

    await flushAllForSlug(slug)
    expect(fnA).not.toHaveBeenCalled()
    expect(fnB).toHaveBeenCalledTimes(1)
  })
})
