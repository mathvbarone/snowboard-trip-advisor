import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = process.cwd()
const ADMIN_SRC = join(REPO_ROOT, 'apps/admin/src')

async function lintFixture(code: string, filePath: string): Promise<ESLint.LintResult[]> {
  const eslint = new ESLint({
    overrideConfigFile: join(REPO_ROOT, 'eslint.config.js'),
    cwd: REPO_ROOT,
    warnIgnored: false,
  })
  return eslint.lintText(code, { filePath })
}

describe('apps/admin ESLint restrictions (PR 4.1a, spec §3.2 + §7.5)', (): void => {
  it.each([
    [
      'raw fetch( in SPA code',
      `export const x = fetch('/api/foo')\n`,
      'no-restricted-syntax',
    ],
    [
      'schema/node import',
      `import { publishDataset } from '@snowboard-trip-advisor/schema/node'\nvoid publishDataset\n`,
      'no-restricted-imports',
    ],
    [
      'node:fs/promises import',
      `import { readFile } from 'node:fs/promises'\nvoid readFile\n`,
      'no-restricted-imports',
    ],
    [
      'apps/admin/server import',
      `import { listResortsHandler } from 'apps/admin/server/listResorts'\nvoid listResortsHandler\n`,
      'no-restricted-imports',
    ],
  ])('blocks %s', async (_name: string, code: string, ruleId: string): Promise<void> => {
    const [result] = await lintFixture(code, join(ADMIN_SRC, '__eslint_fixture__.ts'))
    expect(result?.messages.some((m): boolean => m.ruleId === ruleId)).toBe(true)
  })

  it('exempts apps/admin/src/lib/apiClient.ts from the raw-fetch rule via inline disable', async (): Promise<void> => {
    const code = `// eslint-disable-next-line no-restricted-syntax\nexport const x = fetch('/api/foo')\n`
    // The exemption mechanism is the inline-disable comment, not the filename.
    // Use the eslint-fixture sentinel basename so the lint runner doesn't try to
    // resolve the virtual path through the tsconfig project service.
    const [result] = await lintFixture(code, join(ADMIN_SRC, '__eslint_fixture__.ts'))
    expect(result?.messages.some((m): boolean => m.ruleId === 'no-restricted-syntax')).toBe(false)
  })

  it.each([
    ['window.fetch', `export const x = window.fetch('/api/foo')\n`],
    ['globalThis.fetch', `export const x = globalThis.fetch('/api/foo')\n`],
    ['self.fetch', `export const x = self.fetch('/api/foo')\n`],
  ])('blocks member-expression %s (Codex P1 fold — bare-callee selector did not catch X.fetch)', async (_label: string, code: string): Promise<void> => {
    const [result] = await lintFixture(code, join(ADMIN_SRC, '__eslint_fixture__.ts'))
    expect(result?.messages.some((m): boolean => m.ruleId === 'no-restricted-syntax')).toBe(true)
  })

  it.each([
    ["window['fetch']", `export const x = window['fetch']('/api/foo')\n`],
    ["globalThis['fetch']", `export const x = globalThis['fetch']('/api/foo')\n`],
  ])('blocks computed-member %s (Codex round-3 P2 fold — bracket access bypassed dot-notation selector)', async (_label: string, code: string): Promise<void> => {
    const [result] = await lintFixture(code, join(ADMIN_SRC, '__eslint_fixture__.ts'))
    expect(result?.messages.some((m): boolean => m.ruleId === 'no-restricted-syntax')).toBe(true)
  })

  it.each([
    ['window[`fetch`]', 'export const x = window[`fetch`]("/api/foo")\n'],
    ['globalThis[`fetch`]', 'export const x = globalThis[`fetch`]("/api/foo")\n'],
  ])('blocks template-literal computed-member %s (Codex round-4 P2 fold)', async (_label: string, code: string): Promise<void> => {
    const [result] = await lintFixture(code, join(ADMIN_SRC, '__eslint_fixture__.ts'))
    expect(result?.messages.some((m): boolean => m.ruleId === 'no-restricted-syntax')).toBe(true)
  })

  it('blocks template-literal computed-member new XMLHttpRequest', async (): Promise<void> => {
    const code = 'export const x = new window[`XMLHttpRequest`]()\n'
    const [result] = await lintFixture(code, join(ADMIN_SRC, '__eslint_fixture__.ts'))
    expect(result?.messages.some((m): boolean => m.ruleId === 'no-restricted-syntax')).toBe(true)
  })

  it.each([
    ['fetch.call', `export const x = fetch.call(globalThis, '/api/foo')\n`],
    ['fetch.apply', `export const x = fetch.apply(globalThis, ['/api/foo'])\n`],
    ['fetch.bind', `export const f = fetch.bind(globalThis)\n`],
    ['variable indirection', `const f = fetch\nexport const x = f('/api/foo')\n`],
  ])('blocks indirect fetch invocation: %s (Codex round-5 P2 fold via no-restricted-globals)', async (_label: string, code: string): Promise<void> => {
    const [result] = await lintFixture(code, join(ADMIN_SRC, '__eslint_fixture__.ts'))
    expect(result?.messages.some((m): boolean => m.ruleId === 'no-restricted-globals')).toBe(true)
  })

  it('blocks template-literal dynamic server import (Codex round-5 P2 fold)', async (): Promise<void> => {
    const code = 'export const load = async (): Promise<unknown> => (await import(`../../server/foo`))\n'
    const [result] = await lintFixture(code, join(ADMIN_SRC, '__eslint_fixture__.ts'))
    expect(result?.messages.some((m): boolean => m.ruleId === 'no-restricted-syntax')).toBe(true)
  })

  it.each([
    ['new EventSource', `export const x = new EventSource('/api/events')\n`],
    ['new WebSocket', `export const x = new WebSocket('wss://example/ws')\n`],
    ['new window.EventSource', `export const x = new window.EventSource('/api/events')\n`],
    ['new globalThis.WebSocket', `export const x = new globalThis.WebSocket('wss://example/ws')\n`],
  ])('blocks streaming-network primitive %s (proactive round-6 P2 fold)', async (_label: string, code: string): Promise<void> => {
    const [result] = await lintFixture(code, join(ADMIN_SRC, '__eslint_fixture__.ts'))
    expect(result?.messages.some((m): boolean => m.ruleId === 'no-restricted-syntax')).toBe(true)
  })

  it.each([
    ['navigator.sendBeacon', `export const x = navigator.sendBeacon('/api/log', 'data')\n`],
    ['window.navigator.sendBeacon', `export const x = window.navigator.sendBeacon('/api/log', 'data')\n`],
    ['globalThis.navigator.sendBeacon', `export const x = globalThis.navigator.sendBeacon('/api/log', 'data')\n`],
    ['self.navigator.sendBeacon', `export const x = self.navigator.sendBeacon('/api/log', 'data')\n`],
  ])('blocks %s (Codex round-6 P2 fold — selector now matches any nested object)', async (_label: string, code: string): Promise<void> => {
    const [result] = await lintFixture(code, join(ADMIN_SRC, '__eslint_fixture__.ts'))
    expect(result?.messages.some((m): boolean => m.ruleId === 'no-restricted-syntax')).toBe(true)
  })

  it.each([
    ["bare ../server (no trailing slash, Codex round-6)", `import { x } from '../server'\nvoid x\n`],
    ["bare ../../server (no trailing slash)", `import { x } from '../../server'\nvoid x\n`],
    ["bare dynamic await import('../server')", `export const load = async (): Promise<unknown> => (await import('../server'))\n`],
    ["bare template-literal await import(`../server`)", 'export const load = async (): Promise<unknown> => (await import(`../server`))\n'],
    ["bare absolute apps/admin/server (no trailing slash)", `import { x } from 'apps/admin/server'\nvoid x\n`],
  ])('blocks %s', async (_label: string, code: string): Promise<void> => {
    const [result] = await lintFixture(code, join(ADMIN_SRC, '__eslint_fixture__.ts'))
    const ids = result?.messages.map((m): string | null => m.ruleId) ?? []
    // Bare absolute lives in Block A (no-restricted-imports); bare relative
    // and dynamic forms live in Block B (no-restricted-syntax). Either rule
    // firing is acceptable — the assertion is that SOME ban catches it.
    expect(ids.includes('no-restricted-imports') || ids.includes('no-restricted-syntax')).toBe(true)
  })

  it('does NOT block ../serverless (false-positive guard for the trailing-slash anchor)', async (): Promise<void> => {
    // The regex anchor `(\/|$)` after "server" must not over-match prefixes
    // like `serverless`. Pin the false-positive guard so a future change to
    // the regex doesn't accidentally widen the rule.
    const code = `import { x } from '../serverless'\nvoid x\n`
    const [result] = await lintFixture(code, join(ADMIN_SRC, '__eslint_fixture__.ts'))
    const ids = result?.messages.map((m): string | null => m.ruleId) ?? []
    expect(ids.includes('no-restricted-syntax')).toBe(false)
    expect(ids.includes('no-restricted-imports')).toBe(false)
  })

  it.each([
    ['@snowboard-trip-advisor/admin-server (forward-looking)', `import { x } from '@snowboard-trip-advisor/admin-server'\nvoid x\n`],
    ['@snowboard-trip-advisor/foo-server (wildcard pattern)', `import { x } from '@snowboard-trip-advisor/foo-server'\nvoid x\n`],
  ])('blocks future package-name server import: %s', async (_label: string, code: string): Promise<void> => {
    const [result] = await lintFixture(code, join(ADMIN_SRC, '__eslint_fixture__.ts'))
    expect(result?.messages.some((m): boolean => m.ruleId === 'no-restricted-imports')).toBe(true)
  })

  it('apiClient.ts inline-disable mechanism still works for the combined no-restricted-syntax + no-restricted-globals pair', async (): Promise<void> => {
    const code = `// eslint-disable-next-line no-restricted-syntax, no-restricted-globals\nexport const x = fetch('/api/foo')\n`
    const [result] = await lintFixture(code, join(ADMIN_SRC, '__eslint_fixture__.ts'))
    expect(result?.messages.some((m): boolean => m.ruleId === 'no-restricted-syntax')).toBe(false)
    expect(result?.messages.some((m): boolean => m.ruleId === 'no-restricted-globals')).toBe(false)
  })

  it.each([
    ['../server/foo (1 level)', `import { x } from '../server/foo'\nvoid x\n`],
    ['../../server/foo (2 levels)', `import { x } from '../../server/foo'\nvoid x\n`],
    ['../../../server/foo (3 levels)', `import { x } from '../../../server/foo'\nvoid x\n`],
    ['../../../../server/foo (4 levels)', `import { x } from '../../../../server/foo'\nvoid x\n`],
    ['../../../../../server/foo (5 levels — Codex round-3 P2 fold: arbitrary-depth)', `import { x } from '../../../../../server/foo'\nvoid x\n`],
    ['../../../../../../server/foo (6 levels)', `import { x } from '../../../../../../server/foo'\nvoid x\n`],
  ])('blocks relative server import %s', async (_label: string, code: string): Promise<void> => {
    const [result] = await lintFixture(code, join(ADMIN_SRC, '__eslint_fixture__.ts'))
    // Moved from no-restricted-imports (enumerated patterns) to no-restricted-syntax
    // (regex selector) so the rule catches arbitrary depth without enumeration.
    expect(result?.messages.some((m): boolean => m.ruleId === 'no-restricted-syntax')).toBe(true)
  })

  it('blocks dynamic relative server import (await import("../server/foo"))', async (): Promise<void> => {
    const code = `export const load = async (): Promise<unknown> => (await import('../../server/foo'))\n`
    const [result] = await lintFixture(code, join(ADMIN_SRC, '__eslint_fixture__.ts'))
    expect(result?.messages.some((m): boolean => m.ruleId === 'no-restricted-syntax')).toBe(true)
  })

  it('still bans raw fetch in admin TEST files (Codex P2 fold — top-level ignores no longer relaxes the fetch ban)', async (): Promise<void> => {
    const code = `export const x = fetch('/api/foo')\n`
    const [result] = await lintFixture(code, join(ADMIN_SRC, '__eslint_fixture__.test.ts'))
    expect(result?.messages.some((m): boolean => m.ruleId === 'no-restricted-syntax')).toBe(true)
  })

  it('test files DO retain the schema/node + node:* import carve-out (per the policy comment in eslint.config.js)', async (): Promise<void> => {
    // Tests sometimes need filesystem primitives for fixture setup; the import
    // bans are relaxed for test files. Only the syntax bans (raw fetch) stay
    // active. This pins the carve-out so it doesn't silently drift.
    const code = `import { readFile } from 'node:fs/promises'\nvoid readFile\n`
    const [result] = await lintFixture(code, join(ADMIN_SRC, '__eslint_fixture__.test.ts'))
    expect(result?.messages.some((m): boolean => m.ruleId === 'no-restricted-imports')).toBe(false)
  })
})

