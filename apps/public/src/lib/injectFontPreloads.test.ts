// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { injectFontPreloads } from './injectFontPreloads'

describe('injectFontPreloads', (): void => {
  beforeEach((): void => {
    document.head.innerHTML = ''
  })

  afterEach((): void => {
    document.head.innerHTML = ''
  })

  it('appends a <link rel="preload"> per URL with the correct attributes', (): void => {
    injectFontPreloads(['/fonts/a.woff2', '/fonts/b.woff2'])
    const links = document.head.querySelectorAll('link[rel="preload"]')
    expect(links.length).toBe(2)
    for (const link of links) {
      expect(link.getAttribute('as')).toBe('font')
      expect(link.getAttribute('type')).toBe('font/woff2')
      expect(link.getAttribute('crossorigin')).not.toBeNull()
    }
    const hrefs = Array.from(links).map((l): string => l.getAttribute('href') ?? '')
    expect(hrefs).toEqual(['/fonts/a.woff2', '/fonts/b.woff2'])
  })

  it('is idempotent: re-running with the same URL does not add a second tag', (): void => {
    injectFontPreloads(['/fonts/a.woff2'])
    injectFontPreloads(['/fonts/a.woff2'])
    const links = document.head.querySelectorAll(
      'link[rel="preload"][href="/fonts/a.woff2"]',
    )
    expect(links.length).toBe(1)
  })

  it('appends new URLs independently when called with mixed already-present and new', (): void => {
    injectFontPreloads(['/fonts/a.woff2'])
    injectFontPreloads(['/fonts/a.woff2', '/fonts/b.woff2'])
    const all = document.head.querySelectorAll('link[rel="preload"]')
    expect(all.length).toBe(2)
    const hrefs = Array.from(all).map((l): string => l.getAttribute('href') ?? '')
    expect(hrefs).toEqual(['/fonts/a.woff2', '/fonts/b.woff2'])
  })
})
