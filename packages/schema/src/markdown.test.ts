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

/**
 * Inherited-`srcSet` XSS regression (Codex P2, PR N.b1 fold).
 *
 * `rehype-sanitize`'s `defaultSchema` lists `picture`/`source` in
 * `tagNames` and `attributes.source = ['srcSet']`. The analyst-note
 * schema spreads `...defaultSchema` for both, and its explicit
 * `protocols` map does NOT define `srcSet` — so `hast-util-sanitize`
 * waved every `<source srcset>` value through unvalidated, including
 * `javascript:` and `data:` candidates. Spec §4.4 allows only `<img>`
 * (src/alt/title/width/height/loading); `<picture>`/`<source>` and
 * `srcset`/`srcSet` are NOT in the intended allowlist. AST-level,
 * consistent with the OWASP corpus (a raw substring scan false-fails
 * on safe inert-text output — see spec §4.6).
 */
describe('inherited srcSet vector (Codex P2 regression)', () => {
  function hasSrcsetAttr(htmlString: string): boolean {
    return elements(htmlString).some((el) =>
      el.attrs.some((a) => a.name.toLowerCase() === 'srcset'),
    )
  }

  it.each([
    '<picture><source srcset="javascript:alert(1)"><img src=x></picture>',
    '<picture><source srcset="data:text/html,<script>alert(1)</script>"><img src=x></picture>',
    '<source srcset="vbscript:msgbox(1)">',
    '<img srcset="javascript:alert(1)" src=x>',
  ])('strips <picture>/<source>/srcset — %s', (input) => {
    const out = html(input)
    // No <picture>/<source> element survives the allowlist.
    expect(hasElement(out, 'picture')).toBe(false)
    expect(hasElement(out, 'source')).toBe(false)
    // No surviving srcset/srcSet attribute on ANY element (the inherited
    // `attributes.source` grant must be dropped, not merely the tag).
    expect(hasSrcsetAttr(out)).toBe(false)
    // Defense-in-depth: nothing carries a dangerous scheme either.
    expect(hasExecutableUrl(out)).toBe(false)
    expect(hasElement(out, 'script')).toBe(false)
  })
})

/**
 * GFM footnote-navigation end-to-end (Codex P2 round-2, PR N.b1 fold).
 *
 * `remark-gfm` emits a `<sup><a href="#user-content-fn-1"
 * id="user-content-fnref-1" data-footnote-ref>` ref link and a
 * `<section class="footnotes"><ol><li id="user-content-fn-1"> …
 * <a href="#user-content-fnref-1" data-footnote-backref>↩</a></li></ol>
 * </section>` body. The analyst schema strips the universal `id` grant
 * (re-granted only to headings + <figure>) and overrides `a` to
 * `['href','title','rel','target']` — so both footnote `id`s and the
 * footnote-specific `a` attributes were removed, leaving the ref/backref
 * `<a href="#…">` links pointing at ids the sanitizer had stripped
 * (broken nav). The fix re-grants the GFM footnote id locations +
 * attributes; `clobberPrefix='analyst-'` rewrites surviving `id`s and
 * `rehypeAnchorRewrite` rewrites the matching `#…` fragments to the
 * SAME prefix, so the end-to-end href↔id mapping must hold.
 *
 * AST-level, consistent with the OWASP corpus (spec §4.6).
 */
describe('GFM footnote navigation (Codex P2 round-2)', () => {
  function idSet(els: P5Element[]): Set<string> {
    const ids = new Set<string>()
    for (const el of els) {
      const idAttr = el.attrs.find((a) => a.name === 'id')
      if (idAttr) {
        ids.add(idAttr.value)
      }
    }
    return ids
  }

  function internalHrefs(els: P5Element[]): string[] {
    const out: string[] = []
    for (const el of els) {
      if (el.tagName !== 'a') {
        continue
      }
      const href = el.attrs.find((a) => a.name === 'href')?.value
      if (href && href.startsWith('#')) {
        out.push(href.slice(1))
      }
    }
    return out
  }

  it('renders a footnote ref link and a backref link', () => {
    const out = html('See note[^1].\n\n[^1]: The footnote body.')
    const els = elements(out)
    // Ref link lives inside the <sup>.
    const sup = els.find((el) => el.tagName === 'sup')
    expect(sup).toBeDefined()
    // Backref link carries the GFM data-footnote-backref marker.
    const backref = els.find(
      (el) =>
        el.tagName === 'a' &&
        el.attrs.some((a) => a.name === 'data-footnote-backref'),
    )
    expect(backref).toBeDefined()
  })

  it('preserves the footnote container <section>', () => {
    const out = html('See note[^1].\n\n[^1]: The footnote body.')
    const els = elements(out)
    const section = els.find(
      (el) =>
        el.tagName === 'section' &&
        el.attrs.some((a) => a.name === 'data-footnotes'),
    )
    expect(section).toBeDefined()
  })

  it('resolves every footnote anchor end-to-end (href↔id match)', () => {
    const out = html('See note[^1] and another[^2].\n\n[^1]: First body.\n\n[^2]: Second body.')
    const els = elements(out)
    const ids = idSet(els)
    const hrefs = internalHrefs(els)
    // There must be footnote nav links at all (4: 2 refs + 2 backrefs).
    expect(hrefs.length).toBe(4)
    // EVERY internal footnote anchor must resolve to a real element id —
    // this is the end-to-end nav invariant, not merely "an id exists".
    for (const frag of hrefs) {
      expect(ids.has(frag)).toBe(true)
    }
  })

  it('clobber-prefixes the footnote ids (DOM-clobber safe)', () => {
    const out = html('See note[^1].\n\n[^1]: The footnote body.')
    const els = elements(out)
    const ids = [...idSet(els)]
    const footnoteIds = ids.filter((i) => i.includes('user-content-fn'))
    expect(footnoteIds.length).toBeGreaterThan(0)
    // No surviving footnote id may be un-prefixed (clobber safety).
    for (const id of footnoteIds) {
      expect(id.startsWith('analyst-')).toBe(true)
    }
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

  /**
   * GFM task-list item className regression (PR N.b1 fidelity fix).
   *
   * `remark-gfm` emits `<li class="task-list-item">` for `- [x]` / `- [ ]`
   * items. The round-2 footnote fold set `li: ['id']`, which is a FULL
   * override of `defaultSchema.attributes.li` (`[['className',
   * 'task-list-item']]`), silently stripping the GFM-marker class. The
   * spec promises full GFM; this class must survive sanitization.
   *
   * AST-level, consistent with the surrounding OWASP corpus (spec §4.6).
   */
  it('preserves task-list-item className on <li> (GFM marker class)', () => {
    const out = html('- [x] done\n- [ ] todo')
    const els = elements(out)
    const taskListItems = els.filter(
      (el) =>
        el.tagName === 'li' &&
        el.attrs.some(
          (a) => a.name === 'class' && a.value === 'task-list-item',
        ),
    )
    // Both items must carry the GFM-marker class.
    expect(taskListItems.length).toBe(2)
    // The disabled checkbox must still be present inside a task-list item.
    const checkboxes = els.filter(
      (el) =>
        el.tagName === 'input' &&
        el.attrs.some((a) => a.name === 'type' && a.value === 'checkbox') &&
        el.attrs.some((a) => a.name === 'disabled'),
    )
    expect(checkboxes.length).toBe(2)
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
