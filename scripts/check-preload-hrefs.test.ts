import { describe, expect, it } from 'vitest'

import {
  findMissingPreloadHrefs,
  parsePreloadHrefs,
} from './check-preload-hrefs'

describe('parsePreloadHrefs', (): void => {
  it('returns an empty array for empty HTML', (): void => {
    expect(parsePreloadHrefs('')).toEqual([])
  })

  it('returns an empty array when no preload links exist', (): void => {
    const html = '<html><head><link rel="stylesheet" href="/a.css"></head></html>'
    expect(parsePreloadHrefs(html)).toEqual([])
  })

  it('extracts the href of a single rel="preload" font link', (): void => {
    const html =
      '<html><head><link rel="preload" as="font" href="/assets/font.woff2"></head></html>'
    expect(parsePreloadHrefs(html)).toEqual(['/assets/font.woff2'])
  })

  it('extracts multiple preload hrefs in document order', (): void => {
    const html = `<html><head>
      <link rel="preload" as="font" href="/assets/dm-sans.woff2">
      <link rel="preload" as="font" href="/assets/jetbrains.woff2">
    </head></html>`
    expect(parsePreloadHrefs(html)).toEqual([
      '/assets/dm-sans.woff2',
      '/assets/jetbrains.woff2',
    ])
  })

  it('ignores links whose rel is not preload', (): void => {
    const html = `<html><head>
      <link rel="modulepreload" href="/assets/index.js">
      <link rel="preload" as="font" href="/assets/font.woff2">
      <link rel="prefetch" href="/assets/lazy.js">
    </head></html>`
    expect(parsePreloadHrefs(html)).toEqual(['/assets/font.woff2'])
  })

  it('omits preload links that have no href attribute', (): void => {
    const html =
      '<html><head><link rel="preload" as="font"></head></html>'
    expect(parsePreloadHrefs(html)).toEqual([])
  })

  it('omits preload links whose href is the empty string', (): void => {
    const html =
      '<html><head><link rel="preload" as="font" href=""></head></html>'
    expect(parsePreloadHrefs(html)).toEqual([])
  })
})

describe('findMissingPreloadHrefs', (): void => {
  it('returns an empty array when all hrefs resolve to existing files', async (): Promise<void> => {
    const exists = (): Promise<boolean> => Promise.resolve(true)
    const missing = await findMissingPreloadHrefs(
      '/dist',
      ['/assets/font.woff2', '/assets/other.woff2'],
      exists,
    )
    expect(missing).toEqual([])
  })

  it('returns the hrefs whose resolved path does not exist', async (): Promise<void> => {
    const present = new Set(['/dist/assets/font.woff2'])
    const exists = (path: string): Promise<boolean> =>
      Promise.resolve(present.has(path))
    const missing = await findMissingPreloadHrefs(
      '/dist',
      ['/assets/font.woff2', '/assets/missing.woff2'],
      exists,
    )
    expect(missing).toEqual(['/assets/missing.woff2'])
  })

  it('resolves leading-slash hrefs as absolute paths under distDir', async (): Promise<void> => {
    const seen: string[] = []
    const exists = (path: string): Promise<boolean> => {
      seen.push(path)
      return Promise.resolve(true)
    }
    await findMissingPreloadHrefs('/dist', ['/assets/font.woff2'], exists)
    expect(seen).toEqual(['/dist/assets/font.woff2'])
  })

  it('resolves bare relative hrefs against distDir', async (): Promise<void> => {
    const seen: string[] = []
    const exists = (path: string): Promise<boolean> => {
      seen.push(path)
      return Promise.resolve(true)
    }
    await findMissingPreloadHrefs('/dist', ['assets/font.woff2'], exists)
    expect(seen).toEqual(['/dist/assets/font.woff2'])
  })

  it('returns an empty array for an empty href list', async (): Promise<void> => {
    const exists = (): Promise<boolean> => Promise.resolve(true)
    expect(await findMissingPreloadHrefs('/dist', [], exists)).toEqual([])
  })
})
