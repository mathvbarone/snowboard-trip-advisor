import type { Element, Root } from 'hast'
import rehypeExternalLinks from 'rehype-external-links'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { SKIP, visit } from 'unist-util-visit'

import { analystNoteSanitizeSchema, ID_CLOBBER_PREFIX } from './markdownSanitizeSchema'

/**
 * SECURITY BOUNDARY. The output of this function is rendered via
 * dangerouslySetInnerHTML in analyst-note views. Any change to the
 * plugin chain, plugin order, allowlist schema, or auxiliary passes
 * MUST go through ADR amendment + CODEOWNERS review per AGENTS.md §60.
 *
 * Plugin order is load-bearing:
 *   parse → gfm → rehype(allowDangerousHtml) → raw → externalLinks
 *   → sanitize → stripStrayInputs → anchorRewrite → stringify
 *
 * Locked test in markdown.test.ts pins this sequence by name.
 *
 * Security contract: any input string → output HTML where no script
 * execution is possible in any browser parsing context. Verified by
 * markdown.test.ts XSS corpus (OWASP Filter Evasion Cheat Sheet).
 */

/**
 * Post-sanitize pass — removes any `<input>` element whose attributes do
 * not exactly match the GFM task-list shape (`type="checkbox"` AND
 * `disabled` present). Closes R10.1: `rehype-sanitize`'s value-restricted
 * attribute model strips non-matching attributes but leaves the bare
 * `<input>` tag, which defaults to `type="text"` (a focusable,
 * interactive text field). MUST run AFTER `rehype-sanitize`.
 */
function rehypeStripStrayInputs() {
  return (tree: Root): void => {
    visit(tree, 'element', (node: Element, index, parent) => {
      if (node.tagName !== 'input') {
        return
      }
      const type = node.properties.type
      const disabled = node.properties.disabled
      const isGfmCheckbox = type === 'checkbox' && disabled === true
      if (!isGfmCheckbox && parent && typeof index === 'number') {
        parent.children.splice(index, 1)
        return [SKIP, index]
      }
    })
  }
}

/**
 * Rewrites internal anchors `<a href="#X">` to `<a href="#analyst-X">`
 * so they hop to the clobber-prefixed `id`s that `rehype-sanitize`
 * produced. Idempotent — already-prefixed fragments are left alone.
 */
function rehypeAnchorRewrite() {
  return (tree: Root): void => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'a') {
        return
      }
      const href = node.properties.href
      if (typeof href !== 'string' || !href.startsWith('#')) {
        return
      }
      const fragment = href.slice(1)
      if (fragment.length === 0 || fragment.startsWith(ID_CLOBBER_PREFIX)) {
        return
      }
      node.properties.href = `#${ID_CLOBBER_PREFIX}${fragment}`
    })
  }
}

export const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeExternalLinks, {
    target: '_blank',
    rel: ['nofollow', 'noopener', 'noreferrer'],
    protocols: ['http', 'https'],
  })
  .use(rehypeSanitize, analystNoteSanitizeSchema)
  .use(rehypeStripStrayInputs)
  .use(rehypeAnchorRewrite)
  .use(rehypeStringify)
  .freeze()

export function renderAnalystNoteMarkdown(markdown: string): string {
  if (typeof markdown !== 'string') {
    throw new TypeError('renderAnalystNoteMarkdown: markdown must be string')
  }
  if (markdown.length === 0) {
    return ''
  }
  return String(processor.processSync(markdown))
}
