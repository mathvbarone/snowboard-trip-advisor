import { describe, expect, it } from 'vitest'

import pkg from '../package.json' with { type: 'json' }

interface PackageJsonExports {
  readonly exports: Record<string, string>
}

const exports = (pkg as unknown as PackageJsonExports).exports

describe('packages/schema exports map (PR 4.0)', (): void => {
  it('declares the ./api subpath (resolves once PR 4.1a lands api/index.ts)', (): void => {
    expect(exports['./api']).toBe('./api/index.ts')
  })

  it('still declares . and ./node', (): void => {
    expect(exports['.']).toBe('./src/index.ts')
    expect(exports['./node']).toBe('./src/node.ts')
  })
})
