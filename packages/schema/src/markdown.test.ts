import * as parse5 from 'parse5'
import { describe, expect, it } from 'vitest'

import { processor, renderAnalystNoteMarkdown } from './markdown'

function html(md: string): string {
  return renderAnalystNoteMarkdown(md)
}

type P5Node = parse5.DefaultTreeAdapterMap['node']
type P5Element = parse5.DefaultTreeAdapterMap['element']

function elements(htmlString: string): P5Element[] {
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
  walk(parse5.parse(htmlString))
  return result
}

// AST-level element check. A raw `/<tag/i` substring scan false-fails on
// safe output where the payload is inert attribute-value text (spec §4.6:
// "A raw substring scan would reject safe output ... The AST-level
// property tests the *real* invariant"). Parse the serialized HTML the
// way a browser would and assert the dangerous element does not exist.
function hasElement(htmlString: string, tag: string): boolean {
  return elements(htmlString).some((el) => el.tagName === tag)
}

function hasEventHandlerAttr(htmlString: string): boolean {
  return elements(htmlString).some((el) =>
    el.attrs.some((a) => /^on[a-z]+$/i.test(a.name)),
  )
}

function hasExecutableUrl(htmlString: string): boolean {
  const URL_ATTRS = ['href', 'src', 'cite', 'xlink:href']
  return elements(htmlString).some((el) =>
    el.attrs.some((a) => {
      if (!URL_ATTRS.includes(a.name)) {
        return false
      }
      const raw = a.value.toLowerCase().trim()
      let decoded = raw
      try {
        decoded = decodeURIComponent(a.value).toLowerCase().trim()
      } catch {
        /* malformed escape — fall back to raw */
      }
      return ['javascript:', 'vbscript:', 'data:'].some(
        (s) => raw.startsWith(s) || decoded.startsWith(s),
      )
    }),
  )
}

describe('renderAnalystNoteMarkdown', () => {
  it('plugin order is the documented security invariant', () => {
    // `processor.attachers` is `unified`'s internal plugin list. Spec §4.3
    // pins the security-critical chain order by name via exactly this
    // property — it is the documented invariant test, not an accident.
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- spec §4.3: plugin-order pin reads processor.attachers by design
    const names = processor.attachers.map((a) => (a[0] as { name: string }).name)
    expect(names).toStrictEqual([
      'remarkParse', 'remarkGfm', 'remarkRehype', 'rehypeRaw',
      'rehypeExternalLinks', 'rehypeSanitize', 'rehypeStripStrayInputs',
      'rehypeAnchorRewrite', 'rehypeStringify',
    ])
  })
})

describe('OWASP XSS corpus', () => {
  it.each([
    ['<script>alert(1)</script>', 'script'],
    ['<img src=x onerror=alert(1)>', 'script'],   // onerror stripped
    ['[click](javascript:alert(1))', 'script'],
    ['<iframe src="javascript:alert(1)"></iframe>', 'iframe'],
    ['<style>body{background:url(javascript:alert(1))}</style>', 'style'],
    ['<details ontoggle="alert(1)" open>x</details>', 'script'],
    ['<svg onload="alert(1)"></svg>', 'script'],
    ['<math><annotation-xml encoding="text/html"><script>alert(1)</script></annotation-xml></math>', 'script'],
    ['<iframe srcdoc="<script>alert(1)</script>"></iframe>', 'iframe'],
    ['<noscript><p title="--></noscript><script>alert(1)</script>">x</p></noscript>', 'script'],
    ['<template><script>alert(1)</script></template>', 'script'],
    ['<a href="javascript&#58;alert(1)">x</a>', 'script'],
    ['[x][y]\n\n[y]: javascript:alert(1)', 'script'],
  ])('strips %s — no %s element survives', (input, tag) => {
    const out = html(input)
    expect(hasElement(out, tag)).toBe(false)
    expect(hasElement(out, 'script')).toBe(false)
    expect(hasEventHandlerAttr(out)).toBe(false)
    expect(hasExecutableUrl(out)).toBe(false)
  })
})

describe('GFM', () => {
  it('renders tables', () => {
    const out = html('| a | b |\n|---|---|\n| 1 | 2 |')
    expect(out).toContain('<table>')
    expect(out).toContain('<th>a</th>')
  })

  it('renders task list with disabled checkbox', () => {
    const out = html('- [x] done')
    expect(out).toMatch(/<input[^>]*type="checkbox"[^>]*disabled/i)
  })

  it('renders strikethrough', () => {
    expect(html('~~old~~')).toContain('<del>')
  })

  it('renders autolinks', () => {
    expect(html('https://example.com')).toContain('<a href="https://example.com"')
  })

  it('renders fenced code with language', () => {
    expect(html('```js\nx\n```')).toMatch(/<code class="language-js">/)
  })
})

describe('rehypeStripStrayInputs', () => {
  it('removes <input type="text">', () => {
    expect(html('<input type="text" name="x">')).not.toMatch(/<input/i)
  })

  it('removes <input type="checkbox"> without disabled', () => {
    expect(html('<input type="checkbox" name="exfil">')).not.toMatch(/<input/i)
  })

  it('preserves <input type="checkbox" disabled> (GFM shape)', () => {
    expect(html('- [ ] todo')).toMatch(/<input[^>]*type="checkbox"[^>]*disabled/i)
  })
})

describe('allowlist widening (c2)', () => {
  it.each([
    ['<kbd>Cmd+K</kbd>', '<kbd>'],
    ['<details open>x</details>', '<details'],
    ['<sub>2</sub>', '<sub>'],
    ['<sup>3</sup>', '<sup>'],
    ['<abbr title="ETA">ETA</abbr>', '<abbr'],
    ['<figure><figcaption>x</figcaption></figure>', '<figure>'],
  ])('preserves %s → contains %s', (input, expected) => {
    expect(html(input)).toContain(expected)
  })
})

describe('DOM clobbering', () => {
  it('does not emit an unprefixed heading id', () => {
    expect(html('# Hello {#hello}')).not.toMatch(/<h1 id="hello"/)
  })

  it('prefixes raw <h2 id="head">', () => {
    expect(html('<h2 id="head">x</h2>')).toContain('id="analyst-head"')
  })

  it('rewrites internal anchors via rehypeAnchorRewrite', () => {
    expect(html('[link](#section)')).toContain('href="#analyst-section"')
  })

  it('leaves already-prefixed internal anchors idempotent', () => {
    expect(html('<a href="#analyst-section">x</a>')).toContain('href="#analyst-section"')
  })

  it('leaves external links untouched by the anchor rewrite', () => {
    expect(html('[ex](https://example.com)')).toContain('href="https://example.com"')
  })
})

describe('renderAnalystNoteMarkdown contract', () => {
  it('returns empty string for empty input', () => {
    expect(renderAnalystNoteMarkdown('')).toBe('')
  })

  it('throws TypeError for non-string input', () => {
    expect(() => renderAnalystNoteMarkdown(null as never)).toThrow(TypeError)
    expect(() => renderAnalystNoteMarkdown(undefined as never)).toThrow(TypeError)
    expect(() => renderAnalystNoteMarkdown(42 as never)).toThrow(TypeError)
  })

  it('parses the rendered HTML as well-formed', () => {
    const out = html('# heading\n\nparagraph with **bold**')
    expect(() => parse5.parse(out)).not.toThrow()
    expect(out).toContain('<strong>bold</strong>')
  })
})
