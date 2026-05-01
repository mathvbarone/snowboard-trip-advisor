import { describe, expect, it } from 'vitest'

import {
  findMissingPreloadHrefs,
  parsePreloadHrefs,
  parseRuntimeAssetHrefs,
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

  it('extracts hrefs using single-quoted attribute syntax', (): void => {
    const html =
      "<html><head><link rel='preload' as='font' href='/assets/font.woff2'></head></html>"
    expect(parsePreloadHrefs(html)).toEqual(['/assets/font.woff2'])
  })
})

describe('parseRuntimeAssetHrefs', (): void => {
  it('returns an empty array for an empty bundle', (): void => {
    expect(parseRuntimeAssetHrefs('')).toEqual([])
  })

  it('extracts a /assets/*.woff2 URL from a double-quoted JS string', (): void => {
    const js = 'var u="/assets/dm-sans-latin-ext-400-normal-BtiwyxMk.woff2";'
    expect(parseRuntimeAssetHrefs(js)).toEqual([
      '/assets/dm-sans-latin-ext-400-normal-BtiwyxMk.woff2',
    ])
  })

  it('extracts a /assets/*.woff URL from a single-quoted JS string', (): void => {
    const js =
      "var u='/assets/jetbrains-mono-latin-500-normal-CJOVTJB7.woff';"
    expect(parseRuntimeAssetHrefs(js)).toEqual([
      '/assets/jetbrains-mono-latin-500-normal-CJOVTJB7.woff',
    ])
  })

  it('extracts URLs from backtick template literals (esbuild minified output)', (): void => {
    const js =
      'var C=`/assets/dm-sans-latin-ext-400-normal-BtiwyxMk.woff2`,w=`/assets/jetbrains-mono-latin-ext-500-normal-Cut-4mMH.woff2`;'
    expect(parseRuntimeAssetHrefs(js).sort()).toEqual([
      '/assets/dm-sans-latin-ext-400-normal-BtiwyxMk.woff2',
      '/assets/jetbrains-mono-latin-ext-500-normal-Cut-4mMH.woff2',
    ])
  })

  it('extracts multiple distinct asset URLs', (): void => {
    const js =
      'var a="/assets/a.woff2",b="/assets/b-CJOVTJB7.woff";console.log(a,b);'
    expect(parseRuntimeAssetHrefs(js).sort()).toEqual([
      '/assets/a.woff2',
      '/assets/b-CJOVTJB7.woff',
    ])
  })

  it('deduplicates the same URL referenced multiple times', (): void => {
    const js = 'var a="/assets/font.woff2";var b="/assets/font.woff2";'
    expect(parseRuntimeAssetHrefs(js)).toEqual(['/assets/font.woff2'])
  })

  it('ignores non-woff URLs (woff2/woff scope only)', (): void => {
    const js =
      'var a="/assets/index.js";var b="/assets/style.css";var c="/assets/img.png";'
    expect(parseRuntimeAssetHrefs(js)).toEqual([])
  })

  it('ignores asset URLs that are not under /assets/', (): void => {
    const js = 'var a="/fonts/font.woff2";var b="./local.woff2";'
    expect(parseRuntimeAssetHrefs(js)).toEqual([])
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

  it('rejects hrefs that resolve outside distDir even when the escaped path exists', async (): Promise<void> => {
    // exists() is permissive — would say "yes, this file exists" for any
    // path. The containment guard must reject `../`-escaping hrefs before
    // exists() is consulted; otherwise a malformed href like `/../foo`
    // gives a false-negative on the deploy-breakage gate by validating a
    // file outside the build output.
    const exists = (): Promise<boolean> => Promise.resolve(true)
    const missing = await findMissingPreloadHrefs(
      '/dist',
      ['/../etc/secret', '/assets/../../escape.woff2'],
      exists,
    )
    expect(missing).toEqual(['/../etc/secret', '/assets/../../escape.woff2'])
  })
})
