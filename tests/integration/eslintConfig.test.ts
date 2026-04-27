import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

// Under "type": "module" with verbatimModuleSyntax, __dirname is unavailable.
// Resolve relative to this test file's URL.
const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')

const eslint = new ESLint({
  overrideConfigFile: resolve(repoRoot, 'eslint.config.js'),
})

const violations = async (filename: string, source: string): Promise<string[]> => {
  const [result] = await eslint.lintText(source, { filePath: resolve(repoRoot, filename) })
  return (result?.messages ?? []).map((m): string => m.ruleId ?? '')
}

// Fixture filenames use the sentinel basename `__eslint_fixture__` so the
// flat-config has a stable hook to disable type-aware parsing for them
// (real files don't exist on disk; @typescript-eslint's projectService
// would otherwise reject the unknown path with a parsing error).
describe('eslint package DAG enforcement', (): void => {
  it('blocks packages/design-system from importing packages/integrations', async (): Promise<void> => {
    const src = "import { something } from '@snowboard-trip-advisor/integrations'\nexport { something }\n"
    const ids = await violations('packages/design-system/src/__eslint_fixture__.ts', src)
    expect(ids).toContain('no-restricted-imports')
  })

  it('allows apps/public to import packages/design-system', async (): Promise<void> => {
    const src = "import { tokens } from '@snowboard-trip-advisor/design-system'\nexport { tokens }\n"
    const ids = await violations('apps/public/src/__eslint_fixture__.ts', src)
    expect(ids).not.toContain('no-restricted-imports')
  })
})

describe('eslint design-system discipline', (): void => {
  it('blocks raw color literals in apps/*.tsx', async (): Promise<void> => {
    const src = "export const c = '#ff0000'\n"
    const ids = await violations('apps/public/src/__eslint_fixture__.tsx', src)
    expect(ids).toContain('no-restricted-syntax')
  })

  it('allows color literals inside packages/design-system/src/tokens.ts', async (): Promise<void> => {
    // tokens.ts is a real file (the design tokens source-of-truth), so the
    // type-aware parser can resolve it normally; this fixture asserts the
    // apps-only `no-restricted-syntax` block does not bleed into the
    // design-system workspace.
    const src = "export const c = '#ff0000'\n"
    const ids = await violations('packages/design-system/src/tokens.ts', src)
    expect(ids).not.toContain('no-restricted-syntax')
  })
})

describe('eslint branded-type discipline', (): void => {
  it('blocks `as ResortSlug` casts outside packages/schema', async (): Promise<void> => {
    const src = "const s = 'three-valleys' as ResortSlug\nexport { s }\n"
    const ids = await violations('apps/public/src/__eslint_fixture__.ts', src)
    expect(ids).toContain('no-restricted-syntax')
  })
})
