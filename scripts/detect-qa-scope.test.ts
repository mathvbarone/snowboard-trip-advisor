import { describe, expect, it } from 'vitest'

import { detectQaScope, parseGitNameStatus } from './detect-qa-scope'

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

describe('parseGitNameStatus', (): void => {
  it('returns an empty list for empty input', (): void => {
    expect(parseGitNameStatus('')).toEqual([])
    expect(parseGitNameStatus('\n\n')).toEqual([])
  })

  it('extracts the path from single-path entries (M / A / D / T)', (): void => {
    expect(parseGitNameStatus('M\tREADME.md\n')).toEqual(['README.md'])
    expect(parseGitNameStatus('A\tdocs/x.md\n')).toEqual(['docs/x.md'])
    expect(parseGitNameStatus('D\tscripts/old.sh\n')).toEqual(['scripts/old.sh'])
    expect(parseGitNameStatus('T\tpackage.json\n')).toEqual(['package.json'])
  })

  it('extracts BOTH preimage and postimage paths for renames (R*)', (): void => {
    expect(
      parseGitNameStatus('R100\tdocs/old.md\tdocs/new.md\n'),
    ).toEqual(['docs/old.md', 'docs/new.md'])
    expect(
      parseGitNameStatus(
        'R75\tapps/public/src/main.tsx\tREADME.md\n',
      ),
    ).toEqual(['apps/public/src/main.tsx', 'README.md'])
  })

  it('extracts both paths for copies (C*) — same shape as renames', (): void => {
    expect(parseGitNameStatus('C75\tsrc/orig.ts\tsrc/copy.ts\n')).toEqual([
      'src/orig.ts',
      'src/copy.ts',
    ])
  })

  it('handles a mixed diff with single-path and rename lines together', (): void => {
    const input =
      'M\tREADME.md\n' +
      'R100\tdocs/old.md\tdocs/new.md\n' +
      'A\tdocs/x.md\n' +
      'D\tscripts/old.sh\n'
    expect(parseGitNameStatus(input)).toEqual([
      'README.md',
      'docs/old.md',
      'docs/new.md',
      'docs/x.md',
      'scripts/old.sh',
    ])
  })

  it('strips trailing CR (CRLF stdin from Windows shells)', (): void => {
    expect(parseGitNameStatus('M\tREADME.md\r\n')).toEqual(['README.md'])
  })

  it('treats malformed single-column lines as a single path (defensive fail-closed for classifier)', (): void => {
    expect(parseGitNameStatus('orphan-line\n')).toEqual(['orphan-line'])
  })

  it('skips empty columns produced by consecutive tabs (defensive)', (): void => {
    expect(parseGitNameStatus('M\t\tREADME.md\n')).toEqual(['README.md'])
  })

  it('end-to-end: rename of code → markdown classifies as "full" (Codex P1 case)', (): void => {
    const renameToMd = 'R75\tapps/public/src/main.tsx\tREADME.md\n'
    expect(detectQaScope(parseGitNameStatus(renameToMd))).toBe('full')
  })

  it('end-to-end: rename within docs/ stays "docs-only"', (): void => {
    const renameWithinDocs =
      'R100\tdocs/adr/0001-old.md\tdocs/adr/0001-new.md\n'
    expect(detectQaScope(parseGitNameStatus(renameWithinDocs))).toBe(
      'docs-only',
    )
  })

  it('end-to-end: copy of code file (C*) classifies as "full" even if destination is markdown', (): void => {
    const copy = 'C50\tsrc/foo.ts\tdocs/foo.md\n'
    expect(detectQaScope(parseGitNameStatus(copy))).toBe('full')
  })
})
