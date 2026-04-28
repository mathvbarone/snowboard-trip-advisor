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

  it("does NOT fire on hex-shaped strings that aren't CSS colors (e.g. SHA prefixes)", async (): Promise<void> => {
    const src = "export const sha = '#deadbeef-1234'\n"
    const ids = await violations('apps/public/src/__eslint_fixture__.ts', src)
    expect(ids).not.toContain('no-restricted-syntax')
  })
})

describe('eslint deep-import discipline', (): void => {
  it('blocks `@snowboard-trip-advisor/design-system/internals/foo` deep imports from apps', async (): Promise<void> => {
    const src = "import { foo } from '@snowboard-trip-advisor/design-system/internals/foo'\nexport { foo }\n"
    const ids = await violations('apps/public/src/__eslint_fixture__.ts', src)
    expect(ids).toContain('no-restricted-imports')
  })
  it('allows package-root imports', async (): Promise<void> => {
    const src = "import { tokens } from '@snowboard-trip-advisor/design-system'\nexport { tokens }\n"
    const ids = await violations('apps/public/src/__eslint_fixture__.ts', src)
    expect(ids).not.toContain('no-restricted-imports')
  })
})

describe('eslint branded-type discipline', (): void => {
  it('blocks `as ResortSlug` casts outside packages/schema', async (): Promise<void> => {
    const src = "const s = 'three-valleys' as ResortSlug\nexport { s }\n"
    const ids = await violations('apps/public/src/__eslint_fixture__.ts', src)
    expect(ids).toContain('no-restricted-syntax')
  })
})

