import * as fc from 'fast-check'
import * as parse5 from 'parse5'
import { describe, expect, it } from 'vitest'

import { renderAnalystNoteMarkdown } from './markdown'

type P5Node = parse5.DefaultTreeAdapterMap['node']
type P5Element = parse5.DefaultTreeAdapterMap['element']

function findAllElements(node: P5Node): P5Element[] {
  const result: P5Element[] = []
  function walk(n: P5Node): void {
    if ('tagName' in n) {
      result.push(n)
    }
    if ('childNodes' in n) {
      for (const c of n.childNodes) {
        walk(c)
      }
    }
  }
  walk(node)
  return result
}

// `picture`/`source` added (Codex P2): they are inherited via the
// `...defaultSchema` `tagNames` spread and `<source>` carries an
// unvalidated `srcSet` URL — banned at the tag level so a no-scheme /
// relative `srcset` (which the DANGEROUS_SCHEMES check below would NOT
// flag) still fails the fuzz if the allowlist ever re-admits the tag.
const BANNED_TAGS = [
  'script', 'iframe', 'object', 'embed', 'form', 'style', 'noscript', 'template',
  'picture', 'source',
]
// URL-bearing attribute names the allowlist could plausibly carry. Codex
// P2 showed the inherited `attributes.source = ['srcSet']` was a silent
// gap the old scan (`href`/`src`/`cite`/`xlink:href` only) missed entirely.
// `srcset`/`poster`/`longdesc`/`data`/`formaction`/`background` are every
// other URL-bearing attribute reachable via `...defaultSchema` spread.
// parse5 lower-cases attribute names, so `srcSet` arrives as `srcset`.
const URL_ATTRS = [
  'href', 'src', 'cite', 'xlink:href',
  'srcset', 'poster', 'longdesc', 'data', 'formaction', 'background',
]
const DANGEROUS_SCHEMES = ['javascript:', 'vbscript:', 'data:']

describe('renderAnalystNoteMarkdown fuzz', () => {
  it('no script-execution path survives random input', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 5000 }), (input: string): void => {
        const out = renderAnalystNoteMarkdown(input)
        const doc = parse5.parse(out)
        const elements = findAllElements(doc)

        for (const el of elements) {
          // No banned tags.
          expect(BANNED_TAGS).not.toContain(el.tagName)

          for (const attr of el.attrs) {
            // No on* event-handler attributes.
            expect(/^on[a-z]+$/i.test(attr.name)).toBe(false)

            // No javascript:/vbscript:/data: in URL-bearing attributes.
            if (URL_ATTRS.includes(attr.name)) {
              // Fuzz inputs can produce malformed percent-escapes (e.g. an
              // otherwise-safe `https://example.com/%` survives sanitization).
              // decodeURIComponent throws URIError on those — don't false-fail.
              // The dangerous schemes don't contain `%`, so the raw-value
              // check below catches them regardless of decode failure.
              const raw = attr.value.toLowerCase().trim()
              let decoded = raw
              try {
                decoded = decodeURIComponent(attr.value).toLowerCase().trim()
              } catch {
                /* malformed escape — fall back to raw */
              }
              for (const scheme of DANGEROUS_SCHEMES) {
                expect(raw.startsWith(scheme)).toBe(false)
                expect(decoded.startsWith(scheme)).toBe(false)
              }
            }
          }

          // Every <input> has type="checkbox" AND disabled (GFM shape).
          if (el.tagName === 'input') {
            const attrs = new Map(el.attrs.map((a) => [a.name, a.value]))
            expect(attrs.get('type')).toBe('checkbox')
            expect(attrs.has('disabled')).toBe(true)
          }
        }
      }),
      { numRuns: 1000 },
    )
  })
})
