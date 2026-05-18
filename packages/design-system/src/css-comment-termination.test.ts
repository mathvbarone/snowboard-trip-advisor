import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// Regression guard for the S1d gallery-smoke defect: a token-listing header
// comment containing the literal sequence `--shadow-*/--scrim-*` had its `*/`
// (inside `--shadow-*/`) PREMATURELY close the CSS block comment. The CSS
// parser's error recovery then consumed tokens up to the next `}` — silently
// swallowing the entire `.sta-modal__overlay` scrim rule that immediately
// followed the header. The per-component `Modal.css.test.ts` source-text
// assertion `expect(source).toContain('.sta-modal__overlay')` still PASSED
// because the substring was literally in the file; only the live-DOM smoke
// caught the missing backdrop.
//
// Why this check is NOT a tautology: it does not look for any known-bad
// substring. It reproduces the *structural* consequence of a premature
// terminator. Every co-located design-system CSS file opens with a single
// banner `/* ... */` comment. We strip exactly the FIRST balanced comment and
// assert that the remainder begins with a valid CSS construct (selector,
// at-rule, nested comment, or block punctuation). When the banner closes
// early, the leftover comment PROSE leaks into rule-start position — in the
// Modal.css break that leftover was `--scrim-* token — Toast.css/...`, which
// starts with `-` and fails the rule-start pattern. Verified by region test:
// substituting the broken `--shadow-*/--scrim-*` fragment makes the stripped
// remainder start with `--scrim-...` and this guard goes RED; the fixed file
// remainder starts with `.sta-modal__overlay {` and it stays GREEN.
//
// `RULE_START` enumerates the only characters CSS allows at the top level
// where a rule/at-rule/comment may begin: selector punctuation
// (. # * : [ > + ~ & %), at-rules (@), a nested comment (/), block
// punctuation a malformed-but-recoverable file might surface (} { ;), or an
// element/identifier selector (ASCII letter or escape `\`). Comment prose
// leaking from a premature terminator characteristically starts with a dash,
// an em dash, a digit, a quote, or a parenthesis — none of which are valid
// here — so the guard fails closed on the real bug class.
const RULE_START = /^(?:\/\*|[.#*:[\]>+~&%@{};\\]|[A-Za-z])/

function collectCssFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...collectCssFiles(full))
    } else if (entry.isFile() && entry.name.endsWith('.css')) {
      out.push(full)
    }
  }
  return out.sort()
}

const srcRoot = resolve(import.meta.dirname)
const cssFiles = collectCssFiles(srcRoot)

describe('design-system CSS comment termination', (): void => {
  it('discovers every co-located CSS file', (): void => {
    expect(cssFiles.length).toBeGreaterThan(0)
  })

  it.each(cssFiles)('%s has no premature comment terminator', (file): void => {
    const source = readFileSync(file, 'utf8')
    const open = source.indexOf('/*')
    const label = relative(srcRoot, file)

    // Files may legitimately open with no comment at all.
    if (open === -1) {
      return
    }

    const close = source.indexOf('*/', open + 2)
    expect(
      close,
      `${label}: opening "/*" is never terminated`,
    ).toBeGreaterThan(open)

    const remainder = source.slice(close + 2).replace(/^\s+/, '')

    // End-of-file after the only comment is fine (e.g. a trailing banner).
    if (remainder.length === 0) {
      return
    }

    expect(
      RULE_START.test(remainder),
      `${label}: content after the first comment does not begin a valid CSS ` +
        `rule — the banner comment terminated early and prose leaked into ` +
        `rule-start position. First 60 chars: ${JSON.stringify(
          remainder.slice(0, 60),
        )}`,
    ).toBe(true)
  })
})