const ALLOWLIST: ReadonlyArray<string> = [
  'apps/admin/src/lib/apiClient.ts',
  'apps/admin/src/mocks/realHandlers.test.ts',
]

const INLINE_DISABLE_PATTERN = /eslint-disable.*(no-restricted-syntax|no-restricted-globals)/

async function findFiles(dir: string): Promise<ReadonlyArray<string>> {
  const out: string[] = []
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        const sub = await findFiles(full)
        out.push(...sub)
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        out.push(full)
      }
    }
  } catch {
    // Directory does not exist (yet) — admin SPA may be empty pre-PR-4.1a.
  }
  return out
}

describe('apps/admin/src/** inline-disable allowlist (PR 4.1a, P1-10 + second-review fold)', (): void => {
  it('inline-disables for no-restricted-syntax in apps/admin/src/** are an enumerated allowlist', async (): Promise<void> => {
    const files = await findFiles(ADMIN_SRC)
    const offenders: string[] = []
    for (const filePath of files) {
      const content = await readFile(filePath, 'utf8')
      if (INLINE_DISABLE_PATTERN.test(content)) {
        const relPath = relative(REPO_ROOT, filePath)
        if (!ALLOWLIST.includes(relPath)) {
          offenders.push(relPath)
        }
      }
    }
    expect(offenders, `Files with no-restricted-syntax inline-disables outside the allowlist (${ALLOWLIST.join(', ')}): ${offenders.join(', ')}`).toEqual([])
  })
})
