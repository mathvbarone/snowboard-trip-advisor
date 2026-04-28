import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// The browser default-fetches `/favicon.ico` when no <link rel="icon"> is
// declared, surfacing as a 404 in the dev console. The fix ships a
// self-hosted SVG under apps/public/public/ and references it from
// index.html. Asserting on the source HTML (vs. a runtime DOM check) keeps
// the test independent of jsdom's request lifecycle and avoids any network
// mocking — the contract under test is the served HTML.
describe('apps/public/index.html', (): void => {
  const indexHtmlPath = resolve(import.meta.dirname, '../../index.html')
  const html = readFileSync(indexHtmlPath, 'utf8')

  it('declares a self-hosted SVG favicon to suppress the default /favicon.ico 404', (): void => {
    expect(html).toMatch(
      /<link\s+rel="icon"\s+type="image\/svg\+xml"\s+href="\/favicon\.svg"\s*\/?>/,
    )
  })
})
