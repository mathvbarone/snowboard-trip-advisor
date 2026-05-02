import { describe, expect, it } from 'vitest'

import { detectQaScope } from './detect-qa-scope'

describe('detectQaScope', (): void => {
  it('returns "full" for an empty diff (safe default)', (): void => {
    expect(detectQaScope([])).toBe('full')
  })

  it('returns "docs-only" when every path is under docs/', (): void => {
    expect(
      detectQaScope([
        'docs/adr/0001-pivot-to-data-transparency.md',
        'docs/superpowers/specs/2026-04-22-product-pivot-design.md',
      ]),
    ).toBe('docs-only')
  })

  it('returns "docs-only" for root-level markdown files', (): void => {
    expect(detectQaScope(['README.md'])).toBe('docs-only')
    expect(detectQaScope(['AGENTS.md'])).toBe('docs-only')
    expect(detectQaScope(['CLAUDE.md'])).toBe('docs-only')
  })

  it('returns "docs-only" when mixing docs/ and root-level markdown', (): void => {
    expect(detectQaScope(['README.md', 'docs/adr/0010-x.md'])).toBe('docs-only')
  })

  it('returns "full" when any TypeScript file is changed', (): void => {
    expect(
      detectQaScope(['README.md', 'packages/schema/index.ts']),
    ).toBe('full')
  })

  it('returns "full" when package.json is changed', (): void => {
    expect(detectQaScope(['package.json'])).toBe('full')
  })

  it('returns "full" when eslint.config.js is changed', (): void => {
    expect(detectQaScope(['eslint.config.js'])).toBe('full')
  })

  it('returns "full" for any file under .github/ — including markdown', (): void => {
    expect(detectQaScope(['.github/CODEOWNERS'])).toBe('full')
    expect(detectQaScope(['.github/workflows/quality-gate.yml'])).toBe('full')
    expect(detectQaScope(['.github/pull_request_template.md'])).toBe('full')
    expect(detectQaScope(['.github/BRANCH_PROTECTION.md'])).toBe('full')
  })

  it('returns "full" for any file under scripts/ — policy surface', (): void => {
    expect(detectQaScope(['scripts/pre-commit'])).toBe('full')
    expect(detectQaScope(['scripts/hooks/session-start-context.sh'])).toBe(
      'full',
    )
  })

  it('returns "full" for any file under .claude/ — policy surface', (): void => {
    expect(detectQaScope(['.claude/settings.json'])).toBe('full')
  })

  it('treats markdown nested in source trees as docs (rare; safe to skip)', (): void => {
    expect(detectQaScope(['packages/schema/NOTES.md'])).toBe('docs-only')
  })

  it('returns "full" when one code path appears alongside many doc paths', (): void => {
    expect(
      detectQaScope([
        'docs/adr/0001.md',
        'README.md',
        'docs/handoffs/x.md',
        'apps/public/src/main.tsx',
      ]),
    ).toBe('full')
  })

  it('ignores blank lines (handles raw `git diff` stdin)', (): void => {
    expect(detectQaScope(['', 'README.md', ''])).toBe('docs-only')
  })

  it('returns "full" for tsconfig.json', (): void => {
    expect(detectQaScope(['tsconfig.json'])).toBe('full')
  })

  it('returns "full" for vite.config.ts', (): void => {
    expect(detectQaScope(['apps/public/vite.config.ts'])).toBe('full')
  })

  it('trims trailing CR (handles CRLF stdin from git on Windows)', (): void => {
    expect(detectQaScope(['README.md\r'])).toBe('docs-only')
  })

  it('trims leading and trailing whitespace', (): void => {
    expect(detectQaScope(['  docs/adr/0001.md  '])).toBe('docs-only')
  })

  it('returns "full" for a single empty-string entry (defensive)', (): void => {
    expect(detectQaScope([''])).toBe('full')
  })

  it('strips leading "./" so it cannot bypass policy-root checks', (): void => {
    expect(detectQaScope(['./scripts/evil.md'])).toBe('full')
    expect(detectQaScope(['./.github/x.md'])).toBe('full')
    expect(detectQaScope(['./README.md'])).toBe('docs-only')
  })

  it('returns "full" for a path that contains "docs/" mid-string but does not start with it', (): void => {
    expect(detectQaScope(['apps/public/docs/foo.ts'])).toBe('full')
  })
})