describe('eslint apps/public bundle-safety discipline (PR 3.1a)', (): void => {
  it('blocks `loadResortDataset` named import from apps/public', async (): Promise<void> => {
    // The path-taking variant pulls node:fs/promises in transitively; the
    // browser-safe `loadResortDatasetFromObject` (lands in PR 3.1c) is the
    // intended entry point for apps/public.
    const src = "import { loadResortDataset } from '@snowboard-trip-advisor/schema'\nexport { loadResortDataset }\n"
    const ids = await violations('apps/public/src/__eslint_fixture__.ts', src)
    expect(ids).toContain('no-restricted-imports')
  })

  it('allows `loadResortDatasetFromObject` named import from apps/public', async (): Promise<void> => {
    // Forward-looking assertion: PR 3.1c adds loadResortDatasetFromObject as
    // the browser-safe replacement. The ban must NOT cover it; this fixture
    // pins that distinction so a future regression can't widen the rule.
    const src = "import { loadResortDatasetFromObject } from '@snowboard-trip-advisor/schema'\nexport { loadResortDatasetFromObject }\n"
    const ids = await violations('apps/public/src/__eslint_fixture__.ts', src)
    expect(ids).not.toContain('no-restricted-imports')
  })

  it('does NOT block `loadResortDataset` from apps/admin (loopback-only, node:fs/promises is fine)', async (): Promise<void> => {
    // apps/admin runs on 127.0.0.1 with full Node access; it can use the path-taking variant.
    const src = "import { loadResortDataset } from '@snowboard-trip-advisor/schema'\nexport { loadResortDataset }\n"
    const ids = await violations('apps/admin/src/__eslint_fixture__.ts', src)
    expect(ids).not.toContain('no-restricted-imports')
  })

  it('does NOT block `loadResortDataset` from apps/public test files (run under Node, not bundled)', async (): Promise<void> => {
    // Vitest tests run under Node + jsdom; the bundle-safety motivation does not
    // apply. PR 3.1c migrates the existing test to loadResortDatasetFromObject;
    // until then the exemption keeps the rule landable without churn.
    // Filename uses the `__eslint_fixture__.test.ts` sentinel: matches the
    // flat-config's type-checking-disabled fixture block AND the bundle-safety
    // rule's *.test.{ts,tsx} `ignores` glob.
    const src = "import { loadResortDataset } from '@snowboard-trip-advisor/schema'\nexport { loadResortDataset }\n"
    const ids = await violations('apps/public/src/__eslint_fixture__.test.ts', src)
    expect(ids).not.toContain('no-restricted-imports')
  })

  it('blocks dynamic `import("@snowboard-trip-advisor/schema")` from apps/public (no-restricted-imports does not match dynamic imports)', async (): Promise<void> => {
    // ESLint's `no-restricted-imports` only matches static `import` declarations,
    // so without a companion `no-restricted-syntax` selector on `ImportExpression`,
    // `await import('@snowboard-trip-advisor/schema').loadResortDataset(...)`
    // would silently bypass the bundle-safety ban and reintroduce node:fs/promises
    // into the browser bundle. This fixture pins the dynamic-import block.
    const src = "export const load = async (): Promise<unknown> => (await import('@snowboard-trip-advisor/schema'))\n"
    const ids = await violations('apps/public/src/__eslint_fixture__.ts', src)
    expect(ids).toContain('no-restricted-syntax')
  })

  it('blocks `loadResortDataset` named import from the `/node` subpath in apps/public', async (): Promise<void> => {
    // After the schema-package split, `loadResortDataset` lives at
    // `'@snowboard-trip-advisor/schema/node'`. Without an explicit ban on
    // this subpath, apps/public could import it directly and the browser
    // bundle would pull node:fs/promises at module evaluation. This
    // fixture pins the subpath-level ban.
    const src = "import { loadResortDataset } from '@snowboard-trip-advisor/schema/node'\nexport { loadResortDataset }\n"
    const ids = await violations('apps/public/src/__eslint_fixture__.ts', src)
    expect(ids).toContain('no-restricted-imports')
  })

  it('blocks `publishDataset` named import from the `/node` subpath in apps/public', async (): Promise<void> => {
    // `publishDataset` is the other Node-only utility on the `/node`
    // subpath; it depends on node:fs/promises (write side). Same
    // reasoning as the loadResortDataset ban above — the bundler would
    // follow the re-export and pull Node built-ins into the browser
    // bundle.
    const src = "import { publishDataset } from '@snowboard-trip-advisor/schema/node'\nexport { publishDataset }\n"
    const ids = await violations('apps/public/src/__eslint_fixture__.ts', src)
    expect(ids).toContain('no-restricted-imports')
  })

  it('blocks dynamic `import("@snowboard-trip-advisor/schema/node")` from apps/public', async (): Promise<void> => {
    // Dynamic-import bypass for the `/node` subpath. The
    // `no-restricted-syntax` regex selector matches both the bare
    // package specifier and its `/node` subpath; without the regex,
    // `await import('@snowboard-trip-advisor/schema/node')` would
    // silently bypass the static-import ban.
    const src = "export const load = async (): Promise<unknown> => (await import('@snowboard-trip-advisor/schema/node'))\n"
    const ids = await violations('apps/public/src/__eslint_fixture__.ts', src)
    expect(ids).toContain('no-restricted-syntax')
  })

  it('does NOT block `loadResortDataset` from apps/admin via the `/node` subpath (loopback-only, node:fs/promises is fine)', async (): Promise<void> => {
    // The carve-out for apps/admin must extend to the `/node` subpath
    // (admin runs on Node and legitimately uses these utilities).
    const src = "import { loadResortDataset } from '@snowboard-trip-advisor/schema/node'\nexport { loadResortDataset }\n"
    const ids = await violations('apps/admin/src/__eslint_fixture__.ts', src)
    expect(ids).not.toContain('no-restricted-imports')
  })

  it('does NOT block `loadResortDataset` from apps/public test files via the `/node` subpath (run under Node, not bundled)', async (): Promise<void> => {
    // Same exemption as the package-root case: tests run under Node +
    // jsdom and never reach the browser bundle. The `/node` subpath
    // ban must respect the same `*.test.{ts,tsx}` carve-out.
    const src = "import { loadResortDataset } from '@snowboard-trip-advisor/schema/node'\nexport { loadResortDataset }\n"
    const ids = await violations('apps/public/src/__eslint_fixture__.test.ts', src)
    expect(ids).not.toContain('no-restricted-imports')
  })
})
